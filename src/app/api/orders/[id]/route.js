import { prisma } from "@/lib/db";
import { emitToRoom } from "@/lib/emit";
import { notify } from "@/lib/notify";
import { NextResponse } from "next/server";

const FULL_INCLUDE = {
  items: { include: { menuItem: true } },
  session: { include: { table: true } },
};

// PATCH /api/orders/:id
// body: { status } to update the whole order (accepted/preparing/ready/served/cancelled)
// body: { itemId, itemStatus } to update a single item — itemStatus "cancellation_requested"
//        is the customer-facing cancel action; approval gating happens server-side below.
//
// NOTE: moving an order to a different table used to be handled here via
// `transferToTable`, spinning up a brand-new session at the destination. That left the
// customer's own device still pointed at the old table/session (so their live status
// view looked like the order vanished) and didn't carry their table number or the rest
// of their bill along. Table moves are now always whole-session moves — see
// PATCH /api/session { action: "transfer" } — which keeps the customer's device, table
// number, and every order on that bill in sync automatically.
export async function PATCH(req, { params }) {
  try {
    const { id } = params;
    const body = await req.json();

    let order;
    let becameCancelRequested = false;

    if (body.itemId) {
      // --- Single-item update: covers admin accept/reject AND the cancel-request flow ---
      const item = await prisma.orderItem.findUnique({
        where: { id: body.itemId },
        include: { order: true },
      });
      if (!item) {
        return NextResponse.json({ error: "Order item not found" }, { status: 404 });
      }

      let nextStatus = body.itemStatus;
      let cancelReqAt = undefined;

      if (body.itemStatus === "cancellation_requested") {
        // Customer is asking to cancel this dish. Gate by how far along the order is.
        if (item.order.status === "ready" || item.order.status === "served") {
          return NextResponse.json(
            { error: "This item has already been prepared and can no longer be cancelled." },
            { status: 400 }
          );
        }
        if (item.order.status === "preparing") {
          // Already being cooked — needs manual admin approval.
          nextStatus = "cancellation_requested";
          cancelReqAt = new Date();
          becameCancelRequested = true;
        } else {
          // pending / accepted — nothing wasted yet, cancel goes through instantly.
          nextStatus = "cancelled";
        }
      }
      // Admin approving a pending cancellation request sends itemStatus: "cancelled".
      // Admin rejecting one sends itemStatus: "accepted" (item stays on the order).
      if (nextStatus === "accepted" && item.status === "cancellation_requested") {
        cancelReqAt = null;
      }

      await prisma.orderItem.update({
        where: { id: body.itemId },
        data: { status: nextStatus, ...(cancelReqAt !== undefined ? { cancelReqAt } : {}) },
      });
      order = await prisma.order.findUnique({ where: { id }, include: FULL_INCLUDE });
    } else {
      // Whole-order status update. When an order is rejected/cancelled outright,
      // cascade that down to every item on it — otherwise the items keep their old
      // "pending"/"accepted" status and still get counted in any total that filters
      // by item.status (customer bill/history, admin order totals), even though the
      // order itself is dead.
      order = await prisma.order.update({
        where: { id },
        data: {
          status: body.status,
          ...(body.status === "cancelled"
            ? { items: { updateMany: { where: {}, data: { status: "cancelled" } } } }
            : {}),
        },
        include: FULL_INCLUDE,
      });
    }

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const restaurantId = order.session?.table?.restaurantId || body.restaurantId;

    // Push the update to the specific table's devices so their status view updates live
    await emitToRoom(`table-${order.sessionId}`, "order-updated", { order });

    // Also refresh the admin dashboard's copy
    if (restaurantId) {
      await emitToRoom(`restaurant-${restaurantId}`, "order-updated", { order });
      if (becameCancelRequested) {
        const table = order.session?.table?.number;
        await notify(restaurantId, "cancel_request", `Cancellation requested — Table ${table}`, table);
      }
    }

    return NextResponse.json({ order });
  } catch (err) {
    console.error("PATCH /api/orders/[id] error:", err);
    return NextResponse.json({ error: err.message || "Failed to update order" }, { status: 500 });
  }
}

// DELETE /api/orders/:id
// Admin-only soft delete — pulls the order out of the active queue/history but keeps
// the row (and its items) in the DB, retrievable via GET /api/orders?deleted=true.
export async function DELETE(_req, { params }) {
  try {
    const { id } = params;
    const order = await prisma.order.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: FULL_INCLUDE,
    });

    const restaurantId = order.session?.table?.restaurantId;
    await emitToRoom(`table-${order.sessionId}`, "order-updated", { order, removed: true });
    if (restaurantId) {
      await emitToRoom(`restaurant-${restaurantId}`, "order-updated", { order, removed: true });
    }

    return NextResponse.json({ order });
  } catch (err) {
    console.error("DELETE /api/orders/[id] error:", err);
    return NextResponse.json({ error: err.message || "Failed to delete order" }, { status: 500 });
  }
}