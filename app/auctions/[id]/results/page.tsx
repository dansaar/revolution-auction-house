"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trophy, Gavel, ExternalLink } from "lucide-react";
import { cdnUrl } from "@/lib/cdn";

import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";

import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import "@/lib/amplifyclient";

function makeBidderDisplayName(value: string) {
  if (!value) return "";
  if (value.startsWith("Bidder ")) return value;
  return `Bidder ${value.slice(0, 4).toUpperCase()}`;
}

function moneyToNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  return Number(String(value).replace("$", "").replaceAll(",", ""));
}

function GradeBadge({ grade }: { grade?: string | null }) {
  if (!grade) return null;
  const g = grade.trim();
  const num = parseFloat((g.match(/(\d+\.?\d*)/) || [])[1] || "0");
  const color =
    num >= 10
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : num >= 9.5
        ? "border-[#d6aa55]/50 bg-[#d6aa55]/10 text-[#e7c77f]"
        : num >= 9
          ? "border-white/30 bg-white/[0.06] text-[#c0c0c0]"
          : "border-white/20 bg-white/[0.04] text-gray-400";
  return (
    <span
      className={`inline-flex items-center rounded border px-2.5 py-1 text-xs font-bold uppercase tracking-[0.14em] ${color}`}
    >
      {g}
    </span>
  );
}

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
  const [invoice, setInvoice] = useState<any>(null);

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
    if (!auction?.paid || !id) return;
    async function loadInvoice() {
      try {
        const res = await client.models.Invoice.list({
          filter: { auctionId: { eq: id } },
          authMode: "userPool",
        } as any);
        const inv = (res.data || []).find((i: any) => i.status === "PAID" || i.paidAt);
        if (inv) setInvoice(inv);
      } catch { /* not logged in or not authorized */ }
    }
    loadInvoice();
  }, [auction?.paid, id]);

  useEffect(() => {
    async function loadResults() {
      try {
        const [auctionResult, stateResult, bidResult] = await Promise.all([
          client.models.Auction.get({ id }, { authMode: "apiKey" } as any),
          client.models.AuctionState.get(
            { auctionId: id },
            { authMode: "apiKey" } as any,
          ),
          client.models.Bid.bidsByAuction(
            { auctionId: id },
            { authMode: "apiKey", limit: 100, sortDirection: "DESC" } as any,
          ),
        ]);

        const baseAuction = auctionResult.data;
        const state = stateResult.data;

        if (!baseAuction) {
          setAuction(null);
          setBids([]);
          setLoading(false);
          return;
        }

        const mergedAuction = {
          ...baseAuction,
          price: state?.currentPrice || baseAuction.price,
          winningBid: state?.currentPrice || baseAuction.winningBid,
          winnerUserId: state?.leaderUserId || baseAuction.winnerUserId,
          winnerEmail: state?.leaderEmail || baseAuction.winnerEmail,
          winnerDisplayName: state?.leaderUserId
            ? makeBidderDisplayName(state.leaderUserId)
            : baseAuction.winnerDisplayName,
          bids: state?.bidCount ?? baseAuction.bids,
          ended: state?.ended ?? baseAuction.ended,
          endsAt: state?.endsAt || baseAuction.endsAt,
        };

        const sortedBids = [...(bidResult.data || [])].sort(
          (a: any, b: any) =>
            new Date(b.createdAt || 0).getTime() -
            new Date(a.createdAt || 0).getTime(),
        );

        setAuction(mergedAuction);
        setBids(sortedBids);
      } catch (err) {
        console.error("LOAD AUCTION RESULTS ERROR", err);
      } finally {
        setLoading(false);
      }
    }

    loadResults();
  }, [id]);

  useEffect(() => {
    if (!auction) return;
    const rawImage =
      auction.fullImages?.[0] ||
      auction.mediumImages?.[0] ||
      auction.thumbImages?.[0] ||
      auction.images?.[0] ||
      auction.image ||
      "";
    setResolvedImage(cdnUrl(rawImage) || "/logo.png");
  }, [auction]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050607] text-white">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="h-8 w-40 animate-pulse rounded bg-white/10" />
          <div className="mt-10 grid gap-10 lg:grid-cols-2">
            <div className="h-96 animate-pulse rounded-2xl bg-white/[0.04]" />
            <div className="space-y-4">
              <div className="h-6 w-24 animate-pulse rounded bg-white/10" />
              <div className="h-12 w-3/4 animate-pulse rounded bg-white/10" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-white/10" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050607] text-white">
        <div className="text-center">
          <p className="text-gray-400">Auction not found.</p>
          <Link href="/auctions" className="mt-4 inline-block text-sm text-[#c0c0c0] underline">
            Back to Auctions
          </Link>
        </div>
      </div>
    );
  }

  const userValues = [
    user?.userId,
    user?.username,
    user?.signInDetails?.loginId,
  ].map((v) => String(v || ""));

  const winnerValues = [
    auction.winnerUserId,
    auction.winnerEmail,
    auction.winnerDisplayName,
  ].map((v) => String(v || ""));

  const isWinner = winnerValues.some((wv) => userValues.includes(wv));
  const isSeller = auction.sellerUserId
    ? user?.userId === auction.sellerUserId
    : user?.signInDetails?.loginId?.toLowerCase() === auction.sellerEmail?.toLowerCase();

  const finalPrice = moneyToNumber(auction.price || auction.winningBid || 0);
  const reservePrice = moneyToNumber(auction.reservePrice || 0);
  const reserveMet = reservePrice === 0 || finalPrice >= reservePrice;

  const winningBidderName =
    auction.winnerDisplayName ||
    (auction.winnerUserId ? makeBidderDisplayName(auction.winnerUserId) : "") ||
    bids[0]?.bidderName ||
    "";

  async function handleCheckout() {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    if (!token) {
      alert("Please sign in to checkout.");
      return;
    }

    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
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
    } else {
      alert(data.error || "Checkout failed");
    }
  }

  return (
    <div className="min-h-screen bg-[#050607] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_30%)]" />

      <main className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <Link
          href="/auctions"
          className="inline-flex items-center gap-2 text-sm text-gray-500 transition hover:text-white"
        >
          <ArrowLeft size={15} />
          Back to Auctions
        </Link>

        {/* Winner banner */}
        {isWinner && reserveMet && (
          <div className="mt-6 flex items-center gap-4 rounded-2xl border border-[#d6aa55]/30 bg-[#d6aa55]/[0.07] px-6 py-5">
            <Trophy className="shrink-0 text-[#d6aa55]" size={28} />
            <div>
              <div className="font-serif text-2xl text-[#e7c77f]">
                Congratulations — you won this auction
              </div>
              <p className="mt-1 text-sm text-[#d6aa55]/70">
                Complete your purchase below to claim this lot.
              </p>
            </div>
          </div>
        )}

        <div className="mt-8 grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          {/* Image */}
          <div className="flex items-start justify-center rounded-2xl border border-white/10 bg-black p-6">
            <img
              src={resolvedImage}
              alt={auction.title}
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = "/logo.png";
              }}
              className="max-h-[480px] w-full object-contain"
            />
          </div>

          {/* Details */}
          <div>
            <div className="inline-flex items-center gap-2 rounded border border-[#c0c0c0]/25 bg-[#c0c0c0]/[0.07] px-4 py-2 text-xs uppercase tracking-[0.25em] text-[#c0c0c0]">
              <Trophy size={13} />
              Auction Results
            </div>

            <h1 className="mt-5 font-serif text-4xl leading-tight text-[#d7d7d7] md:text-5xl">
              {auction.title}
            </h1>

            {auction.subtitle && (
              <p className="mt-2 text-lg text-gray-400">{auction.subtitle}</p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {auction.grade && <GradeBadge grade={auction.grade} />}
              <span className="text-xs uppercase tracking-[0.18em] text-gray-600">
                LOT-{id.slice(-6).toUpperCase()}
              </span>
              {auction.certNumber && (
                <span className="text-xs text-gray-500">
                  Cert #{auction.certNumber}
                </span>
              )}
              {auction.population && (
                <span className="text-xs text-gray-500">
                  Pop: {auction.population}
                </span>
              )}
              {auction.year && (
                <span className="text-xs text-gray-500">{auction.year}</span>
              )}
            </div>

            {/* Final price */}
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <div className="text-xs uppercase tracking-[0.22em] text-gray-500">
                Final Price
              </div>
              <div className="mt-2 font-serif text-6xl text-[#c0c0c0]">
                {auction.price || auction.winningBid || "$0"}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span
                  className={`rounded px-3 py-1 text-sm ${
                    reserveMet
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-yellow-500/10 text-yellow-400"
                  }`}
                >
                  {reserveMet ? "Reserve Met" : "Reserve Not Met"}
                </span>
                <span className="rounded bg-white/[0.05] px-3 py-1 text-sm text-gray-400">
                  {auction.bids || 0} bids
                </span>
              </div>

              {isWinner && auction.paid && (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-4 py-3 text-emerald-400">
                  <span className="text-base">✓</span>
                  <span className="text-sm font-semibold">Payment received</span>
                </div>
              )}

              {isSeller && auction.paid && invoice?.shippingLine1 && (
                <div className="mt-4 rounded-lg border border-[#d6aa55]/20 bg-[#1a1408]/60 p-4">
                  <div className="mb-2 text-xs uppercase tracking-widest text-[#d6aa55]/70">Ship To</div>
                  <div className="space-y-0.5 text-sm">
                    <div className="font-medium text-white">{invoice.shippingName}</div>
                    <div className="text-gray-300">{invoice.shippingLine1}</div>
                    {invoice.shippingLine2 && <div className="text-gray-300">{invoice.shippingLine2}</div>}
                    <div className="text-gray-300">{invoice.shippingCity}, {invoice.shippingState} {invoice.shippingZip}</div>
                    <div className="text-gray-500 text-xs">{invoice.buyerEmail}</div>
                  </div>
                </div>
              )}

              {isSeller && auction.paid && !invoice?.shippingLine1 && (
                <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm text-gray-500">
                  Payment received — no shipping address on file (purchased before shipping collection was enabled).
                </div>
              )}

              {isWinner && reserveMet && !auction.paid && (
                <button
                  onClick={handleCheckout}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#c0c0c0] px-6 py-4 font-bold text-black transition hover:bg-white"
                >
                  Complete Purchase <ExternalLink size={15} />
                </button>
              )}
            </div>

            {/* Winner */}
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-gray-500">
                <Gavel size={14} />
                Winning Bidder
              </div>
              <div className="mt-3 font-serif text-3xl text-[#d7d7d7]">
                {winningBidderName || "No bids placed"}
              </div>
              {auction.endsAt && (
                <div className="mt-2 text-sm text-gray-500">
                  Closed {new Date(auction.endsAt).toLocaleString()}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bid History */}
        <section className="mt-12">
          <h2 className="font-serif text-3xl text-[#d7d7d7]">Bid History</h2>

          {bids.length === 0 ? (
            <p className="mt-6 text-gray-500">No bids were placed.</p>
          ) : (
            <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
              {bids.map((bid, index) => (
                <div
                  key={bid.id || index}
                  className={`flex items-center justify-between px-6 py-4 ${
                    index === 0
                      ? "border-b border-emerald-500/20 bg-emerald-500/[0.06]"
                      : "border-b border-white/[0.05] bg-white/[0.02] last:border-b-0"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {index === 0 && (
                      <Trophy size={16} className="shrink-0 text-[#d6aa55]" />
                    )}
                    {index > 0 && (
                      <span className="w-4 text-center text-xs text-gray-600">
                        {index + 1}
                      </span>
                    )}
                    <div>
                      <div
                        className={`font-semibold ${
                          index === 0 ? "text-emerald-300" : "text-gray-300"
                        }`}
                      >
                        {bid.bidderName || makeBidderDisplayName(bid.userId || "")}
                      </div>
                      <div className="text-xs text-gray-600">
                        {bid.createdAt
                          ? new Date(bid.createdAt).toLocaleString()
                          : ""}
                      </div>
                    </div>
                  </div>
                  <div
                    className={`font-serif text-2xl ${
                      index === 0 ? "text-emerald-300" : "text-[#c0c0c0]"
                    }`}
                  >
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
