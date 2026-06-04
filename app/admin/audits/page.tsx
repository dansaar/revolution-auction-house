"use client";

import "@/lib/amplifyclient";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getCurrentUser } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { isPlatformAdmin } from "@/lib/sellers";
import { cdnUrl } from "@/lib/cdn";

const client = generateClient<Schema>();

function moneyToNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  return Number(String(value).replace(/[$,]/g, ""));
}

function isAuctionEnded(auction: any) {
  return Boolean(
    auction?.ended ||
    (auction?.endsAt && new Date(auction.endsAt).getTime() <= Date.now()),
  );
}

export default function AdminAuditsPage() {
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [auctions, setAuctions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    async function checkAccessAndLoad() {
      try {
        const user = await getCurrentUser();
        const email = user.signInDetails?.loginId || user.username || "";

        const admin = isPlatformAdmin(email);
        setIsAdmin(admin);

        if (!admin) return;

        const result = await client.models.Auction.list({
          authMode: "apiKey",
          limit: 1000,
        } as any);

        const sorted = [...(result.data || [])].sort(
          (a: any, b: any) =>
            new Date(b.endsAt || b.createdAt || 0).getTime() -
            new Date(a.endsAt || a.createdAt || 0).getTime(),
        );

        setAuctions(
          sorted.map((auction: any) => {
            const rawImage =
              auction.thumbImages?.[0] ||
              auction.images?.[0] ||
              auction.image ||
              "";

            return {
              ...auction,
              imageUrl: cdnUrl(rawImage) || "/logo.png",
            };
          }),
        );
      } catch (err) {
        console.error("ADMIN AUDITS LOAD ERROR", err);
        setIsAdmin(false);
      } finally {
        setCheckingAccess(false);
        setLoading(false);
      }
    }

    checkAccessAndLoad();
  }, []);

  const filteredAuctions = useMemo(() => {
    const search = searchText.trim().toLowerCase();

    if (!search) return auctions;

    return auctions.filter((auction: any) => {
      return (
        String(auction.title || "")
          .toLowerCase()
          .includes(search) ||
        String(auction.sellerEmail || "")
          .toLowerCase()
          .includes(search) ||
        String(auction.sellerPublicId || "")
          .toLowerCase()
          .includes(search) ||
        String(auction.id || "")
          .toLowerCase()
          .includes(search)
      );
    });
  }, [auctions, searchText]);

  if (checkingAccess || loading) {
    return (
      <main className="min-h-screen bg-[#050607] p-10 text-white">
        Loading admin audits...
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-[#050607] p-10 text-white">
        Admin access required.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-7xl">
        <Link href="/admin" className="text-sm text-gray-500 hover:text-white">
          ← Back to Admin
        </Link>

        <div className="mt-6 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-serif text-5xl text-[#c0c0c0]">
              Auction Audits
            </h1>

            <p className="mt-3 text-gray-400">
              Admin-only audit access for auction bidding activity.
            </p>
          </div>

          <div className="rounded-2xl border border-[#d6aa55]/20 bg-[#1a1408] px-6 py-4">
            <div className="text-xs uppercase tracking-[0.24em] text-[#b89b61]">
              Auctions
            </div>
            <div className="mt-2 font-serif text-3xl text-[#f0d28c]">
              {filteredAuctions.length}
            </div>
          </div>
        </div>

        <div className="mt-8">
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search title, seller, seller ID, or auction ID"
            className="w-full rounded-xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-600 focus:border-[#d6aa55]/50"
          />
        </div>

        <section className="mt-8 grid gap-5">
          {filteredAuctions.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-gray-500">
              No auctions found.
            </div>
          ) : (
            filteredAuctions.map((auction: any) => {
              const ended = isAuctionEnded(auction);
              const finalPrice = auction.winningBid || auction.price || "$0";
              const reservePrice = moneyToNumber(auction.reservePrice || 0);
              const reserveMet =
                reservePrice === 0 || moneyToNumber(finalPrice) >= reservePrice;

              return (
                <div
                  key={auction.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-center gap-5">
                      <img
                        src={auction.imageUrl || "/logo.png"}
                        alt={auction.title || "Auction"}
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = "/logo.png";
                        }}
                        className="h-24 w-24 shrink-0 rounded-xl bg-black object-contain"
                      />

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded px-2 py-1 text-xs uppercase ${
                              ended
                                ? "bg-red-500/10 text-red-300"
                                : "bg-emerald-500/10 text-emerald-300"
                            }`}
                          >
                            {ended ? "Ended" : "Live"}
                          </span>

                          <span
                            className={`rounded px-2 py-1 text-xs uppercase ${
                              reserveMet
                                ? "bg-emerald-500/10 text-emerald-300"
                                : "bg-yellow-500/10 text-yellow-300"
                            }`}
                          >
                            {reserveMet ? "Reserve Met" : "Reserve Not Met"}
                          </span>
                        </div>

                        <h2 className="mt-3 font-serif text-2xl text-[#d7d7d7]">
                          {auction.title}
                        </h2>

                        <div className="mt-2 grid gap-2 text-sm text-gray-500 sm:grid-cols-2 lg:grid-cols-4">
                          <div>
                            Price
                            <div className="text-[#c0c0c0]">{finalPrice}</div>
                          </div>

                          <div>
                            Bids
                            <div className="text-[#c0c0c0]">
                              {auction.bids || 0}
                            </div>
                          </div>

                          <div>
                            Seller
                            <div className="break-all text-[#c0c0c0]">
                              {auction.sellerPublicId ||
                                auction.sellerEmail ||
                                "—"}
                            </div>
                          </div>

                          <div>
                            Auction ID
                            <div className="break-all text-[#c0c0c0]">
                              {auction.id}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3 lg:w-[420px]">
                      <Link
                        href={`/auctions/${auction.id}`}
                        className="rounded border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-sm font-semibold text-white hover:bg-white/[0.08]"
                      >
                        View Auction
                      </Link>

                      <Link
                        href={`/auctions/${auction.id}/results`}
                        className="rounded border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-sm font-semibold text-white hover:bg-white/[0.08]"
                      >
                        Results
                      </Link>

                      <Link
                        href={`/auctions/${auction.id}/audit`}
                        className="rounded border border-[#d6aa55]/30 bg-[#1a1408] px-4 py-3 text-center text-sm font-semibold text-[#e7c77f] hover:bg-[#221909]"
                      >
                        Audit
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>
      </div>
    </main>
  );
}
