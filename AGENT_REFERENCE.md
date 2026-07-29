# TableTap — Full Project Context (Agent Reference Document)

This document is a complete, self-contained reference to the TableTap project.
It is written so that any AI agent (Claude, ChatGPT, or any coding assistant)
can be handed ONLY this file and immediately understand the product, the
business model, the technical architecture, every design decision made and
why, and the current state of the build — without needing the original
conversation history.

Owner: Pinaki, founder of NexaCode Technologies (Odisha, India).
Status: Working local MVP built and demoed. Not yet deployed to production.

---

## 1. What TableTap is

TableTap is a QR-code-based digital table-ordering system for restaurants.
A customer sits at a table, scans a QR code unique to that table, and orders
food directly from their own phone — no app download, no waiter needed to take
the order. The kitchen/reception staff see the order appear on a dashboard in
real time (via WebSockets, not polling), accept it, and progress it through
prep stages while the customer watches live status updates on their own phone.

The core differentiator versus a generic online menu is: everything is scoped
per physical table, sessions are shared automatically between multiple phones
at the same table, and every state change (order placed, accepted, cancelled,
stock changed) propagates instantly to every relevant device via Socket.io.

## 2. Business model — NOT a generic multi-tenant SaaS

This is an important, deliberate decision: TableTap is being built as a
**personalized product per restaurant client**, not a single generic SaaS
platform that many unrelated restaurants sign up for self-serve.

Reasoning:
- The Indian QR-ordering market already has multiple established players
  (MenuScan, LimeTray/Dotpe, Restroworks, OrderIt, RestoLabs, TableQR, and
  others) offering generic self-serve SaaS. Competing head-on there means
  competing on price/features against companies with more engineering
  resources.
- Pinaki's actual edge is being a **local, personal, high-touch technology
  partner** — someone who can walk into a restaurant in Odisha, install the
  system, train the staff, tailor the branding/menu/flow to that specific
  restaurant, and be reachable directly for support. Big SaaS players ignore
  small-town, small-ticket clients; that's the gap.
- Practically, this means: **one shared codebase/engine, reused and
  re-themed/re-configured for each client** — not one shared multi-tenant
  database serving unrelated restaurants from a single deployment. Each client
  gets their own instance/config (own branding, own menu structure, own
  deployment), while the underlying code, schema design, and architecture stay
  the same across all of them. This is a "productized service" model, not a
  classic SaaS model — recurring revenue potential still exists (via
  maintenance/hosting fees per client) but the sales motion is manual/local,
  not self-serve signup.

Monetization path under consideration:
- One-time setup/customization fee per restaurant (covers Pinaki's build/config
  time) + a small flat monthly fee (hosting + support), rather than a
  per-transaction commission model (which is what alienates small restaurant
  owners about some existing platforms).
- Bundle this as a NexaCode Technologies product line, not a one-off freelance
  project — meant to become a repeatable, recurring revenue stream alongside
  Pinaki's other NexaCode/teaching income.

Target customer: small-to-medium independent restaurants and cafes, starting
hyperlocal (Bhawanipatna / Odisha), not an India-wide launch. First real client
demo is the immediate goal; scaling to more clients comes after the model is
proven with one.

## 3. Competitive landscape (for context, researched mid-2026)

Existing Indian QR-ordering / restaurant-tech players noted during planning:
MenuScan (~₹129/month, India-focused, budget), LimeTray/Dotpe (QR ordering +
digital menus to reduce commission dependency), Restroworks (enterprise/multi-
location), OrderIt (full restaurant management suite: POS, KDS, table mgmt),
RestoLabs/TableQR (QR menu + ordering specific tools), plus global players like
Toast/Square/Clover. Adoption context: QR ordering had crossed roughly half of
restaurants worldwide by 2026, and India's UPI/smartphone penetration means the
scan-to-order behavior already has zero friction with customers.

Conclusion drawn from this research: the technology itself is not the moat —
the personalized, local-first delivery model is.

## 4. Full user walkthrough

### 4.1 Customer journey
1. Customer sits at a table (e.g. Table 7) and scans the QR code printed and
   stuck on that table.
2. QR encodes a static per-table URL: `/menu/<restaurantId>/<tableNumber>`.
   The QR itself never changes — it's the underlying session behind it that's
   dynamic.
3. Page loads instantly (no login, no app download) showing the restaurant's
   menu: categories (Starters, Rice & Biryani, Mains, Beverages, etc. — fully
   editable by the restaurant), with a veg/non-veg filter.
4. Customer browses, adds dishes to cart, adjusts quantity.
5. If other people at the same table also scan the same QR (on their own
   phones), they automatically join the SAME shared session/cart — anyone's
   additions show up live on everyone's screen at that table. Optionally, each
   person can enter their name so items show "added by X" for context (no
   real auth, just a lightweight label).
