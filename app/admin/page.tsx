"use client";

import "@/lib/amplifyclient";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCurrentUser } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";

const ADMINS = ["dansaar52@gmail.com"];

export default function AdminPage() {
  const client = generateClient<Schema>();

  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [stats, setStats] = useState({
    auctions: 0,
    marketplace: 0,
    bids: 0,
    watchlist: 0,
  });

  useEffect(() => {
    async function loadAdmin() {
      try {
        const user = await getCurrentUser();
        const email = user.signInDetails?.loginId || user.username || "";

        if (!ADMINS.includes(email)) {
          setIsAdmin(false);
          return;
        }

        setIsAdmin(true);

        const [auctions, marketplace, bids, watchlist] = await Promise.all([
          client.models.Auction.list({ authMode: "apiKey" }),
          client.models.MarketplaceListing.list({ authMode: "apiKey" }),
          client.models.Bid.list({ authMode: "apiKey" }),
          client.models.WatchlistItem.list({ authMode: "userPool" }),
        ]);

        setStats({
          auctions: auctions.data.length,
          marketplace: marketplace.data.length,
          bids: bids.data.length,
          watchlist: watchlist.data.length,
        });
      } catch {
        setIsAdmin(false);
      } finally {
        setChecking(false);
      }
    }

    loadAdmin();
  }, []);

  if (checking) {
    return (
      <main className="min-h-screen bg-[#050607] p-10 text-white">
        Checking admin access...
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050607] px-6 text-white">
        <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <h1 className="font-serif text-3xl text-[#c0c0c0]">
            Admin Access Required
          </h1>
          <p className="mt-3 text-gray-400">
            You do not have permission to view this page.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded bg-[#c0c0c0] px-5 py-3 font-semibold text-black"
          >
            Back Home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="border-b border-white/10 pb-8">
          <div className="text-xs uppercase tracking-[0.3em] text-gray-500">
            Revolution Auction House
          </div>
          <h1 className="mt-3 font-serif text-5xl text-[#c0c0c0]">
            Admin Dashboard
          </h1>
          <p className="mt-3 text-gray-400">
            Platform overview, moderation, and operations.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-4">
          <Stat label="Auctions" value={stats.auctions} />
          <Stat label="Marketplace" value={stats.marketplace} />
          <Stat label="Bids" value={stats.bids} />
          <Stat label="Watchlist Items" value={stats.watchlist} />
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          <AdminCard
            title="Manage Auctions"
            description="Review active, ended, and reserve-not-met auctions."
            href="/admin/auctions"
          />
          <AdminCard
            title="Manage Marketplace"
            description="Review listings, sellers, and featured inventory."
            href="/admin/marketplace"
          />
          <AdminCard
            title="Seller Controls"
            description="Approve sellers and manage invite-only access."
            href="/admin/sellers"
          />
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="text-xs uppercase tracking-[0.22em] text-gray-500">
        {label}
      </div>
      <div className="mt-3 font-serif text-4xl text-[#c0c0c0]">{value}</div>
    </div>
  );
}

function AdminCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-[#c0c0c0]/40 hover:bg-white/[0.06]"
    >
      <h2 className="font-serif text-2xl text-white">{title}</h2>
      <p className="mt-3 text-sm text-gray-400">{description}</p>
      <div className="mt-6 text-sm font-semibold text-[#c0c0c0]">
        Open →
      </div>
    </Link>
  );
}