import Link from "next/link";

export default function SellPage() {
  return (
    <main className="min-h-screen bg-[#050607] px-6 py-16 text-white">
      <div className="mx-auto max-w-5xl">
        <h1 className="font-serif text-5xl text-[#d7d7d7]">
          Sell With Revolution Auction House
        </h1>

        <p className="mt-4 max-w-2xl text-gray-400">
          Choose how you want to sell your collectible: auction it to the
          highest bidder or list it in the marketplace at a fixed price.
        </p>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <Link
            href="/sell/auction"
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 transition hover:border-[#c0c0c0]/50"
          >
            <div className="text-xs uppercase tracking-[0.28em] text-gray-500">
              Auction House
            </div>

            <h2 className="mt-4 font-serif text-3xl text-[#c0c0c0]">
              Create Auction
            </h2>

            <p className="mt-3 text-gray-400">
              Best for rare, high-value cards where competitive bidding can
              drive the final price.
            </p>
          </Link>

          <Link
            href="/sell/listing"
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 transition hover:border-[#c0c0c0]/50"
          >
            <div className="text-xs uppercase tracking-[0.28em] text-gray-500">
              Marketplace
            </div>

            <h2 className="mt-4 font-serif text-3xl text-[#c0c0c0]">
              Create Listing
            </h2>

            <p className="mt-3 text-gray-400">
              Best for fixed-price inventory, buy-now cards, graded slabs,
              sealed product, and offers.
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}
