"use client";

import "@/lib/amplifyclient";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";

const client = generateClient<Schema>();

export default function AuctionAuditPage() {
  const params = useParams();
  const auctionId = params.id as string;

  const [auction, setAuction] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAudit() {
      try {
        const auctionResult = await client.models.Auction.get(
          { id: auctionId },
          { authMode: "apiKey" } as any,
        );

        const auditResult = await client.models.BidAuditLog.bidAuditByAuction(
          { auctionId },
          {
            authMode: "userPool",
            limit: 1000,
            sortDirection: "DESC",
          } as any,
        );

        setAuction(auctionResult.data);
        const sortedAuditLogs = [...(auditResult.data || [])]
          .filter(Boolean)
          .sort(
            (a: any, b: any) =>
              new Date(b.createdAt || 0).getTime() -
              new Date(a.createdAt || 0).getTime(),
          );

        setAuditLogs(sortedAuditLogs);
      } catch (err) {
        console.error("LOAD AUCTION AUDIT ERROR", err);
      } finally {
        setLoading(false);
      }
    }

    if (auctionId) loadAudit();
  }, [auctionId]);

  const cleanAuditLogs = auditLogs.filter(Boolean);

  const accepted = cleanAuditLogs.filter((log: any) => log.accepted === true);
  const rejected = cleanAuditLogs.filter((log: any) => log.accepted !== true);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050607] p-10 text-white">
        Loading audit log...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-7xl">
        <Link
          href={`/auctions/${auctionId}/results`}
          className="text-sm text-gray-500 hover:text-white"
        >
          ← Back to Results
        </Link>

        <div className="mt-6">
          <h1 className="font-serif text-5xl text-[#c0c0c0]">
            Auction Audit Log
          </h1>

          <p className="mt-3 text-gray-400">
            {auction?.title || "Auction"} · accepted and rejected bid attempts
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <Stat label="Total Attempts" value={String(cleanAuditLogs.length)} />
          <Stat label="Accepted" value={String(accepted.length)} />
          <Stat label="Rejected" value={String(rejected.length)} />
        </div>

        <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03]">
          {cleanAuditLogs.length === 0 ? (
            <div className="p-8 text-gray-500">No audit records yet.</div>
          ) : (
            <div className="divide-y divide-white/10">
              {cleanAuditLogs.map((log: any) => (
                <div key={log.bidRequestId} className="p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded px-2 py-1 text-xs uppercase ${
                            log.accepted
                              ? "bg-emerald-500/10 text-emerald-300"
                              : "bg-red-500/10 text-red-300"
                          }`}
                        >
                          {log.accepted ? "Accepted" : "Rejected"}
                        </span>

                        {log.rejectionReason && (
                          <span className="rounded bg-white/10 px-2 py-1 text-xs text-gray-300">
                            {log.rejectionReason}
                          </span>
                        )}

                        <span className="rounded bg-[#d6aa55]/10 px-2 py-1 text-xs text-[#e7c77f]">
                          {log.buyerTier || "BASIC"}
                        </span>
                      </div>

                      <div className="mt-3 font-serif text-2xl text-[#c0c0c0]">
                        {log.bidderName || log.bidderUserId || "Bidder"}
                      </div>

                      <div className="mt-2 text-sm text-gray-400">
                        Requested max bid:{" "}
                        <span className="text-white">
                          {log.requestedMaxBid || "—"}
                        </span>
                      </div>

                      <div className="mt-1 text-sm text-gray-400">
                        Result:{" "}
                        <span className="text-white">
                          {log.resultMessage || "—"}
                        </span>
                      </div>

                      <div className="mt-3 grid gap-2 text-xs text-gray-500 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          Previous Price
                          <div className="mt-1 text-sm text-gray-300">
                            {log.previousPrice || "—"}
                          </div>
                        </div>

                        <div>
                          New Price
                          <div className="mt-1 text-sm text-gray-300">
                            {log.newPrice || "—"}
                          </div>
                        </div>

                        <div>
                          Previous Leader
                          <div className="mt-1 break-all text-sm text-gray-300">
                            {log.previousLeaderUserId || "—"}
                          </div>
                        </div>

                        <div>
                          New Leader
                          <div className="mt-1 break-all text-sm text-gray-300">
                            {log.newLeaderUserId || "—"}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="text-left text-xs text-gray-500 lg:text-right">
                      <div>
                        {log.createdAt
                          ? new Date(log.createdAt).toLocaleString()
                          : "Unknown time"}
                      </div>

                      <div className="mt-2 break-all">
                        Request ID: {log.bidRequestId}
                      </div>

                      <div className="mt-2">
                        Attempts: {log.attemptCount ?? 0}
                      </div>

                      <div className="mt-2">
                        Limit: $
                        {Number(log.buyerBidLimit || 0).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#c8a96b]/20 bg-[#c8a96b]/10 p-5">
      <div className="text-xs uppercase tracking-widest text-gray-500">
        {label}
      </div>

      <div className="mt-2 font-serif text-3xl text-[#e7c98a]">{value}</div>
    </div>
  );
}
