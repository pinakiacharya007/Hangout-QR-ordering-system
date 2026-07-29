import { prisma } from "@/lib/db";
import { emitToRoom } from "@/lib/emit";
import { NextResponse } from "next/server";

// DELETE /api/menu/:id  -> delete a category and everything in it
// Any item in the category that's been ordered before can't be hard-deleted (its
// OrderItem rows need it to stay for order history), so it's archived instead. If that
// leaves any items behind, the category itself is archived rather than removed (a
// category row can't be deleted while archived items still reference it). Otherwise
// both the items and the category are removed outright.
export async function DELETE(_req, { params }) {
  try {
    const { id } = params;

    const category = await prisma.category.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    for (const item of category.items) {
      const orderCount = await prisma.orderItem.count({ where: { menuItemId: item.id } });
      if (orderCount === 0) {
        await prisma.menuItem.delete({ where: { id: item.id } });
      } else {
        await prisma.menuItem.update({ where: { id: item.id }, data: { archived: true, available: false } });
      }
    }

    const remaining = await prisma.menuItem.count({ where: { categoryId: id } });
    let deleted = false;
    if (remaining === 0) {
      await prisma.category.delete({ where: { id } });
      deleted = true;
    } else {
      await prisma.category.update({ where: { id }, data: { archived: true } });
    }

    await emitToRoom(`restaurant-${category.restaurantId}`, "category-deleted", { categoryId: id });

    return NextResponse.json({ deleted, archived: !deleted });
  } catch (err) {
    console.error("DELETE /api/menu/[id] error:", err);
    return NextResponse.json({ error: err.message || "Failed to delete category" }, { status: 500 });
  }
}