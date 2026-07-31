import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

const NOTIFICATION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// Notifications are ephemeral — purge anything older than the TTL before every read.
// This is a lazy/on-read cleanup (no separate cron needed): since the admin dashboard
// calls GET on every page load, this keeps the table from growing unbounded without
// requiring persistent server infra beyond the existing Next.js API + Postgres.
async function purgeExpiredNotifications(restaurantId) {
  const cutoff = new Date(Date.now() - NOTIFICATION_TTL_MS);
  await prisma.notification.deleteMany({
    where: { restaurantId, createdAt: { lt: cutoff } },
  });
}

// GET /api/notifications?restaurantId=xxx -> recent notifications + unread count
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const restaurantId = searchParams.get("restaurantId");
    if (!restaurantId) {
      return NextResponse.json({ error: "restaurantId is required" }, { status: 400 });
    }

    await purgeExpiredNotifications(restaurantId);

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