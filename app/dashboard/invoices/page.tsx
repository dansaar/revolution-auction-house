"use client";

import "@/lib/amplifyclient";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCurrentUser } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { fetchAuthSession } from "aws-amplify/auth";
import { moneyToNumber } from "@/lib/money";
import ShippingTimeline from "@/app/components/ShippingTimeline";

export default function BuyerInvoicesPage() {
  const client = generateClient<Schema>();
  const [invoices, setInvoices] = useState<any[]>([]);
  // invoiceId -> { status, trackingNumber, carrier } pulled from the related record
  const [shipping, setShipping] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadInvoices() {
      try {
        const user = await getCurrentUser();
        const email = user.signInDetails?.loginId || user.username;

        const result = await client.models.Invoice.list({
          filter: {
            buyerEmail: { eq: email },
          },
          authMode: "userPool",
        } as any);

        const list = result.data || [];
        setInvoices(list);

        // Pull live shipping status from each invoice's auction/listing (public read).
        const entries = await Promise.all(
          list.map(async (inv: any) => {
            try {
              let rec: any = null;
              if (inv.auctionId) {
                rec = (await client.models.Auction.get({ id: inv.auctionId }, { authMode: "apiKey" } as any)).data;
              } else if (inv.listingId) {
                rec = (await client.models.MarketplaceListing.get({ id: inv.listingId }, { authMode: "apiKey" } as any)).data;
              }
              if (!rec) return null;
              return [inv.id, { status: rec.shippingStatus, trackingNumber: rec.trackingNumber, carrier: rec.carrier }] as const;
            } catch {
              return null;
            }
          }),
        );
        setShipping(Object.fromEntries(entries.filter(Boolean) as any));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadInvoices();
  }, []);

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

  async function getInvoicePdf(invoiceId: string) {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();

    if (!token) {
      alert("Please sign in again to view this invoice.");
      return null;
    }

    const res = await fetch(`/api/invoices/${invoiceId}/pdf`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      let message = `Unable to open invoice PDF. Status: ${res.status}`;

      try {
        const data = await res.json();
        if (data?.error) {
          message = `${message} — ${data.error}`;
        }
      } catch {}

      alert(message);
      return null;
    }

    return await res.blob();
  }

  async function viewInvoicePdf(invoiceId: string) {
    const blob = await getInvoicePdf(invoiceId);
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function downloadInvoicePdf(invoiceId: string) {
    const blob = await getInvoicePdf(invoiceId);
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = `invoice-${invoiceId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050607] p-10 text-white">
        Loading invoices...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/dashboard"
          className="text-sm text-gray-400 hover:text-white"
        >
          ← Back to Dashboard
        </Link>

        <h1 className="mt-6 font-serif text-5xl text-[#c0c0c0]">My Invoices</h1>

        <p className="mt-3 text-gray-400">
          Receipts for your paid auctions and marketplace purchases.
        </p>

        <div className="mt-10 grid gap-4">
          {invoices.length === 0 ? (
            <p className="text-gray-500">No invoices yet.</p>
          ) : (
            invoices.map((invoice: any) => (
              <div
                key={invoice.id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.25em] text-gray-500">
                      {invoice.type}
                    </div>

                    <h2 className="mt-2 font-serif text-2xl text-[#d7d7d7]">
                      {invoice.title}
                    </h2>

                    <p className="mt-2 text-sm text-gray-400">
                      Paid:{" "}
                      {invoice.paidAt
                        ? new Date(invoice.paidAt).toLocaleString("en-US", { timeZone: "America/New_York" })
                        : "—"}
                    </p>

                    <p className="mt-1 text-xs text-gray-500">
                      Stripe Session: {invoice.stripeSessionId}
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="font-serif text-3xl text-[#c0c0c0]">
                      {formatInvoiceAmount(invoice.amount)}
                    </div>

                    <div className="mt-3 space-y-1 text-xs text-gray-500">
                      {invoice.subtotal && (
                        <div>
                          Subtotal: {formatInvoiceAmount(invoice.subtotal)}
                        </div>
                      )}

                      {invoice.buyerPremium &&
                        moneyToNumber(invoice.buyerPremium) > 0 && (
                          <div>
                            Buyer Premium:{" "}
                            {formatInvoiceAmount(invoice.buyerPremium)}
                          </div>
                        )}

                      {invoice.tax && moneyToNumber(invoice.tax) > 0 && (
                        <div>Tax: {formatInvoiceAmount(invoice.tax)}</div>
                      )}
                    </div>

                    <span className="mt-2 inline-block rounded bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
                      {invoice.status || "PAID"}
                    </span>
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={() => viewInvoicePdf(invoice.id)}
                        className="rounded border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white hover:bg-white/[0.08]"
                      >
                        View PDF
                      </button>

                      <button
                        type="button"
                        onClick={() => downloadInvoicePdf(invoice.id)}
                        className="rounded border border-[#d6aa55]/30 bg-[#1a1408] px-4 py-2 text-sm font-semibold text-[#e7c77f] hover:bg-[#221909]"
                      >
                        Download PDF
                      </button>
                    </div>
                  </div>
                </div>

                <ShippingTimeline
                  status={shipping[invoice.id]?.status}
                  trackingNumber={shipping[invoice.id]?.trackingNumber}
                  carrier={shipping[invoice.id]?.carrier}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
