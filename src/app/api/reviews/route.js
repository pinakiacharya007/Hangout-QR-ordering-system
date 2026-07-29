import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// POST /api/reviews  { sessionId, rating, comment? }  -> 1-5 satisfaction rating after checkout
export async function POST(req) {
  try {
    const { sessionId, rating, comment } = await req.json();
    const r = Number(rating);
    if (!sessionId || !r || r < 1 || r > 5) {
      return NextResponse.json({ error: "sessionId and a rating from 1-5 are required" }, { status: 400 });
    }

    const session = await prisma.tableSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const review = await prisma.review.create({
      data: { sessionId, rating: r, comment: comment ? String(comment).slice(0, 1000) : null },
    });
    return NextResponse.json({ review });
  } catch (err) {
    console.error("POST /api/reviews error:", err);
    return NextResponse.json({ error: err.message || "Failed to submit review" }, { status: 500 });
  }
}

// GET /api/reviews?restaurantId=xxx -> recent reviews + average, for the admin dashboard
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const restaurantId = searchParams.get("restaurantId");
    if (!restaurantId) {
      return NextResponse.json({ error: "restaurantId is required" }, { status: 400 });
    }

    const reviews = await prisma.review.findMany({
      where: { session: { table: { restaurantId } } },
      include: { session: { include: { table: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const average = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;

    return NextResponse.json({ reviews, average, count: reviews.length });
  } catch (err) {
    console.error("GET /api/reviews error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch reviews" }, { status: 500 });
  }
}