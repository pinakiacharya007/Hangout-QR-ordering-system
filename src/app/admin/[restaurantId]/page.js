"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { io } from "socket.io-client";

let SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";

// Formats a date using the browser's LOCAL calendar day, not UTC. toISOString() always
// converts to UTC first, which silently files late-night orders (e.g. 12am–5:30am IST)
// under the PREVIOUS day — a real bug for any restaurant operating past midnight.
function toLocalDateStr(date) {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function AdminDashboard() {
  const { restaurantId } = useParams();
  const [tab, setTab] = useState("orders"); // orders | tables | menu | qr | reviews
  const [reviews, setReviews] = useState([]);
  const [reviewsAvg, setReviewsAvg] = useState(null);
  const [orderFilter, setOrderFilter] = useState("active"); // active | pending | preparing | ready | all
  const [orders, setOrders] = useState([]);
  const [deletedOrders, setDeletedOrders] = useState([]);
  const [showDeleted, setShowDeleted] = useState(false);
  const [dateFilterEnabled, setDateFilterEnabled] = useState(false);
  const [selectedDate, setSelectedDate] = useState(toLocalDateStr(new Date()));
  const [tables, setTables] = useState([]);
  const [allTables, setAllTables] = useState([]); // All tables for QR management
  const [categories, setCategories] = useState([]);
  const [newOrderIds, setNewOrderIds] = useState(new Set());
  const [origin, setOrigin] = useState("");
  const [localIp, setLocalIp] = useState("localhost");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [checkoutSessionId, setCheckoutSessionId] = useState(null);
  const [revenueRange, setRevenueRange] = useState("day");
  const [revenue, setRevenue] = useState(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    if (process.env.NODE_ENV !== "production") {
      fetch("/api/localip")
        .then((r) => r.json())
        .then((d) => {
          if (d.localIp) {
            setLocalIp(d.localIp);
            if (d.localIp !== "localhost") {
              SOCKET_URL = `http://${d.localIp}:4000`;
            }
          }
        })
        .catch(() => setLocalIp("localhost"));
    }
  }, []);

  function loadOrders() {
    fetch(`/api/orders?restaurantId=${restaurantId}`)
      .then((r) => r.json())
      .then((d) => setOrders(d.orders || []));
  }

  function loadDeletedOrders() {
    fetch(`/api/orders?restaurantId=${restaurantId}&deleted=true`)
      .then((r) => r.json())
      .then((d) => setDeletedOrders(d.orders || []));
  }

  function loadTables() {
    fetch(`/api/session?restaurantId=${restaurantId}`)
      .then((r) => r.json())
      .then((d) => setTables(d.tables || []));
  }

  function loadMenu() {
    fetch(`/api/menu?restaurantId=${restaurantId}`)
      .then((r) => r.json())
      .then((d) => setCategories(d.categories || []));
  }

  // Fetch all tables (not just active sessions) for QR code management
  function loadAllTables() {
    fetch(`/api/tables?restaurantId=${restaurantId}`)
      .then((r) => r.json())
      .then((d) => setAllTables(d.tables || []))
      .catch((err) => console.error("Failed to load tables:", err));
  }

  function loadReviews() {
    fetch(`/api/reviews?restaurantId=${restaurantId}`)
      .then((r) => r.json())
      .then((d) => {
        setReviews(d.reviews || []);
        setReviewsAvg(d.average);
      });
  }

  useEffect(() => {
    if (tab === "reviews") loadReviews();
  }, [tab, restaurantId]);

  useEffect(() => {
    loadOrders();
    loadTables();
    loadMenu();
    loadAllTables();
    loadNotifications();
  }, [restaurantId]);

  function loadNotifications() {
    fetch(`/api/notifications?restaurantId=${restaurantId}`)
      .then((r) => r.json())
      .then((d) => {
        setNotifications(d.notifications || []);
        setUnreadCount(d.unreadCount || 0);
      });
  }

  function loadRevenue(range) {
    fetch(`/api/revenue?restaurantId=${restaurantId}&range=${range}`)
      .then((r) => r.json())
      .then((d) => setRevenue(d));
  }

  useEffect(() => {
    if (tab === "revenue") loadRevenue(revenueRange);
  }, [tab, revenueRange, restaurantId]);

  useEffect(() => {
    const s = io(SOCKET_URL);
    s.emit("join", `restaurant-${restaurantId}`);

    s.on("new-order", ({ order }) => {
      setOrders((prev) => [order, ...prev]);
      setNewOrderIds((prev) => new Set(prev).add(order.id));
      loadTables();

      // Play audio notification ping if audio is enabled by staff
      if (soundEnabled) {
        try {
          const audio = new Audio(
            "data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoAAAAAAAAA"
          );
          audio.play().catch(() => {});
        } catch (e) {}
      }

      setTimeout(() => {
        setNewOrderIds((prev) => {
          const next = new Set(prev);
          next.delete(order.id);
          return next;
        });
      }, 2000);
    });

    s.on("order-updated", ({ order }) => {
      setOrders((prev) => prev.map((o) => (o.id === order.id ? order : o)));
      loadTables();
    });

    s.on("item-availability-updated", ({ itemId, available }) => {
      setCategories((prev) =>
        prev.map((c) => ({
          ...c,
          items: c.items.map((it) => (it.id === itemId ? { ...it, available } : it)),
        }))
      );
    });

    s.on("table-updated", () => {
      loadTables();
    });

    s.on("bill-requested", () => {
      loadTables();
    });

    s.on("notification", ({ notification }) => {
      setNotifications((prev) => [notification, ...prev].slice(0, 50));
      setUnreadCount((prev) => prev + 1);
    });

    return () => s.disconnect();
  }, [restaurantId, soundEnabled]);

  async function updateOrderStatus(orderId, status) {
    const res = await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, restaurantId }),
    });
    const data = await res.json();
    if (data.order) {
      setOrders((prev) => prev.map((o) => (o.id === data.order.id ? data.order : o)));
    }
  }

  // Approve/reject a customer's cancel-request, or accept/reject an item directly.
  // Applies the response immediately so the dashboard doesn't depend purely on the
  // socket broadcast reaching back to this same admin device.
  async function updateOrderItem(orderId, itemId, itemStatus) {
    const res = await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, itemStatus, restaurantId }),
    });
    const data = await res.json();
    if (data.order) {
      setOrders((prev) => prev.map((o) => (o.id === data.order.id ? data.order : o)));
    } else if (data.error) {
      alert(data.error);
    }
  }

  async function checkoutTable(sessionId, paymentMethod, lentToName) {
    const res = await fetch("/api/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, paymentMethod, lentToName }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || `Failed to checkout table (status ${res.status})`);
      return false;
    }
    loadTables();
    loadOrders();
    return true;
  }

  async function markLentReturned(sessionId) {
    const res = await fetch("/api/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, action: "mark_lent_returned" }),
    });
    if (res.ok) loadRevenue(revenueRange);
  }

  // Moves an ENTIRE session (customer's whole running bill, all their orders) to
  // another table — for when a customer/party physically relocates tables.
  async function transferSession(sessionId, currentTableNumber) {
    const target = prompt(`Move this whole bill from Table ${currentTableNumber} to which table number?`);
    if (!target || isNaN(Number(target))) return;
    const res = await fetch("/api/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, action: "transfer", tableNumber: Number(target) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || `Failed to move table (status ${res.status})`);
      return;
    }
    loadTables();
    loadOrders();
  }

  async function markNotificationsRead() {
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId }),
    });
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = `/admin/login?restaurantId=${restaurantId}`;
  }

  async function deleteOrder(orderId) {
    if (!confirm("Delete this order? It moves to Deleted Orders history and leaves the live queue.")) return;
    const res = await fetch(`/api/orders/${orderId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || `Failed to delete order (status ${res.status})`);
      return;
    }
    loadOrders();
    if (showDeleted) loadDeletedOrders();
  }

  async function deleteCategory(categoryId, categoryName) {
    if (!confirm(`Delete "${categoryName}" and everything in it? This can't be undone.`)) return;
    const res = await fetch(`/api/menu/${categoryId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || `Failed to delete category (status ${res.status})`);
      return;
    }
    loadMenu();
  }

  async function deleteItem(itemId, itemName) {
    if (!confirm(`Delete "${itemName}" from the menu? This can't be undone.`)) return;
    const res = await fetch(`/api/items/${itemId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || `Failed to delete item (status ${res.status})`);
      return;
    }
    loadMenu();
  }

  async function toggleStock(itemId, available) {
    setCategories((prev) =>
      prev.map((c) => ({
        ...c,
        items: c.items.map((it) => (it.id === itemId ? { ...it, available } : it)),
      }))
    );
    await fetch(`/api/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ available }),
    });
  }

  const activeOrders = orders.filter((o) => o.status !== "cancelled" && o.status !== "served");

  const baseFilteredOrders = showDeleted
    ? deletedOrders
    : orders.filter((o) => {
        if (orderFilter === "active") return o.status !== "cancelled" && o.status !== "served";
        if (orderFilter === "all") return true;
        return o.status === orderFilter;
      });

  const filteredOrders = dateFilterEnabled
    ? baseFilteredOrders.filter((o) => {
        const orderDate = new Date(o.createdAt);
        if (Number.isNaN(orderDate.getTime())) return false;
        return toLocalDateStr(orderDate) === selectedDate;
      })
    : baseFilteredOrders;

  const groupedOrders = [...filteredOrders]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .reduce((acc, order) => {
      const key = toLocalDateStr(order.createdAt);
      if (!acc[key]) acc[key] = [];
      acc[key].push(order);
      return acc;
    }, {});

  function formatDateLabel(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "Unknown date";
    return date.toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  return (
    <div className="admin-body">
      <div className="admin-container">
        {/* Sleek Command Center Clay Header */}
        <div className="admin-header">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div className="admin-logo-holder">
              <img
                src="/logo.png"
                alt=""
                onError={(e) => {
                  e.target.style.display = "none";
                  e.target.nextSibling.style.display = "flex";
                }}
              />
              <span className="admin-logo-fallback">H</span>
            </div>
            <div>
              <div className="admin-title">Hangout Restro Cafe</div>
              <div className="admin-sub">Admin Command Center · Real-time socket sync</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ position: "relative" }}>
              <button
                className="sound-toggle-btn"
                onClick={() => {
                  const next = !showNotifPanel;
                  setShowNotifPanel(next);
                  if (next && unreadCount > 0) markNotificationsRead();
                }}
                style={{ position: "relative" }}
              >
                🔔 Notifications
                {unreadCount > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: -6,
                      right: -6,
                      background: "var(--red-600, #dc2626)",
                      color: "#fff",
                      borderRadius: "999px",
                      fontSize: 11,
                      fontWeight: 800,
                      padding: "1px 6px",
                    }}
                  >
                    {unreadCount}
                  </span>
                )}
              </button>
              {showNotifPanel && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "110%",
                    width: 320,
                    maxHeight: 400,
                    overflowY: "auto",
                    background: "var(--surface-white)",
                    borderRadius: 14,
                    boxShadow: "var(--clay-card-shadow)",
                    border: "1px solid var(--blue-100)",
                    zIndex: 50,
                    padding: 10,
                  }}
                >
                  {notifications.length === 0 && (
                    <div style={{ padding: 12, fontSize: 13, color: "var(--muted)" }}>No notifications yet.</div>
                  )}
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      style={{
                        padding: "10px 8px",
                        borderBottom: "1px solid var(--blue-50)",
                        fontSize: 13,
                        color: "var(--navy-800)",
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{n.message}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{new Date(n.createdAt).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              className="sound-toggle-btn"
              onClick={() => {
                setSoundEnabled(!soundEnabled);
                // Test audio gesture activation
                try {
                  const audio = new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoAAAAAAAAA");
                  audio.play().catch(() => {});
                } catch (e) {}
              }}
            >
              {soundEnabled ? "🔊 Sound Alert: ON" : "🔇 Enable Sound Alert"}
            </button>
            <button className="sound-toggle-btn" onClick={() => setShowAccountModal(true)}>
              ⚙️ Account
            </button>
            <button className="sound-toggle-btn" onClick={handleLogout}>
              🚪 Logout
            </button>
          </div>
        </div>

        {showAccountModal && (
          <AccountModal restaurantId={restaurantId} onClose={() => setShowAccountModal(false)} />
        )}
        {checkoutSessionId && (
          <CheckoutModal
            sessionId={checkoutSessionId}
            onClose={() => setCheckoutSessionId(null)}
            onCheckout={checkoutTable}
          />
        )}

        {/* Admin Navigation Tabs */}
        <div className="admin-tabs">
          <button className={`admin-tab ${tab === "orders" ? "active" : ""}`} onClick={() => setTab("orders")}>
            Live Orders ({activeOrders.length})
          </button>
          <button className={`admin-tab ${tab === "tables" ? "active" : ""}`} onClick={() => setTab("tables")}>
            Table Sessions ({tables.filter((t) => t.sessions?.length > 0).length})
          </button>
          <button className={`admin-tab ${tab === "menu" ? "active" : ""}`} onClick={() => setTab("menu")}>
            Menu & Stock Editor
          </button>
          <button className={`admin-tab ${tab === "qr" ? "active" : ""}`} onClick={() => setTab("qr")}>
            Table QR Studio
          </button>
          <button className={`admin-tab ${tab === "reviews" ? "active" : ""}`} onClick={() => setTab("reviews")}>
            Reviews {reviewsAvg ? `(⭐ ${reviewsAvg.toFixed(1)})` : ""}
          </button>
          <button className={`admin-tab ${tab === "revenue" ? "active" : ""}`} onClick={() => setTab("revenue")}>
            💰 Revenue
          </button>
        </div>

        {/* Tab 1: Live Orders */}
        {tab === "orders" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              {!showDeleted &&
                ["active", "pending", "preparing", "ready", "all"].map((f) => (
                  <button
                    key={f}
                    className={`veg-pill ${orderFilter === f ? "active-veg" : ""}`}
                    style={{ textTransform: "capitalize", padding: "8px 16px" }}
                    onClick={() => setOrderFilter(f)}
                  >
                    {f} Orders
                  </button>
                ))}
              <button
                className={`veg-pill ${showDeleted ? "active-veg" : ""}`}
                style={{ padding: "8px 16px" }}
                onClick={() => {
                  const next = !showDeleted;
                  setShowDeleted(next);
                  if (next) loadDeletedOrders();
                }}
              >
                🗑 {showDeleted ? "Back to Live Orders" : "Deleted Orders"}
              </button>

              <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  className={`veg-pill ${dateFilterEnabled ? "active-veg" : ""}`}
                  onClick={() => setDateFilterEnabled((prev) => !prev)}
                  style={{ padding: "8px 14px" }}
                >
                  {dateFilterEnabled ? "Showing selected date" : "All dates"}
                </button>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 999,
                    border: "1px solid var(--blue-200)",
                    background: "var(--surface-white)",
                    color: "var(--navy-900)",
                    fontWeight: 700,
                  }}
                />
              </div>
            </div>

            <div>
              {filteredOrders.length === 0 && (
                <div className="empty-state">No orders matching this filter.</div>
              )}

              {Object.entries(groupedOrders).map(([dateKey, dayOrders]) => (
                <div key={dateKey} style={{ marginBottom: 24 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ fontWeight: 800, color: "var(--blue-700)" }}>{formatDateLabel(dayOrders[0].createdAt)}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>
                      {dayOrders.length} order{dayOrders.length === 1 ? "" : "s"}
                    </div>
                  </div>

                  <div className="order-grid">
                    {dayOrders.map((order) =>
                      showDeleted ? (
                        <DeletedOrderCard key={order.id} order={order} />
                      ) : (
                        <OrderCard
                          key={order.id}
                          order={order}
                          isNew={newOrderIds.has(order.id)}
                          onUpdate={(status) => updateOrderStatus(order.id, status)}
                          onItemUpdate={(itemId, itemStatus) => updateOrderItem(order.id, itemId, itemStatus)}
                          onTransfer={() => transferSession(order.sessionId, order.session?.table?.number)}
                          onDelete={() => deleteOrder(order.id)}
                        />
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: Table Sessions & Checkout — a table can have MULTIPLE concurrent
            sessions (separate bills) if people at the same table chose not to share */}
        {tab === "tables" && (
          <div className="table-sessions-grid">
            {tables.length === 0 && (
              <div className="empty-state">No active table sessions found.</div>
            )}
            {tables.map((t) => {
              const activeSessions = t.sessions || [];

              return (
                <div key={t.id} style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8, color: t.isParcel ? "var(--orange-700, #b45f14)" : "inherit" }}>
                    {t.isParcel ? "📦 Parcels" : `Table ${t.number}`}
                    {activeSessions.length > 1 && (
                      <span style={{ fontWeight: 700, fontSize: 12, color: "var(--muted)", marginLeft: 8 }}>
                        {activeSessions.length} separate bills
                      </span>
                    )}
                  </div>

                  {activeSessions.length === 0 && (
                    <div className="table-session-card">
                      <div style={{ fontSize: 13, color: "var(--muted)", padding: "8px 0" }}>
                        {t.isParcel ? "No parcel orders right now." : `No active guests currently at Table ${t.number}.`}
                      </div>
                    </div>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
                    {activeSessions.map((session) => {
                      const tableOrders = session.orders || [];
                      const cartCount = (session.cartItems || []).reduce((s, c) => s + c.quantity, 0);
                      const totalAmount = tableOrders.reduce((sum, ord) => {
                        const ordSum = ord.items
                          .filter((it) => it.status !== "cancelled" && it.status !== "rejected")
                          .reduce((s, it) => s + (it.price ?? it.menuItem?.price ?? 0) * it.quantity, 0);
                        return sum + ordSum;
                      }, 0);
                      const isBillRequested = session.status === "bill_requested";

                      return (
                        <div key={session.id} className="table-session-card">
                          <div className="table-status-header">
                            <span className="order-table-num">Session</span>
                            <span
                              className="status-pill"
                              style={
                                isBillRequested
                                  ? { background: "var(--gold, #e8a33d)", color: "#fff" }
                                  : { background: "var(--blue-100, #e2ecfb)", color: "var(--blue-700, #1d4ed8)" }
                              }
                            >
                              {isBillRequested ? "🧾 Bill Requested" : "Active"}
                            </span>
                          </div>

                          {t.isParcel && session.parcelLabel && (
                            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--orange-700, #b45f14)", margin: "0 0 6px" }}>
                              📦 {session.parcelLabel}
                            </p>
                          )}
                          <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 10px" }}>
                            Orders placed: <strong>{tableOrders.length}</strong>
                            {cartCount > 0 && <> · {cartCount} item{cartCount > 1 ? "s" : ""} still in cart</>}
                          </p>

                          <div style={{ background: "var(--blue-50)", padding: 12, borderRadius: 12, marginBottom: 12 }}>
                            <div style={{ fontSize: 12, color: "var(--muted)" }}>Current Running Bill</div>
                            <div style={{ fontSize: 22, fontWeight: 800, color: "var(--blue-700)" }}>₹{totalAmount}</div>
                          </div>

                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              className="secondary-btn"
                              style={{ flex: 1 }}
                              onClick={() => transferSession(session.id, t.number)}
                            >
                              🔀 Move
                            </button>
                            <button className="checkout-btn" style={{ flex: 1 }} onClick={() => setCheckoutSessionId(session.id)}>
                              💳 Checkout
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 3: Menu & Stock Editor */}
        {tab === "menu" && (
          <div>
            <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Add Category</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input id="new-cat-name" placeholder="Category name" />
                  <button
                    onClick={async () => {
                      const input = document.getElementById('new-cat-name');
                      const name = input?.value?.trim();
                      if (!name) return alert('Name required');
                      await fetch('/api/menu', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ restaurantId, name }) });
                      input.value = '';
                      loadMenu();
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>

              <div style={{ marginLeft: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Add Item</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select id="new-item-cat">
                    <option value="">Select category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <input id="new-item-name" placeholder="Item name" />
                  <input id="new-item-price" placeholder="Price" type="number" />
                  <input id="new-item-desc" placeholder="Description (optional)" style={{ minWidth: 200 }} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                    <input id="new-item-veg" type="checkbox" defaultChecked /> Veg
                  </label>
                  <button
                    onClick={async () => {
                      const cat = document.getElementById('new-item-cat')?.value;
                      const name = document.getElementById('new-item-name')?.value?.trim();
                      const price = document.getElementById('new-item-price')?.value;
                      const description = document.getElementById('new-item-desc')?.value?.trim();
                      const veg = document.getElementById('new-item-veg')?.checked;
                      if (!cat || !name || !price) return alert('category, name, price required');
                      await fetch('/api/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ restaurantId, categoryId: cat, name, price, veg, description }) });
                      document.getElementById('new-item-name').value = '';
                      document.getElementById('new-item-price').value = '';
                      document.getElementById('new-item-desc').value = '';
                      loadMenu();
                    }}
                  >
                    Add Item
                  </button>
                </div>
              </div>
            </div>
            {categories.map((cat) => (
              <div key={cat.id} style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 800, textTransform: "uppercase", color: "var(--muted)", margin: 0 }}>
                    {cat.name}
                  </h3>
                  <button
                    onClick={() => deleteCategory(cat.id, cat.name)}
                    title="Delete category"
                    style={{
                      padding: "4px 10px",
                      background: "var(--red-100, #fde2e2)",
                      color: "var(--red-600, #dc2626)",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    🗑 Delete Category
                  </button>
                </div>
                {cat.items.map((item) => (
                  <div key={item.id} className="menu-editor-row">
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15, color: "var(--navy-900)" }}>{item.name}</div>
                      <div style={{ fontSize: 13, color: "var(--blue-700)", fontWeight: 700 }}>₹{item.price}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <button
                        className={`toggle ${item.available ? "on" : ""}`}
                        onClick={() => toggleStock(item.id, !item.available)}
                        title={item.available ? "Mark out of stock" : "Mark available"}
                      >
                        <span className="toggle-dot" />
                      </button>
                      <button
                        onClick={() => deleteItem(item.id, item.name)}
                        title="Delete item"
                        style={{
                          padding: "4px 10px",
                          background: "var(--red-100, #fde2e2)",
                          color: "var(--red-600, #dc2626)",
                          border: "none",
                          borderRadius: 6,
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 800,
                        }}
                      >
                        🗑 Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Tab 4: QR Code Studio */}
        {tab === "qr" && <QrTab origin={origin} localIp={localIp} restaurantId={restaurantId} allTables={allTables} onTablesChange={loadAllTables} />}

        {/* Tab 5: Customer Reviews */}
        {tab === "reviews" && (
          <div>
            <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: "var(--blue-700)" }}>
                {reviewsAvg ? reviewsAvg.toFixed(1) : "—"} <span style={{ fontSize: 16 }}>/ 5</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>{reviews.length} review{reviews.length === 1 ? "" : "s"}</div>
            </div>

            {reviews.length === 0 && <div className="empty-state">No reviews yet.</div>}

            {reviews.map((rv) => (
              <div key={rv.id} className="order-batch" style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 18 }}>{"⭐".repeat(rv.rating)}</span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    Table {rv.session?.table?.number ?? "?"} · {new Date(rv.createdAt).toLocaleString()}
                  </span>
                </div>
                {rv.comment && (
                  <p style={{ fontSize: 13.5, color: "var(--navy-800)", margin: "8px 0 0" }}>{rv.comment}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tab 6: Revenue */}
        {tab === "revenue" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {["day", "week", "month"].map((r) => (
                <button
                  key={r}
                  className={`veg-pill ${revenueRange === r ? "active-veg" : ""}`}
                  style={{ textTransform: "capitalize", padding: "8px 16px" }}
                  onClick={() => setRevenueRange(r)}
                >
                  {r === "day" ? "Today" : r === "week" ? "Last 7 Days" : "This Month"}
                </button>
              ))}
            </div>

            <div className="order-batch" style={{ textAlign: "center", padding: 32 }}>
              <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 700, marginBottom: 8 }}>TOTAL REVENUE</div>
              <div style={{ fontSize: 40, fontWeight: 800, color: "var(--blue-700)" }}>
                {revenue ? `₹${revenue.total.toLocaleString()}` : "—"}
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>
                {revenue ? `${revenue.orderCount} order${revenue.orderCount === 1 ? "" : "s"}` : ""}
              </div>
            </div>

            {revenue?.paymentTotals && (
              <div className="order-batch" style={{ padding: 20, marginTop: 16 }}>
                <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 700, marginBottom: 14 }}>PAYMENT BREAKDOWN</div>
                <div style={{ display: "flex", gap: 12 }}>
                  {[
                    { key: "cash", label: "💵 Cash" },
                    { key: "upi", label: "📱 UPI" },
                    { key: "lend", label: "🤝 Lent" },
                  ].map((p) => (
                    <div key={p.key} style={{ flex: 1, textAlign: "center", padding: "12px 8px", background: "var(--surface-ice)", borderRadius: "var(--radius-md)" }}>
                      <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>{p.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>
                        ₹{(revenue.paymentTotals[p.key] || 0).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>

                {revenue.lentBreakdown?.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, marginBottom: 8 }}>OUTSTANDING — LENT TO</div>
                    {revenue.lentBreakdown.map((l) => (
                      <div key={l.sessionId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--blue-100)" }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{l.name}</div>
                          <div style={{ fontSize: 11, color: "var(--muted)" }}>
                            {l.closedAt ? new Date(l.closedAt).toLocaleDateString() : ""}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontWeight: 700, color: "var(--nonveg)" }}>₹{l.amount.toLocaleString()}</span>
                          <button
                            className="secondary-btn"
                            style={{ padding: "4px 10px", fontSize: 11.5 }}
                            onClick={() => markLentReturned(l.sessionId)}
                          >
                            ✓ Returned
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {revenue?.buckets?.length > 0 && (
              <div className="order-batch" style={{ padding: 20, marginTop: 16 }}>
                <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 700, marginBottom: 14 }}>REVENUE TREND</div>
                {(() => {
                  const max = Math.max(1, ...revenue.buckets.map((b) => b.total));
                  return (
                    <div style={{ display: "flex", alignItems: "flex-end", gap: revenueRange === "day" ? 2 : 6, height: 120, overflowX: "auto" }}>
                      {revenue.buckets.map((b, i) => (
                        <div
                          key={i}
                          title={`${b.label}: ₹${b.total.toLocaleString()}`}
                          style={{ flex: "0 0 auto", width: revenueRange === "day" ? 8 : 22, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
                        >
                          <div style={{ width: "100%", height: 100, display: "flex", alignItems: "flex-end" }}>
                            <div
                              style={{
                                width: "100%",
                                height: `${Math.max(2, Math.round((b.total / max) * 100))}%`,
                                background: b.total > 0 ? "var(--blue-500)" : "var(--blue-100)",
                                borderRadius: 4,
                                transition: "height 0.3s ease",
                              }}
                            />
                          </div>
                          {revenueRange !== "day" && (
                            <div style={{ fontSize: 9, color: "var(--muted)", whiteSpace: "nowrap" }}>{b.label.slice(5)}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {revenue?.topItems?.length > 0 && (
              <div className="order-batch" style={{ padding: 20, marginTop: 16 }}>
                <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 700, marginBottom: 14 }}>TOP SELLING ITEMS</div>
                {revenue.topItems.map((item, i) => (
                  <div
                    key={i}
                    style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < revenue.topItems.length - 1 ? "1px solid var(--blue-100)" : "none" }}
                  >
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                      {i + 1}. {item.name} <span style={{ color: "var(--muted)", fontWeight: 500 }}>× {item.qty}</span>
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--blue-700)" }}>₹{item.revenue.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DeletedOrderCard({ order }) {
  const table = order.session?.table?.number;
  const isParcel = order.session?.table?.isParcel;
  const parcelLabel = order.session?.parcelLabel;
  const total = order.items.reduce((sum, i) => sum + (i.price ?? i.menuItem?.price ?? 0) * i.quantity, 0);
  return (
    <div className="order-card" style={{ opacity: 0.75 }}>
      <div className="order-card-top">
        <span className="order-table-num">{isParcel ? `📦 Parcel${parcelLabel ? " — " + parcelLabel : ""}` : `Table ${table}`}</span>
        <span className="order-time">{new Date(order.createdAt).toLocaleTimeString()}</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--red-600, #dc2626)", fontWeight: 700, marginBottom: 6 }}>
        Deleted {order.deletedAt ? new Date(order.deletedAt).toLocaleString() : ""}
      </div>
      {order.items.map((i) => (
        <div key={i.id} style={{ fontSize: 13, color: "var(--navy-800)" }}>
          {i.quantity}x {i.name || i.menuItem?.name}
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, marginTop: 8 }}>
        <span>Total</span>
        <span style={{ color: "var(--blue-700)" }}>₹{total}</span>
      </div>
    </div>
  );
}

function OrderCard({ order, isNew, onUpdate, onItemUpdate, onTransfer, onDelete }) {
  const table = order.session?.table?.number;
  const isParcel = order.session?.table?.isParcel;
  const parcelLabel = order.session?.parcelLabel;
  const nextAction = {
    pending: { label: "Accept Order", status: "accepted", cls: "btn-accept" },
    accepted: { label: "Start Preparing", status: "preparing", cls: "btn-preparing" },
    preparing: { label: "Mark Ready", status: "ready", cls: "btn-ready" },
    ready: { label: "Mark Served", status: "served", cls: "btn-served" },
  }[order.status];

  const activeItems = order.items.filter((i) => i.status !== "cancelled" && i.status !== "rejected");
  const cancelRequests = order.items.filter((i) => i.status === "cancellation_requested");
  // Prefer the price/name snapshotted at order time over the live menu item, so a later
  // menu price edit never silently changes what an already-placed order shows.
  const orderTotal = activeItems.reduce((sum, i) => sum + (i.price ?? i.menuItem?.price ?? 0) * i.quantity, 0);

  function handleCancelRequest(itemId, approve) {
    // Reject reverts the item back to "accepted" — it stays on the order as normal.
    onItemUpdate(itemId, approve ? "cancelled" : "accepted");
  }

  return (
    <div className={`order-card ${isNew ? "is-new" : ""}`}>
      <div className="order-card-top">
        <span className="order-table-num">{isParcel ? `📦 Parcel${parcelLabel ? " — " + parcelLabel : ""}` : `Table ${table}`}</span>
        <span className="order-time">{new Date(order.createdAt).toLocaleTimeString()}</span>
      </div>

      <div style={{ marginBottom: 12 }}>
        <span className={`status-pill status-${order.status}`}>{order.status}</span>
      </div>

      {cancelRequests.length > 0 && (
        <div style={{ background: "var(--orange-50)", padding: 12, borderRadius: 8, marginBottom: 12, borderLeft: "3px solid var(--orange-500)" }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: "var(--orange-700)", marginBottom: 8 }}>
            ⏳ Cancellation Requests ({cancelRequests.length})
          </div>
          {cancelRequests.map((it) => (
            <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, marginBottom: 8, borderBottom: "1px solid var(--orange-200)" }}>
              <span style={{ fontSize: 13 }}>
                {it.quantity}× {it.name || it.menuItem?.name}
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => handleCancelRequest(it.id, true)}
                  style={{
                    padding: "4px 12px",
                    background: "#dc2626",
                    color: "#fff",
                    border: "none",
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  ✓ Approve
                </button>
                <button
                  onClick={() => handleCancelRequest(it.id, false)}
                  style={{
                    padding: "4px 12px",
                    background: "#fca5a5",
                    color: "#7f1d1d",
                    border: "none",
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  ✕ Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeItems.map((it) => (
        <div key={it.id} className="order-item-line">
          <span>
            <strong>{it.quantity}×</strong> {it.name || it.menuItem?.name}
            {it.addedBy && <span style={{ color: "var(--muted)", fontSize: 12 }}> ({it.addedBy})</span>}
          </span>
          <span style={{ fontWeight: 700 }}>₹{(it.price ?? it.menuItem?.price ?? 0) * it.quantity}</span>
        </div>
      ))}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--blue-100)", fontWeight: 800 }}>
        <span>Total</span>
        <span style={{ color: "var(--blue-700)" }}>₹{orderTotal}</span>
      </div>

      <div className="order-actions">
        {order.status === "pending" && (
          <button className="action-btn btn-reject" onClick={() => onUpdate("cancelled")}>
            Reject
          </button>
        )}
        {order.status !== "ready" && order.status !== "served" && (
          <button className="action-btn" style={{ background: "var(--line, #e8e1d8)" }} onClick={onTransfer}>
            🔀 Move
          </button>
        )}
        {nextAction && (
          <button className={`action-btn ${nextAction.cls}`} onClick={() => onUpdate(nextAction.status)}>
            {nextAction.label}
          </button>
        )}
        <button
          className="action-btn"
          style={{ background: "var(--red-100, #fde2e2)", color: "var(--red-600, #dc2626)" }}
          onClick={onDelete}
          title="Delete order (kept in Deleted Orders history)"
        >
          🗑
        </button>
      </div>
    </div>
  );
}

function QrTab({ origin, localIp, restaurantId, allTables, onTablesChange }) {
  const [newTableNum, setNewTableNum] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());

  const byId = Object.fromEntries(allTables.map((t) => [t.id, t]));
  function primaryNumberFor(t) {
    return t.groupId ? byId[t.groupId]?.number : null;
  }
  function membersOf(t) {
    return allTables.filter((o) => o.groupId === t.id);
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function combineSelected() {
    const numbers = allTables.filter((t) => selected.has(t.id)).map((t) => t.number);
    if (numbers.length < 2) return alert("Select at least 2 tables to combine");
    setLoading(true);
    try {
      const res = await fetch("/api/tables", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "combine", restaurantId, tableNumbers: numbers }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Failed to combine tables");
      } else {
        setSelected(new Set());
        onTablesChange();
      }
    } finally {
      setLoading(false);
    }
  }

  async function uncombine(tableNumber) {
    if (!confirm(`Split Table ${tableNumber}'s combined group back into separate tables?`)) return;
    setLoading(true);
    try {
      const res = await fetch("/api/tables", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "uncombine", restaurantId, tableNumber }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Failed to split tables");
      } else {
        onTablesChange();
      }
    } finally {
      setLoading(false);
    }
  }

  const baseUrl = origin;

  async function addTable() {
    if (!newTableNum.trim()) return alert("Enter a table number");
    const num = Number(newTableNum);
    if (isNaN(num) || num <= 0) return alert("Table number must be a positive integer");

    setLoading(true);
    try {
      const res = await fetch("/api/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId, tableNumber: num }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewTableNum("");
        onTablesChange();
      } else {
        alert(data.error || "Failed to add table");
      }
    } catch (err) {
      alert("Error adding table");
    } finally {
      setLoading(false);
    }
  }

  async function addParcelTable() {
    const hasParcel = allTables.some((t) => t.isParcel);
    if (hasParcel) return alert("A Parcels table already exists — only one is needed.");
    const nextNum = allTables.length > 0 ? Math.max(...allTables.map((t) => t.number)) + 1 : 1;

    setLoading(true);
    try {
      const res = await fetch("/api/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId, tableNumber: nextNum, isParcel: true }),
      });
      const data = await res.json();
      if (res.ok) {
        onTablesChange();
      } else {
        alert(data.error || "Failed to add Parcels table");
      }
    } catch (err) {
      alert("Error adding Parcels table");
    } finally {
      setLoading(false);
    }
  }

  async function deleteTable(tableId) {
    if (!confirm("Are you sure? This will delete all orders and sessions for this table.")) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/tables?id=${tableId}`, { method: "DELETE" });
      if (res.ok) {
        onTablesChange();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete table");
      }
    } catch (err) {
      alert("Error deleting table");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>📋 Manage Tables</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            type="number"
            placeholder="Table number (e.g., 1, 2, 3...)"
            value={newTableNum}
            onChange={(e) => setNewTableNum(e.target.value)}
            disabled={loading}
            min="1"
          />
          <button onClick={addTable} disabled={loading} style={{ fontWeight: 800 }}>
            {loading ? "Adding..." : "+ Add Table"}
          </button>
          {!allTables.some((t) => t.isParcel) && (
            <button
              onClick={addParcelTable}
              disabled={loading}
              style={{ fontWeight: 800, background: "var(--orange-500, #ea7c1f)", color: "#fff" }}
            >
              📦 Add Parcels Table
            </button>
          )}
        </div>

        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong>Total Tables: {allTables.length}</strong>
          <button className="combine-btn" onClick={combineSelected} disabled={loading || selected.size < 2}>
            🔗 Combine Selected ({selected.size})
          </button>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
          Check 2+ tables to combine into one shared bill — the smallest table number becomes the group's QR/identity.
          Only works before anyone's seated at those tables.
        </div>

        {allTables.length > 0 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 12,
            }}
          >
            {allTables.map((t) => {
              const primaryNum = primaryNumberFor(t);
              const members = membersOf(t);
              return (
                <div
                  key={t.id}
                  style={{
                    padding: 12,
                    border: t.isParcel ? "1px solid var(--orange-400, #f0a35c)" : "1px solid var(--blue-200)",
                    borderRadius: 12,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    backgroundColor: t.isParcel ? "var(--orange-50, #fef3e8)" : "var(--blue-50)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 800, fontSize: 15 }}>
                      {!t.groupId && !t.isParcel && (
                        <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSelect(t.id)} />
                      )}
                      {t.isParcel ? "📦 Parcels" : `Table ${t.number}`}
                    </label>
                    <button
                      onClick={() => deleteTable(t.id)}
                      disabled={loading}
                      style={{
                        padding: "4px 8px",
                        background: "var(--red-100)",
                        color: "var(--red-600)",
                        border: "none",
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      Delete
                    </button>
                  </div>

                  {primaryNum && (
                    <div className="table-group-badge">→ Combined into Table {primaryNum}</div>
                  )}
                  {members.length > 0 && (
                    <>
                      <div className="table-group-badge">
                        Combined with Table {members.map((m) => m.number).join(", ")}
                      </div>
                      <button className="table-split-btn" onClick={() => uncombine(t.number)} disabled={loading}>
                        Split
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ color: "var(--muted)", fontSize: 14 }}>No tables yet. Add your first table above.</div>
        )}
      </div>

      <hr style={{ margin: "24px 0", border: "none", borderTop: "1px solid var(--blue-100)" }} />

      <div>
        <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
          Print these QR codes and place one on each table. Customers can scan to access the live menu & shared table
          cart.
          <br />
          <strong>Local IP: {localIp}</strong>
        </p>
        {allTables.length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: 14 }}>Add tables above to generate QR codes.</div>
        ) : (
          <div className="qr-grid">
            {allTables
              .filter((t) => !t.groupId) // member tables share the primary's QR — nothing separate to print
              .map((t) => {
                const url = `${baseUrl}/menu/${restaurantId}/${t.number}`;
                const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
                const members = membersOf(t);
                return (
                  <div
                    key={t.id}
                    className="qr-card"
                    style={t.isParcel ? { border: "2px solid var(--orange-400, #f0a35c)", background: "var(--orange-50, #fef3e8)" } : undefined}
                  >
                    <img src={qrImg} alt={t.isParcel ? "Parcels QR" : `Table ${t.number} QR`} />
                    <div style={{ fontWeight: 800, fontSize: 15, color: t.isParcel ? "var(--orange-700, #b45f14)" : "var(--navy-900)", marginBottom: 4 }}>
                      {t.isParcel ? "📦 Parcels" : `Table ${t.number}`}
                      {members.length > 0 && ` (+ Table ${members.map((m) => m.number).join(", ")})`}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", wordBreak: "break-all" }}>{url}</div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}

function CheckoutModal({ sessionId, onClose, onCheckout }) {
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [lentToName, setLentToName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    setError("");
    if (paymentMethod === "lend" && !lentToName.trim()) {
      setError("Enter the customer's name for a lent bill.");
      return;
    }
    setSaving(true);
    const ok = await onCheckout(sessionId, paymentMethod, lentToName.trim() || null);
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(20, 30, 50, 0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
      onClick={onClose}
    >
      <div className="order-batch" style={{ width: 340, maxWidth: "90vw", padding: 24 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>Checkout Table</div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16 }}>How was this bill settled?</p>

        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>Payment Method</label>
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          style={{ width: "100%", padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--blue-100)", marginTop: 6, marginBottom: 14, fontSize: 14 }}
        >
          <option value="cash">Cash</option>
          <option value="upi">UPI</option>
          <option value="lend">Lend (pay later)</option>
        </select>

        {paymentMethod === "lend" && (
          <>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>Customer Name</label>
            <input
              type="text"
              value={lentToName}
              onChange={(e) => setLentToName(e.target.value)}
              placeholder="Who is this lent to?"
              style={{ width: "100%", padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--blue-100)", marginTop: 6, marginBottom: 14, fontSize: 14 }}
            />
          </>
        )}

        {error && <p style={{ color: "var(--nonveg)", fontSize: 12.5, marginBottom: 10 }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <button className="secondary-btn" style={{ flex: 1 }} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="checkout-btn" style={{ flex: 1 }} onClick={handleConfirm} disabled={saving}>
            {saving ? "Closing…" : "Confirm & Close Table"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AccountModal({ restaurantId, onClose }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError("");
    if (!currentPassword) {
      setError("Enter your current password to confirm changes.");
      return;
    }
    if (!newUsername.trim() && !newPassword.trim()) {
      setError("Enter a new username and/or a new password.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/admin/credentials", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId, currentPassword, newUsername, newPassword }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Failed to update credentials");
      return;
    }
    // Credentials changed — the server clears the session cookie, so log back in.
    alert("Credentials updated. Please log in again.");
    window.location.href = `/admin/login?restaurantId=${restaurantId}`;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20, 30, 50, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        className="order-batch"
        style={{ width: 360, maxWidth: "90vw", padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>Account Settings</div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16 }}>
          Change your admin username and/or password.
        </p>

        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>Current Password</label>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          style={{ width: "100%", padding: 10, borderRadius: 10, border: "1.5px solid var(--blue-200)", margin: "4px 0 12px" }}
        />

        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>New Username (optional)</label>
        <input
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
          style={{ width: "100%", padding: 10, borderRadius: 10, border: "1.5px solid var(--blue-200)", margin: "4px 0 12px" }}
        />

        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>New Password (optional, 6+ chars)</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          style={{ width: "100%", padding: 10, borderRadius: 10, border: "1.5px solid var(--blue-200)", margin: "4px 0 12px" }}
        />

        {error && <div style={{ color: "var(--red-600, #dc2626)", fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button className="primary-btn" style={{ flex: 1, padding: 10 }} disabled={saving} onClick={handleSave}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <button className="secondary-btn" style={{ flex: 1, padding: 10 }} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}