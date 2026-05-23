"use client";

import "@/lib/amplifyclient";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCurrentUser } from "aws-amplify/auth";

const ADMINS = ["dansaar52@gmail.com"];
const APPROVED_SELLERS = ["dansaar52@gmail.com"];

export default function AdminSellersPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const user = await getCurrentUser();
        const email = user.signInDetails?.loginId || user.username || "";
        setIsAdmin(ADMINS.includes(email));
      } finally {
        setChecking(false);
      }
    }

    load();
  }, []);

  if (checking) {
    return <main className="min-h-screen bg-[#050607] p-10 text-white">Checking admin access...</main>;
  }

  if (!isAdmin) {
    return <main className="min-h-screen bg-[#050607] p-10 text-white">Admin access required.</main>;
  }

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin" className="text-sm text-[#c0c0c0]">
          ← Back to Admin
        </Link>

        <h1 className="mt-6 font-serif text-5xl text-[#c0c0c0]">
          Seller Controls
        </h1>

        <p className="mt-4 text-gray-400">
          Current approved sellers. For now, seller access is controlled in code.
        </p>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03]">
          {APPROVED_SELLERS.map((email) => (
            <div key={email} className="border-b border-white/10 p-5 last:border-b-0">
              <div className="text-white">{email}</div>
              <div className="mt-1 text-xs uppercase tracking-[0.18em] text-emerald-400">
                Approved Seller
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}