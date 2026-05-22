"use client";

import { Suspense } from "react";
import CheckoutSuccessContent from "./CheckoutSuccessContent";

export default function CheckoutSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#050607] p-10 text-white">
          Loading...
        </div>
      }
    >
      <CheckoutSuccessContent />
    </Suspense>
  );
}
