"use client";

import "@/lib/amplifyclient";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getCurrentUser } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { fetchAuthSession } from "aws-amplify/auth";
import { moneyToNumber } from "@/lib/money";

export default function SellerInvoicesPage() {
  const client = generateClient<Schema>();

  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadInvoices() {
      try {
        const user = await getCurrentUser();

        const email = user.signInDetails?.loginId || user.username;

        const result = await client.models.Invoice.list({
          filter: {
            sellerEmail: {
              eq: email,
            },
          },
          authMode: "userPool",
        } as any);

        setInvoices(result.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadInvoices();
  }, []);

  const totalRevenue = useMemo(() => {
    return invoices.reduce((sum: number, invoice: any) => {
      const value = Number(
        String(invoice.amount || "0")
          .replace("$", "")
          .replaceAll(",", ""),
      );

      return sum + value;
    }, 0);
  }, [invoices]);

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
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <Link
              href="/seller"
              className="text-sm text-gray-500 hover:text-white"
            >
              ← Back to Seller Dashboard
            </Link>

            <h1 className="mt-5 font-serif text-5xl text-[#c0c0c0]">
              Seller Invoices
            </h1>

            <p className="mt-3 text-gray-400">
              Completed auction and marketplace payments.
            </p>
          </div>

          <div className="rounded-2xl border border-[#d6aa55]/20 bg-[#1a1408] px-8 py-6">
            <div className="text-xs uppercase tracking-[0.28em] text-[#b89b61]">
              Total Revenue
            </div>

            <div className="mt-3 font-serif text-4xl text-[#f0d28c]">
              {formatInvoiceAmount(totalRevenue)}
            </div>
          </div>
        </div>

        <div className="mt-10 grid gap-5">
          {invoices.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-gray-500">
              No invoices yet.
            </div>
          ) : (
            invoices.map((invoice: any) => (
              <div
                key={invoice.id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
              >
                <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.24em] text-gray-500">
                      {invoice.type}
                    </div>

                    <h2 className="mt-2 font-serif text-2xl text-[#d7d7d7]">
                      {invoice.title}
                    </h2>

                    <div className="mt-4 space-y-1 text-sm text-gray-400">
                      <p>
                        Buyer:{" "}
                        <span className="text-[#d7d7d7]">
                          {invoice.buyerEmail || "—"}
                        </span>
                      </p>

                      <p>
                        Paid:{" "}
                        <span className="text-[#d7d7d7]">
                          {invoice.paidAt
                            ? new Date(invoice.paidAt).toLocaleString()
                            : "—"}
                        </span>
                      </p>

                      <p className="text-xs text-gray-500">
                        Stripe Session: {invoice.stripeSessionId}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-serif text-4xl text-[#c0c0c0]">
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

                    <span className="mt-3 inline-block rounded bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
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
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
