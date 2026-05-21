"use client";

import { Suspense } from "react";
import SellAuctionContent from "./SellAuctionContent";

export default function SellAuctionPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#050607] p-10 text-white">
          Loading...
        </main>
      }
    >
      <SellAuctionContent />
    </Suspense>
  );
}