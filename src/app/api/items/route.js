import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// POST /api/items  { restaurantId, categoryId, name, price, veg, description }
export async function POST(req) {
  const body = await req.json();
  const { restaurantId, categoryId, name, price, veg, description } = body;
  if (!restaurantId || !categoryId || !name || price == null) {
    return NextResponse.json({ error: "restaurantId, categoryId, name, price are required" }, { status: 400 });
  }

  const item = await prisma.menuItem.create({
    data: {
      restaurantId,
      categoryId,
      name,
      price: Number(price),
      veg: Boolean(veg),
      description: description || null,
      available: true,
    },
  });

  return NextResponse.json({ item });
}
