import { redirect } from "next/navigation";

// Error Log was merged into System Health (alongside Stripe Health). Keep this
// path as a redirect so old bookmarks/links (and webhook log hints) don't 404.
export default function AdminErrorsPage() {
  redirect("/admin/system");
}
