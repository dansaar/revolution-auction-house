"use client";

import "@/lib/amplifyclient";

import { useEffect, useState } from "react";
import Link from "next/link";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";

const client = generateClient<Schema>();

export const ANNOUNCEMENT_ID = "GLOBAL";
const POLL_MS = 120_000;

const VARIANT: Record<string, string> = {
  info: "bg-[#1a1408] text-[#e7c77f] border-[#d6aa55]/30",
  special: "bg-emerald-500/10 text-emerald-200 border-emerald-500/30",
  alert: "bg-red-500/10 text-red-200 border-red-500/30",
};

export default function AnnouncementTicker() {
  const [msg, setMsg] = useState<any>(null);

  async function load() {
    try {
      const res = await client.models.SiteAnnouncement.get(
        { id: ANNOUNCEMENT_ID },
        { authMode: "apiKey" } as any,
      );
      const a = res.data as any;
      setMsg(a && a.active && a.message ? a : null);
    } catch {
      setMsg(null);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, []);

  if (!msg) return null;

  const variant = VARIANT[msg.variant as string] || VARIANT.info;
  // Repeat the message a few times so the marquee fills wide screens.
  const text = msg.linkUrl && msg.linkLabel ? `${msg.message}` : msg.message;
  const items = Array.from({ length: 4 });

  return (
    <div className={`relative overflow-hidden border-b ${variant}`}>
      <div className="ticker-track flex w-max items-center gap-16 whitespace-nowrap py-2 text-sm font-semibold">
        {items.map((_, i) => (
          <span key={i} className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-[0.25em] opacity-60">●</span>
            {text}
            {msg.linkUrl && msg.linkLabel && (
              <Link href={msg.linkUrl} className="underline underline-offset-2 hover:opacity-80">
                {msg.linkLabel}
              </Link>
            )}
          </span>
        ))}
      </div>

      <style jsx>{`
        .ticker-track {
          animation: ticker 28s linear infinite;
        }
        .ticker-track:hover {
          animation-play-state: paused;
        }
        @keyframes ticker {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </div>
  );
}
