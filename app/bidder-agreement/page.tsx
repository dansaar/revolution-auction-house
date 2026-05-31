"use client";

import Link from "next/link";
import BidderAgreementContent from "../components/BidderAgreementContent";

export default function BidderAgreementPage() {
  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white print:bg-white print:text-black">
      <div className="mx-auto max-w-4xl">
        <Link href="/signup" className="text-sm text-gray-500 hover:text-white">
          ← Back to Signup
        </Link>

        <div className="mt-8">
          <h1 className="font-serif text-4xl text-[#c0c0c0] md:text-6xl">
            Revolution Auction House
          </h1>

          <div className="mt-3 h-px w-72 bg-gradient-to-r from-transparent via-[#d6aa55]/70 to-transparent md:w-80" />

          <h2 className="mt-5 font-serif text-2xl text-white md:text-4xl">
            Buyer & Bidder Agreement
          </h2>
        </div>

        <p className="mt-4 text-sm text-gray-500">Last updated: May 30, 2026</p>

        <button
          type="button"
          onClick={() => window.print()}
          className="mt-6 w-full rounded border border-[#d6aa55]/30 bg-[#1a1408] px-5 py-3 text-sm font-semibold text-[#e7c77f] hover:bg-[#221909] print:hidden md:w-auto"
        >
          Print / Save PDF
        </button>

        <div className="mt-6 rounded-lg border border-[#d6aa55]/20 bg-[#d6aa55]/5 p-4 text-sm text-gray-300">
          By creating an account, placing bids, submitting offers, or purchasing
          marketplace items, you agree to these terms.
        </div>

        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-8 print:border-0 print:bg-white print:p-0">
          <BidderAgreementContent />
        </div>
      </div>
    </main>
  );
}
