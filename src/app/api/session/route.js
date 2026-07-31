import { prisma } from "@/lib/db";
import { emitToRoom } from "@/lib/emit";
import { notify } from "@/lib/notify";
import { NextResponse } from "next/server";

const ACTIVE_STATUSES = ["active", "bill_requested"];

// If the scanned table has been combined into a group, all session/cart activity
// lives on the PRIMARY table instead — so every member's QR joins the same shared bill.
async function resolveTable(restaurantId, tableNumber) {
  const table = await prisma.table.findFirst({
    where: { restaurantId, number: Number(tableNumber) },
  });
  if (!table) return null;
  if (table.groupId) {
    const primary = await prisma.table.findUnique({ where: { id: table.groupId } });
    return primary || table;
  }
  return table;
}

const STALE_EMPTY_MINUTES = 8;

// The client-side "closed the tab" cleanup (sendBeacon on pagehide) doesn't fire
// reliably for QR-scan traffic — a lot of it happens inside in-app browsers (camera
// app, WhatsApp, Instagram) that the OS can kill without ever running page JS. So a
// session with nothing in it can just sit there forever showing up as clutter on the
// admin dashboard. This sweep is the real backstop: any session that's still "active",
// has zero cart items and zero real orders, and has been sitting for a while gets
// auto-closed whenever anyone (customer or admin) asks for session data.
async function sweepStaleEmptySessions(restaurantId) {
  const cutoff = new Date(Date.now() - STALE_EMPTY_MINUTES * 60 * 1000);
  const candidates = await prisma.tableSession.findMany({
    where: { status: "active", startedAt: { lt: cutoff }, table: { restaurantId } },
    include: {
      cartItems: { select: { id: true } },
      orders: { where: { status: { not: "cancelled" } }, select: { id: true } },
    },
  });
  const staleIds = candidates.filter((s) => s.cartItems.length === 0 && s.orders.length === 0).map((s) => s.id);
  if (staleIds.length) {
    await prisma.tableSession.updateMany({
      where: { id: { in: staleIds } },
      data: { status: "completed", closedAt: new Date() },
    });
  }
}

// Includes order history so a customer-facing page load/refresh always recovers correct
// state from the DB regardless of whether a live socket event was ever received.
const SESSION_INCLUDE = {
  table: true,
  cartItems: { include: { menuItem: true }, orderBy: { updatedAt: "asc" } },
  orders: {
    where: { status: { not: "cancelled" } },
    include: { items: { include: { menuItem: true } } },
    orderBy: { createdAt: "desc" },
  },
};

const ADMIN_SESSION_INCLUDE = {
  cartItems: { include: { menuItem: true }, orderBy: { updatedAt: "asc" } },
  orders: {
    where: { status: { not: "cancelled" } },
    include: { items: { include: { menuItem: true } } },
    orderBy: { createdAt: "desc" },
  },
};

// GET /api/session?restaurantId=X&tableNumber=Y  -> { activeSessions, isParcel } for that table (customer)
// GET /api/session?restaurantId=X                -> { tables }                   for the whole venue (admin)
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const restaurantId = searchParams.get("restaurantId");
    const tableNumber = searchParams.get("tableNumber");

    if (!restaurantId) {
      return NextResponse.json({ error: "restaurantId is required" }, { status: 400 });
    }

    await sweepStaleEmptySessions(restaurantId);

    if (tableNumber) {
      const table = await resolveTable(restaurantId, tableNumber);

      if (!table) {
        // No table row yet — first scan at this table number, nothing active.
        return NextResponse.json({ activeSessions: [], isParcel: false });
      }

      const activeSessions = await prisma.tableSession.findMany({
        where: { tableId: table.id, status: { in: ACTIVE_STATUSES } },
        include: SESSION_INCLUDE,
        orderBy: { startedAt: "asc" },
      });

      return NextResponse.json({ activeSessions, isParcel: !!table.isParcel });
    }

    // No tableNumber -> admin dashboard's full table overview
    const tables = await prisma.table.findMany({
      where: { restaurantId },
      orderBy: { number: "asc" },
      include: {
        sessions: {
          where: { status: { in: ACTIVE_STATUSES } },
          include: ADMIN_SESSION_INCLUDE,
          orderBy: { startedAt: "asc" },
        },
      },
    });

    return NextResponse.json({ tables });
  } catch (err) {
    console.error("GET /api/session error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch session data" }, { status: 500 });
  }
}

