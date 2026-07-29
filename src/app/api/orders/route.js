import { prisma } from "@/lib/db";
import { emitToRoom } from "@/lib/emit";
import { notify } from "@/lib/notify";
import { NextResponse } from "next/server";

// GET /api/orders?restaurantId=xxx           -> live order queue for the admin dashboard
// GET /api/orders?restaurantId=xxx&deleted=true -> admin-deleted order history
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const restaurantId = searchParams.get("restaurantId");
    const deleted = searchParams.get("deleted") === "true";

    if (!restaurantId) {
      return NextResponse.json({ error: "restaurantId is required" }, { status: 400 });
    }

    const orders = await prisma.order.findMany({
      where: {
        session: { table: { restaurantId } },
        status: { not: "cancelled" },
        deletedAt: deleted ? { not: null } : null,
      },
      include: {
        items: { include: { menuItem: true } },
        session: { include: { table: true } },
      },
      orderBy: deleted ? { deletedAt: "desc" } : { createdAt: "desc" },
    });

    return NextResponse.json({ orders });
  } catch (err) {
    console.error("GET /api/orders error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch orders" }, { status: 500 });
  }
}

// POST /api/orders  { sessionId, items: [{ menuItemId, quantity, addedBy, notes }] }
export async function POST(req) {
  try {
    const body = await req.json();
    const { sessionId, items, restaurantId } = body;

    if (!sessionId || !items?.length) {
      return NextResponse.json({ error: "sessionId and items are required" }, { status: 400 });
    }

    // Snapshot current name/price for every item so future menu edits
    // (price changes, renames) never retroactively alter a placed order.
    const menuItemIds = items.map((it) => it.menuItemId);
    const menuItemsNow = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds } },
    });
    const menuItemMap = Object.fromEntries(menuItemsNow.map((m) => [m.id, m]));

    const order = await prisma.order.create({
      data: {
        sessionId,
        status: "pending",
        items: {
          create: items.map((it) => {
            const snapshot = menuItemMap[it.menuItemId];
            return {
              menuItemId: it.menuItemId,
              name: snapshot?.name || null,
              price: snapshot?.price ?? null,
              quantity: it.quantity || 1,
              addedBy: it.addedBy || null,
              notes: it.notes || null,
            };
          }),
        },
      },
      include: {
        items: { include: { menuItem: true } },
        session: { include: { table: true } },
      },
    });

    const targetRestaurantId = restaurantId || order.session?.table?.restaurantId;

    // Clear shared cart for this session upon order placement
    await prisma.cartItem.deleteMany({
      where: { sessionId },
    });

    // Instantly notify the admin dashboard
    if (targetRestaurantId) {
      await emitToRoom(`restaurant-${targetRestaurantId}`, "new-order", { order });
      const table = order.session?.table?.number;
      const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);
      await notify(targetRestaurantId, "new_order", `New order — Table ${table} (${itemCount} item${itemCount === 1 ? "" : "s"})`, table);
    }
    
    // Also notify every device at this table (shared session room)
    await emitToRoom(`table-${sessionId}`, "order-placed", { order });
    await emitToRoom(`table-${sessionId}`, "cart-updated", { cartItems: [] });

    return NextResponse.json({ order });
  } catch (err) {
    console.error("POST /api/orders error:", err);
    return NextResponse.json({ error: err.message || "Failed to place order" }, { status: 500 });
  }
}