6. Customer places the order. It appears instantly on the restaurant's admin
   dashboard.
7. Customer sees a live status view: Pending → Accepted → Preparing → Ready →
   Served. Each transition is pushed in real time, no refresh needed.
8. Customer can request to cancel individual dishes (or the whole order) while
   it's still pending/accepted/preparing.
9. (Not yet built) Customer can eventually request the bill digitally from the
   same screen — planned next feature, not in the current MVP.

### 4.2 Restaurant / admin journey
1. Staff open the Admin Dashboard on any device (phone, tablet, PC — no
   special hardware required).
2. New orders appear instantly (Socket.io push), tagged with table number,
   time, and items, with a brief visual highlight/flash for new orders and a
   notification sound.
3. Staff accept the order (or reject it), then progress it: Accepted →
   Preparing → Ready → Served, each transition pushed live back to the
   customer's phone.
4. Staff can edit the menu and toggle any dish "out of stock" instantly — this
   immediately greys out that item on every customer's live menu view at that
   restaurant. This was identified as a small but high-value feature: solves
   the real, frequent pain point of menu-mismatch/stock surprises.
5. Staff can view and print/display QR codes per table directly from the
   dashboard (a QR-code generator tab is built into admin).
6. (Not yet built) Staff will be able to close a table's session manually
   (e.g. after payment) and (not yet built) receive digital "Request Bill"
   notifications from customers.

## 5. Key design decisions and the reasoning behind them

These were deliberately chosen during planning, in priority order of how
much design difficulty they solved:

1. **QR codes are static per table, not per session or per customer.**
   Reprinting a QR for every new customer/session is operationally
   impossible. The QR always points to `/menu/<restaurantId>/<tableNumber>`;
   the *session* underneath is what's dynamic and gets created/reused/closed.

2. **Shared session logic (multiple people, same table).**
   When a customer scans a table's QR, the backend checks: does this table
   already have an ACTIVE session? If yes, join it (shared cart). If no,
   create a new one. This is the single mechanism that solves "multiple users
   at the same table" — no per-user cart logic needed, just a session-scoped
   cart that any device joined to that session's socket room can see update
   live.

3. **Session lifecycle / auto-reset for next customer.**
   A session is marked "active" until staff manually close the table (or,
   planned: a bill-request flow that auto-closes it, or an auto-expiry
   timeout as a safety net for staff forgetting to close it). This prevents
   the classic bug where the next customer at that table sees the previous
   customer's leftover cart/order.

4. **Order accept/reject flow, not instant auto-confirmation.**
   Orders start in "pending" and require an explicit admin "accept" action
   before the customer sees "Preparing." This was chosen deliberately so the
   kitchen isn't blindsided and the customer gets an honest status rather
   than a fake instant confirmation.

5. **Item-level status, not just whole-order status.**
   Every order item carries its own status (pending/accepted/rejected/
   cancelled) independent of the parent order's status. This enables partial
   accept (e.g. kitchen is out of one dish but can fulfill the rest) and
   item-level cancellation, without needing to cancel/resubmit the whole
   order.

6. **Cancel request rules tied to preparation state (planned refinement,
   partially simplified in the current MVP for time):**
   - Before preparation starts: cancellation should be automatic/instant, no
     admin approval needed (nothing wasted).
   - Once preparation has started: cancellation should require manual admin
     approval, with the dashboard visibly flagging that the dish may already
     be in progress.
   - Once ready/served: cancellation should not be allowed at all; only a
     "raise an issue with staff" action makes sense at that point.
   - NOTE: the current built MVP simplifies this to instant cancellation at
     any pre-served stage, to fit the one-night build deadline. The
     approval-gated version above is the intended v2 behavior and is not yet
     implemented — see Section 8 (Roadmap).

7. **Shared-cart permissions kept fully collaborative.**
   Rather than building per-user sub-carts merged at checkout (more complex,
   marginal benefit), anyone at a shared table session can add or cancel any
   item. Each item still carries an `addedBy` label for transparency/context,
   but there's no restrictive permission system. Chosen for simplicity and
   because dining tables are inherently a trust group.

8. **Multiple order batches per table session, not one merged running cart.**
   Every time a customer clicks "Place Order," it creates a new order
   record tied to the same table session (rather than merging into one
   giant running order). This matches how real dine-in ordering actually
   works — starters ordered first, then mains ordered later — and avoids
   complex merge logic. Both customer and kitchen views should show these as
   distinct "batches" tied to the same table (this batch-grouping UI is a
   planned refinement — see Roadmap). Data model already supports this (each Order is tied to
   TableSession); only the UI grouping is pending.

