"use client";

import "@/lib/amplifyclient";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { cdnUrl } from "@/lib/cdn";
import { moneyToNumber } from "@/lib/money";
import { AUCTION_PUBLIC_FIELDS } from "@/lib/auctionSelection";

const client = generateClient<Schema>();

export default function AuctionResultsArchivePage() {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadResults() {
      try {
        const result = await client.models.Auction.list({
          authMode: "apiKey",
          selectionSet: AUCTION_PUBLIC_FIELDS,
        } as any);

        const ended = (result.data || [])
          .filter(
            (auction: any) =>
              auction.ended === true && auction.status !== "CANCELLED",
          )
          .sort(
            (a: any, b: any) =>
              new Date(b.endsAt || b.updatedAt || 0).getTime() -
              new Date(a.endsAt || a.updatedAt || 0).getTime(),
          )
          .map((auction: any) => {
            const rawImage =
              auction.thumbImages?.[0] ||
              auction.image ||
              auction.images?.[0] ||
              "";

            return {
              ...auction,
              imageUrl: cdnUrl(rawImage),
            };
          });

        setResults(ended);
      } catch (err) {
        console.error("RESULTS ARCHIVE ERROR", err);
      } finally {
        setLoading(false);
      }
    }

    loadResults();
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050607] p-10 text-white">
        Loading results...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10">
          <h1 className="font-serif text-5xl text-[#c0c0c0]">
            Auction Results
          </h1>

          <p className="mt-3 text-gray-400">
            Completed sales and historical auction records.
          </p>
        </div>

        {results.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-10 text-gray-500">
            No completed auctions yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {results.map((auction: any) => {
              const reserveMet =
                !auction.reservePrice ||
                moneyToNumber(auction.price || 0) >=
                  moneyToNumber(auction.reservePrice || 0);

              return (
                <Link
                  key={auction.id}
                  href={`/auctions/${auction.id}/results`}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition hover:border-[#c0c0c0]/40 hover:shadow-[0_0_40px_rgba(192,192,192,0.10)]"
                >
                  <div className="relative h-56 bg-black sm:h-72">
                    <img
                      loading="lazy"
                      src={auction.imageUrl || "/logo.png"}
                      alt={auction.title}
                      className="h-full w-full object-contain bg-black grayscale"
                    />

                    <div className="absolute left-3 top-3 rounded bg-black/80 px-3 py-1 text-xs uppercase tracking-[0.18em] text-[#c0c0c0]">
                      Final Results
                    </div>
                  </div>

                  <div className="p-5">
                    <h2 className="font-serif text-xl sm:text-2xl">
                      {auction.title}
                    </h2>

                    {auction.subtitle && (
                      <p className="mt-2 text-sm text-gray-400">
                        {auction.subtitle}
                      </p>
                    )}

                    <div className="mt-5">
                      <div className="text-xs uppercase tracking-[0.18em] text-gray-500">
                        Final Price
                      </div>

                      <div className="mt-1 font-serif text-3xl text-[#c0c0c0]">
                        {auction.price}
                      </div>
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
                      <span className="text-xs uppercase tracking-[0.16em] text-gray-500">
                        Result
                      </span>

                      {reserveMet ? (
                        <span className="rounded bg-emerald-500/15 px-2 py-1 text-[11px] uppercase text-emerald-300">
                          Reserve Met
                        </span>
                      ) : (
                        <span className="rounded bg-yellow-500/15 px-2 py-1 text-[11px] uppercase text-yellow-300">
                          Reserve Not Met
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
