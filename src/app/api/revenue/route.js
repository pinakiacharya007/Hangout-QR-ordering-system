import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

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
      start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
    }

    // Revenue counts when a table is actually checked out (paid), not when each
    // order was placed — keeps the total consistent with the payment breakdown.
    const sessions = await prisma.tableSession.findMany({
      where: {
        table: { restaurantId },
        status: "completed",
        closedAt: { gte: start, lt: end },
      },
      include: {
        orders: {
          where: { status: { not: "cancelled" }, deletedAt: null },
          include: { items: { include: { menuItem: true } } },
        },
      },
    });

    let total = 0;
    let orderCount = 0;
    const bucketTotals = {};
    const itemTotals = {};
    const paymentTotals = { cash: 0, upi: 0, lend: 0, unspecified: 0 };
    const outstandingLent = []; // individual unreturned lend sessions

    for (const session of sessions) {
      let sessionTotal = 0;
      for (const order of session.orders) {
        const validItems = order.items.filter((i) => i.status !== "cancelled" && i.status !== "rejected");
        if (validItems.length === 0) continue;
        orderCount += 1;
        const orderTotal = validItems.reduce((s, i) => s + (i.price ?? 0) * i.quantity, 0);
        sessionTotal += orderTotal;

        for (const item of validItems) {
          const key = item.menuItemId;
          const name = item.name || item.menuItem?.name || "Unknown item";
          if (!itemTotals[key]) itemTotals[key] = { name, qty: 0, revenue: 0 };
          itemTotals[key].qty += item.quantity;
          itemTotals[key].revenue += (item.price ?? 0) * item.quantity;
        }
      }

      total += sessionTotal;
      const method = session.paymentMethod || "unspecified";
      paymentTotals[method] = (paymentTotals[method] || 0) + sessionTotal;

      if (method === "lend" && !session.lentReturned) {
        outstandingLent.push({
          sessionId: session.id,
          name: session.lentToName || "Unknown",
          amount: sessionTotal,
          closedAt: session.closedAt,
        });
      }

      const bucketKey =
        range === "day"
          ? String(session.closedAt.getHours()).padStart(2, "0") + ":00"
          : session.closedAt.toISOString().slice(0, 10);
      bucketTotals[bucketKey] = (bucketTotals[bucketKey] || 0) + sessionTotal;
    }

    const buckets = [];
    if (range === "day") {
      for (let h = 0; h < 24; h++) {
        const key = String(h).padStart(2, "0") + ":00";
        buckets.push({ label: key, total: bucketTotals[key] || 0 });
      }
    } else {
      const cursor = new Date(start);
      while (cursor < end) {
        const key = cursor.toISOString().slice(0, 10);
        buckets.push({ label: key, total: bucketTotals[key] || 0 });
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    const topItems = Object.values(itemTotals).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    return NextResponse.json({
      total,
      orderCount,
      range,
      start,
      end,
      buckets,
      topItems,
      paymentTotals,
      lentBreakdown: outstandingLent,
    });
  } catch (err) {
    console.error("GET /api/revenue error:", err);
    return NextResponse.json({ error: err.message || "Failed to compute revenue" }, { status: 500 });
  }
}