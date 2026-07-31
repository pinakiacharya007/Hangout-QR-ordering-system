import { prisma } from "@/lib/db";
import { emitToRoom } from "@/lib/emit";
import { NextResponse } from "next/server";

// GET /api/cart?sessionId=xxx
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const cartItems = await prisma.cartItem.findMany({
      where: { sessionId },
      include: { menuItem: true },
      orderBy: { updatedAt: "asc" },
    });

    return NextResponse.json({ cartItems });
  } catch (err) {
    console.error("GET /api/cart error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch cart" }, { status: 500 });
  }
}

// POST /api/cart
// body: { sessionId, menuItemId, delta, addedBy, notes }
// notes is optional — when provided (including empty string, to clear it) it overwrites
// the cart line's special instructions; when omitted, existing notes are preserved.
export async function POST(req) {
  try {
    const body = await req.json();
    const { sessionId, menuItemId, delta = 0, addedBy = "Guest", notes } = body;

    if (!sessionId || !menuItemId) {
      return NextResponse.json({ error: "sessionId and menuItemId are required" }, { status: 400 });
    }

    const existing = await prisma.cartItem.findUnique({
      where: {
        sessionId_menuItemId: { sessionId, menuItemId },
      },
    });

    const currentQty = existing ? existing.quantity : 0;
    const newQty = Math.max(0, currentQty + delta);
    const resolvedNotes = notes !== undefined ? (notes.trim() ? notes.trim() : null) : existing?.notes ?? null;

    if (newQty === 0) {
      if (existing) {
        await prisma.cartItem.delete({
          where: { id: existing.id },
        });
      }
    } else {
      await prisma.cartItem.upsert({
        where: {
          sessionId_menuItemId: { sessionId, menuItemId },
        },
        update: {
          quantity: newQty,
          addedBy: addedBy || existing?.addedBy || "Guest",
          notes: resolvedNotes,
        },
        create: {
          sessionId,
          menuItemId,
          quantity: newQty,
          addedBy: addedBy || "Guest",
          notes: resolvedNotes,
        },
      });
    }

    const updatedCartItems = await prisma.cartItem.findMany({
      where: { sessionId },
      include: { menuItem: true },
      orderBy: { updatedAt: "asc" },
    });

    // Real-time broadcast to all devices scanning the same QR table session
    await emitToRoom(`table-${sessionId}`, "cart-updated", { cartItems: updatedCartItems });

    return NextResponse.json({ cartItems: updatedCartItems });
  } catch (err) {
    console.error("POST /api/cart error:", err);
    return NextResponse.json({ error: err.message || "Failed to update cart" }, { status: 500 });
  }
}
