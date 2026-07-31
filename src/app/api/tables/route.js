import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// GET /api/tables?restaurantId=xxx -> Fetch all tables for a restaurant
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const restaurantId = searchParams.get("restaurantId");

    if (!restaurantId) {
      return NextResponse.json({ error: "restaurantId is required" }, { status: 400 });
    }

    const tables = await prisma.table.findMany({
      where: { restaurantId },
      orderBy: { number: "asc" },
    });

    return NextResponse.json({ tables });
  } catch (err) {
    console.error("GET /api/tables error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch tables" }, { status: 500 });
  }
}

// POST /api/tables { restaurantId, tableNumber, isParcel? }
export async function POST(req) {
  try {
    const { restaurantId, tableNumber, isParcel } = await req.json();

    if (!restaurantId || !tableNumber) {
      return NextResponse.json({ error: "restaurantId and tableNumber are required" }, { status: 400 });
    }

    // Only one Parcels table is meaningful per restaurant — enforce it here rather
    // than relying on the admin UI to hide the option correctly every time.
    if (isParcel) {
      const existingParcel = await prisma.table.findFirst({ where: { restaurantId, isParcel: true } });
      if (existingParcel) {
        return NextResponse.json(
          { error: `A Parcels table already exists (Table ${existingParcel.number}) — only one is needed.` },
          { status: 400 }
        );
      }
    }

    // Check if table already exists
    const existing = await prisma.table.findFirst({
      where: { restaurantId, number: Number(tableNumber) },
    });

    if (existing) {
      return NextResponse.json({ error: "Table already exists", table: existing }, { status: 400 });
    }

    const table = await prisma.table.create({
      data: { restaurantId, number: Number(tableNumber), isParcel: !!isParcel },
    });

    return NextResponse.json({ table });
  } catch (err) {
    console.error("POST /api/tables error:", err);
    return NextResponse.json({ error: err.message || "Failed to create table" }, { status: 500 });
  }
}

// PATCH /api/tables
//   { action: "combine", restaurantId, tableNumbers: [1, 2, ...] }
//     -> Groups the given tables into one shared bill. The primary is always the
//        SMALLEST table number in the set; its QR/table identity is what the group
//        uses going forward. Only allowed while none of the tables have an active
//        (or bill_requested) session — i.e. before anyone's ordering.
//   { action: "uncombine", restaurantId, tableNumber }
//     -> Splits a table (or its whole group) back into independent tables.
export async function PATCH(req) {
  try {
    const body = await req.json();
    const { action, restaurantId } = body || {};

    if (!restaurantId) {
      return NextResponse.json({ error: "restaurantId is required" }, { status: 400 });
    }

    if (action === "combine") {
      const tableNumbers = (body.tableNumbers || []).map(Number).filter((n) => !isNaN(n));
      if (tableNumbers.length < 2) {
        return NextResponse.json({ error: "Select at least 2 tables to combine" }, { status: 400 });
      }

      const tables = await prisma.table.findMany({
        where: { restaurantId, number: { in: tableNumbers } },
      });
      if (tables.length !== tableNumbers.length) {
        return NextResponse.json({ error: "One or more of those tables don't exist yet — add them first" }, { status: 400 });
      }
      if (tables.some((t) => t.groupId || tables.some((other) => other.id !== t.id && other.groupId === t.id))) {
        return NextResponse.json(
          { error: "One of these tables is already part of a combined group — split it first" },
          { status: 400 }
        );
      }

      const tableIds = tables.map((t) => t.id);
      const activeElsewhere = await prisma.tableSession.count({
        where: { tableId: { in: tableIds }, status: { in: ["active", "bill_requested"] } },
      });
      if (activeElsewhere > 0) {
        return NextResponse.json(
          { error: "Can't combine — one of these tables already has a customer seated. Checkout that table first." },
          { status: 400 }
        );
      }

      const primary = tables.reduce((min, t) => (t.number < min.number ? t : min), tables[0]);
      const memberIds = tables.filter((t) => t.id !== primary.id).map((t) => t.id);

      await prisma.table.updateMany({ where: { id: { in: memberIds } }, data: { groupId: primary.id } });
      // In case the primary was previously a member of a different group.
      await prisma.table.update({ where: { id: primary.id }, data: { groupId: null } });

      return NextResponse.json({ primaryTableNumber: primary.number, combinedNumbers: tableNumbers });
    }

    if (action === "uncombine") {
      const tableNumber = Number(body.tableNumber);
      const table = await prisma.table.findFirst({ where: { restaurantId, number: tableNumber } });
      if (!table) {
        return NextResponse.json({ error: "Table not found" }, { status: 404 });
      }

      const primaryId = table.groupId || table.id;
      const groupSize = await prisma.table.count({
        where: { restaurantId, OR: [{ id: primaryId }, { groupId: primaryId }] },
      });
      if (groupSize <= 1) {
        return NextResponse.json({ error: "This table isn't part of a combined group" }, { status: 400 });
      }

      await prisma.table.updateMany({
        where: { restaurantId, OR: [{ id: primaryId }, { groupId: primaryId }] },
        data: { groupId: null },
      });

      return NextResponse.json({ split: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("PATCH /api/tables error:", err);
    return NextResponse.json({ error: err.message || "Failed to update tables" }, { status: 500 });
  }
}

// DELETE /api/tables/{id} -> Delete a table and all its sessions/orders
export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const tableId = searchParams.get("id");

    if (!tableId) {
      return NextResponse.json({ error: "Table id is required" }, { status: 400 });
    }

    // If this table is a combined group's primary, free its members first so they
    // don't end up with a groupId pointing at a table that no longer exists.
    await prisma.table.updateMany({ where: { groupId: tableId }, data: { groupId: null } });

    // Delete the table (cascade will handle sessions and orders)
    const table = await prisma.table.delete({
      where: { id: tableId },
    });

    return NextResponse.json({ table });
  } catch (err) {
    console.error("DELETE /api/tables error:", err);
    return NextResponse.json({ error: err.message || "Failed to delete table" }, { status: 500 });
  }
}