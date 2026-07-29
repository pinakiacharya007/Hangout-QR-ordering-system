import { prisma } from "@/lib/db";
import { emitToRoom } from "@/lib/emit";
import { NextResponse } from "next/server";

// POST /api/session/abandon { sessionId }
// Called via navigator.sendBeacon when a customer's tab closes/navigates away (including
// hitting the browser back button). Only auto-closes the session if NOTHING was ever
// added — no items sitting in the cart and no order placed. If they added anything at
// all, the table stays active in case they come back or staff needs to follow up.
export async function POST(req) {
  try {
    const body = await req.json();
    const { sessionId } = body || {};
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const session = await prisma.tableSession.findUnique({
      where: { id: sessionId },
      include: {
        table: true,
        orders: { where: { status: { not: "cancelled" } } },
        cartItems: true,
      },
    });

    if (!session || session.status !== "active" || session.orders.length > 0 || session.cartItems.length > 0) {
      // Nothing to do: already closed, already flagged for billing, has real orders,
      // or still has items sitting in the cart.
      return NextResponse.json({ skipped: true });
    }

    await prisma.tableSession.update({
      where: { id: sessionId },
      data: { status: "completed", closedAt: new Date() },
    });
    await prisma.cartItem.deleteMany({ where: { sessionId } });

    if (session.table?.restaurantId) {
      await emitToRoom(`restaurant-${session.table.restaurantId}`, "table-updated", {});
    }

    return NextResponse.json({ closed: true });
  } catch (err) {
    console.error("POST /api/session/abandon error:", err);
    // Beacon requests don't read the response, so just log server-side.
    return NextResponse.json({ error: err.message || "Failed to abandon session" }, { status: 500 });
  }
}