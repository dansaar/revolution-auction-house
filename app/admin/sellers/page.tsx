import { redirect } from "next/navigation";

// Seller Controls was merged into Accounts (Sellers tab). Redirect so old
// bookmarks/links don't 404.
export default function AdminSellersPage() {
  redirect("/admin/accounts?tab=sellers");
}
