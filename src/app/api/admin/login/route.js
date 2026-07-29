import { prisma } from "@/lib/db";
import { verifyPassword, createSessionToken, ADMIN_COOKIE_NAME, ADMIN_COOKIE_MAX_AGE } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { restaurantId, username, password } = await req.json();
    if (!restaurantId || !username || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    }

    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant || restaurant.adminUsername !== username || !verifyPassword(password, restaurant.adminPasswordHash)) {
      return NextResponse.json({ error: "Incorrect username or password" }, { status: 401 });
    }

    const token = createSessionToken(restaurantId);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: ADMIN_COOKIE_MAX_AGE,
      path: "/",
    });
    return res;
  } catch (err) {
    console.error("POST /api/admin/login error:", err);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}