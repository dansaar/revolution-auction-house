"use client";

import "@/lib/amplifyclient";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCurrentUser } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";

const ADMINS = ["dansaar52@gmail.com"];

export default function AdminAuctionsPage() {
  const client = generateClient<Schema>();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [auctions, setAuctions] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);

  function formatInvoiceAmount(value: string | number | null | undefined) {
    const amount = Number(String(value || "0").replace(/[$,]/g, ""));

    if (!Number.isFinite(amount)) return "$0.00";

    return amount.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  useEffect(() => {
    async function load() {
      try {
        const user = await getCurrentUser();
        const email = user.signInDetails?.loginId || user.username || "";

        if (!ADMINS.includes(email)) return;

        setIsAdmin(true);

        const result = await client.models.Auction.list({
          authMode: "apiKey",
          limit: 1000,
        } as any);

        const invoiceResult = await client.models.Invoice.list({
          authMode: "apiKey",
          limit: 1000,
        } as any);

        setInvoices(invoiceResult.data || []);

        setAuctions(result.data || []);
      } finally {
        setChecking(false);
      }
    }

    load();
  }, []);

  if (checking)
    return (
      <main className="min-h-screen bg-[#050607] p-10 text-white">
        Checking admin access...
      </main>
    );

  if (!isAdmin)
    return (
      <main className="min-h-screen bg-[#050607] p-10 text-white">
        Admin access required.
      </main>
    );

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-7xl">
        <Link href="/admin" className="text-sm text-[#c0c0c0]">
          ← Back to Admin
        </Link>

        <h1 className="mt-6 font-serif text-5xl text-[#c0c0c0]">
          Manage Auctions
        </h1>

        <div className="mt-8 overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.18em] text-gray-500">
              <tr>
                <th className="p-4">Title</th>
                <th className="p-4">Price</th>
                <th className="p-4">Status</th>
                <th className="p-4">Ends</th>
                <th className="p-4">Bids</th>
                <th className="p-4">Open</th>
              </tr>
            </thead>
            <tbody>
              {auctions.map((auction: any) => {
                const invoice = invoices.find(
                  (invoice: any) =>
                    String(invoice.auctionId) === String(auction.id),
                );

                return (
                  <tr key={auction.id} className="border-t border-white/10">
                    <td className="p-4 text-white">{auction.title}</td>
                    <td className="p-4 text-[#c0c0c0]">
                      <div>
                        <div className="text-[#c0c0c0]">
                          Hammer Price:{" "}
                          {auction.winningBid || auction.price || "$0"}
                        </div>

                        {invoice && (
                          <div className="mt-1 text-xs text-emerald-400">
                            Paid Total: {formatInvoiceAmount(invoice.amount)}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-gray-300">
                      {auction.status || (auction.ended ? "ENDED" : "ACTIVE")}
                    </td>
                    <td className="p-4 text-gray-400">
                      {auction.endsAt
                        ? new Date(auction.endsAt).toLocaleString()
                        : "—"}
                    </td>
                    <td className="p-4 text-gray-400">{auction.bids || 0}</td>
                    <td className="p-4">
                      <Link
                        href={`/auctions/${auction.id}`}
                        className="text-[#c0c0c0] hover:text-white"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
