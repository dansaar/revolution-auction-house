import { redirect } from "next/navigation";

// Stripe Health was merged into System Health (alongside the Error Log). Keep
// this path as a redirect so old bookmarks/links don't 404.
export default function AdminStripeHealthPage() {
  redirect("/admin/system");
}
