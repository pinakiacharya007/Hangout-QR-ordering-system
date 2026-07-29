import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword, verifySessionToken, ADMIN_COOKIE_NAME } from "@/lib/auth";
import { NextResponse } from "next/server";

// PATCH /api/admin/credentials  { restaurantId, currentPassword, newUsername?, newPassword? }
export async function PATCH(req) {
  try {
    const { restaurantId, currentPassword, newUsername, newPassword } = await req.json();
    if (!restaurantId || !currentPassword) {
      return NextResponse.json({ error: "Current password is required" }, { status: 400 });
    }

    const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
    if (!verifySessionToken(token, restaurantId)) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant || !verifyPassword(currentPassword, restaurant.adminPasswordHash)) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
    }

    const data = {};
    if (newUsername && newUsername.trim()) data.adminUsername = newUsername.trim();
    if (newPassword && newPassword.trim()) {
      if (newPassword.trim().length < 6) {
        return NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 });
      }
      data.adminPasswordHash = hashPassword(newPassword.trim());
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    await prisma.restaurant.update({ where: { id: restaurantId }, data });

    // Force a fresh login with the new credentials.
    const res = NextResponse.json({ ok: true });
    res.cookies.set(ADMIN_COOKIE_NAME, "", { path: "/", maxAge: 0 });
    return res;
  } catch (err) {
    console.error("PATCH /api/admin/credentials error:", err);
    return NextResponse.json({ error: "Failed to update credentials" }, { status: 500 });
  }
}