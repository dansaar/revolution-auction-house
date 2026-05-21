"use client";

import "@/lib/amplifyclient";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import React from "react";

export default function TestDbPage() {
  const clientRef = React.useRef(generateClient<Schema>());
  const client = clientRef.current;

  async function createAuction() {
    const result = await client.models.Auction.create({
      title: "Blastoise Holo 1st Edition Ended yesterday",
      subtitle: "1999 Base Set · PSA 9",
      price: "$6,200",
      bids: 12,
      image:
        "https://images.unsplash.com/photo-1627856013091-fed6e4e30025?q=80&w=900",
      status: "LIVE",
      reservePrice: "$10,000",
      endsAt: new Date("2026-05-01T20:00:00.000Z").toISOString(),
    });

    console.log(result);
    alert("Auction created!");
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center">
      <button
        onClick={createAuction}
        className="rounded bg-[#c0c0c0] px-6 py-3 text-black font-semibold"
      >
        Create Test Auction
      </button>
    </main>
  );
}
