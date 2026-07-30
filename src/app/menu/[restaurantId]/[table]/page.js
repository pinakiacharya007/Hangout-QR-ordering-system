"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { io } from "socket.io-client";

let SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";

export default function CustomerMenuPage() {
  const { restaurantId, table } = useParams();

  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [vegFilter, setVegFilter] = useState("all"); // all | veg | nonveg
  const [searchQuery, setSearchQuery] = useState("");
  
  const [session, setSession] = useState(null);
  const [cartItems, setCartItems] = useState([]); // [{ id, menuItemId, quantity, addedBy, menuItem }]
  const [showCart, setShowCart] = useState(false);
  const [name, setName] = useState("");
  const [orders, setOrders] = useState([]);
  const [placing, setPlacing] = useState(false);
  const [sessionClosedNotice, setSessionClosedNotice] = useState(false);
  const [closedSessionId, setClosedSessionId] = useState(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewText, setReviewText] = useState("");
  const [isOwner, setIsOwner] = useState(true);
  const [askingName, setAskingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  // "checking" -> looking for existing sessions at this table
  // "choosing" -> multiple/one session already active here, customer must pick join/new
  // "ready"    -> session is set, menu can render
  const [sessionStage, setSessionStage] = useState("checking");
  const [sessionOptions, setSessionOptions] = useState([]);
  const [currentTableNumber, setCurrentTableNumber] = useState(table);
  const [billRequested, setBillRequested] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // 0. Detect local network IP for socket connection (local network support)
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      fetch("/api/localip")
        .then((r) => r.json())
        .then((d) => {
          if (d.localIp && d.localIp !== "localhost") {
            SOCKET_URL = `http://${d.localIp}:4000`;
          }
        })
        .catch(() => {});
    }
  }, []);

  const initRef = useRef(false);

  function storageKey() {
    return `tabletap:${restaurantId}:${table}`;
  }
  function roleKey() {
    return `tabletap:role:${restaurantId}:${table}`;
  }
  function nameKey() {
    return `tabletap:name:${restaurantId}:${table}`;
  }

  // 1. Check whether this table already has active session(s). If so, ask the customer
  //    whether to join an existing bill or start their own — this is what makes
  //    "multiple people at one table" produce separate bills by default rather than
  //    silently merging carts.
  //
  //    Guarded with a ref + sessionStorage: without this, React's dev-mode double-effect
  //    invocation (and any later remount/reload) can race two "no active session yet"
  //    checks against each other and create two separate sessions for the SAME device.
  //    That's harmless-looking at first, but it means the socket can end up joined to
  //    the wrong session's room — so actions like cancelling an item succeed in the
  //    database but the confirmation never reaches this screen. Persisting the resolved
  //    session id per browser tab makes re-renders/reloads resume the same session
  //    deterministically instead of creating a fresh one each time.
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    init();

    async function init() {
      let savedSessionId = null;
      try {
        savedSessionId = sessionStorage.getItem(storageKey());
      } catch (e) {}

      const res = await fetch(`/api/session?restaurantId=${restaurantId}&tableNumber=${table}`);
      const data = await res.json();
      const options = data.activeSessions || [];

      if (savedSessionId) {
        const match = options.find((s) => s.id === savedSessionId);
        if (match) {
          try {
            setIsOwner(sessionStorage.getItem(roleKey()) !== "member");
          } catch (e) {}
          applySession(match);
          return;
        }
        // Saved session is gone/closed — clear it and fall through to a fresh choice.
        try {
          sessionStorage.removeItem(storageKey());
        } catch (e) {}
      }

      if (options.length === 0) {
        startNewSession();
      } else {
        setSessionOptions(options);
        setSessionStage("choosing");
      }
    }
  }, [restaurantId, table]);

  function applySession(newSession) {
    setSession(newSession);
    setCurrentTableNumber(table);
    setBillRequested(newSession.status === "bill_requested");
    setCartItems(newSession.cartItems || []);
    setOrders(newSession.orders || []);
    setSessionStage("ready");
    try {
      sessionStorage.setItem(storageKey(), newSession.id);
      const savedName = sessionStorage.getItem(nameKey());
      if (savedName) {
        setName(savedName);
      } else {
        setAskingName(true);
      }
    } catch (e) {
      setAskingName(true);
    }
  }

  async function startNewSession() {
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId, tableNumber: table, mode: "new" }),
    });
    const data = await res.json();
    if (data.session) {
      setIsOwner(true);
      try {
        sessionStorage.setItem(roleKey(), "owner");
      } catch (e) {}
      applySession(data.session);
    }
  }

  async function joinSession(existingSessionId) {
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId, tableNumber: table, mode: "join", sessionId: existingSessionId }),
    });
    const data = await res.json();
    if (data.session) {
      setIsOwner(false);
      try {
        sessionStorage.setItem(roleKey(), "member");
      } catch (e) {}
      applySession(data.session);
    }
  }

  async function requestBill() {
    if (!session || !isOwner) return;
    await fetch("/api/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.id, action: "request_bill" }),
    });
    setBillRequested(true);
  }

  // 2. Load menu categories and items
  useEffect(() => {
    fetch(`/api/menu?restaurantId=${restaurantId}`)
      .then((r) => r.json())
      .then((data) => {
        setCategories(data.categories || []);
        if (data.categories?.[0]) setActiveCategory(data.categories[0].id);
      });
  }, [restaurantId]);

  // 3. Connect socket, join restaurant room & table session room
  useEffect(() => {
    if (!session) return;
    const s = io(SOCKET_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    s.on("connect", () => {
      console.log("[socket] ✅ Connected to socket server");
      s.emit("join", `restaurant-${restaurantId}`);
      s.emit("join", `table-${session.id}`);
      console.log(`[socket] ✅ Joined rooms: restaurant-${restaurantId}, table-${session.id}`);

      // Catch up on anything that happened while disconnected (screen lock, tab
      // backgrounded, brief network drop, reconnect after cold start) — pull fresh
      // state so a missed event doesn't leave the screen stale until a manual refresh.
      fetch(`/api/session?restaurantId=${restaurantId}&tableNumber=${table}`)
        .then((r) => r.json())
        .then((d) => {
          const match = (d.activeSessions || []).find((s2) => s2.id === session.id);
          if (match) {
            setOrders(match.orders || []);
            setCartItems(match.cartItems || []);
            setBillRequested(match.status === "bill_requested");
          }
        })
        .catch(() => {});
    });

    s.on("connect_error", (error) => {
      console.error("[socket] ❌ Connection error:", error);
    });

    s.on("disconnect", () => {
      console.warn("[socket] 🔴 Disconnected from socket server");
    });

    // Real-time stock update
    s.on("item-availability-updated", ({ itemId, available }) => {
      console.log("[socket] Item availability updated:", itemId, available);
      setCategories((prev) =>
        prev.map((c) => ({
          ...c,
          items: c.items.map((it) => (it.id === itemId ? { ...it, available } : it)),
        }))
      );
    });

    // Real-time menu item deletion
    s.on("item-deleted", ({ itemId }) => {
      console.log("[socket] Item deleted:", itemId);
      setCategories((prev) =>
        prev.map((c) => ({ ...c, items: c.items.filter((it) => it.id !== itemId) }))
      );
    });

    // Real-time shared cart update across all phones at table
    s.on("cart-updated", ({ cartItems: updatedCart }) => {
      console.log("[socket] Cart updated");
      setCartItems(updatedCart || []);
    });

    // Real-time order events
    s.on("order-placed", ({ order }) => {
      console.log("[socket] Order placed:", order.id);
      setOrders((prev) => {
        // Prevent duplicate orders with same id from being inserted
        if (prev.find((o) => o.id === order.id)) return prev;
        return [order, ...prev];
      });
    });

    s.on("order-updated", ({ order, removed }) => {
      console.log("[socket] Order updated:", order.id, order.status);
      if (removed) {
        setOrders((prev) => prev.filter((o) => o.id !== order.id));
      } else {
        setOrders((prev) => prev.map((o) => (o.id === order.id ? order : o)));
      }
    });

    // Real-time menu category deletion
    s.on("category-deleted", ({ categoryId }) => {
      console.log("[socket] Category deleted:", categoryId);
      setCategories((prev) => prev.filter((c) => c.id !== categoryId));
    });

    // Real-time session closed event by admin staff
    s.on("session-closed", () => {
      console.log("[socket] Session closed by admin");
      setClosedSessionId(session?.id || null);
      setSessionClosedNotice(true);
      setCartItems([]);
      setOrders([]);
      try {
        sessionStorage.removeItem(storageKey());
      } catch (e) {}
    });

    // Admin moved this session to a different table, or confirmed a bill request —
    // the socket room (table-<sessionId>) doesn't change when the table does, so we
    // just refresh the displayed table number / status here.
    s.on("session-updated", ({ session: updated }) => {
      console.log("[socket] Session updated:", updated);
      if (updated?.table?.number != null) setCurrentTableNumber(updated.table.number);
      if (updated?.status) setBillRequested(updated.status === "bill_requested");
    });

    return () => s.disconnect();
  }, [session, restaurantId]);

  // Map cart items into easy quantity map: { menuItemId: qty }
  const cartQtyMap = useMemo(() => {
    const map = {};
    cartItems.forEach((ci) => {
      map[ci.menuItemId] = ci.quantity;
    });
    return map;
  }, [cartItems]);

  const allItems = useMemo(() => categories.flatMap((c) => c.items), [categories]);

  const filteredItems = useMemo(() => {
    let items = [];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = allItems.filter(
        (i) => i.name.toLowerCase().includes(q) || (i.description && i.description.toLowerCase().includes(q))
      );
    } else {
      const cat = categories.find((c) => c.id === activeCategory);
      items = cat ? cat.items : [];
    }

    if (vegFilter === "veg") items = items.filter((i) => i.veg);
    if (vegFilter === "nonveg") items = items.filter((i) => !i.veg);
    return items;
  }, [categories, activeCategory, vegFilter, searchQuery, allItems]);

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cartItems.reduce((sum, item) => {
    const price = item.menuItem?.price || allItems.find((i) => i.id === item.menuItemId)?.price || 0;
    return sum + price * item.quantity;
  }, 0);

  // Real-time Shared Cart Delta API
  async function updateQty(menuItemId, delta) {
    if (!session) return;
    try {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          menuItemId,
          delta,
          addedBy: name || "Guest",
        }),
      });
      const data = await res.json();
      if (data.cartItems) {
        setCartItems(data.cartItems);
      }
    } catch (err) {
      console.error("Failed to update cart:", err);
    }
  }

  async function placeOrder() {
    if (!cartCount || !session || !isOwner) return;
    setPlacing(true);
    const items = cartItems.map((ci) => ({
      menuItemId: ci.menuItemId,
      quantity: ci.quantity,
      addedBy: name || ci.addedBy || "Guest",
    }));

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, items, restaurantId }),
      });
      const data = await res.json();
      if (data.order) {
        // Don't add order here — let the socket listener handle it
        // This prevents duplicate order entries from racing state updates
        setCartItems([]);
        setShowCart(false);
      }
    } catch (err) {
      console.error("Failed to place order:", err);
    } finally {
      setPlacing(false);
    }
  }

  async function requestCancelItem(orderId, orderItemId) {
    if (!isOwner) return;
    if (!confirm("Request cancellation for this item?")) return;
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: orderItemId, itemStatus: "cancellation_requested", restaurantId }),
      });
      const data = await res.json();
      if (data.order) {
        // Update this screen immediately from the response itself, rather than waiting
        // for the socket broadcast to round-trip back — the socket still exists to keep
        // OTHER devices sharing this same session in sync.
        setOrders((prev) => prev.map((o) => (o.id === data.order.id ? data.order : o)));
      } else if (data.error) {
        alert(data.error);
      }
    } catch (err) {
      console.error("Cancel request failed:", err);
      alert("Couldn't send the cancel request — check your connection and try again.");
    }
  }

  // Auto-checkout if the customer leaves (closes tab, hits back, navigates away) having
  // never added anything at all — empty cart AND no placed order. If they added items to
  // the cart or ordered, the table stays active in case they come back. Uses sendBeacon
  // since a normal fetch() can get cancelled mid-flight when the page is actually closing.
  useEffect(() => {
    function handlePageHide() {
      if (!session || orders.length > 0 || cartItems.length > 0) return;
      try {
        const payload = JSON.stringify({ sessionId: session.id });
        navigator.sendBeacon("/api/session/abandon", new Blob([payload], { type: "application/json" }));
      } catch (e) {}
    }
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [session, orders, cartItems]);

  const activeOrders = orders.filter((o) => o.status !== "served" && o.status !== "cancelled");

  if (sessionStage === "checking") {
    return (
      <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <p style={{ color: "var(--muted, #837568)" }}>Loading table {table}…</p>
      </div>
    );
  }

  if (sessionStage === "choosing") {
    return (
      <div className="container">
        <div className="topbar">
          <div className="brand">
            <div className="brand-icon">
              <img src="/logo.png" alt="" onError={(e) => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }} />
              <span className="brand-icon-fallback">H</span>
            </div>
            Hangout Restro Cafe
          </div>
          <div className="table-chip">Table {table}</div>
        </div>
        <div style={{ padding: 20 }}>
          <p style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>
            Table {table} already has {sessionOptions.length} active order{sessionOptions.length > 1 ? "s" : ""}
          </p>
          <p style={{ fontSize: 13, color: "var(--muted, #837568)", marginBottom: 16 }}>
            Ordering with people already here? Join their bill. Ordering separately? Start your own.
          </p>

          {sessionOptions.map((opt) => {
            const itemCount =
              (opt.cartItems?.reduce((s, c) => s + c.quantity, 0) || 0) +
              (opt.orders?.reduce((s, o) => s + o.items.reduce((s2, i) => s2 + i.quantity, 0), 0) || 0);
            const names = [
              ...new Set([
                ...(opt.cartItems || []).map((c) => c.addedBy).filter(Boolean),
                ...(opt.orders || []).flatMap((o) => o.items.map((i) => i.addedBy)).filter(Boolean),
              ]),
            ];
            return (
              <div key={opt.id} className="order-batch" style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {names.length ? names.join(", ") : "Guest"}'s order
                </div>
                <div style={{ fontSize: 12.5, color: "var(--muted, #837568)", margin: "4px 0 10px" }}>
                  {itemCount} item{itemCount !== 1 ? "s" : ""} so far
                </div>
                <button className="primary-btn" onClick={() => joinSession(opt.id)}>
                  Join this bill
                </button>
              </div>
            );
          })}

          <button className="secondary-btn" onClick={startNewSession} style={{ marginTop: 8 }}>
            Start my own separate bill
          </button>
        </div>
      </div>
    );
  }

  if (askingName) {
    return (
      <div className="container">
        <div className="topbar">
          <div className="brand">
            <div className="brand-icon">
              <img src="/logo.png" alt="" onError={(e) => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }} />
              <span className="brand-icon-fallback">H</span>
            </div>
            Hangout Restro Cafe
          </div>
          <div className="table-chip">Table {currentTableNumber}</div>
        </div>
        <div style={{ padding: 20 }}>
          <p style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>What should we call you?</p>
          <p style={{ fontSize: 13, color: "var(--muted, #837568)", marginBottom: 16 }}>
            So everyone at the table can see who added what to the shared cart.
          </p>
          <input
            className="cart-name-input"
            placeholder="Your name"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            style={{ width: "100%", padding: 12, borderRadius: 12, border: "1.5px solid var(--blue-200)", marginBottom: 12 }}
          />
          <button
            className="primary-btn"
            onClick={() => {
              const finalName = nameDraft.trim() || "Guest";
              setName(finalName);
              try {
                sessionStorage.setItem(nameKey(), finalName);
              } catch (e) {}
              setAskingName(false);
            }}
          >
            Continue
          </button>
          <button
            className="secondary-btn"
            onClick={() => {
              setName("Guest");
              setAskingName(false);
            }}
          >
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      {/* Topbar Header */}
      <div className="topbar">
        <div className="brand">
          <div className="brand-icon">
            <img src="/logo.png" alt="" onError={(e) => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }} />
            <span className="brand-icon-fallback">H</span>
          </div>
          Hangout Restro Cafe
        </div>
        <div className="table-chip">Table {currentTableNumber}</div>
      </div>

      {billRequested && (
        <div style={{ padding: "12px 16px 0" }}>
          <div className="order-batch" style={{ borderLeft: "4px solid var(--gold, #e8a33d)" }}>
            <span style={{ fontWeight: 700, fontSize: 13.5 }}>🧾 Bill requested — staff have been notified.</span>
          </div>
        </div>
      )}

      {/* Session Closed Alert -> Review -> Start New Order */}
      {sessionClosedNotice && (
        <div style={{ padding: "16px 16px 0" }}>
          <div className="order-batch review-box" style={{ borderLeft: "4px solid var(--blue-600)" }}>
            {!reviewSubmitted ? (
              <>
                <div style={{ fontWeight: 800, fontSize: 15, color: "var(--navy-900)" }}>
                  Thank you for dining with us!
                </div>
                <p style={{ fontSize: 13, color: "var(--muted)", margin: "4px 0 14px" }}>
                  How was your experience?
                </p>
                <div className="review-emoji-row">
                  {[
                    { v: 1, e: "😞" },
                    { v: 2, e: "🙁" },
                    { v: 3, e: "😐" },
                    { v: 4, e: "🙂" },
                    { v: 5, e: "😄" },
                  ].map(({ v, e }) => (
                    <button
                      key={v}
                      type="button"
                      className={`review-emoji-btn ${reviewRating === v ? "selected" : ""}`}
                      onClick={() => setReviewRating(v)}
                      aria-label={`Rate ${v} out of 5`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
                <textarea
                  placeholder="Anything you'd like to tell us? (optional)"
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  rows={3}
                  style={{
                    width: "100%",
                    padding: 10,
                    borderRadius: 12,
                    border: "1.5px solid var(--blue-200)",
                    marginBottom: 12,
                    fontFamily: "inherit",
                    fontSize: 13,
                    resize: "vertical",
                  }}
                />
                <button
                  className="primary-btn"
                  style={{ padding: "10px" }}
                  disabled={!reviewRating || reviewSubmitting}
                  onClick={async () => {
                    if (!closedSessionId) {
                      setReviewSubmitted(true);
                      return;
                    }
                    setReviewSubmitting(true);
                    try {
                      await fetch("/api/reviews", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ sessionId: closedSessionId, rating: reviewRating, comment: reviewText.trim() || null }),
                      });
                    } catch (e) {}
                    setReviewSubmitting(false);
                    setReviewSubmitted(true);
                  }}
                >
                  {reviewSubmitting ? "Submitting..." : "Submit Rating"}
                </button>
                <button
                  className="secondary-btn"
                  style={{ padding: "10px" }}
                  onClick={() => setReviewSubmitted(true)}
                >
                  Skip
                </button>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 800, fontSize: 15, color: "var(--navy-900)" }}>Session Closed</div>
                <p style={{ fontSize: 13, color: "var(--muted)", margin: "4px 0 12px" }}>
                  Staff has completed your table session. See you again soon!
                </p>
                <button
                  className="primary-btn"
                  style={{ padding: "10px" }}
                  onClick={() => {
                    setSessionClosedNotice(false);
                    setReviewSubmitted(false);
                    setReviewRating(0);
                    window.location.reload();
                  }}
                >
                  Start New Order
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Active Orders Status Tracker */}
      {activeOrders.length > 0 && (
        <div style={{ padding: "16px 16px 0" }}>
          {activeOrders.map((order) => (
            <OrderStatusCard
              key={order.id}
              order={order}
              onCancelItem={isOwner ? (itemId) => requestCancelItem(order.id, itemId) : null}
            />
          ))}
        </div>
      )}

      {orders.length > 0 && !billRequested && isOwner && (
        <div style={{ padding: "0 16px 12px" }}>
          <button className="secondary-btn" onClick={requestBill}>
            🧾 Request Bill
          </button>
        </div>
      )}
      {orders.length > 0 && !billRequested && !isOwner && (
        <div style={{ padding: "0 16px 12px", fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
          Only the person who started this table's bill can request it.
        </div>
      )}

      {/* Order History — everything ordered this session, including already-served items */}
      {orders.length > 0 && (
        <div style={{ padding: "0 16px 12px" }}>
          <button className="secondary-btn" onClick={() => setShowHistory((v) => !v)}>
            📜 {showHistory ? "Hide" : "View"} Your Order History
          </button>
          {showHistory && (
            <div style={{ marginTop: 10 }}>
              {[...orders]
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .map((order) => {
                  if (order.status === "cancelled") return null;
                  const visibleItems = order.items.filter((i) => i.status !== "cancelled" && i.status !== "rejected");
                  if (visibleItems.length === 0) return null;
                  const total = visibleItems.reduce((s, i) => s + (i.price ?? i.menuItem?.price ?? 0) * i.quantity, 0);
                  return (
                    <div key={order.id} className="order-batch" style={{ opacity: order.status === "served" ? 0.75 : 1 }}>
                      <div className="batch-header">
                        <span>{new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        <span className={`status-pill status-${order.status}`}>{order.status}</span>
                      </div>
                      {visibleItems.map((it) => (
                        <div key={it.id} className="batch-item-row">
                          <span>
                            {it.quantity}× {it.name || it.menuItem?.name}
                          </span>
                          <span style={{ fontWeight: 700 }}>₹{(it.price ?? it.menuItem?.price ?? 0) * it.quantity}</span>
                        </div>
                      ))}
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--blue-100, #dbeafe)", fontWeight: 700, fontSize: 13 }}>
                        <span>Subtotal</span>
                        <span>₹{total}</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Instant Search Bar */}
      <div className="search-box">
        <input
          className="search-input"
          placeholder="🔍 Search dishes (e.g. Biryani, Paneer)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Category Clay Tabs */}
      {!searchQuery && (
        <div className="tabs">
          {categories.map((cat) => (
            <button
              key={cat.id}
              className={`tab ${activeCategory === cat.id ? "active" : ""}`}
              onClick={() => setActiveCategory(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Veg / Non-Veg Filter Pills */}
      <div className="veg-filter">
        <button
          className={`veg-pill ${vegFilter === "veg" ? "active-veg" : ""}`}
          onClick={() => setVegFilter(vegFilter === "veg" ? "all" : "veg")}
        >
          <span className="item-tag" /> Veg
        </button>
        <button
          className={`veg-pill ${vegFilter === "nonveg" ? "active-nonveg" : ""}`}
          onClick={() => setVegFilter(vegFilter === "nonveg" ? "all" : "nonveg")}
        >
          <span className="item-tag nonveg" /> Non-Veg
        </button>
      </div>

      {/* Menu Item Cards */}
      <div className="menu-list">
        {filteredItems.map((item) => {
          const currentQty = cartQtyMap[item.id] || 0;
          return (
            <div key={item.id} className={`item-card ${!item.available ? "unavailable" : ""}`}>
              {item.isBestseller && <span className="bestseller-ribbon">★ Bestseller</span>}
              <div className="item-info">
                <p className="item-name">
                  <span className={`item-tag ${!item.veg ? "nonveg" : ""}`} />
                  {item.name}
                </p>
                {item.description && <p className="item-desc">{item.description}</p>}
                <p className="item-price">{item.price}</p>
                {!item.available && <p className="stock-badge">Out of stock</p>}
              </div>

              {item.available &&
                (currentQty > 0 ? (
                  <div className="qty-control">
                    <button className="qty-btn" onClick={() => updateQty(item.id, -1)}>
                      −
                    </button>
                    <span className="qty-num">{currentQty}</span>
                    <button className="qty-btn" onClick={() => updateQty(item.id, 1)}>
                      +
                    </button>
                  </div>
                ) : (
                  <button className="add-btn" onClick={() => updateQty(item.id, 1)}>
                    + Add
                  </button>
                ))}
            </div>
          );
        })}
        {filteredItems.length === 0 && (
          <div className="empty-state">No matching items found.</div>
        )}
      </div>

      {/* Floating Clay Cart Bar */}
      {cartCount > 0 && (
        <div className="cart-bar" onClick={() => setShowCart(true)}>
          <div className="cart-bar-info">
            <span className="cart-bar-count">{cartCount} item{cartCount > 1 ? "s" : ""} in shared cart</span>
            <span className="cart-bar-total">₹{cartTotal}</span>
          </div>
          <button className="cart-bar-btn">View Cart →</button>
        </div>
      )}

      {/* Clay Cart Drawer Sheet */}
      {showCart && (
        <div className="sheet-overlay" onClick={() => setShowCart(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-title">
              Shared Table Cart
              <button className="close-x" onClick={() => setShowCart(false)}>
                ✕
              </button>
            </div>

            <input
              className="name-input"
              placeholder="Your name (so staff know who added what)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            {cartItems.map((ci) => {
              const item = ci.menuItem || allItems.find((i) => i.id === ci.menuItemId);
              if (!item) return null;
              return (
                <div key={ci.menuItemId} className="cart-row">
                  <div>
                    <div className="cart-row-name">{item.name}</div>
                    <div className="cart-row-by">
                      ₹{item.price} × {ci.quantity} {ci.addedBy ? `· Added by ${ci.addedBy}` : ""}
                    </div>
                  </div>
                  <div className="qty-control">
                    <button className="qty-btn" onClick={() => updateQty(ci.menuItemId, -1)}>
                      −
                    </button>
                    <span className="qty-num">{ci.quantity}</span>
                    <button className="qty-btn" onClick={() => updateQty(ci.menuItemId, 1)}>
                      +
                    </button>
                  </div>
                </div>
              );
            })}

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, fontWeight: 800, fontSize: 18 }}>
              <span>Total Bill</span>
              <span style={{ color: "var(--blue-700)" }}>₹{cartTotal}</span>
            </div>

            {isOwner ? (
              <button className="primary-btn" disabled={placing} onClick={placeOrder}>
                {placing ? "Placing order..." : "Place Table Order"}
              </button>
            ) : (
              <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", marginTop: 12 }}>
                You can add items to the shared cart — only the person who started this
                table's session can place the order.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OrderStatusCard({ order, onCancelItem }) {
  const activeItems = order.items.filter((i) => i.status !== "cancelled" && i.status !== "rejected");
  if (activeItems.length === 0) return null;

  const label = {
    pending: "Order sent — waiting for kitchen confirmation",
    accepted: "Order accepted — preparing soon",
    preparing: "Chef is cooking your order 🍳",
    ready: "Ready! Hot & fresh for your table 🔥",
    served: "Served",
  }[order.status] || order.status;

  return (
    <div className="order-batch">
      <div className="batch-header">
        <span>Order #{order.id.slice(-4).toUpperCase()}</span>
        <span className={`status-pill status-${order.status}`}>
          {order.status}
        </span>
      </div>
      <p style={{ fontSize: 13.5, fontWeight: 700, margin: "0 0 10px", color: "var(--navy-900)" }}>{label}</p>
      {activeItems.map((it) => {
        const canCancel = it.status !== "cancelled" && it.status !== "rejected";
        const isCancelRequested = it.status === "cancellation_requested";
        
        return (
          <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", fontSize: 14, borderBottom: "1px solid var(--blue-100)" }}>
            <div>
              <span>
                {it.quantity}× {it.menuItem?.name}
                {it.addedBy && <span style={{ color: "var(--muted)", fontSize: 12 }}> ({it.addedBy})</span>}
              </span>
              {isCancelRequested && (
                <div style={{ fontSize: 12, color: "var(--orange-600)", fontWeight: 700, marginTop: 2 }}>
                  ⏳ Cancellation requested
                </div>
              )}
            </div>
            {canCancel && !isCancelRequested && onCancelItem && (
              <button 
                className="cancel-link" 
                onClick={() => onCancelItem(it.id)}
                style={{ fontSize: 12, padding: "4px 8px", background: "var(--red-50)", color: "var(--red-600)", borderRadius: 6 }}
              >
                Request Cancel
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}