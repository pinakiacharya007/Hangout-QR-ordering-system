import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// GET /api/revenue?restaurantId=xxx&range=day|week|month&date=YYYY-MM-DD
// "date" anchors the range (defaults to today); day = that date, week = the 7 days
// ending on that date, month = the calendar month containing that date.
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const restaurantId = searchParams.get("restaurantId");
    const range = searchParams.get("range") || "day";
    const dateParam = searchParams.get("date");

    if (!restaurantId) {
      return NextResponse.json({ error: "restaurantId is required" }, { status: 400 });
    }

    const anchor = dateParam ? new Date(`${dateParam}T00:00:00`) : new Date();
    let start, end;

    if (range === "day") {
      start = new Date(anchor);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 1);
    } else if (range === "week") {
      end = new Date(anchor);
      end.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() + 1);
      start = new Date(end);
      start.setDate(start.getDate() - 7);
    } else {
      // month
      start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
    }

    const orders = await prisma.order.findMany({
      where: {
        session: { table: { restaurantId } },
        status: { not: "cancelled" },
        deletedAt: null,
        createdAt: { gte: start, lt: end },
      },
      include: { items: true },
    });

    let total = 0;
    let orderCount = 0;
    for (const order of orders) {
      const validItems = order.items.filter((i) => i.status !== "cancelled" && i.status !== "rejected");
      if (validItems.length === 0) continue;
      orderCount += 1;
      total += validItems.reduce((s, i) => s + (i.price ?? 0) * i.quantity, 0);
    }

    return NextResponse.json({ total, orderCount, range, start, end });
  } catch (err) {
    console.error("GET /api/revenue error:", err);
    return NextResponse.json({ error: err.message || "Failed to compute revenue" }, { status: 500 });
  }
}