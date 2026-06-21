"use client";

import "@/lib/amplifyclient";

import { useEffect, useRef, useState } from "react";
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
  const [scroll, setScroll] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);

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

  // Scroll only when the message is wider than the bar; otherwise center it.
  useEffect(() => {
    if (!msg) return;
    const measure = () => {
      const c = containerRef.current;
      const m = measureRef.current;
      if (!c || !m) return;
      setScroll(m.scrollWidth > c.clientWidth - 32);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [msg]);

  if (!msg) return null;

  const variant = VARIANT[msg.variant as string] || VARIANT.info;

  const Content = (
    <span className="inline-flex items-center gap-3">
      <span className="text-[10px] uppercase tracking-[0.25em] opacity-60">●</span>
      {msg.message}
      {msg.linkUrl && msg.linkLabel && (
        <Link href={msg.linkUrl} className="underline underline-offset-2 hover:opacity-80">
          {msg.linkLabel}
        </Link>
      )}
    </span>
  );

  return (
    <div ref={containerRef} className={`relative overflow-hidden border-b ${variant}`}>
      {scroll ? (
        <div className="ticker-track flex w-max items-center gap-16 whitespace-nowrap py-2 text-sm font-semibold">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} ref={i === 0 ? measureRef : undefined}>
              {Content}
            </span>
          ))}
        </div>
      ) : (
        <div className="flex justify-center whitespace-nowrap py-2 text-sm font-semibold">
          <span ref={measureRef}>{Content}</span>
        </div>
      )}

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
