import { redirect } from "next/navigation";

// Single-tenant deployment — the system opens straight into the admin dashboard.
// Customers never land here; they reach the menu via the QR codes generated in
// Admin > Table QR Studio, which link directly to /menu/{restaurantId}/{table}.
export default function Home() {
  redirect("/admin/demo-restaurant");
}