9. **No payment integration in the MVP.**
   Payment (UPI/cards) is deliberately out of scope for v1. Billing still
   happens by the restaurant's existing method (cash/card at counter).
   Reasoning: payment gateway integration brings disputes/refunds/compliance
   complexity that isn't needed to prove the core ordering-and-kitchen-sync
   loop. A "Request Bill" digital button (notifies staff, doesn't process
   payment) is the intended next step before actual payment processing.

10. **Real-time via a standalone Socket.io server, not Next.js API routes
    directly.** Serverless hosts like Vercel cannot hold persistent WebSocket
    connections, so a separate always-on Node process (`socket-server.js`)
    handles all real-time broadcasting. Next.js API routes, after writing to
    the database via Prisma, make a simple internal HTTP POST to this socket
    server's `/emit` endpoint, which then broadcasts to the correct Socket.io
    room. This keeps the Next.js app deployable on Vercel's free tier while
    the socket server is deployed separately (Render/Railway free tier).

11. **Socket.io rooms scope broadcasts correctly and enable multi-restaurant
    hosting on one socket server.** Two room types are used:
    - `restaurant-<restaurantId>` — joined by the admin dashboard; receives
      all new orders and stock-toggle updates for that restaurant only.
    - `table-<sessionId>` — joined by every customer device at that specific
      table session; receives only that table's own order status updates.
    Because rooms isolate broadcasts per restaurant and per table session,
    a single deployed socket server can serve every personalized client
    deployment (per Section 2's business model) without cross-restaurant
    data leaking between them, if hosted together.

12. **SQLite locally, Postgres in production.** Prisma's schema is written
    against a `sqlite` datasource for zero-setup local development (a single
    `dev.db` file, no Docker/Postgres install needed for a same-night demo).
    Switching to Postgres for real deployment is a one-line provider change
    plus a connection string (Neon/Supabase free tier already used previously
    for Pinaki's other projects, e.g. AttendEase).

## 6. Technical architecture

### Stack
- **Frontend + backend**: Next.js 14 (App Router), same codebase serves both
  the customer-facing menu/ordering pages and the admin dashboard, as
  different routes.
- **Database**: Prisma ORM. SQLite locally (`dev.db`), Postgres in production.
- **Real-time**: Socket.io — a standalone Node/Express server
  (`socket-server.js`), separate from the Next.js process.
- **Styling**: plain CSS (no framework dependency), mobile-first for the
  customer view.
- **QR generation**: client-side, via `api.qrserver.com` image URLs pointing
  at each table's menu link (no server-side QR library dependency).

### Why this stack
Deliberately reuses Pinaki's existing production experience: Next.js +
Prisma + PostgreSQL is his established stack (used previously for AttendEase
and PadhAI), and Socket.io was a known quantity from prior planning. This
was chosen specifically so the build velocity could be fast enough for a
same-night MVP deadline, not because it's the only valid stack.

### Data model (Prisma schema, conceptually)

```
Restaurant
 ├─ Table (per physical table, has a `number`)
 │   └─ TableSession (status: active | completed; one active at a time per table)
 │        └─ Order (status: pending | accepted | preparing | ready | served | cancelled)
 │             └─ OrderItem (status: pending | accepted | rejected | cancelled;
 │                           carries quantity, addedBy, notes)
 ├─ Category (name, sortOrder — restaurant-editable menu sections)
 └─ MenuItem (name, price, veg boolean, available boolean, description)
```

Key relations: `MenuItem` belongs to both a `Restaurant` and a `Category`.
`OrderItem` references a `MenuItem` (so price/name history is implicitly tied
to catalog data — note: for production, consider snapshotting price/name at
order time so historical orders aren't affected by later menu edits — not yet
done in the MVP).

### API routes (Next.js App Router, under `src/app/api/`)
- `GET /api/menu?restaurantId=` — returns categories with nested items.
- `POST /api/session` — get-or-create the active session for a
  `{ restaurantId, tableNumber }` pair (this is the shared-cart mechanism).
- `PATCH /api/session` — closes a session (`{ sessionId }` → status
  "completed").
- `PATCH /api/items/:id` — toggles `available` on a menu item; emits
  `item-availability-updated` to the restaurant's room.
- `GET /api/orders?restaurantId=` — lists all non-cancelled orders for the
  admin dashboard.
- `POST /api/orders` — creates a new order (a "batch") with its items; emits
  `new-order` to the restaurant's room and `order-placed` to the table's
  session room.
- `PATCH /api/orders/:id` — updates either the whole order's `status`, or (if
  `itemId` is passed) a single `OrderItem`'s `status` — this is how
  individual-dish cancellation works. Emits `order-updated` to both the
  table's session room and the restaurant's room.

### Socket events reference
| Event | Emitted by | Room | Consumed by |
|---|---|---|---|
| `new-order` | POST /api/orders | `restaurant-<id>` | Admin dashboard |
| `order-placed` | POST /api/orders | `table-<sessionId>` | Customer devices at that table |
| `order-updated` | PATCH /api/orders/:id | `table-<sessionId>` AND `restaurant-<id>` | Both customer and admin |
| `item-availability-updated` | PATCH /api/items/:id | `restaurant-<id>` | Every customer device viewing that restaurant's menu |

### File structure
```
tabletap/
├── prisma/
│   ├── schema.prisma
│   └── seed.js                 # demo restaurant "Spice Route Kitchen"
├── socket-server.js             # standalone Socket.io + Express server (port 4000)
├── .env                          # DATABASE_URL, SOCKET_SERVER_URL, NEXT_PUBLIC_SOCKET_URL
├── src/
│   ├── lib/
│   │   ├── db.js                 # Prisma client singleton
│   │   └── emit.js               # fetch() helper: Next.js API routes → socket server /emit
│   └── app/
│       ├── page.js                              # landing page with demo links
│       ├── globals.css                          # all styling
│       ├── menu/[restaurantId]/[table]/page.js  # customer menu + cart + live status (client component)
│       ├── admin/[restaurantId]/page.js         # admin dashboard: orders / menu-stock / QR tabs (client component)
│       └── api/
│           ├── menu/route.js
│           ├── session/route.js
│           ├── items/[id]/route.js
│           └── orders/route.js, orders/[id]/route.js
```

## 7. Current build status (as of last working session)

- Fully coded, locally installable MVP exists as a zip (`tabletap.zip`),
  confirmed to install and run correctly on Windows: `npm install`,
  `npx prisma generate`, `npx prisma db push`, `npm run seed`, `npm run
  socket` all completed successfully on the user's machine.
- Demo restaurant seeded: "Spice Route Kitchen", 4 categories (Starters, Rice
  & Biryani, Mains, Beverages), 12 menu items total.
- Not yet independently confirmed: the full live customer→admin socket flow
  running end-to-end on the user's machine (the build environment used to
  create this project could not fully verify the database layer at rest, due
  to a sandboxed network restriction blocking Prisma's engine-binary
  download domain — this is an environment limitation of the build tool, not
  a defect in the code; the user's own machine has unrestricted internet and
  the `npx prisma generate` step completed there without issue).
