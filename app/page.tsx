"use client";

import React, { useRef } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ShieldCheck,
  LockKeyhole,
  Truck,
  Headphones,
  BadgeCheck,
  Heart,
  Gem,
  Crown,
  Package,
  Sparkles,
  Timer,
} from "lucide-react";
import { useEffect, useState } from "react";
import "@/lib/amplifyclient";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { cdnUrl } from "@/lib/cdn";

const client = generateClient<Schema>();

const CATEGORIES = ["All", "PSA 10", "PSA 9.5", "PSA 9", "Vintage", "Sealed"];

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function resolveAuctionImage(auction: any) {
  const imagePath =
    auction.thumbImages?.find(
      (img: string) => img && img !== "undefined" && img !== "/logo.png",
    ) ||
    auction.images?.find(
      (img: string) => img && img !== "undefined" && img !== "/logo.png",
    ) ||
    auction.image;

  return cdnUrl(imagePath);
}

function formatCountdown(
  endsAt: string | null | undefined,
  now: number,
): { text: string; urgent: boolean } {
  if (!endsAt) return { text: "", urgent: false };
  const diff = new Date(endsAt).getTime() - now;
  if (diff <= 0) return { text: "Ended", urgent: true };
  if (diff < 60000)
    return { text: `${Math.floor(diff / 1000)}s`, urgent: true };
  if (diff < 3600000)
    return {
      text: `${Math.floor(diff / 60000)}m ${Math.floor((diff % 60000) / 1000)}s`,
      urgent: true,
    };
  if (diff < 86400000)
    return {
      text: `${Math.floor(diff / 3600000)}h ${Math.floor((diff % 3600000) / 60000)}m`,
      urgent: false,
    };
  return {
    text: `${Math.floor(diff / 86400000)}d ${Math.floor((diff % 86400000) / 3600000)}h`,
    urgent: false,
  };
}

function matchesCategory(auction: any, category: string): boolean {
  if (category === "All") return true;
  const grade = (auction.grade || "").toUpperCase();
  const text = `${auction.title || ""} ${auction.subtitle || ""}`.toLowerCase();
  if (category === "PSA 10")
    return grade.includes("PSA 10") || grade === "10";
  if (category === "PSA 9.5") return grade.includes("9.5");
  if (category === "PSA 9")
    return (
      (grade.includes("PSA 9") || grade === "9") &&
      !grade.includes("9.5") &&
      !grade.includes("10")
    );
  if (category === "Vintage")
    return (
      (!!auction.year && parseInt(auction.year) < 2003) ||
      /base set|jungle|fossil|rocket|gym|neo/i.test(text)
    );
  if (category === "Sealed") return /sealed|booster|box|pack/i.test(text);
  return true;
}

