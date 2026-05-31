"use client";

import Link from "next/link";

export default function BidderAgreementPage() {
  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
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

        <div className="mt-6 rounded-lg border border-[#d6aa55]/20 bg-[#d6aa55]/5 p-4 text-sm text-gray-300">
          By creating an account, placing bids, submitting offers, or purchasing
          marketplace items, you agree to these terms.
        </div>
        
        <button
          type="button"
          onClick={() => window.print()}
          className="mt-6 w-full md:w-auto rounded border border-[#d6aa55]/30 bg-[#1a1408] px-5 py-3 text-sm font-semibold text-[#e7c77f] hover:bg-[#221909] print:hidden"
        >
          Print / Save PDF
        </button>
        <div className="mt-10 space-y-8 rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-gray-300">
          <section>
            <h2 className="font-serif text-xl md:text-2xl text-white">
              1. Bidding Responsibility
            </h2>
            <p className="mt-3 leading-6 md:leading-7">
              By creating an account and placing bids, you agree that every bid
              you submit is binding. If you are the winning bidder, you are
              responsible for completing payment according to Revolution Auction
              House terms.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl md:text-2xl text-white">
              2. Buyer Limits
            </h2>
            <p className="mt-3 leading-6 md:leading-7">
              Your account may be assigned a bidding limit based on your buyer
              verification tier. Revolution Auction House may approve, deny,
              reduce, or increase bidding limits at its discretion.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl md:text-2xl text-white">
              3. Payment
            </h2>
            <p className="mt-3 leading-6 md:leading-7">
              Winning bidders must pay all amounts due, including hammer price,
              applicable fees, shipping, taxes, and any other charges shown at
              checkout or invoice.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl md:text-2xl text-white">
              4. Marketplace Purchases and Offers
            </h2>

            <p className="mt-3 leading-6 md:leading-7">
              By using the marketplace, you agree that Buy Now purchases and
              accepted offers are binding. If you purchase an item or your offer
              is accepted, you are responsible for completing payment according
              to Revolution Auction House terms.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl md:text-2xl text-white">
              5. Auction Closing and Extensions
            </h2>
            <p className="mt-3 leading-6 md:leading-7">
              Auctions may include extended bidding or soft-close rules. Bids
              placed near the end of an auction may extend the auction closing
              time.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl md:text-2xl text-white">
              6. Account Review
            </h2>
            <p className="mt-3 leading-6 md:leading-7">
              Revolution Auction House may review accounts for fraud prevention,
              bidding abuse, payment risk, or suspicious activity. Accounts may
              be restricted or suspended if necessary.
            </p>
          </section>

          <section>
            <h2 className="font-seriffont-serif text-xl md:text-2xl text-2xl text-white">
              7. Final Approval
            </h2>
            <p className="mt-3 leading-6 md:leading-7">
              Higher bidding tiers may require manual approval, identity review,
              proof of funds, or additional verification.
            </p>
          </section>
        </div>

        <p className="mt-6 text-sm text-gray-500">
          This page is a working platform agreement draft and should be reviewed
          by an attorney before public launch.
        </p>
      </div>
    </main>
  );
}
