import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// GET /api/notifications?restaurantId=xxx -> recent notifications + unread count
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const restaurantId = searchParams.get("restaurantId");
    if (!restaurantId) {
      return NextResponse.json({ error: "restaurantId is required" }, { status: 400 });
    }

    const notifications = await prisma.notification.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const unreadCount = await prisma.notification.count({ where: { restaurantId, read: false } });

    return NextResponse.json({ notifications, unreadCount });
  } catch (err) {
    console.error("GET /api/notifications error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch notifications" }, { status: 500 });
  }
}

// PATCH /api/notifications  { restaurantId, id? }  -> mark one (id) or all as read
export async function PATCH(req) {
  try {
    const { restaurantId, id } = await req.json();
    if (!restaurantId) {
      return NextResponse.json({ error: "restaurantId is required" }, { status: 400 });
    }
    if (id) {
      await prisma.notification.update({ where: { id }, data: { read: true } });
    } else {
      await prisma.notification.updateMany({ where: { restaurantId, read: false }, data: { read: true } });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/notifications error:", err);
    return NextResponse.json({ error: err.message || "Failed to update notifications" }, { status: 500 });
  }
}