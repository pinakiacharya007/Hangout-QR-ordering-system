import { prisma } from "@/lib/db";
import { emitToRoom } from "@/lib/emit";

// Writes a notification row and pushes it live to the admin dashboard. Used for
// everything the admin notification centre tracks: new orders, cancellation
// requests, bill requests, new sessions starting.
export async function notify(restaurantId, type, message, tableNumber) {
  try {
    const notification = await prisma.notification.create({
      data: { restaurantId, type, message, tableNumber: tableNumber ?? null },
    });
    await emitToRoom(`restaurant-${restaurantId}`, "notification", { notification });
  } catch (err) {
    // Notifications are best-effort — never let a failure here break the action
    // (placing an order, requesting the bill, etc.) that triggered it.
    console.error("notify() failed:", err);
  }
}