// POST /api/session  { restaurantId, tableNumber, mode: "new" | "join", sessionId? }
export async function POST(req) {
  try {
    const body = await req.json();
    const { restaurantId, tableNumber, mode, sessionId } = body || {};

    if (!restaurantId || !tableNumber) {
      return NextResponse.json({ error: "restaurantId and tableNumber are required" }, { status: 400 });
    }

    if (mode === "join") {
      if (!sessionId) {
        return NextResponse.json({ error: "sessionId is required to join" }, { status: 400 });
      }
      const session = await prisma.tableSession.findUnique({
        where: { id: sessionId },
        include: SESSION_INCLUDE,
      });
      if (!session || !ACTIVE_STATUSES.includes(session.status)) {
        return NextResponse.json({ error: "That session is no longer active" }, { status: 404 });
      }
      return NextResponse.json({ session });
    }

    // mode "new" (default): find-or-create the table (resolving a combined member to
    // its group's primary), then always start a fresh session
    let table = await resolveTable(restaurantId, tableNumber);
    if (!table) {
      table = await prisma.table.create({
        data: { restaurantId, number: Number(tableNumber) },
      });
    }

    const created = await prisma.tableSession.create({
      data: { tableId: table.id, status: "active" },
      include: SESSION_INCLUDE,
    });

    await emitToRoom(`restaurant-${restaurantId}`, "table-updated", {});
    await notify(restaurantId, "new_session", `New session started — Table ${table.number}`, table.number);

    return NextResponse.json({ session: created });
  } catch (err) {
    console.error("POST /api/session error:", err);
    return NextResponse.json({ error: err.message || "Failed to start session" }, { status: 500 });
  }
}

// PATCH /api/session
//   { sessionId }                                             -> admin checkout (close table)
//   { sessionId, paymentMethod, lentToName }                  -> admin checkout with payment info
//   { sessionId, action: "request_bill" }                      -> customer requests the bill
//   { sessionId, action: "transfer", tableNumber }             -> admin moves the whole session to a new table
//   { sessionId, action: "set_parcel_label", parcelLabel }     -> label a parcel order (Parcels QR flow)
//   { sessionId, action: "mark_lent_returned" }                -> admin marks a lent bill as paid back
export async function PATCH(req) {
  try {
    const body = await req.json();
    const { sessionId, action, tableNumber } = body || {};

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const existing = await prisma.tableSession.findUnique({
      where: { id: sessionId },
      include: { table: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const restaurantId = existing.table.restaurantId;

    if (action === "request_bill") {
      const session = await prisma.tableSession.update({
        where: { id: sessionId },
        data: { status: "bill_requested", billRequestedAt: new Date() },
        include: SESSION_INCLUDE,
      });
      await emitToRoom(`table-${sessionId}`, "session-updated", { session });
      await emitToRoom(`restaurant-${restaurantId}`, "bill-requested", {});
      await emitToRoom(`restaurant-${restaurantId}`, "table-updated", {});
      await notify(restaurantId, "bill_request", `Bill requested — Table ${session.table.number}`, session.table.number);
      return NextResponse.json({ session });
    }

    if (action === "transfer") {
      if (!tableNumber) {
        return NextResponse.json({ error: "tableNumber is required to transfer" }, { status: 400 });
      }
      let destTable = await resolveTable(restaurantId, tableNumber);
      if (!destTable) {
        destTable = await prisma.table.create({
          data: { restaurantId, number: Number(tableNumber) },
        });
      }
      const session = await prisma.tableSession.update({
        where: { id: sessionId },
        data: { tableId: destTable.id },
        include: SESSION_INCLUDE,
      });
      await emitToRoom(`table-${sessionId}`, "session-updated", { session });
      await emitToRoom(`restaurant-${restaurantId}`, "table-updated", {});
      return NextResponse.json({ session });
    }

    if (action === "set_parcel_label") {
      const { parcelLabel } = body || {};
      if (!parcelLabel || !parcelLabel.trim()) {
        return NextResponse.json({ error: "parcelLabel is required" }, { status: 400 });
      }
      const session = await prisma.tableSession.update({
        where: { id: sessionId },
        data: { parcelLabel: parcelLabel.trim() },
        include: SESSION_INCLUDE,
      });
      await emitToRoom(`restaurant-${restaurantId}`, "table-updated", {});
      return NextResponse.json({ session });
    }

    if (action === "mark_lent_returned") {
      const session = await prisma.tableSession.update({
        where: { id: sessionId },
        data: { lentReturned: true },
        include: SESSION_INCLUDE,
      });
      return NextResponse.json({ session });
    }

    // Default: admin checkout — close the table, record how it was paid, and clear
    // whatever's left in the cart.
    const { paymentMethod, lentToName } = body || {};
    if (paymentMethod && !["cash", "upi", "lend"].includes(paymentMethod)) {
      return NextResponse.json({ error: "Invalid paymentMethod" }, { status: 400 });
    }
    if (paymentMethod === "lend" && !lentToName?.trim()) {
      return NextResponse.json({ error: "lentToName is required when paymentMethod is lend" }, { status: 400 });
    }
    const session = await prisma.tableSession.update({
      where: { id: sessionId },
      data: {
        status: "completed",
        closedAt: new Date(),
        paymentMethod: paymentMethod || null,
        lentToName: paymentMethod === "lend" ? lentToName.trim() : null,
      },
      include: SESSION_INCLUDE,
    });
    await prisma.cartItem.deleteMany({ where: { sessionId } });

    await emitToRoom(`table-${sessionId}`, "session-closed", {});
    await emitToRoom(`restaurant-${restaurantId}`, "table-updated", {});

    return NextResponse.json({ session });
  } catch (err) {
    console.error("PATCH /api/session error:", err);
    return NextResponse.json({ error: err.message || "Failed to update session" }, { status: 500 });
  }
}