"use client";

import "@/lib/amplifyclient";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getCurrentUser } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { cdnUrl } from "@/lib/cdn";
import { moneyToNumber } from "@/lib/money";

const client = generateClient<Schema>();

type CartItem = {
  id: string;
  type: "AUCTION" | "MARKETPLACE";
  title: string;
  amount: string;
  image?: string;
  href: string;
  chargeTax?: boolean;
  taxRate?: number;
  buyerPremiumRate?: number;
};

function formatMoney(amount: number) {
  return `$${Math.round(amount).toLocaleString()}`;
}

function calculateAuctionTotals(item: any) {
  const hammerPrice = moneyToNumber(item.amount || 0);
  const buyerPremiumRate = Number(item.buyerPremiumRate || 20);
  const buyerPremium = hammerPrice * (buyerPremiumRate / 100);

  const taxableAmount = hammerPrice + buyerPremium;
  const taxRate = item.chargeTax ? Number(item.taxRate || 6.625) : 0;
  const tax = item.chargeTax ? taxableAmount * (taxRate / 100) : 0;

  return {
    subtotal: hammerPrice,
    buyerPremium,
    tax,
    total: hammerPrice + buyerPremium + tax,
  };
}

function calculateMarketplaceTotals(item: any) {
  const subtotal = moneyToNumber(item.amount || 0);
  const taxRate = item.chargeTax ? Number(item.taxRate || 6.625) : 0;
  const tax = item.chargeTax ? subtotal * (taxRate / 100) : 0;

  return {
    subtotal,
    buyerPremium: 0,
    tax,
    total: subtotal + tax,
  };
}

