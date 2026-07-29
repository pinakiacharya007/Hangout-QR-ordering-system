import { prisma } from "@/lib/db";
import { emitToRoom } from "@/lib/emit";
import { NextResponse } from "next/server";

// PATCH /api/items/:id  { available: boolean }
// Toggles stock status. Broadcasts instantly to all customer devices for that restaurant
// so the menu greys out the item in real time.
export async function PATCH(req, { params }) {
  const { id } = params;
  const body = await req.json();

  const item = await prisma.menuItem.update({
    where: { id },
    data: { available: body.available },
  });

  await emitToRoom(`restaurant-${item.restaurantId}`, "item-availability-updated", {
    itemId: item.id,
    available: item.available,
  });

  return NextResponse.json({ item });
}

// DELETE /api/items/:id
// If the item has never been ordered, it's removed outright. If it has past orders
// referencing it, it's archived instead (hidden from customer menu + admin editor,
// but the order history keeps showing correctly via each OrderItem's own snapshot).
export async function DELETE(_req, { params }) {
  try {
    const { id } = params;

    const item = await prisma.menuItem.findUnique({ where: { id } });
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const orderCount = await prisma.orderItem.count({ where: { menuItemId: id } });

    if (orderCount === 0) {
      await prisma.menuItem.delete({ where: { id } });
    } else {
      await prisma.menuItem.update({ where: { id }, data: { archived: true, available: false } });
    }

    await emitToRoom(`restaurant-${item.restaurantId}`, "item-deleted", { itemId: id });

    return NextResponse.json({ deleted: true, archived: orderCount > 0 });
  } catch (err) {
    console.error("DELETE /api/items/[id] error:", err);
    return NextResponse.json({ error: err.message || "Failed to delete item" }, { status: 500 });
  }
}