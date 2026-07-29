import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// GET /api/menu?restaurantId=xxx
// Returns categories with their items (used by both customer menu and admin menu editor).
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const restaurantId = searchParams.get("restaurantId");

  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId is required" }, { status: 400 });
  }

  const categories = await prisma.category.findMany({
    where: { restaurantId, archived: false },
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        where: { archived: false },
        orderBy: { name: "asc" },
      },
    },
  });

  return NextResponse.json({ categories });
}

// POST /api/menu  { restaurantId, name }
export async function POST(req) {
  const body = await req.json();
  const { restaurantId, name } = body;
  if (!restaurantId || !name) {
    return NextResponse.json({ error: "restaurantId and name are required" }, { status: 400 });
  }

  const category = await prisma.category.create({ data: { restaurantId, name } });
  return NextResponse.json({ category });
}