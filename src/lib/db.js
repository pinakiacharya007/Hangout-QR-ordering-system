import { PrismaClient } from "@prisma/client";

// Prevent multiple Prisma instances in Next.js dev hot-reload
const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
