import { redirect } from "next/navigation";

// Auction Audits was merged into Manage Auctions (same list, same per-auction
// "Audit" link, plus management actions). Keep this path as a redirect so old
// bookmarks/links don't 404.
export default function AdminAuditsPage() {
  redirect("/admin/auctions");
}