function calculateItemTotals(item: any) {
  return item.type === "AUCTION"
    ? calculateAuctionTotals(item)
    : calculateMarketplaceTotals(item);
}

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);

  useEffect(() => {
    async function loadCart() {
      try {
        const user = await getCurrentUser();

        const userId = user.userId || user.username || "";
        const email = user.signInDetails?.loginId || user.username || "";

        const auctionResult = await client.models.Auction.list({
          authMode: "apiKey",
          limit: 1000,
        } as any);

        const listingResult = await client.models.MarketplaceListing.list({
          authMode: "apiKey",
          limit: 1000,
        } as any);

        const unpaidAuctionWins: CartItem[] = (auctionResult.data || [])
          .filter((auction: any) => {
            const winnerMatches =
              auction.winnerUserId === userId ||
              auction.winnerEmail === email ||
              auction.winnerDisplayName === userId;

            const ended =
              auction.ended ||
              (auction.endsAt &&
                new Date(auction.endsAt).getTime() <= Date.now());

            return winnerMatches && ended && auction.paid !== true;
          })
          .map((auction: any) => {
            const rawImage =
              auction.thumbImages?.[0] ||
              auction.images?.[0] ||
              auction.image ||
              "";

            return {
              id: auction.id,
              type: "AUCTION",
              title: auction.title || "Auction Win",
              amount: auction.price || auction.winningBid || "$0",
              image: cdnUrl(rawImage),
              href: `/auctions/${auction.id}/results`,
              chargeTax: Boolean(auction.chargeTax),
              taxRate: Number(auction.taxRate || 6.625),
              buyerPremiumRate: Number(auction.buyerPremiumRate || 20),
            };
          });

        const unpaidMarketplacePurchases: CartItem[] = (
          listingResult.data || []
        )
          .filter((listing: any) => {
            const buyerMatches =
              listing.buyerEmail === email ||
              listing.buyerEmail === userId ||
              listing.buyerUserId === userId;

            const payableStatus =
              listing.status === "OFFER_ACCEPTED" ||
              listing.status === "PENDING_PAYMENT";

            return buyerMatches && payableStatus && listing.paid !== true;
          })
          .map((listing: any) => {
            const rawImage =
              listing.thumbImages?.[0] ||
              listing.images?.[0] ||
              listing.image ||
              "";

            return {
              id: listing.id,
              type: "MARKETPLACE",
              title: listing.title || "Marketplace Purchase",
              amount: listing.acceptedOfferAmount || listing.price || "$0",
              image: cdnUrl(rawImage),
              href: `/marketplace/${listing.id}`,
              chargeTax: Boolean(listing.chargeTax),
              taxRate: Number(listing.taxRate || 6.625),
              buyerPremiumRate: 0,
            };
          });

        const allItems = [...unpaidAuctionWins, ...unpaidMarketplacePurchases];

        setItems(allItems);
        setSelectedIds(allItems.map((item) => `${item.type}:${item.id}`));
      } catch (err) {
        console.error("LOAD CART ERROR", err);
      } finally {
        setLoading(false);
      }
    }

    loadCart();
  }, []);

  const selectedItems = items.filter((item) =>
    selectedIds.includes(`${item.type}:${item.id}`),
  );

  const total = useMemo(() => {
    return selectedItems.reduce((sum, item) => {
      return sum + calculateItemTotals(item).total;
    }, 0);
  }, [selectedItems]);

  function toggleItem(item: CartItem) {
    const key = `${item.type}:${item.id}`;

    setSelectedIds((prev) =>
      prev.includes(key) ? prev.filter((id) => id !== key) : [...prev, key],
    );
  }

  async function checkoutSelected() {
    if (selectedItems.length === 0 || checkingOut) return;

    try {
      setCheckingOut(true);

      const user = await getCurrentUser();
      const buyerEmail = user.signInDetails?.loginId || user.username || "";

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          buyerEmail,
          items: selectedItems.map((item) => {
            const totals = calculateItemTotals(item);

            return {
              ...item,
              subtotal: formatMoney(totals.subtotal),
              buyerPremium: formatMoney(totals.buyerPremium),
              tax: formatMoney(totals.tax),
              amount: formatMoney(totals.total),
            };
          }),
        }),
      });

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Checkout failed");
      }
    } catch (err) {
      console.error("CART CHECKOUT ERROR", err);
      alert("Checkout failed.");
    } finally {
      setCheckingOut(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050607] p-10 text-white">
        Loading payment center...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/dashboard"
          className="text-sm text-gray-500 hover:text-white"
        >
          ← Back to Buyer Dashboard
        </Link>

        <div className="mt-6 flex flex-col gap-4 border-b border-white/10 pb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-serif text-5xl text-[#c0c0c0]">
              Payment Center
            </h1>

            <p className="mt-3 text-gray-400">
              Pay for auction wins and accepted marketplace purchases.
            </p>
          </div>

          <div className="rounded-2xl border border-[#d6aa55]/20 bg-[#1a1408] px-6 py-5">
            <div className="text-xs uppercase tracking-[0.25em] text-[#b89b61]">
              Selected Total
            </div>

            <div className="mt-2 font-serif text-4xl text-[#f0d28c]">
              ${total.toLocaleString()}
            </div>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-gray-400">
            No unpaid auction wins or marketplace purchases.
          </div>
        ) : (
          <>
            <div className="mt-10 grid gap-5">
              {items.map((item) => {
                const key = `${item.type}:${item.id}`;
                const checked = selectedIds.includes(key);

                return (
                  <div
                    key={key}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
                  >
                    <div className="flex flex-col gap-5 md:flex-row md:items-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleItem(item)}
                        className="h-5 w-5 accent-[#d6aa55]"
                      />

                      <img
                        src={item.image || "/logo.png"}
                        alt={item.title}
                        onError={(e) => {
                          e.currentTarget.src = "/logo.png";
                        }}
                        className="h-24 w-24 rounded-xl bg-black object-contain"
                      />

                      <div className="flex-1">
                        <div className="text-xs uppercase tracking-[0.22em] text-gray-500">
                          {item.type === "AUCTION"
                            ? "Auction Win"
                            : "Marketplace Purchase"}
                        </div>

                        <Link
                          href={item.href}
                          className="mt-2 block font-serif text-2xl text-white hover:text-[#e7c77f]"
                        >
                          {item.title}
                        </Link>
                      </div>

                      {(() => {
                        const totals = calculateItemTotals(item);

                        return (
                          <div className="text-right">
                            <div className="font-serif text-3xl text-[#c0c0c0]">
                              {formatMoney(totals.total)}
                            </div>

                            <div className="mt-2 space-y-1 text-xs text-gray-500">
                              <div>
                                Subtotal: {formatMoney(totals.subtotal)}
                              </div>

                              {item.type === "AUCTION" && (
                                <div>
                                  Buyer Premium:{" "}
                                  {formatMoney(totals.buyerPremium)}
                                </div>
                              )}

                              {totals.tax > 0 && (
                                <div>Tax: {formatMoney(totals.tax)}</div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 flex justify-end">
              <button
                type="button"
                disabled={selectedItems.length === 0 || checkingOut}
                onClick={checkoutSelected}
                className="rounded-xl bg-[#c0c0c0] px-8 py-4 text-sm font-bold uppercase tracking-[0.16em] text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {checkingOut ? "Starting Checkout..." : "Checkout Selected"}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