- Deployment (Vercel + Render/Railway + Neon/Supabase) has been planned but
  not yet executed — the project currently runs locally only.

## 8. Explicit roadmap / known simplifications (v2 and beyond)

In priority order of what to build next:
1. **Cancel-request approval gating** — currently instant; should require
   admin approval once an item's status is "preparing" (see Section 5.6).
2. **Partial accept at the item level** on the admin side (accept 4 of 5
   items, reject 1 — e.g. "out of stock mid-order") — currently the admin
   accepts/rejects the whole order only.
3. **Order batch grouping in the UI** — multiple orders placed by the same
   table session should visually group as "Batch 1 / Batch 2" under one
   continuous view, both for the customer and for kitchen staff (see
   Section 5.8). Data model already supports this (each Order is tied to
   TableSession); only the UI grouping is pending.
4. **"Request Bill" digital flow** — a button on the customer side that
   notifies the admin dashboard and can auto-close the table session on
   settlement.
5. **Payment gateway integration** (UPI/cards) — after the bill-request flow
   is proven, not before.
6. **Order/session timeout handling** — soft escalation if an order sits
   "pending" too long without being accepted (visual/audio escalation on the
   admin dashboard, not auto-cancellation).
7. **Menu-item price/name snapshotting at order time** — so later menu edits
   don't retroactively alter historical order records.
8. **Per-client configuration layer** — instead of hardcoding one demo
   restaurant, build a lightweight admin onboarding flow so a new restaurant
   client (its own menu, table count, branding) can be spun up without
   manually editing seed data — this directly supports the "one engine,
   many personalized clients" business model in Section 2.
9. **Production deployment** — Next.js → Vercel, socket server → Render or
   Railway, database → Neon or Supabase Postgres (swap `provider =
   "sqlite"` to `provider = "postgresql"` in `schema.prisma` plus the
   connection string).

## 9. How to run this locally (for any agent picking this up)

```bash
cd tabletap
npm install
npx prisma generate
npx prisma db push
npm run seed
```
Then in two separate terminals, running concurrently:
```bash
npm run socket     # starts the Socket.io server on :4000
npm run dev        # starts the Next.js app on :3000
```
Customer view: `http://localhost:3000/menu/demo-restaurant/7`
Admin view: `http://localhost:3000/admin/demo-restaurant`

---

*End of context document. Any agent reading this should have full working
knowledge of TableTap's product intent, business rationale, technical
architecture, every design tradeoff made and why, and exactly what remains
to be built.*
