"use client";

import React from "react";
import Link from "next/link";
import {
  Search,
  ArrowRight,
  ShieldCheck,
  LockKeyhole,
  Truck,
  Headphones,
  Gavel,
  Users,
  Globe2,
  BadgeCheck,
  Heart,
  Gem,
  Crown,
  Package,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import "@/lib/amplifyclient";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { cdnUrl } from "@/lib/cdn";

const client = generateClient<Schema>();

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

export default function RevolutionAuctionHouseHomepage() {
  const [endingSoon, setEndingSoon] = useState<any[]>([]);
  const [now, setNow] = useState(Date.now());
  const featuredAuction =
    endingSoon.find((auction) => auction?.endsAt) || endingSoon[0];
  const countdown = getCountdown(featuredAuction?.endsAt, now);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    async function loadEndingSoon() {
      try {
        const result = await client.models.Auction.list({
          authMode: "apiKey",
        } as any);

        const live = (result.data || [])
          .filter((auction: any) => {
            if (!auction.endsAt) return false;
            return new Date(auction.endsAt).getTime() > Date.now();
          })
          .sort(
            (a: any, b: any) =>
              new Date(a.endsAt || 0).getTime() -
              new Date(b.endsAt || 0).getTime(),
          )
          .slice(0, 5);

        const resolved = live.map((auction: any) => ({
          ...auction,
          imageUrl: resolveAuctionImage(auction),
        }));

        setEndingSoon(resolved);
      } catch (err) {
        console.error("HOME AUCTIONS ERROR", err);
      }
    }

    function scheduleRefresh() {
      if (refreshTimer) clearTimeout(refreshTimer);

      refreshTimer = setTimeout(() => {
        loadEndingSoon();
      }, 300);
    }

    loadEndingSoon();

    const auctionSub = client.models.Auction.onUpdate({
      authMode: "apiKey",
    }).subscribe({
      next: () => {
        scheduleRefresh();
      },
    });

    const stateSub = client.models.AuctionState.onUpdate({
      authMode: "apiKey",
    }).subscribe({
      next: () => {
        scheduleRefresh();
      },
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      auctionSub.unsubscribe();
      stateSub.unsubscribe();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#050607] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(255,255,255,0.08),transparent_28%),radial-gradient(circle_at_75%_40%,rgba(214,170,85,0.08),transparent_24%)]" />

      <main className="relative z-10 mx-auto max-w-[1500px] px-6 pb-12 pt-10">
        <section className="grid min-h-[650px] items-center gap-10 py-16 lg:grid-cols-[1.35fr_0.9fr]">
          <div className="text-center lg:text-left">
            <div className="font-serif text-7xl leading-none tracking-[0.01em] text-transparent bg-gradient-to-b from-[#ffffff] via-[#e7e7e7] to-[#cfcfcf] bg-clip-text drop-shadow-[0_0_12px_rgba(255,255,255,0.08)] md:text-8xl lg:text-[10rem]">
              Revolution
            </div>

            <div className="mt-6 flex flex-col items-center">
              <div className="text-2xl uppercase tracking-[0.55em] text-[#c8a96b] md:text-3xl">
                Auction House
              </div>

              <div className="mt-4 h-px w-72 bg-gradient-to-r from-transparent via-[#d6aa55]/60 to-transparent" />
            </div>

            <div className="mt-10 text-center text-lg uppercase tracking-[0.38em] text-[#d6aa55] md:text-xl">
              For Collectors, By Collectors
            </div>

            <h1 className="mx-auto mt-12 max-w-3xl font-serif text-4xl leading-tight text-[#d7d7d7] lg:mx-0 lg:text-5xl">
              The Premier Destination for Pokémon Collectibles
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-gray-300 lg:mx-0">
              High-end auctions. Verified buyers. Authenticated cards. Where
              collectors invest in legends.
            </p>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-7 shadow-[0_40px_120px_rgba(0,0,0,0.55)]">
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

                  <div className="mt-2 font-serif text-6xl text-[#c0c0c0]">
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
                featuredAuction
                  ? `/auctions/${featuredAuction.id}`
                  : "/auctions"
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
                Ending Soon
              </h2>
              <Link
                href="/auctions"
                className="text-xs uppercase tracking-[0.18em] text-gray-500 hover:text-white"
              >
                View All Auctions
              </Link>
            </div>

            <div className="grid gap-4 md:grid-cols-5">
              {endingSoon.map((auction) => (
                <Link
                  key={auction.id}
                  href={`/auctions/${auction.id}`}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-3 hover:border-[#c0c0c0]/40"
                >
                  <div className="relative flex h-40 items-center justify-center rounded-lg bg-black">
                    <div className="absolute inset-0 animate-pulse rounded-lg bg-white/[0.04]" />
                    <img
                      loading="lazy"
                      decoding="async"
                      src={auction.imageUrl || "/logo.png"}
                      alt={auction.title}
                      className="relative z-10 h-28 object-contain opacity-80"
                    />
                  </div>

                  <div className="mt-3 rounded bg-black/70 px-2 py-1 text-xs text-[#e7c77f]">
                    Ending Soon
                  </div>

                  <h3 className="mt-3 text-sm font-semibold">
                    {auction.title}
                  </h3>
                  <p className="text-xs text-gray-400">
                    {auction.subtitle || auction.grade || "Premium Collectible"}
                  </p>
                  <div className="mt-2 font-serif text-xl text-[#c0c0c0]">
                    {auction.price || "$0"}
                  </div>
                  <div className="text-xs text-gray-500">
                    {auction.bids || 0} bids
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="border-r border-white/10 pr-4 last:border-r-0">
      <div className="text-[#c0c0c0] [&_svg]:h-7 [&_svg]:w-7">{icon}</div>
      <div className="mt-3 font-serif text-3xl text-[#d7d7d7]">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.16em] text-gray-500">
        {label}
      </div>
    </div>
  );
}

function Time({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-serif text-4xl text-white">{value}</div>
      <div className="text-xs uppercase tracking-[0.18em] text-gray-500">
        {label}
      </div>
    </div>
  );
}

function getCountdown(endsAt?: string | null, currentTime?: number) {
  if (!endsAt) {
    return {
      days: "--",
      hrs: "--",
      mins: "--",
      secs: "--",
    };
  }

  const diff = new Date(endsAt).getTime() - (currentTime || Date.now());

  if (diff <= 0) {
    return {
      days: "00",
      hrs: "00",
      mins: "00",
      secs: "00",
    };
  }

  const days = Math.floor(diff / 86400000)
    .toString()
    .padStart(2, "0");

  const hrs = Math.floor((diff % 86400000) / 3600000)
    .toString()
    .padStart(2, "0");

  const mins = Math.floor((diff % 3600000) / 60000)
    .toString()
    .padStart(2, "0");

  const secs = Math.floor((diff % 60000) / 1000)
    .toString()
    .padStart(2, "0");

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
