"use client";

import "@/lib/amplifyclient";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isAdminUser } from "@/lib/sellers";
import BuyersPanel from "./BuyersPanel";
import SellersPanel from "./SellersPanel";

type Tab = "buyers" | "sellers";

export default function AdminAccountsPage() {
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState<Tab>("buyers");

  useEffect(() => {
    // Deep-link support: /admin/accounts?tab=sellers (used by the old route redirects).
    const param = new URLSearchParams(window.location.search).get("tab");
    if (param === "sellers" || param === "buyers") setTab(param);
    (async () => {
      setIsAdmin(await isAdminUser());
      setReady(true);
    })();
  }, []);

  if (!ready) return <main className="min-h-screen bg-[#050607] p-10 text-white">Loading…</main>;
  if (!isAdmin) return <main className="min-h-screen bg-[#050607] p-10 text-white">Admin access required.</main>;

  const tabClass = (active: boolean) =>
    `rounded-xl border px-5 py-2.5 text-sm font-semibold transition ${
      active
        ? "border-[#d6aa55] bg-gradient-to-b from-[#241a09] to-[#1a1408] text-[#e7c77f] ring-1 ring-[#d6aa55]/50 shadow-[0_0_20px_rgba(214,170,85,0.28)]"
        : "border-white/10 bg-white/[0.03] text-gray-300 opacity-70 hover:opacity-100 hover:border-[#d6aa55]/30"
    }`;

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-7xl">
        <Link href="/admin" className="text-sm text-gray-500 hover:text-white">← Back to Admin</Link>

        <h1 className="mt-6 font-serif text-5xl text-[#c0c0c0]">Accounts</h1>
        <div className="mt-2 h-px w-48 bg-gradient-to-r from-transparent via-[#d6aa55]/60 to-transparent" />

        <div className="mt-8 flex flex-wrap gap-2">
          <button type="button" onClick={() => setTab("buyers")} className={tabClass(tab === "buyers")}>
            Buyers
          </button>
          <button type="button" onClick={() => setTab("sellers")} className={tabClass(tab === "sellers")}>
            Sellers
          </button>
        </div>

        <div className="mt-8">
          {tab === "buyers" ? <BuyersPanel /> : <SellersPanel />}
        </div>
      </div>
    </main>
  );
}
