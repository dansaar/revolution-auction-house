"use client";

import "@/lib/amplifyclient";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { getCurrentUser } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { cdnUrl } from "@/lib/cdn";
import { moneyToNumber } from "@/lib/money";

export default function SellerPage() {
  const clientRef = React.useRef(generateClient<Schema>());
  const client = clientRef.current;

  const [auctions, setAuctions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [marketplaceListings, setMarketplaceListings] = useState<any[]>([]);

  const [offers, setOffers] = useState<any[]>([]);

  useEffect(() => {
    async function loadSellerAuctions() {
      try {
        const user = await getCurrentUser();

        const email = user.signInDetails?.loginId || user.username;

        const offerResult = await client.models.Offer.list({
          filter: {
            sellerEmail: { eq: email },
          },
          authMode: "userPool",
        } as any);

        setOffers(offerResult.data || []);

        const listingResult = await client.models.MarketplaceListing.list({
          filter: {
            sellerEmail: { eq: email },
          },
          authMode: "apiKey",
        } as any);

        const resolvedListings = (listingResult.data || []).map(
          (listing: any) => {
            const rawImage =
              listing.thumbImages?.[0] ||
              listing.image ||
              listing.images?.[0] ||
              "";

            return {
              ...listing,
              image: cdnUrl(rawImage),
            };
          },
        );

        setMarketplaceListings(resolvedListings);

        const result = await client.models.Auction.list({
          filter: {
            sellerEmail: { eq: email },
          },
          authMode: "apiKey",
        } as any);

        const sorted = [...result.data].sort(
          (a: any, b: any) =>
            new Date(b.endsAt || 0).getTime() -
            new Date(a.endsAt || 0).getTime(),
        );

        const resolved = sorted.map((auction: any) => {
          const rawImage =
            auction.thumbImages?.[0] ||
            auction.images?.[0] ||
            auction.image ||
            "";

          return {
            ...auction,
            image: cdnUrl(rawImage),
          };
        });

        setAuctions(resolved);
      } catch (err) {
        console.error(err);
      }

      setLoading(false);
    }

    loadSellerAuctions();

    const bidSub = client.models.Bid.onCreate({
      authMode: "apiKey",
    }).subscribe({
      next: () => {
        loadSellerAuctions();
      },
      error: (error) => console.error("Seller bid subscription error:", error),
    });

    const auctionSub = client.models.Auction.onUpdate({
      authMode: "apiKey",
    }).subscribe({
      next: () => {
        loadSellerAuctions();
      },
      error: (error) =>
        console.error("Seller auction subscription error:", error),
    });

    return () => {
      bidSub.unsubscribe();
      auctionSub.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050607] p-10 text-white">
        Loading seller dashboard...
      </main>
    );
  }

  const liveAuctions = auctions.filter(
    (a) => !a.endsAt || new Date(a.endsAt).getTime() > Date.now(),
  );

  const allEndedAuctions = auctions.filter(
    (a) => a.endsAt && new Date(a.endsAt).getTime() <= Date.now(),
  );

  const endedAuctions = allEndedAuctions.filter(
    (a) =>
      a.winnerUserId &&
      (!a.reservePrice ||
        moneyToNumber(a.price || 0) >= moneyToNumber(a.reservePrice || 0)),
  );

  const endingSoon = liveAuctions.filter((a) => {
    if (!a.endsAt) return false;
    return new Date(a.endsAt).getTime() - Date.now() < 24 * 60 * 60 * 1000;
  });

  const totalBids = auctions.reduce(
    (sum, auction) => sum + Number(auction.bids || 0),
    0,
  );

  const paidAuctions = endedAuctions.filter((a) => a.paid === true);

  const unpaidAuctions = endedAuctions.filter(
    (a) => a.winnerUserId && a.paid !== true,
  );

  const totalRevenue = paidAuctions.reduce(
    (sum, auction) => sum + moneyToNumber(auction.price || 0),
    0,
  );

  const reserveMetCount = allEndedAuctions.filter(
    (a) =>
      a.reservePrice &&
      moneyToNumber(a.price || 0) >= moneyToNumber(a.reservePrice || 0),
  ).length;

  const reserveNotMetCount = allEndedAuctions.filter(
    (a) =>
      a.reservePrice &&
      moneyToNumber(a.price || 0) < moneyToNumber(a.reservePrice || 0),
  ).length;

  const unsoldAuctions = allEndedAuctions.filter(
    (a) =>
      !a.winnerUserId ||
      (a.reservePrice &&
        moneyToNumber(a.price || 0) < moneyToNumber(a.reservePrice || 0)),
  );

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-10 text-white">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-5xl font-serif text-[#c0c0c0]">Seller Dashboard</h1>

        <p className="mt-3 text-gray-400">
          Manage your live and completed auctions.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/sell/auction"
            className="rounded border border-[#d6aa55]/30 bg-[#1a1408] px-5 py-3 text-sm font-semibold text-[#e7c77f] hover:bg-[#221909]"
          >
            Create Auction
          </Link>

          <Link
            href="/sell/listing"
            className="rounded border border-[#d6aa55]/30 bg-[#1a1408] px-5 py-3 text-sm font-semibold text-[#e7c77f] hover:bg-[#221909]"
          >
            Create Listing
          </Link>

          <Link
            href="/auctions/results"
            className="rounded border border-white/10 px-5 py-3 text-sm text-white hover:bg-white/[0.05]"
          >
            View Results Archive
          </Link>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-4">
          <Stat label="Total Auctions" value={String(auctions.length)} />
          <Stat label="Live Auctions" value={String(liveAuctions.length)} />
          <Stat label="Ending Soon" value={String(endingSoon.length)} />
          <Stat label="Total Bids" value={String(totalBids)} />

          <Stat label="Paid Auctions" value={String(paidAuctions.length)} />
          <Stat label="Unpaid Wins" value={String(unpaidAuctions.length)} />

          <Stat label="Reserve Met" value={String(reserveMetCount)} />
          <Stat label="Reserve Not Met" value={String(reserveNotMetCount)} />

          <Stat label="Revenue" value={`$${totalRevenue.toLocaleString()}`} />
        </div>

        <AuctionSection
          title="Live Auctions"
          auctions={liveAuctions}
          client={client}
        />

        <AuctionSection
          title="Ending Soon"
          auctions={endingSoon}
          client={client}
        />

        <AuctionSection
          title="Ended Auctions"
          auctions={endedAuctions}
          client={client}
        />

        <AuctionSection
          title="Unsold Auctions"
          auctions={unsoldAuctions}
          client={client}
        />

        <OfferSection offers={offers} client={client} />

        <MarketplaceSection listings={marketplaceListings} client={client} />
      </div>
    </main>
  );
}
function AuctionSection({ title, auctions, client }: any) {
  return (
    <section className="mt-12">
      <h2 className="mb-5 font-serif text-3xl text-[#c0c0c0]">{title}</h2>

      {auctions.length === 0 ? (
        <p className="text-gray-500">No auctions in this section.</p>
      ) : (
        <div className="grid gap-6">
          {auctions.map((auction: any) => (
            <SellerAuctionCard
              key={auction.id}
              auction={auction}
              client={client}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function OfferSection({ offers, client }: any) {
  const pendingOffers = offers.filter(
    (offer: any) => offer.status === "PENDING",
  );

  return (
    <section className="mt-12">
      <h2 className="mb-5 font-serif text-3xl text-[#c0c0c0]">
        Pending Offers
      </h2>

      {pendingOffers.length === 0 ? (
        <p className="text-gray-500">No pending offers.</p>
      ) : (
        <div className="grid gap-4">
          {pendingOffers.map((offer: any) => (
            <div
              key={offer.id}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-5"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-gray-500">
                    Offer Amount
                  </div>

                  <div className="mt-2 font-serif text-3xl text-[#c0c0c0]">
                    {offer.amount}
                  </div>

                  <div className="mt-3 text-sm text-gray-400">
                    Buyer: {offer.buyerDisplayName || offer.buyerEmail}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await client.models.Offer.update(
                          {
                            id: offer.id,
                            status: "ACCEPTED",
                          },
                          { authMode: "userPool" } as any,
                        );

                        await client.models.MarketplaceListing.update(
                          {
                            id: offer.listingId,
                            sold: true,
                            status: "SOLD",
                          },
                          { authMode: "apiKey" } as any,
                        );

                        window.location.reload();
                      } catch (err) {
                        console.error(err);
                        alert("Failed to accept offer");
                      }
                    }}
                    className="rounded border border-emerald-500/20 bg-emerald-500/10 px-5 py-3 text-sm text-emerald-300 hover:bg-emerald-500/20"
                  >
                    Accept
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await client.models.Offer.update(
                          {
                            id: offer.id,
                            status: "DECLINED",
                          },
                          { authMode: "userPool" } as any,
                        );

                        window.location.reload();
                      } catch (err) {
                        console.error(err);
                        alert("Failed to decline offer");
                      }
                    }}
                    className="rounded border border-red-500/20 bg-red-500/10 px-5 py-3 text-sm text-red-300 hover:bg-red-500/20"
                  >
                    Decline
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#c8a96b]/20 bg-[#c8a96b]/10 p-5">
      <div className="text-xs uppercase tracking-widest text-gray-500">
        {label}
      </div>

      <div className="mt-2 font-serif text-3xl text-[#e7c98a]">{value}</div>
    </div>
  );
}
function SellerAuctionCard({ auction, client }: any) {
  const ended =
    auction.endsAt && new Date(auction.endsAt).getTime() < Date.now();

  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    if (!auction?.endsAt) return;

    function updateTimer() {
      const diff = new Date(auction.endsAt).getTime() - Date.now();

      if (diff <= 0) {
        setTimeLeft("Ended");
        return;
      }

      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      setTimeLeft(
        `${days}days ${hours}hr ${minutes}min ${seconds
          .toString()
          .padStart(2, "0")}sec`,
      );
    }

    updateTimer();

    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [auction?.endsAt]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-col gap-6 lg:flex-row">
        <img
          loading="lazy"
          src={
            auction.image &&
            auction.image !== "undefined" &&
            auction.image.trim() !== ""
              ? auction.image
              : "/logo.png"
          }
          alt={auction.title}
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = "/logo.png";
          }}
          className="h-64 w-full rounded-xl object-contain bg-black lg:w-72"
        />

        <div className="flex flex-1 flex-col justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-serif">{auction.title}</h2>

              {ended ? (
                <span className="rounded bg-red-500/20 px-3 py-1 text-xs text-red-300">
                  Ended
                </span>
              ) : (
                <span className="rounded bg-green-500/20 px-3 py-1 text-xs text-green-300">
                  Live
                </span>
              )}

              {auction.reservePrice &&
                (moneyToNumber(auction.price || 0) >=
                moneyToNumber(auction.reservePrice || 0) ? (
                  <span className="rounded bg-emerald-500/20 px-3 py-1 text-xs text-emerald-300">
                    Reserve Met
                  </span>
                ) : (
                  <span className="rounded bg-yellow-500/20 px-3 py-1 text-xs text-yellow-300">
                    Reserve Not Met
                  </span>
                ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
              <div>
                <div className="text-xs uppercase text-gray-500">
                  Current Price
                </div>

                <div className="mt-1 text-xl font-serif text-[#c0c0c0]">
                  {auction.price}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase text-gray-500">
                  Leading Bidder
                </div>

                <div className="mt-1 text-sm text-[#c0c0c0]">
                  {auction.winnerDisplayName ||
                    auction.winnerUserId ||
                    "No bids"}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase text-gray-500">Max Bid</div>

                <div className="mt-1 text-sm text-[#c0c0c0]">
                  {auction.winningBid || "—"}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase text-gray-500">
                  Total Bids
                </div>

                <div className="mt-1 text-xl">{auction.bids || 0}</div>
              </div>

              <div>
                <div className="text-xs uppercase text-gray-500">Reserve</div>

                <div className="mt-1 text-sm">
                  {auction.reservePrice || "No Reserve"}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase text-gray-500">Ends</div>

                <div className="mt-1 text-sm">
                  <span className={ended ? "text-red-400" : "text-yellow-300"}>
                    {timeLeft}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <Link
              href={`/auctions/${auction.id}`}
              className="rounded border border-white/10 px-5 py-3 text-sm text-white hover:bg-white/[0.05]"
            >
              View Auction
            </Link>
            <Link
              href={`/sell/auction/${auction.id}/edit`}
              className="rounded border border-[#d6aa55]/30 bg-[#1a1408] px-5 py-3 text-sm text-[#e7c77f] hover:bg-[#221909]"
            >
              Edit Auction
            </Link>

            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(
                  `${window.location.origin}/auctions/${auction.id}`,
                );

                alert("Auction link copied");
              }}
              className="rounded border border-white/10 px-5 py-3 text-sm text-white hover:bg-white/[0.05]"
            >
              Copy Link
            </button>

            {!ended && (
              <button
                type="button"
                onClick={async () => {
                  const confirmed = confirm("End this auction now?");
                  if (!confirmed) return;

                  try {
                    await client.mutations.finalizeAuction(
                      { auctionId: auction.id },
                      { authMode: "apiKey" } as any,
                    );

                    alert("Auction ended");
                    window.location.reload();
                  } catch (err) {
                    console.error(err);
                    alert("Failed to end auction");
                  }
                }}
                className="rounded border border-red-500/30 bg-red-500/10 px-5 py-3 text-sm text-red-300 hover:bg-red-500/20"
              >
                End Auction
              </button>
            )}

            {ended && (
              <Link
                href={`/auctions/${auction.id}/results`}
                className="rounded border border-white/10 px-5 py-3"
              >
                View Results
              </Link>
            )}

            {ended &&
              (!auction.winnerUserId ||
                (auction.reservePrice &&
                  moneyToNumber(auction.price || 0) <
                    moneyToNumber(auction.reservePrice || 0))) && (
                <Link
                  href={`/sell/auction?relist=${auction.id}`}
                  className="rounded border border-[#d6aa55]/30 bg-[#1a1408] px-5 py-3 text-sm font-semibold text-[#e7c77f] hover:bg-[#221909]"
                >
                  Re-List Auction
                </Link>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MarketplaceSection({ listings, client }: any) {
  return (
    <section className="mt-14">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-serif text-3xl text-[#c0c0c0]">
          Marketplace Listings
        </h2>

        <Link
          href="/sell/listing"
          className="rounded border border-[#d6aa55]/30 bg-[#1a1408] px-5 py-3 text-sm font-semibold text-[#e7c77f] hover:bg-[#221909]"
        >
          Create Listing
        </Link>
      </div>

      {listings.length === 0 ? (
        <p className="text-gray-500">No marketplace listings.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-3">
          {listings.map((listing: any) => (
            <div
              key={listing.id}
              className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition hover:border-[#c0c0c0]/40"
            >
              <div className="h-72 bg-black">
                <img
                  loading="lazy"
                  src={
                    listing.image && listing.image !== "undefined"
                      ? listing.image
                      : "/logo.png"
                  }
                  className="h-full w-full object-contain bg-black"
                />
              </div>

              <div className="p-5">
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase tracking-[0.2em] text-gray-500">
                    Marketplace
                  </div>

                  {listing.sold ? (
                    <span className="rounded bg-red-500/20 px-2 py-1 text-[10px] uppercase text-red-300">
                      Sold
                    </span>
                  ) : (
                    <span className="rounded bg-emerald-500/20 px-2 py-1 text-[10px] uppercase text-emerald-300">
                      Active
                    </span>
                  )}
                </div>

                <h3 className="mt-2 font-serif text-2xl">{listing.title}</h3>

                <div className="mt-3 font-serif text-3xl text-[#c0c0c0]">
                  {listing.price}
                </div>
                <Link
                  href={`/marketplace/${listing.id}`}
                  className="mt-4 block rounded border border-white/10 px-4 py-2 text-center text-sm text-white transition hover:bg-white/[0.05]"
                >
                  View Listing
                </Link>

                <Link
                  href={`/sell/listing/${listing.id}/edit`}
                  className="mt-3 block rounded border border-[#d6aa55]/20 bg-[#1a1408] px-4 py-2 text-center text-sm text-[#e7c77f] transition hover:bg-[#221909]"
                >
                  Edit Listing
                </Link>

                <div className="mt-3 flex gap-2">
                  {listing.status === "ACTIVE" && (
                    <>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await client.models.MarketplaceListing.update(
                              {
                                id: listing.id,
                                status: "PAUSED",
                              },
                              { authMode: "apiKey" } as any,
                            );

                            window.location.reload();
                          } catch (err) {
                            console.error(err);
                            alert("Failed to pause listing");
                          }
                        }}
                        className="flex-1 rounded border border-yellow-500/20 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-300 hover:bg-yellow-500/20"
                      >
                        Pause
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await client.models.MarketplaceListing.update(
                              {
                                id: listing.id,
                                status: "SOLD",
                                sold: true,
                              },
                              { authMode: "apiKey" } as any,
                            );

                            window.location.reload();
                          } catch (err) {
                            console.error(err);
                            alert("Failed to mark sold");
                          }
                        }}
                        className="flex-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-500/20"
                      >
                        Mark Sold
                      </button>
                    </>
                  )}

                  {listing.status === "PAUSED" && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await client.models.MarketplaceListing.update(
                            {
                              id: listing.id,
                              status: "ACTIVE",
                            },
                            { authMode: "apiKey" } as any,
                          );

                          window.location.reload();
                        } catch (err) {
                          console.error(err);
                          alert("Failed to activate listing");
                        }
                      }}
                      className="w-full rounded border border-[#d6aa55]/20 bg-[#1a1408] px-4 py-2 text-sm text-[#e7c77f] hover:bg-[#221909]"
                    >
                      Activate
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
