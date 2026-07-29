import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionToken, ADMIN_COOKIE_NAME } from "@/lib/auth";

export default function AdminLayout({ children, params }) {
  const { restaurantId } = params;
  const token = cookies().get(ADMIN_COOKIE_NAME)?.value;

  if (!verifySessionToken(token, restaurantId)) {
    redirect(`/admin/login?restaurantId=${restaurantId}`);
  }

  return children;
}