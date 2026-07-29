// One-off helper: sets admin login credentials without touching any other data
// (unlike prisma/seed.js, which wipes and recreates everything). Safe to run any
// time you want to (re)set the admin username/password on an existing restaurant.
//
// Usage: node prisma/set-admin-password.js <restaurantId> <username> <password>
// Example: node prisma/set-admin-password.js demo-restaurant admin myNewPassword123

const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const [, , restaurantId, username, password] = process.argv;

if (!restaurantId || !username || !password) {
  console.error("Usage: node prisma/set-admin-password.js <restaurantId> <username> <password>");
  process.exit(1);
}

prisma.restaurant
  .update({
    where: { id: restaurantId },
    data: { adminUsername: username, adminPasswordHash: hashPassword(password) },
  })
  .then(() => {
    console.log(`Admin credentials set for "${restaurantId}": username="${username}"`);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());