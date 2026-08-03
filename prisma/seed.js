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

const RESTAURANT_ID = "hangout-restro-cafe";
const RESTAURANT_NAME = "Hangout Restro Cafe";
const DEFAULT_ADMIN_USERNAME = "admin";
// CHANGE THIS before handing off — or better, run set-admin-password.js right after seeding.
const DEFAULT_ADMIN_PASSWORD = "changeme123";
const NUM_TABLES = 12; // adjust to match the actual table count at Hangout Restro Cafe

// Full menu, transcribed from the restaurant's price list. veg/non-veg inferred from
// category + item name (chicken/mutton/egg/omlette/keema => non-veg). Double-check the
// handful of ambiguous ones (e.g. Waffle Pizza) before going live.
const categoriesData = [
  {
    "name": "Sandwiches",
    "items": [
      {
        "name": "Plain sandwich",
        "price": 50,
        "veg": true,
        "note": null
      },
      {
        "name": "Veg Sandwich",
        "price": 70,
        "veg": true,
        "note": null
      },
      {
        "name": "Veg Cheese Sandwich",
        "price": 80,
        "veg": true,
        "note": null
      },
      {
        "name": "Corn Cheese Sandwich",
        "price": 80,
        "veg": true,
        "note": null
      },
      {
        "name": "Paneer Sandwich",
        "price": 90,
        "veg": true,
        "note": null
      },
      {
        "name": "Paneer Sweet Corn Sandwich",
        "price": 100,
        "veg": true,
        "note": null
      },
      {
        "name": "Chicken Sandwich",
        "price": 120,
        "veg": false,
        "note": null
      }
    ]
  },
  {
    "name": "Burgers",
    "items": [
      {
        "name": "Veg Burger",
        "price": 70,
        "veg": true,
        "note": null
      },
      {
        "name": "Veg Cheese Burger",
        "price": 80,
        "veg": true,
        "note": null
      },
      {
        "name": "Corn Cheese Burger",
        "price": 80,
        "veg": true,
        "note": null
      },
      {
        "name": "Paneer Burger",
        "price": 90,
        "veg": true,
        "note": null
      }
    ]
  },
  {
    "name": "Pizza",
    "items": [
      {
        "name": "Farm House Pizza",
        "price": 140,
        "veg": true,
        "note": null
      },
      {
        "name": "Cheese Margherita Pizza",
        "price": 160,
        "veg": true,
        "note": null
      },
      {
        "name": "Corn Pizza",
        "price": 170,
        "veg": true,
        "note": null
      },
      {
        "name": "Paneer Pizza",
        "price": 180,
        "veg": true,
        "note": null
      },
      {
        "name": "Mexican Pizza",
        "price": 180,
        "veg": true,
        "note": null
      },
      {
        "name": "Italian Pizza",
        "price": 180,
        "veg": true,
        "note": null
      },
      {
        "name": "Paneer Corn Pizza",
        "price": 190,
        "veg": true,
        "note": null
      },
      {
        "name": "Paneer Italian Pizza",
        "price": 190,
        "veg": true,
        "note": null
      },
      {
        "name": "Chicken Pizza",
        "price": 200,
        "veg": false,
        "note": null
      },
      {
        "name": "Waffle Pizza",
        "price": 220,
        "veg": true,
        "note": null
      }
    ]
  },
  {
    "name": "Coffee & Tea",
    "items": [
      {
        "name": "plain Tea",
        "price": 10,
        "veg": true,
        "note": null
      },
      {
        "name": "Lemon Tea",
        "price": 10,
        "veg": true,
        "note": null
      },
      {
        "name": "Ginger Tea",
        "price": 20,
        "veg": true,
        "note": null
      },
      {
        "name": "Elaichi Tea",
        "price": 20,
        "veg": true,
        "note": null
      },
      {
        "name": "Hot Coffee",
        "price": 30,
        "veg": true,
        "note": null
      },
      {
        "name": "Classic Coffee",
        "price": 30,
        "veg": true,
        "note": null
      },
      {
        "name": "Vanila Coffee",
        "price": 30,
        "veg": true,
        "note": null
      },
      {
        "name": "Butter Scotch Coffee",
        "price": 30,
        "veg": true,
        "note": null
      },
      {
        "name": "Hazzle Nut Coffee",
        "price": 40,
        "veg": true,
        "note": null
      }
    ]
  },
  {
    "name": "Mocktail",
    "items": [
      {
        "name": "Masala Cold Drink",
        "price": 30,
        "veg": true,
        "note": null
      },
      {
        "name": "Lemonade",
        "price": 40,
        "veg": true,
        "note": null
      },
      {
        "name": "Pineapple Mojito",
        "price": 90,
        "veg": true,
        "note": null
      },
      {
        "name": "Mint Mojito",
        "price": 90,
        "veg": true,
        "note": null
      },
      {
        "name": "Lemon Mojito",
        "price": 90,
        "veg": true,
        "note": null
      },
      {
        "name": "Orange Mojito",
        "price": 100,
        "veg": true,
        "note": null
      },
      {
        "name": "Strawberry Mojito",
        "price": 100,
        "veg": true,
        "note": null
      },
      {
        "name": "Blue Ocean Mojito",
        "price": 120,
        "veg": true,
        "note": null
      }
    ]
  },
  {
    "name": "Maggie & pasta",
    "items": [
      {
        "name": "Plain Maggie",
        "price": 40,
        "veg": true,
        "note": null
      },
      {
        "name": "Masala Maggie",
        "price": 50,
        "veg": true,
        "note": null
      },
      {
        "name": "Veg Maggie",
        "price": 70,
        "veg": true,
        "note": null
      },
      {
        "name": "Hangout Special Maggie",
        "price": 90,
        "veg": true,
        "note": null
      },
      {
        "name": "Red Sauce Pasta",
        "price": 100,
        "veg": true,
        "note": null
      },
      {
        "name": "White Sauce Pasta",
        "price": 110,
        "veg": true,
        "note": null
      }
    ]
  },
  {
    "name": "Snacks",
    "items": [
      {
        "name": "Butter Bread toast",
        "price": 40,
        "veg": true,
        "note": null
      },
      {
        "name": "Cheese Chilli Toast",
        "price": 60,
        "veg": true,
        "note": null
      },
      {
        "name": "French Fries",
        "price": 60,
        "veg": true,
        "note": null
      },
      {
        "name": "Peri Peri French Fries",
        "price": 80,
        "veg": true,
        "note": null
      },
      {
        "name": "PizzaCheese Bread",
        "price": 70,
        "veg": true,
        "note": null
      },
      {
        "name": "Garlic Cheese Bread",
        "price": 80,
        "veg": true,
        "note": null
      },
      {
        "name": "French Fries Chilli",
        "price": 120,
        "veg": true,
        "note": null
      }
    ]
  },
  {
    "name": "Shakes",
    "items": [
      {
        "name": "Apple Shake",
        "price": 100,
        "veg": true,
        "note": null
      },
      {
        "name": "Mango Shake",
        "price": 100,
        "veg": true,
        "note": null
      },
      {
        "name": "Strawberry Shake",
        "price": 100,
        "veg": true,
        "note": null
      },
      {
        "name": "Gwava Shake",
        "price": 100,
        "veg": true,
        "note": null
      },
      {
        "name": "Blueberry Shake",
        "price": 100,
        "veg": true,
        "note": null
      },
      {
        "name": "Vanila Shake",
        "price": 100,
        "veg": true,
        "note": null
      },
      {
        "name": "Butter Scotch Shake",
        "price": 100,
        "veg": true,
        "note": null
      },
      {
        "name": "Black Current Shake",
        "price": 100,
        "veg": true,
        "note": null
      },
      {
        "name": "Litchi Shake",
        "price": 110,
        "veg": true,
        "note": null
      },
      {
        "name": "Kiwi Shake",
        "price": 120,
        "veg": true,
        "note": null
      },
      {
        "name": "Chocolate Shake",
        "price": 120,
        "veg": true,
        "note": null
      },
      {
        "name": "Oreo Shake",
        "price": 120,
        "veg": true,
        "note": null
      },
      {
        "name": "Cold Coffee",
        "price": 120,
        "veg": true,
        "note": null
      },
      {
        "name": "Kitkat Shake",
        "price": 130,
        "veg": true,
        "note": null
      }
    ]
  },
  {
    "name": "Soups (Veg)",
    "items": [
      {
        "name": "Hot & Sour Soup",
        "price": 100,
        "veg": true,
        "note": null
      },
      {
        "name": "Manchow Soup",
        "price": 100,
        "veg": true,
        "note": null
      },
      {
        "name": "Lemon Coriander Soup",
        "price": 100,
        "veg": true,
        "note": null
      },
      {
        "name": "Sweet Corn Soup",
        "price": 120,
        "veg": true,
        "note": null
      },
      {
        "name": "Thukpa Noodles Soup",
        "price": 130,
        "veg": true,
        "note": null
      }
    ]
  },
  {
    "name": "Soups (Non-Veg)",
    "items": [
      {
        "name": "Chicken Clear Soup",
        "price": 100,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Hot & Sour Soup",
        "price": 110,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Manchow Soup",
        "price": 110,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Lung Fung Soup",
        "price": 120,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Sweet Corn Soup",
        "price": 130,
        "veg": false,
        "note": null
      },
      {
        "name": "Thukpa Noodles Soup",
        "price": 140,
        "veg": false,
        "note": null
      }
    ]
  },
  {
    "name": "Veg Noodles",
    "items": [
      {
        "name": "Veg Noodles",
        "price": 80,
        "veg": true,
        "note": null
      },
      {
        "name": "Veg Schezwan Noodles",
        "price": 100,
        "veg": true,
        "note": null
      },
      {
        "name": "Veg Hakka Noodles",
        "price": 100,
        "veg": true,
        "note": null
      },
      {
        "name": "Mix Chowmin",
        "price": 120,
        "veg": true,
        "note": null
      },
      {
        "name": "Maxican Noodles",
        "price": 120,
        "veg": true,
        "note": null
      },
      {
        "name": "Singapuri Noodles",
        "price": 120,
        "veg": true,
        "note": null
      },
      {
        "name": "Sanghai Noodles",
        "price": 130,
        "veg": true,
        "note": null
      },
      {
        "name": "Veg American chop suey",
        "price": 160,
        "veg": true,
        "note": null
      }
    ]
  },
  {
    "name": "Non-Veg Noodles",
    "items": [
      {
        "name": "Egg Chowmin",
        "price": 100,
        "veg": false,
        "note": null
      },
      {
        "name": "Egg Chicken Chowmin",
        "price": 120,
        "veg": false,
        "note": null
      },
      {
        "name": "Egg Schezwan Noodles",
        "price": 120,
        "veg": false,
        "note": null
      },
      {
        "name": "Egg Chicken Hakka Noodles",
        "price": 130,
        "veg": false,
        "note": null
      },
      {
        "name": "Egg Chicken Sanghai N",
        "price": 150,
        "veg": false,
        "note": null
      },
      {
        "name": "American Chop Suey",
        "price": 170,
        "veg": false,
        "note": null
      }
    ]
  },
  {
    "name": "Veg Starter",
    "items": [
      {
        "name": "Corn chat",
        "price": 120,
        "veg": true,
        "note": null
      },
      {
        "name": "Mashroom Pakoda",
        "price": 130,
        "veg": true,
        "note": null
      },
      {
        "name": "Honey Chilli Potato",
        "price": 130,
        "veg": true,
        "note": null
      },
      {
        "name": "Hangout 29",
        "price": 130,
        "veg": true,
        "note": null
      },
      {
        "name": "Paneer Pakoda",
        "price": 140,
        "veg": true,
        "note": null
      },
      {
        "name": "Veg Manchurian",
        "price": 140,
        "veg": true,
        "note": null
      },
      {
        "name": "Chana Dry",
        "price": 150,
        "veg": true,
        "note": null
      },
      {
        "name": "American Corn Fry",
        "price": 160,
        "veg": true,
        "note": null
      },
      {
        "name": "Sweet Corn Chilli",
        "price": 160,
        "veg": true,
        "note": null
      },
      {
        "name": "Su Chowk Babycorn",
        "price": 160,
        "veg": true,
        "note": null
      },
      {
        "name": "Baby Corn Chilli",
        "price": 170,
        "veg": true,
        "note": null
      },
      {
        "name": "Paneer Hong Kong",
        "price": 170,
        "veg": true,
        "note": null
      },
      {
        "name": "Veg Navaratna Korma",
        "price": 170,
        "veg": true,
        "note": null
      },
      {
        "name": "Paneer butterfly",
        "price": 180,
        "veg": true,
        "note": null
      },
      {
        "name": "Paneer kurkure",
        "price": 180,
        "veg": true,
        "note": null
      },
      {
        "name": "Paneer Tikka",
        "price": 180,
        "veg": true,
        "note": null
      },
      {
        "name": "Sahi petro",
        "price": 180,
        "veg": true,
        "note": null
      },
      {
        "name": "Paneer Majestic",
        "price": 180,
        "veg": true,
        "note": null
      },
      {
        "name": "Paneer 999",
        "price": 180,
        "veg": true,
        "note": null
      }
    ]
  },
  {
    "name": "Non-Veg Starter",
    "items": [
      {
        "name": "Omlette",
        "price": 80,
        "veg": false,
        "note": null
      },
      {
        "name": "Egg Bhurji",
        "price": 100,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Pakoda",
        "price": 150,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Lolipop (3pc/6pc)",
        "price": 160,
        "veg": false,
        "note": "Also available: ₹300 option"
      },
      {
        "name": "Chicken Ambala",
        "price": 170,
        "veg": false,
        "note": null
      },
      {
        "name": "Hangout 29",
        "price": 170,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Manchurian",
        "price": 180,
        "veg": false,
        "note": null
      },
      {
        "name": "Barbeque Chicken",
        "price": 180,
        "veg": false,
        "note": null
      },
      {
        "name": "Barbeque Chicken Wings",
        "price": 180,
        "veg": false,
        "note": null
      },
      {
        "name": "Dragon Chicken",
        "price": 180,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken 999",
        "price": 180,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Butterfly",
        "price": 180,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Tikka",
        "price": 190,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Bang Bang",
        "price": 190,
        "veg": false,
        "note": null
      }
    ]
  },
  {
    "name": "Veg Dry",
    "items": [
      {
        "name": "Aloo Jeera",
        "price": 70,
        "veg": true,
        "note": null
      },
      {
        "name": "Chana Chilli",
        "price": 150,
        "veg": true,
        "note": null
      },
      {
        "name": "Chilli Mashroom",
        "price": 160,
        "veg": true,
        "note": null
      },
      {
        "name": "Chilli Paneer",
        "price": 170,
        "veg": true,
        "note": null
      },
      {
        "name": "Paneer 65",
        "price": 170,
        "veg": true,
        "note": null
      },
      {
        "name": "Paneer Salt & Pepper",
        "price": 170,
        "veg": true,
        "note": null
      },
      {
        "name": "Mashroom Salt & Pepper",
        "price": 170,
        "veg": true,
        "note": null
      }
    ]
  },
  {
    "name": "Veg Gravy",
    "items": [
      {
        "name": "Chana Masala",
        "price": 100,
        "veg": true,
        "note": null
      },
      {
        "name": "Aloo Gobi Matar Masala",
        "price": 120,
        "veg": true,
        "note": null
      },
      {
        "name": "Mix Veg",
        "price": 130,
        "veg": true,
        "note": null
      },
      {
        "name": "Veg Kurma",
        "price": 130,
        "veg": true,
        "note": null
      },
      {
        "name": "Veg Kofta",
        "price": 140,
        "veg": true,
        "note": null
      },
      {
        "name": "Mushroom Masala",
        "price": 140,
        "veg": true,
        "note": null
      },
      {
        "name": "Manchurian Masala",
        "price": 150,
        "veg": true,
        "note": null
      },
      {
        "name": "Paneer Masala",
        "price": 150,
        "veg": true,
        "note": null
      },
      {
        "name": "Mushroom Butter Masala",
        "price": 150,
        "veg": true,
        "note": null
      },
      {
        "name": "Paneer Butter Masala",
        "price": 160,
        "veg": true,
        "note": null
      },
      {
        "name": "Paneer Hyderabadi",
        "price": 160,
        "veg": true,
        "note": null
      },
      {
        "name": "Paneer Punjabi",
        "price": 160,
        "veg": true,
        "note": null
      },
      {
        "name": "Paneer Kolhapuri",
        "price": 160,
        "veg": true,
        "note": null
      },
      {
        "name": "Paneer Kadhai",
        "price": 160,
        "veg": true,
        "note": null
      },
      {
        "name": "Paneer Lababdar",
        "price": 160,
        "veg": true,
        "note": null
      },
      {
        "name": "Matar Paneer",
        "price": 160,
        "veg": true,
        "note": null
      },
      {
        "name": "Paneer Malai Kofta",
        "price": 160,
        "veg": true,
        "note": null
      },
      {
        "name": "Mushroom Hyderabadi",
        "price": 160,
        "veg": true,
        "note": null
      },
      {
        "name": "Paneer Toofani",
        "price": 170,
        "veg": true,
        "note": null
      },
      {
        "name": "Shahi Paneer",
        "price": 170,
        "veg": true,
        "note": null
      },
      {
        "name": "Mushroom Kadhai",
        "price": 170,
        "veg": true,
        "note": null
      },
      {
        "name": "Veg Patiala",
        "price": 170,
        "veg": true,
        "note": null
      },
      {
        "name": "Paneer Lajawab",
        "price": 180,
        "veg": true,
        "note": null
      },
      {
        "name": "Paneer Kofta",
        "price": 180,
        "veg": true,
        "note": null
      },
      {
        "name": "Paneer Tikka Masala",
        "price": 180,
        "veg": true,
        "note": null
      },
      {
        "name": "Dum Aloo Kashmiri",
        "price": 180,
        "veg": true,
        "note": null
      },
      {
        "name": "Veg Khazana",
        "price": 190,
        "veg": true,
        "note": null
      },
      {
        "name": "Paneer Bhawanipatna",
        "price": 190,
        "veg": true,
        "note": null
      }
    ]
  },
  {
    "name": "Non-Veg Dry",
    "items": [
      {
        "name": "Green chilli Chicken",
        "price": 180,
        "veg": false,
        "note": null
      },
      {
        "name": "Chilli Chicken (b/bl)",
        "price": 180,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken 65",
        "price": 180,
        "veg": false,
        "note": null
      },
      {
        "name": "Garlic Chicken",
        "price": 180,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Salt & Pepper",
        "price": 180,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Capsicum",
        "price": 180,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Drums of Heaven (2pc/5pc)",
        "price": 160,
        "veg": false,
        "note": "Also available: ₹300 option"
      },
      {
        "name": "Crispy Chicken",
        "price": 180,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Malesian",
        "price": 180,
        "veg": false,
        "note": null
      }
    ]
  },
  {
    "name": "Non-Veg Gravy",
    "items": [
      {
        "name": "Chicken Masala",
        "price": 150,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Kasa",
        "price": 160,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Butter Masala",
        "price": 160,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Bhuna Masala",
        "price": 160,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Hyderabadi",
        "price": 160,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Kolhapuri",
        "price": 160,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Punjabi",
        "price": 160,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Lababdar",
        "price": 160,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Dopiaza",
        "price": 160,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Angara",
        "price": 160,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Kadhai",
        "price": 160,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Azooba",
        "price": 170,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Lahori",
        "price": 170,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Handi",
        "price": 170,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Mughlai",
        "price": 170,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Rara",
        "price": 180,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Maharaja",
        "price": 180,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Ghungroo",
        "price": 190,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Patiala",
        "price": 200,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Tikka Masala",
        "price": 200,
        "veg": false,
        "note": null
      },
      {
        "name": "Desi Chicken Masala",
        "price": 230,
        "veg": false,
        "note": null
      },
      {
        "name": "Desi Chicken Kasa",
        "price": 240,
        "veg": false,
        "note": null
      }
    ]
  },
  {
    "name": "Chicken Tandoori",
    "items": [
      {
        "name": "Chicken Wings",
        "price": 160,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Tangdi Kabab",
        "price": 170,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Tandoori Punjabi",
        "price": 190,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Tandoori (Half)",
        "price": 250,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Tandoori (Full)",
        "price": 480,
        "veg": false,
        "note": null
      }
    ]
  },
  {
    "name": "Mutton Special",
    "items": [
      {
        "name": "Mutton Curry",
        "price": 250,
        "veg": false,
        "note": null
      },
      {
        "name": "Mutton Masala",
        "price": 250,
        "veg": false,
        "note": null
      },
      {
        "name": "Mutton Kasa",
        "price": 260,
        "veg": false,
        "note": null
      },
      {
        "name": "Mutton Kadhai",
        "price": 270,
        "veg": false,
        "note": null
      },
      {
        "name": "Mutton Handi",
        "price": 270,
        "veg": false,
        "note": null
      },
      {
        "name": "Mutton Dopiyaza",
        "price": 280,
        "veg": false,
        "note": null
      }
    ]
  },
  {
    "name": "Rice & Biryani",
    "items": [
      {
        "name": "Plain Rice",
        "price": 50,
        "veg": true,
        "note": null
      },
      {
        "name": "Jeera Rice",
        "price": 60,
        "veg": true,
        "note": null
      },
      {
        "name": "Onion Jeera Rice",
        "price": 60,
        "veg": true,
        "note": null
      },
      {
        "name": "Biryani Rice",
        "price": 80,
        "veg": true,
        "note": null
      },
      {
        "name": "Lemon Rice",
        "price": 100,
        "veg": true,
        "note": null
      },
      {
        "name": "Fried Rice (Veg)",
        "price": 120,
        "veg": true,
        "note": null
      },
      {
        "name": "Veg Schezwan Fried Rice",
        "price": 120,
        "veg": true,
        "note": null
      },
      {
        "name": "Egg Biryani",
        "price": 130,
        "veg": false,
        "note": null
      },
      {
        "name": "Veg Dum Biryani",
        "price": 130,
        "veg": true,
        "note": null
      },
      {
        "name": "Chicken Dum Biryani",
        "price": 150,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Hyd. Biryani",
        "price": 150,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Fried Rice",
        "price": 150,
        "veg": false,
        "note": null
      },
      {
        "name": "Kashmiri Pulao",
        "price": 150,
        "veg": true,
        "note": null
      },
      {
        "name": "Chicken Egg Dum Biryani",
        "price": 160,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Schezwan Fried Rice",
        "price": 160,
        "veg": false,
        "note": null
      },
      {
        "name": "Chicken Thai Fried Rice",
        "price": 160,
        "veg": false,
        "note": null
      },
      {
        "name": "Triple Schezwan Fried Rice",
        "price": 170,
        "veg": true,
        "note": null
      },
      {
        "name": "Mutton Fried Biryani",
        "price": 250,
        "veg": false,
        "note": null
      }
    ]
  },
  {
    "name": "Egg Special",
    "items": [
      {
        "name": "Egg Bhurji",
        "price": 90,
        "veg": false,
        "note": null
      },
      {
        "name": "Egg Masala",
        "price": 100,
        "veg": false,
        "note": null
      },
      {
        "name": "Egg Curry",
        "price": 100,
        "veg": false,
        "note": null
      },
      {
        "name": "Egg Keema Masala",
        "price": 100,
        "veg": false,
        "note": null
      },
      {
        "name": "Egg Lotpot",
        "price": 100,
        "veg": false,
        "note": null
      },
      {
        "name": "Egg Bhurji Curry",
        "price": 110,
        "veg": false,
        "note": null
      }
    ]
  },
  {
    "name": "Lentils(Dal)",
    "items": [
      {
        "name": "Jeera Dal",
        "price": 50,
        "veg": true,
        "note": null
      },
      {
        "name": "Dal Fry",
        "price": 60,
        "veg": true,
        "note": null
      },
      {
        "name": "Butter Dal",
        "price": 70,
        "veg": true,
        "note": null
      },
      {
        "name": "Dal Tadka",
        "price": 70,
        "veg": true,
        "note": null
      },
      {
        "name": "Egg Dal Tadka",
        "price": 90,
        "veg": false,
        "note": null
      },
      {
        "name": "Dal Makhni",
        "price": 120,
        "veg": true,
        "note": null
      }
    ]
  },
  {
    "name": "Indian Bread",
    "items": [
      {
        "name": "Tawa Roti",
        "price": 10,
        "veg": true,
        "note": null
      },
      {
        "name": "Tawa Butter Roti",
        "price": 15,
        "veg": true,
        "note": null
      },
      {
        "name": "Tandoori Roti",
        "price": 15,
        "veg": true,
        "note": null
      },
      {
        "name": "Tandoori Butter Roti",
        "price": 20,
        "veg": true,
        "note": null
      },
      {
        "name": "Methi Thepla",
        "price": 20,
        "veg": true,
        "note": null
      },
      {
        "name": "Plain Naan",
        "price": 25,
        "veg": true,
        "note": null
      },
      {
        "name": "Butter Naan",
        "price": 30,
        "veg": true,
        "note": null
      },
      {
        "name": "Plain Paratha",
        "price": 30,
        "veg": true,
        "note": null
      },
      {
        "name": "Garlic Naan",
        "price": 40,
        "veg": true,
        "note": null
      },
      {
        "name": "Aloo Paratha",
        "price": 40,
        "veg": true,
        "note": null
      },
      {
        "name": "Lachha Paratha",
        "price": 50,
        "veg": true,
        "note": null
      },
      {
        "name": "Masala Kulcha",
        "price": 60,
        "veg": true,
        "note": null
      }
    ]
  },
  {
    "name": "Salad",
    "items": [
      {
        "name": "Onion Salad",
        "price": 20,
        "veg": true,
        "note": null
      },
      {
        "name": "Cucumber Salad",
        "price": 20,
        "veg": true,
        "note": null
      },
      {
        "name": "Green Salad",
        "price": 50,
        "veg": true,
        "note": null
      }
    ]
  },
  {
    "name": "Raita",
    "items": [
      {
        "name": "Cucumber Raita",
        "price": 20,
        "veg": true,
        "note": null
      },
      {
        "name": "Plain Curd",
        "price": 30,
        "veg": true,
        "note": null
      },
      {
        "name": "Onion Raita",
        "price": 30,
        "veg": true,
        "note": null
      },
      {
        "name": "Boondi Raita",
        "price": 40,
        "veg": true,
        "note": null
      },
      {
        "name": "Mixed Raita",
        "price": 50,
        "veg": true,
        "note": null
      }
    ]
  },
  {
    "name": "Papad, Sweet & Water",
    "items": [
      {
        "name": "Dry Papad",
        "price": 20,
        "veg": true,
        "note": null
      },
      {
        "name": "Fry Papad",
        "price": 25,
        "veg": true,
        "note": null
      },
      {
        "name": "Dry Masala Papad",
        "price": 30,
        "veg": true,
        "note": null
      },
      {
        "name": "Fry Masala Papad",
        "price": 35,
        "veg": true,
        "note": null
      },
      {
        "name": "Rasmalai",
        "price": 40,
        "veg": true,
        "note": null
      },
      {
        "name": "Water Bottle",
        "price": 20,
        "veg": true,
        "note": null
      }
    ]
  }
];

async function main() {
  console.log(`Seeding ${RESTAURANT_NAME}...`);

  // Wipe existing demo/previous data for a clean slate
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
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
          isBestseller: false,
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