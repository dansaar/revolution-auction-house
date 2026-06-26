import { redirect } from "next/navigation";

// User Management was merged into Accounts (Buyers tab). Redirect so old
// bookmarks/links don't 404.
export default function AdminUsersPage() {
  redirect("/admin/accounts?tab=buyers");
}