export default function RevolutionAuctionHouseHomepage() {
  const [auctions, setAuctions] = useState<any[]>([]);
  const auctionsRef = useRef<any[]>([]);
  const prevPricesRef = useRef<Record<string, string>>({});
  const [featuredListings, setFeaturedListings] = useState<any[]>([]);
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [liveBids, setLiveBids] = useState<{ id: string; title: string; price: string; ts: number }[]>([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [now, setNow] = useState(Date.now());

  const featuredAuction = auctions[0];
  const countdown = getCountdown(featuredAuction?.endsAt, now);
  const filteredAuctions = (
    activeCategory === "All"
      ? auctions
      : auctions.filter((a) => matchesCategory(a, activeCategory))
  ).slice(0, 10);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const cleanup = setInterval(() => {
      const cutoff = Date.now() - 5 * 60 * 1000;
      setLiveBids((prev) => prev.filter((b) => b.ts > cutoff));
    }, 30_000);
    return () => clearInterval(cleanup);
  }, []);

  // Dedicated ticker: polls AuctionState every 5s and fires on any price change
  useEffect(() => {
    const prevTickerPrices: Record<string, string> = {};

    async function checkPrices() {
      try {
        const result = await client.models.AuctionState.list({
          authMode: "apiKey",
        } as any);
        for (const state of result.data || []) {
          const sid = state.auctionId as string | undefined;
          const price = state.currentPrice as string | undefined;
          if (!sid || !price || state.ended) continue;
          const prev = prevTickerPrices[sid];
          if (prev !== undefined && prev !== price) {
            const auction = auctionsRef.current.find((a) => a.id === sid);
            const title = auction?.title || "Live Auction";
            setLiveBids((prevBids) => {
              const entry = { id: sid, title, price, ts: Date.now() };
              return [entry, ...prevBids.filter((b) => b.id !== sid)].slice(0, 20);
            });
          }
          prevTickerPrices[sid] = price;
        }
      } catch {}
    }

    checkPrices();
    const interval = setInterval(checkPrices, 5_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    async function loadAuctions() {
      try {
        async function fetchLiveAuctions() {
          const all: any[] = [];
          let nextToken: string | undefined;
          do {
            const res: any = await client.models.Auction.list({
              authMode: "apiKey",
              filter: { ended: { eq: false } },
              limit: 500,
              ...(nextToken ? { nextToken } : {}),
            } as any);
            all.push(...(res.data || []));
            nextToken = res.nextToken ?? undefined;
          } while (nextToken);
          return all;
        }

        const [liveData, soldResult] = await Promise.all([
          fetchLiveAuctions(),
          client.models.Auction.list({
            authMode: "apiKey",
            filter: { ended: { eq: true } },
            limit: 100,
          } as any),
        ]);

        const live = liveData
          .filter((auction: any) => {
            if (!auction.endsAt) return false;
            if (auction.status === "SCHEDULED" && auction.startsAt && new Date(auction.startsAt).getTime() > Date.now()) return false;
            return new Date(auction.endsAt).getTime() > Date.now();
          })
          .sort(
            (a: any, b: any) =>
              new Date(a.endsAt || 0).getTime() -
              new Date(b.endsAt || 0).getTime(),
          )
          .map((auction: any) => ({
            ...auction,
            imageUrl: resolveAuctionImage(auction),
          }));

        for (const auction of live) {
          const prev = prevPricesRef.current[auction.id];
          if (prev !== undefined && prev !== auction.price && auction.title) {
            setLiveBids((prevBids) => {
              const entry = { id: auction.id, title: auction.title, price: auction.price, ts: Date.now() };
              return [entry, ...prevBids.filter((b) => b.id !== auction.id)].slice(0, 20);
            });
          }
          prevPricesRef.current[auction.id] = auction.price;
        }

        setAuctions(live);
        auctionsRef.current = live;

        const sold = (soldResult.data || [])
          .filter((a: any) => a.winningBid && a.winnerUserId)
          .sort(
            (a: any, b: any) =>
              new Date(b.endsAt || b.updatedAt || 0).getTime() -
              new Date(a.endsAt || a.updatedAt || 0).getTime(),
          )
          .slice(0, 20);

        setRecentSales(sold);
      } catch (err) {
        console.error("HOME AUCTIONS ERROR", err);
      }
    }

    function scheduleRefresh() {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => loadAuctions(), 300);
    }

    async function loadFeaturedListings() {
      try {
        const result = await client.models.MarketplaceListing.list({
          authMode: "apiKey",
          limit: 100,
        } as any);

        const featured = (result.data || [])
          .filter(
            (l: any) =>
              l.featured &&
              !l.sold &&
              !l.paid &&
              (l.status === "ACTIVE" || l.status === "OFFER_PENDING" || !l.status),
          )
          .slice(0, 5)
          .map((l: any) => ({
            ...l,
            imageUrl: (() => {
              const raw = l.thumbImages?.[0] || l.image || l.images?.[0] || "";
              if (!raw || raw === "undefined") return "/logo.png";
              if (raw.startsWith("http") || raw.startsWith("/")) return raw;
              return cdnUrl(raw);
            })(),
          }));

        setFeaturedListings(featured);
      } catch {
        // non-critical
      }
    }

    loadAuctions();
    loadFeaturedListings();

    const pollInterval = setInterval(loadAuctions, 8_000);

    const auctionSub = client.models.Auction.onUpdate({
      authMode: "apiKey",
    }).subscribe({ next: scheduleRefresh });

    const stateSub = client.models.AuctionState.onUpdate({
      authMode: "apiKey",
    }).subscribe({
      next: (state: any) => {
        if (!state?.auctionId) return;

        // Surgically update this auction's price in the card grid
        const patch = (a: any) =>
          a.id === state.auctionId
            ? {
                ...a,
                price: state.currentPrice ?? a.price,
                bids: state.bidCount ?? a.bids,
                ended: state.ended ?? a.ended,
                endsAt: state.endsAt || a.endsAt,
              }
            : a;
        const updated = auctionsRef.current.map(patch);
        auctionsRef.current = updated;
        setAuctions(updated);

        // Update live bids ticker
        if (state.currentPrice && !state.ended) {
          const auction = updated.find((a: any) => a.id === state.auctionId);
          const title = auction?.title || "Live Auction";
          setLiveBids((prev) => {
            const entry = { id: state.auctionId, title, price: state.currentPrice, ts: Date.now() };
            return [entry, ...prev.filter((b) => b.id !== state.auctionId)].slice(0, 20);
          });
        }
      },
    });

    return () => {
      clearInterval(pollInterval);
      if (refreshTimer) clearTimeout(refreshTimer);
      auctionSub.unsubscribe();
      stateSub.unsubscribe();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#050607] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(255,255,255,0.08),transparent_28%),radial-gradient(circle_at_75%_40%,rgba(214,170,85,0.08),transparent_24%)]" />

      <main className="relative z-10 mx-auto max-w-[1500px] px-6 pb-16 pt-10">
        {/* Hero */}
        <section className="grid items-center gap-10 py-10 sm:py-14 lg:min-h-[650px] lg:grid-cols-[1.35fr_0.9fr] lg:py-16">
          <div className="text-center lg:text-left">
            <div className="font-serif text-5xl leading-none tracking-[0.08em] text-transparent bg-gradient-to-b from-[#ffffff] via-[#e7e7e7] to-[#cfcfcf] bg-clip-text drop-shadow-[0_0_12px_rgba(255,255,255,0.08)] sm:text-6xl md:text-8xl lg:text-[9rem]">
              Revolution
            </div>

            <div className="mt-6 flex flex-col items-center">
              <div className="text-2xl uppercase tracking-[0.40em] text-[#c8a96b] md:text-5xl">
                Auction House
              </div>
              <div className="mt-4 h-px w-72 bg-gradient-to-r from-transparent via-[#d6aa55]/60 to-transparent" />
            </div>

            <div className="mt-10 text-center text-lg uppercase tracking-[0.38em] text-[#d6aa55] md:text-2xl">
              For Collectors, By Collectors
            </div>

            <h1 className="mx-auto mt-12 max-w-3xl text-center font-serif text-4xl leading-tight text-[#d7d7d7] lg:text-5xl">
              The Premier Destination for Pokémon Collectibles
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-center text-lg leading-8 text-gray-300">
              High-end auctions. Verified buyers. Authenticated cards. Where
              collectors invest in legends.
            </p>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-4 shadow-[0_40px_120px_rgba(0,0,0,0.55)] sm:p-7">
            <div className="mb-7 inline-flex rounded border border-[#d6aa55]/30 bg-[#d6aa55]/10 px-4 py-3 text-xs uppercase tracking-[0.22em] text-[#e7c77f]">
              Live Auction
            </div>

            <div className="grid gap-7 md:grid-cols-[1fr_0.85fr]">
              <div>
                <h2 className="font-serif text-4xl leading-tight text-[#d7d7d7]">
                  {featuredAuction?.title || "Featured Auction"}
                </h2>
                <p className="mt-3 text-xl text-gray-300">
                  {featuredAuction?.subtitle || "Premium Collectible"}
                </p>
                <div className="mt-8 border-t border-white/10 pt-7">
                  <div className="text-xs uppercase tracking-[0.22em] text-gray-500">
                    Current Bid
                  </div>
                  <div className="mt-2 font-serif text-4xl text-[#c0c0c0] sm:text-6xl">
                    {featuredAuction?.price || "$0"}
                  </div>
                  <div className="mt-4 text-sm text-gray-400">
                    {featuredAuction?.bids || 0} bids
                  </div>
                </div>
              </div>

              <div className="relative flex items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black">
                <div className="absolute inset-0 animate-pulse bg-white/[0.04]" />
                <img
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  src={featuredAuction?.imageUrl || "/logo.png"}
                  alt={featuredAuction?.title || "Featured auction"}
                  onError={(e) => {
                    e.currentTarget.src = "/logo.png";
                  }}
                  className="relative z-10 h-72 w-full object-contain"
                />
              </div>
            </div>

            <div className="mt-8 grid grid-cols-4 gap-4 text-center">
              <Time value={countdown.days || "--"} label="Days" />
              <Time value={countdown.hrs} label="Hrs" />
              <Time value={countdown.mins} label="Mins" />
              <Time value={countdown.secs} label="Secs" />
            </div>

            <Link
              href={
                featuredAuction ? `/auctions/${featuredAuction.id}` : "/auctions"
              }
              className="mt-8 flex items-center justify-center gap-2 rounded bg-[#c0c0c0] px-6 py-4 font-bold text-black"
            >
              View Auction <ArrowRight size={16} />
            </Link>

            <div className="mt-6 flex items-center justify-between text-xs uppercase tracking-[0.16em] text-gray-500">
              <span className="flex items-center gap-2">
                <Heart size={14} /> Watchlist available on auction page
              </span>
              <span>{featuredAuction?.bids || 0} bids</span>
            </div>
          </div>
        </section>

        {/* Live Bid Ticker */}
        {liveBids.length > 0 && (
          <section className="mb-2 overflow-hidden rounded-t-xl border border-emerald-500/20 bg-emerald-500/[0.03]">
            <div className="flex items-center">
              <div className="shrink-0 border-r border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-2.5 text-[10px] uppercase tracking-[0.22em] text-emerald-400">
                <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                Live Bids
              </div>
              <div className="relative flex-1 overflow-hidden">
                <div className="animate-marquee flex gap-0 whitespace-nowrap py-2.5">
                  {[...liveBids, ...liveBids].map((b, i) => (
                    <Link
                      key={i}
                      href={`/auctions/${b.id}`}
                      className="mx-6 inline-flex shrink-0 items-center gap-2 text-sm hover:text-white"
                    >
                      <span className="text-gray-400">{b.title}</span>
                      <span className="font-semibold text-emerald-300">{b.price}</span>
                      <span className="text-white/20">·</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Recent Sales Ticker */}
        {recentSales.length > 0 && (
          <section className={`mb-8 overflow-hidden border border-white/10 bg-white/[0.02] ${liveBids.length > 0 ? "rounded-b-xl border-t-0" : "rounded-xl"}`}>
            <div className="flex items-center">
              <div className="shrink-0 border-r border-white/10 bg-white/[0.04] px-4 py-3 text-[10px] uppercase tracking-[0.22em] text-[#d6aa55]">
                Recent Sales
              </div>
              <div className="relative flex-1 overflow-hidden">
                <div className="animate-marquee flex gap-0 whitespace-nowrap py-3">
                  {[...recentSales, ...recentSales].map((a: any, i: number) => (
                    <Link
                      key={i}
                      href={`/auctions/${a.id}/results`}
                      className="mx-6 inline-flex shrink-0 items-center gap-2 text-sm hover:text-white"
                    >
                      <span className="text-gray-400">{a.title}</span>
                      {a.grade && (
                        <span className="rounded border border-white/20 px-1.5 py-0.5 text-[10px] font-bold text-gray-400">
                          {a.grade}
                        </span>
                      )}
                      <span className="font-semibold text-[#c0c0c0]">
                        ${Number(String(a.winningBid).replace(/[$,]/g, "")).toLocaleString()}
                      </span>
                      <span className="text-white/20">·</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Trust Bar */}
        <section className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:grid-cols-5">
          <Trust
            icon={<ShieldCheck />}
            title="Verified Buyers"
            text="All high-value bidders are personally verified"
          />
          <Trust
            icon={<BadgeCheck />}
            title="Authenticity"
            text="Every card verified by experts"
          />
          <Trust
            icon={<LockKeyhole />}
            title="Secure Payments"
            text="Bank-level security and protection"
          />
          <Trust
            icon={<Truck />}
            title="Insured Shipping"
            text="Fully insured delivery worldwide"
          />
          <Trust
            icon={<Headphones />}
            title="Concierge Service"
            text="White-glove support for clients"
          />
        </section>

        {/* Marketplace + Ending Soon */}
        <section className="mt-8 grid gap-6 lg:grid-cols-[0.8fr_1.4fr]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <h2 className="font-serif text-3xl text-[#d7d7d7]">
              Premium Marketplace
            </h2>
            <p className="mt-3 text-gray-400">
              Buy now or make offers on verified high-end Pokémon cards.
            </p>
            <Link
              href="/marketplace"
              className="mt-6 inline-flex items-center gap-2 rounded border border-white/15 px-5 py-3 text-sm font-bold"
            >
              Shop Marketplace <ArrowRight size={15} />
            </Link>

            <div className="mt-8 grid grid-cols-3 gap-3">
              <Category icon={<Gem />} label="PSA 10" />
              <Category icon={<BadgeCheck />} label="Vintage" />
              <Category icon={<Crown />} label="1st Edition" />
              <Category icon={<Package />} label="Sealed" />
              <Category icon={<Sparkles />} label="Modern" />
              <Category icon={<Gem />} label="High Value" />
            </div>
          </div>

          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-serif text-3xl text-[#d7d7d7]">
                Featured Listings
              </h2>
              <Link
                href="/marketplace"
                className="text-xs uppercase tracking-[0.18em] text-gray-500 hover:text-white"
              >
                View All Listings
              </Link>
            </div>

            {featuredListings.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-5">
                {featuredListings.map((listing) => (
                  <Link
                    key={listing.id}
                    href={`/marketplace/${listing.id}`}
                    className="group rounded-xl border border-white/10 bg-white/[0.03] p-3 hover:border-[#d6aa55]/40"
                  >
                    <div className="relative flex h-40 items-center justify-center overflow-hidden rounded-lg bg-black">
                      <div className="absolute inset-0 animate-pulse rounded-lg bg-white/[0.04]" />
                      <img
                        loading="lazy"
                        decoding="async"
                        src={listing.imageUrl || "/logo.png"}
                        alt={listing.title}
                        className="relative z-10 h-28 object-contain opacity-80"
                      />
                    </div>

                    <div className="mt-3 flex items-center gap-1 rounded bg-[#d6aa55]/10 px-2 py-1 text-xs font-semibold text-[#e7c77f]">
                      <Sparkles size={10} />
                      Buy Now
                    </div>

                    <h3 className="mt-3 text-sm font-semibold">{listing.title}</h3>
                    <p className="text-xs text-gray-400">
                      {listing.condition || listing.category || "Premium Collectible"}
                    </p>
                    <div className="mt-2 font-serif text-xl text-[#c0c0c0]">
                      {listing.price}
                    </div>
                    {listing.acceptsOffers && (
                      <div className="text-xs text-[#d6aa55]/70">Offers accepted</div>
                    )}
                    <div className="mt-1 flex items-center justify-between text-[10px] text-gray-600">
                      {listing.createdAt && <span>Listed {fmtDate(listing.createdAt)}</span>}
                      {listing.paidAt && <span className="text-emerald-700">Sold {fmtDate(listing.paidAt)}</span>}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex h-48 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-gray-500">
                No featured listings right now.
              </div>
            )}
          </div>
        </section>

        {/* Featured Lots Grid */}
        {auctions.length > 0 && (
          <section className="mt-14">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <h2 className="font-serif text-4xl text-[#d7d7d7]">
                Featured Lots
              </h2>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`rounded border px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] transition ${
                      activeCategory === cat
                        ? "border-[#d6aa55]/60 bg-[#d6aa55]/10 text-[#e7c77f]"
                        : "border-white/10 bg-white/[0.03] text-gray-400 hover:border-white/25 hover:text-white"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {filteredAuctions.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] py-16 text-center text-gray-500">
                No lots in this category right now.
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredAuctions.map((auction) => {
                  const ct = formatCountdown(auction.endsAt, now);
                  const grade = auction.grade?.trim();
                  const num = parseFloat(
                    (grade?.match(/(\d+\.?\d*)/) || [])[1] || "0",
                  );
                  const gradeColor =
                    num >= 10
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                      : num >= 9.5
                        ? "border-[#d6aa55]/50 bg-[#d6aa55]/10 text-[#e7c77f]"
                        : num >= 9
                          ? "border-white/30 bg-white/[0.06] text-[#c0c0c0]"
                          : "border-white/20 bg-white/[0.04] text-gray-400";

                  return (
                    <Link
                      key={auction.id}
                      href={`/auctions/${auction.id}`}
                      className="group rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-[#c0c0c0]/30 hover:bg-white/[0.055]"
                    >
                      <div className="relative flex h-56 items-center justify-center overflow-hidden rounded-xl bg-black">
                        <div className="absolute inset-0 rounded-xl bg-white/[0.03]" />
                        <img
                          loading="lazy"
                          decoding="async"
                          src={auction.imageUrl || "/logo.png"}
                          alt={auction.title}
                          onError={(e) => {
                            e.currentTarget.src = "/logo.png";
                          }}
                          className="relative z-10 h-44 w-full object-contain opacity-90 transition group-hover:opacity-100 group-hover:scale-[1.03]"
                        />
                        {ct.text && (
                          <div
                            className={`absolute bottom-2 left-2 flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold backdrop-blur-sm ${
                              ct.urgent
                                ? "bg-red-950/80 text-red-400"
                                : "bg-black/70 text-[#e7c77f]"
                            }`}
                          >
                            <Timer size={9} />
                            {ct.text}
                          </div>
                        )}
                      </div>

                      <div className="mt-4">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold leading-snug text-[#d7d7d7] group-hover:text-white">
                            {auction.title}
                          </h3>
                          {grade && (
                            <span
                              className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${gradeColor}`}
                            >
                              {grade}
                            </span>
                          )}
                        </div>

                        {auction.subtitle && (
                          <p className="mt-1 text-sm text-gray-400">
                            {auction.subtitle}
                          </p>
                        )}

                        <div className="mt-4 flex items-end justify-between border-t border-white/[0.06] pt-3">
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.18em] text-gray-600">
                              Current Bid
                            </div>
                            <div className="font-serif text-2xl text-[#c0c0c0]">
                              {auction.price || "$0"}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-gray-500">
                              {auction.bids || 0} bids
                            </div>
                            <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-gray-600">
                              LOT-{auction.id.slice(-6).toUpperCase()}
                            </div>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[10px] text-gray-600">
                          {auction.createdAt && <span>Listed {fmtDate(auction.createdAt)}</span>}
                          {auction.paidAt && <span className="text-emerald-700">Sold {fmtDate(auction.paidAt)}</span>}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function Time({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-serif text-2xl text-white sm:text-4xl">{value}</div>
      <div className="text-xs uppercase tracking-[0.18em] text-gray-500">
        {label}
      </div>
    </div>
  );
}

function getCountdown(endsAt?: string | null, currentTime?: number) {
  if (!endsAt) {
    return { days: "--", hrs: "--", mins: "--", secs: "--" };
  }

  const diff = new Date(endsAt).getTime() - (currentTime || Date.now());

  if (diff <= 0) {
    return { days: "00", hrs: "00", mins: "00", secs: "00" };
  }

  const days = Math.floor(diff / 86400000).toString().padStart(2, "0");
  const hrs = Math.floor((diff % 86400000) / 3600000).toString().padStart(2, "0");
  const mins = Math.floor((diff % 3600000) / 60000).toString().padStart(2, "0");
  const secs = Math.floor((diff % 60000) / 1000).toString().padStart(2, "0");

  return { days, hrs, mins, secs };
}

function Trust({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-4 border-white/10 p-4 md:border-r md:last:border-r-0">
      <div className="text-[#c8a96b] [&_svg]:h-8 [&_svg]:w-8">{icon}</div>
      <div>
        <div className="text-sm font-bold uppercase tracking-[0.12em]">
          {title}
        </div>
        <p className="mt-2 text-sm text-gray-400">{text}</p>
      </div>
    </div>
  );
}

function Category({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-4 text-center">
      <div className="flex justify-center text-[#c8a96b] [&_svg]:h-7 [&_svg]:w-7">
        {icon}
      </div>
      <div className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-gray-300">
        {label}
      </div>
    </div>
  );
}
