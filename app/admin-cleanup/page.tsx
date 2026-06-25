"use client";

import "@/lib/amplifyclient";

import React, { useState, useEffect } from "react";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { list, remove } from "aws-amplify/storage";
import { isAdminUser } from "@/lib/sellers";
import { confirmDialog } from "@/lib/confirm";

const client = generateClient<Schema>();

export default function AdminCleanupPage() {
  const [status, setStatus] = useState("Ready");
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    isAdminUser().then((ok) => {
      if (!ok) window.location.href = "/";
      else setAuthorized(true);
    });
  }, []);

  if (!authorized) return null;

  async function deleteAll(
    modelName: string,
    model: any,
    getKey: (item: any) => object = (item) => ({ id: item.id }),
  ) {
    setStatus(`Loading ${modelName}...`);

    const result = await model.list({
      authMode: "userPool",
      limit: 1000,
    } as any);

    const items = (result.data || []).filter(Boolean);

    setStatus(`Deleting ${items.length} ${modelName} records...`);

    for (const item of items) {
      const key = getKey(item);
      if (Object.values(key).some((v) => v == null)) continue;
      await model.delete(key, { authMode: "userPool" } as any);
    }
  }

  async function deleteS3Images() {
    const confirmed = await confirmDialog({ message: "Delete all auction and marketplace images from S3?", confirmText: "Delete", danger: true });
    if (!confirmed) return;

    try {
      setStatus("Loading S3 images...");

      const folders = [
        "auction-images/",
        "auction-images/thumb/",
        "auction-images/medium/",
        "auction-images/full/",
        "marketplace-images/",
        "marketplace-images/thumb/",
        "marketplace-images/medium/",
        "marketplace-images/full/",
      ];

      let deleted = 0;

      for (const folder of folders) {
        const result = await list({
          path: folder,
        });

        for (const item of result.items) {
          if (!item.path) continue;

          await remove({
            path: item.path,
          });

          deleted++;
        }
      }

      setStatus(`Deleted ${deleted} images from S3.`);
    } catch (err) {
      console.error(err);
      setStatus("S3 image cleanup failed. Check console.");
    }
  }

  async function cleanup() {
    const confirmed = await confirmDialog({ message: "This will permanently delete all auctions, bids, offers, invoices, watchlist items, auction states, and marketplace listings. Continue?", confirmText: "Delete everything", danger: true });

    if (!confirmed) return;

    try {
      setStatus("Starting cleanup...");

      await deleteAll("Offer", client.models.Offer);
      await deleteAll("Invoice", client.models.Invoice);
      await deleteAll("BidAuditLog", client.models.BidAuditLog, (item) => ({ bidRequestId: item.bidRequestId }));
      await deleteAll("Bid", client.models.Bid);
      await deleteAll("WatchlistItem", client.models.WatchlistItem);
      await deleteAll("AuctionState", client.models.AuctionState, (item) => ({ auctionId: item.auctionId }));
      await deleteAll("MarketplaceListing", client.models.MarketplaceListing);
      await deleteAll("Auction", client.models.Auction);

      setStatus("Cleanup complete. Your site is fresh.");
    } catch (err) {
      console.error(err);
      setStatus("Cleanup failed. Check console.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050607] px-6 text-white">
      <div className="max-w-xl rounded-2xl border border-red-500/20 bg-red-500/10 p-8 text-center">
        <h1 className="font-serif text-4xl text-red-300">Admin Cleanup</h1>

        <p className="mt-4 text-gray-300">
          This will delete all auctions, bids, offers, invoices, watchlist items, auction states, and marketplace listings. Buyer profiles are preserved.
        </p>

        <button
          onClick={cleanup}
          className="mt-8 rounded bg-red-600 px-6 py-4 font-bold text-white hover:bg-red-500"
        >
          Delete All Test Data
        </button>

        <p className="mt-6 text-sm text-gray-400">{status}</p>
      </div>
    </main>
  );
}
