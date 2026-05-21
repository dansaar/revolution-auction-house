"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trophy, Gavel } from "lucide-react";
import { cdnUrl } from "@/lib/cdn";

import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";

import { getCurrentUser } from "aws-amplify/auth";
import "@/lib/amplifyclient";

export default function AuctionResultsPage() {
  const clientRef = React.useRef(generateClient<Schema>());
  const client = clientRef.current;
  const params = useParams();
  const id = params.id as string;
  const [auction, setAuction] = useState<any>(null);
  const [bids, setBids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [resolvedImage, setResolvedImage] = useState("/logo.png");

  useEffect(() => {
    async function loadUser() {
      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
      } catch {
        setUser(null);
      }
    }

    loadUser();
  }, []);

  useEffect(() => {
    async function loadResults() {
      const auctionResult = await client.models.Auction.get({ id });

      const bidResult = await client.models.Bid.list({
        filter: {
          auctionId: {
            eq: id,
          },
        },
      });

      const sortedBids = [...bidResult.data].sort(
        (a: any, b: any) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime(),
      );

      setAuction(auctionResult.data);
      setBids(sortedBids);
      setLoading(false);
    }

    loadResults();
  }, [id]);

  useEffect(() => {
    if (!auction) return;

    const rawImage =
      auction.thumbImages?.[0] || auction.images?.[0] || auction.image || "";

    setResolvedImage(cdnUrl(rawImage));
  }, [auction]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading results...
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="min-h-screen bg-black text-white p-10">
        Auction not found
      </div>
    );
  }

  const winner = bids[0];
  const isWinner = winner?.bidderName === user?.username;
  const reserveMet =
    auction.reservePrice && auction.price
      ? moneyToNumber(auction.price) >= moneyToNumber(auction.reservePrice)
      : false;

  async function handleCheckout() {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auctionId: id,
        title: auction.title,
        amount: auction.price,
      }),
    });

    const data = await res.json();

    if (data.url) {
      window.location.href = data.url;
    }
  }

  return (
    <div className="min-h-screen bg-[#050607] text-white px-6 py-10">
      <main className="mx-auto max-w-6xl">
        <Link
          href="/auctions"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white"
        >
          <ArrowLeft size={16} />
          Back to Auctions
        </Link>

        <div className="mt-8 grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <img
              src={resolvedImage}
              alt={auction.title}
              className="w-full rounded-xl border border-white/10 object-cover"
            />
          </div>

          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#c0c0c0]/30 bg-[#c0c0c0]/10 px-4 py-2 text-xs uppercase tracking-[0.25em] text-[#c0c0c0]">
              <Trophy size={15} />
              Auction Results
            </div>

            <h1 className="mt-5 font-serif text-5xl">{auction.title}</h1>
            <p className="mt-3 text-gray-400">{auction.subtitle}</p>

            <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-6">
              <div className="text-xs uppercase tracking-widest text-gray-500">
                Final Price
              </div>
              <div className="mt-2 font-serif text-6xl text-[#c0c0c0]">
                {auction.price}
              </div>

              <div className="mt-4">
                {reserveMet ? (
                  <span className="rounded bg-green-500/10 px-3 py-1 text-green-400">
                    Reserve Met
                  </span>
                ) : (
                  <span className="rounded bg-yellow-500/10 px-3 py-1 text-yellow-400">
                    Reserve Not Met
                  </span>
                )}
              </div>
              {isWinner && auction.paid && (
                <div className="mt-4 rounded bg-green-500/10 px-3 py-2 text-green-400">
                  ✅ Paid
                </div>
              )}

              {isWinner && reserveMet && !auction.paid && (
                <button
                  onClick={handleCheckout}
                  className="mt-6 w-full rounded bg-[#c0c0c0] px-6 py-4 font-semibold text-black hover:bg-white"
                >
                  Pay Now
                </button>
              )}
            </div>

            <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-6">
              <div className="flex items-center gap-2 text-[#c0c0c0]">
                <Gavel size={18} />
                Winning Bidder
              </div>

              <div className="mt-3 text-2xl font-semibold">
                {winner ? winner.bidderName : "No bids placed"}
              </div>

              {auction.endsAt && (
                <div className="mt-2 text-sm text-gray-500">
                  Ended at {new Date(auction.endsAt).toLocaleString()}
                </div>
              )}
            </div>
          </div>
        </div>

        <section className="mt-12 rounded-xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="font-serif text-3xl">Final Bid History</h2>

          {bids.length === 0 ? (
            <p className="mt-5 text-gray-500">No bids were placed.</p>
          ) : (
            <div className="mt-6 space-y-3">
              {bids.map((bid, index) => (
                <div
                  key={bid.id || index}
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                    index === 0
                      ? "border-green-500/40 bg-green-500/10"
                      : "border-white/10 bg-black/30"
                  }`}
                >
                  <div>
                    <div className="font-semibold">
                      {index === 0 ? "🏆 " : ""}
                      {bid.bidderName}
                    </div>
                    <div className="text-xs text-gray-500">
                      {bid.createdAt
                        ? new Date(bid.createdAt).toLocaleString()
                        : "Unknown time"}
                    </div>
                  </div>

                  <div className="font-serif text-2xl text-[#c0c0c0]">
                    {bid.amount}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function moneyToNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  return Number(String(value).replace("$", "").replaceAll(",", ""));
}
