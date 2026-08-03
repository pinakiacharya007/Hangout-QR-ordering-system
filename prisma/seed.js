const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const prisma = new PrismaClient();

// Same scheme as src/lib/auth.js (scrypt, "salt:hash") — kept duplicated here since
// this script runs standalone via `node prisma/seed.js`, outside the Next.js app.
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const RESTAURANT_ID = "demo-restaurant";
const RESTAURANT_NAME = "Demo Restaurant";
const DEFAULT_ADMIN_USERNAME = "admin";
// CHANGE THIS before any real handoff — or better, run set-admin-password.js right after seeding.
const DEFAULT_ADMIN_PASSWORD = "changeme123";
const NUM_TABLES = 8; // adjust to match whatever table count you want to demo

// Generic placeholder menu — no brand-specific naming, just enough variety across
// categories to demo the full customer + admin flow (veg/non-veg mix, bestseller tags,
// notes-capable items, price range spread).
const categoriesData = [
  {
    "name": "Starters",
    "items": [
      { "name": "Veg Spring Rolls", "price": 120, "veg": true, "note": null, "bestseller": false },
      { "name": "Paneer Tikka", "price": 180, "veg": true, "note": null, "bestseller": true },
      { "name": "Chicken Wings", "price": 220, "veg": false, "note": null, "bestseller": false },
      { "name": "Chilli Chicken", "price": 200, "veg": false, "note": null, "bestseller": true },
      { "name": "Corn Cheese Balls", "price": 150, "veg": true, "note": null, "bestseller": false }
    ]
  },
  {
    "name": "Soups",
    "items": [
      { "name": "Tomato Soup", "price": 90, "veg": true, "note": null, "bestseller": false },
      { "name": "Sweet Corn Soup", "price": 100, "veg": true, "note": null, "bestseller": false },
      { "name": "Chicken Hot & Sour Soup", "price": 130, "veg": false, "note": null, "bestseller": false }
    ]
  },
  {
    "name": "Sandwiches",
    "items": [
      { "name": "Plain Sandwich", "price": 60, "veg": true, "note": null, "bestseller": false },
      { "name": "Veg Cheese Sandwich", "price": 90, "veg": true, "note": null, "bestseller": false },
      { "name": "Grilled Chicken Sandwich", "price": 140, "veg": false, "note": null, "bestseller": false },
      { "name": "Club Sandwich", "price": 160, "veg": true, "note": null, "bestseller": true }
    ]
  },
  {
    "name": "Pizza",
    "items": [
      { "name": "Margherita Pizza", "price": 220, "veg": true, "note": null, "bestseller": true },
      { "name": "Farmhouse Pizza", "price": 260, "veg": true, "note": null, "bestseller": false },
      { "name": "Chicken Tikka Pizza", "price": 320, "veg": false, "note": null, "bestseller": false },
      { "name": "Peppy Paneer Pizza", "price": 280, "veg": true, "note": null, "bestseller": false }
    ]
  },
  {
    "name": "Main Course",
    "items": [
      { "name": "Paneer Butter Masala", "price": 220, "veg": true, "note": null, "bestseller": true },
      { "name": "Dal Makhani", "price": 180, "veg": true, "note": null, "bestseller": false },
      { "name": "Butter Chicken", "price": 280, "veg": false, "note": null, "bestseller": true },
      { "name": "Chicken Biryani", "price": 250, "veg": false, "note": null, "bestseller": true },
      { "name": "Veg Biryani", "price": 200, "veg": true, "note": null, "bestseller": false },
      { "name": "Mutton Curry", "price": 320, "veg": false, "note": null, "bestseller": false }
    ]
  },
  {
    "name": "Breads",
    "items": [
      { "name": "Butter Naan", "price": 40, "veg": true, "note": null, "bestseller": false },
      { "name": "Garlic Naan", "price": 50, "veg": true, "note": null, "bestseller": false },
      { "name": "Tandoori Roti", "price": 25, "veg": true, "note": null, "bestseller": false }
    ]
  },
  {
    "name": "Beverages",
    "items": [
      { "name": "Cold Coffee", "price": 100, "veg": true, "note": null, "bestseller": false },
      { "name": "Fresh Lime Soda", "price": 70, "veg": true, "note": null, "bestseller": false },
      { "name": "Chocolate Shake", "price": 130, "veg": true, "note": null, "bestseller": true },
      { "name": "Masala Chai", "price": 40, "veg": true, "note": null, "bestseller": false }
    ]
  },
  {
    "name": "Desserts",
    "items": [
      { "name": "Gulab Jamun", "price": 80, "veg": true, "note": null, "bestseller": false },
      { "name": "Chocolate Brownie", "price": 120, "veg": true, "note": null, "bestseller": true },
      { "name": "Ice Cream Sundae", "price": 110, "veg": true, "note": null, "bestseller": false }
    ]
  }
];

async function main() {
  await prisma.notification.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.review.deleteMany();
  await prisma.tableSession.deleteMany();
  await prisma.table.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.category.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.restaurant.deleteMany();

  const restaurant = await prisma.restaurant.create({
    data: {
      id: RESTAURANT_ID,
      name: RESTAURANT_NAME,
      adminUsername: DEFAULT_ADMIN_USERNAME,
      adminPasswordHash: hashPassword(DEFAULT_ADMIN_PASSWORD),
    },
  });

  for (let i = 0; i < categoriesData.length; i++) {
    const cat = categoriesData[i];
    const category = await prisma.category.create({
      data: { restaurantId: restaurant.id, name: cat.name, sortOrder: i },
    });
    for (const item of cat.items) {
      await prisma.menuItem.create({
        data: {
          restaurantId: restaurant.id,
          categoryId: category.id,
          name: item.name,
          price: item.price,
          veg: item.veg,
          description: item.note || null,
          available: true,
          isBestseller: !!item.bestseller,
        },
      });
    }
  }

  // Pre-seed tables
  for (let t = 1; t <= NUM_TABLES; t++) {
    await prisma.table.create({
      data: { restaurantId: restaurant.id, number: t },
    });
  }

  const totalItems = categoriesData.reduce((sum, c) => sum + c.items.length, 0);
  console.log(`Done! ${RESTAURANT_NAME} (id: ${RESTAURANT_ID}) — ${categoriesData.length} categories, ${totalItems} items, ${NUM_TABLES} tables.`);
  console.log(`Admin login:   username "${DEFAULT_ADMIN_USERNAME}", password "${DEFAULT_ADMIN_PASSWORD}"`);
  console.log(`⚠️  Change the admin password immediately — run:`);
  console.log(`    node prisma/set-admin-password.js ${RESTAURANT_ID} admin <new-strong-password>`);
  console.log(`Admin view:    /admin/${RESTAURANT_ID}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
