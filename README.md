# 🍽️ TableTap — QR Table Ordering MVP

Scan. Order. Done. A real-time restaurant table-ordering system: customers scan a
per-table QR code, browse the menu, order, and see live status — while the
kitchen/reception dashboard gets orders instantly via WebSockets, no refresh needed.

Built with: Next.js (App Router), Prisma + SQLite (local) / Postgres (production),
Socket.io (standalone real-time server), plain CSS.

---

## 1. One-time setup (do this first)

You need **Node.js 18+** installed. Check with `node -v`.

```bash
# unzip the project, then:
cd tabletap
npm install
```

Then generate the Prisma client and create your local database:

```bash
npx prisma generate
npx prisma db push
```

This creates a `dev.db` SQLite file locally — zero setup, no Postgres/Docker needed
for the demo. `db push` reads `prisma/schema.prisma` and creates matching tables.

Load the demo restaurant (categories, menu items):

```bash
npm run seed
```

You should see:
```
Done! Demo restaurant id: demo-restaurant
Customer view: /menu/demo-restaurant/7
Admin view:    /admin/demo-restaurant
```

---

## 2. Running it locally (every time)

You need **two terminals** running at once:

**Terminal 1 — the real-time socket server:**
```bash
npm run socket
```
You should see: `TableTap socket server listening on http://localhost:4000`

**Terminal 2 — the Next.js app:**
```bash
npm run dev
```
You should see it running on `http://localhost:3000`

Now open:
- `http://localhost:3000` — a landing page with quick links
- `http://localhost:3000/menu/demo-restaurant/7` — customer view for Table 7
- `http://localhost:3000/admin/demo-restaurant` — admin/kitchen dashboard

Open the customer link and admin link in **two separate browser windows side by
side**. Add items to cart on the customer side, place the order, and watch it
appear instantly on the admin dashboard — no refresh. Accept it, and watch the
customer's screen update live too.

---

## 3. Demoing on your phone (recommended — this sells it)

Scanning a QR on your actual phone while the dashboard sits on your laptop is
the moment that impresses people. Here's how, on the same wifi:

1. Find your laptop's local network IP:
   - **Windows:** `ipconfig` → look for "IPv4 Address" (something like `192.168.1.42`)
   - **Mac/Linux:** `ifconfig` or `ip a` → look for an address starting with `192.168.` or `10.`
2. On your phone (connected to the **same wifi**), open a browser and go to:
   `http://<your-ip>:3000/menu/demo-restaurant/7`
   (Replace `<your-ip>` with what you found above, e.g. `192.168.1.42`)
3. Keep the admin dashboard open on your laptop at `http://localhost:3000/admin/demo-restaurant`

**Test this tonight, not tomorrow morning.** If your phone can't reach it, it's
almost always one of these:
- Phone and laptop are on different wifi networks (check both)
- Laptop firewall is blocking incoming connections on ports 3000/4000 — temporarily
  allow them, or disable the firewall just for the demo
- You typed `localhost` instead of the IP on the phone — `localhost` on a phone
  means the phone itself, not your laptop

### Real QR codes
Go to the **"Table QR Codes"** tab in the admin dashboard — it generates a real,
scannable QR code per table (up to 12) pointing to that table's exact link. Pull
this up on your laptop screen and literally let the client scan it with their
own phone during the demo — that's a strong moment.

---

## 4. What's included in this MVP

- Per-table QR-based menu with categories, veg/non-veg filter
- **Shared live cart** — if two phones scan the same table's QR, they share one
  session/cart (test this by opening the same table link in two browser tabs)
- Order placed → **instantly appears on admin dashboard** (Socket.io)
- Admin accepts → **customer's screen updates live** to "Preparing your order"
- Full status flow: Pending → Accepted → Preparing → Ready → Served
- Customer can request to **cancel individual items** from an active order
- Admin can **toggle any item out of stock** → instantly greys out on all
  customer devices watching that restaurant
- Real QR code generator per table, built into the admin dashboard

## What's intentionally simplified for the MVP (roadmap for v2)

- Cancel requests apply instantly rather than needing admin approval — add an
  approval step once a dish may already be mid-preparation
- No payment integration — add a "Request Bill" flow next, then a payment
  gateway (Razorpad/UPI deep link) after that
- No multi-batch order view — currently each "Place Order" click creates a new
  order card; grouping them as one running list per table session is a v2 polish
- Single hardcoded demo restaurant — the real product should let you spin up
  a new restaurant (own menu, own tables, own branding) per client instead of
  editing seed data by hand

---

## 5. Zero-cost deployment (after tonight, when you're ready)

- **Next.js app** → Vercel (free tier)
- **Socket server** (`socket-server.js`) → Render or Railway (free tier) — it
  needs to run as a persistent Node process, which Vercel's serverless
  functions can't do
- **Database** → swap SQLite for Postgres via Neon or Supabase (free tier).
  In `prisma/schema.prisma`, change:
  ```prisma
  datasource db {
    provider = "postgresql"   // was "sqlite"
    url      = env("DATABASE_URL")
  }
  ```
  then set `DATABASE_URL` to your Neon/Supabase connection string and run
  `npx prisma db push` again.
- Update `SOCKET_SERVER_URL` and `NEXT_PUBLIC_SOCKET_URL` in `.env` to point to
  your deployed socket server's URL instead of `localhost:4000`.

---

## Project structure

```
tabletap/
├── prisma/
│   ├── schema.prisma       # DB models: Restaurant, Table, TableSession, Category, MenuItem, Order, OrderItem
│   └── seed.js             # Demo restaurant + menu data
├── socket-server.js         # Standalone real-time server (Socket.io + Express)
├── src/
│   ├── lib/
│   │   ├── db.js            # Prisma client
│   │   └── emit.js          # Helper to notify the socket server from API routes
│   └── app/
│       ├── page.js                          # Landing page
│       ├── menu/[restaurantId]/[table]/     # Customer menu + cart + live order status
│       ├── admin/[restaurantId]/            # Admin dashboard: orders, menu/stock editor, QR codes
│       └── api/
│           ├── menu/                # GET menu
│           ├── session/             # Get-or-create shared table session
│           ├── items/[id]/          # Toggle stock
│           └── orders/              # Create + list + update orders
```

Good luck with the presentation tonight — you've got this. 🔥
