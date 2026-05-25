"use client";

import "@/lib/amplifyclient";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getCurrentUser } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { BadgeCheck, Gavel, Heart, Trophy } from "lucide-react";
import { moneyToNumber } from "@/lib/money";
import { cdnUrl } from "@/lib/cdn";

function makeBidderDisplayName(value: string) {
  if (!value) return "";

  if (value.startsWith("Bidder ")) {
    return value;
  }

  return `Bidder ${value.slice(0, 4).toUpperCase()}`;
}

function resolveAuctionImage(auction: any) {
  const rawImage =
    auction?.thumbImages?.[0] || auction?.images?.[0] || auction?.image || "";

  return cdnUrl(rawImage);
}

export default function DashboardPage() {
  const clientRef = React.useRef(generateClient<Schema>());
  const client = clientRef.current;

  const [bids, setBids] = useState<any[]>([]);
  const [auctions, setAuctions] = useState<any[]>([]);
  const [marketplacePurchases, setMarketplacePurchases] = useState<any[]>([]);
  const [acceptedOffers, setAcceptedOffers] = useState<any[]>([]);
  const [buyerOffers, setBuyerOffers] = useState<any[]>([]);
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [loadingUser, setLoadingUser] = useState(true);
  const [user, setUser] = useState<any>(null);

  const userKey = user?.signInDetails?.loginId || user?.username || "";
  const userId = user?.userId || user?.username || "";

  useEffect(() => {
    async function loadUser() {
      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
      } catch {
        setUser(null);
      } finally {
        setLoadingUser(false);
      }
    }

    loadUser();
  }, []);

  useEffect(() => {
    if (!userKey || !userId) return;

    async function loadDashboard() {
      try {
        const bidResult = await client.models.Bid.bidsByBidder(
          { bidderUserId: userId },
          {
            authMode: "apiKey",
            limit: 1000,
          } as any,
        );

        const emailBidResult = await client.models.Bid.bidsByBidderEmail(
          { bidderEmail: userKey },
          {
            authMode: "apiKey",
            limit: 1000,
          } as any,
        );

        const auctionResult = await client.models.Auction.list({
          authMode: "apiKey",
        } as any);

        const stateResult = await client.models.AuctionState.list({
          authMode: "apiKey",
        } as any);

        const auctionsWithLiveState = auctionResult.data.map((auction: any) => {
          const state = stateResult.data.find(
            (s: any) => s.auctionId === auction.id,
          );

          const leaderUserId =
            state?.leaderUserId ||
            auction.winnerUserId ||
            auction.winnerEmail ||
            "";

          return {
            ...auction,
            price: state?.currentPrice || auction.price,
            winnerUserId: leaderUserId,
            winnerDisplayName: makeBidderDisplayName(leaderUserId),
            winnerEmail: leaderUserId,
            bids: state?.bidCount ?? auction.bids,
            imageUrl: resolveAuctionImage(auction),
          };
        });
        const marketplaceResult = await client.models.MarketplaceListing.list({
          filter: {
            buyerEmail: { eq: userKey },
          },
          authMode: "apiKey",
        } as any);

        const resolvedMarketplacePurchases = (marketplaceResult.data || []).map(
          (listing: any) => {
            const rawImage =
              listing.thumbImages?.[0] ||
              listing.image ||
              listing.images?.[0] ||
              "";

            return {
              ...listing,
              imageUrl: cdnUrl(rawImage),
            };
          },
        );

        const buyerOfferResult = await client.models.Offer.list({
          filter: {
            buyerEmail: { eq: userKey },
          },
          authMode: "userPool",
        } as any);

        setBuyerOffers(buyerOfferResult.data || []);

        setMarketplacePurchases(resolvedMarketplacePurchases);
        const acceptedMarketplaceResult =
          await client.models.MarketplaceListing.list({
            filter: {
              buyerEmail: { eq: userKey },
              status: { eq: "OFFER_ACCEPTED" },
            },
            authMode: "apiKey",
          } as any);

        const resolvedAcceptedOffers = (
          acceptedMarketplaceResult.data || []
        ).map((listing: any) => {
          const rawImage =
            listing.thumbImages?.[0] ||
            listing.image ||
            listing.images?.[0] ||
            "";

          return {
            ...listing,
            imageUrl: cdnUrl(rawImage),
          };
        });

        setAcceptedOffers(resolvedAcceptedOffers);
        const combinedBids = [
          ...(bidResult.data || []),
          ...(emailBidResult.data || []),
        ];

        const uniqueBids = Array.from(
          new Map(combinedBids.map((bid: any) => [bid.id, bid])).values(),
        );

        const meValues = [
          userId,
          userKey,
          makeBidderDisplayName(userId),
          makeBidderDisplayName(userKey),
        ];

        const syntheticWinningBids = auctionsWithLiveState
          .filter(
            (auction: any) =>
              meValues.includes(String(auction.winnerUserId || "")) ||
              meValues.includes(String(auction.winnerEmail || "")) ||
              meValues.includes(String(auction.winnerDisplayName || "")),
          )
          .map((auction: any) => ({
            id: `synthetic-${auction.id}`,
            auctionId: auction.id,
            bidderUserId: userId,
            bidderEmail: userKey,
            bidderName: makeBidderDisplayName(userId),
            amount: auction.price,
            maxBid: auction.price,
          }));

        const finalBids = Array.from(
          new Map(
            [...uniqueBids, ...syntheticWinningBids].map((bid: any) => [
              bid.id,
              bid,
            ]),
          ).values(),
        );

        setBids(finalBids);
        setAuctions(auctionsWithLiveState);
      } catch (err) {
        console.error("DASHBOARD LOAD ERROR", err);
      }
    }

    loadDashboard();

    window.addEventListener("focus", loadDashboard);
    window.addEventListener("pageshow", loadDashboard);
    window.addEventListener("bid-updated", loadDashboard);

    const bidCreateSub = client.models.Bid.onCreate({
      authMode: "apiKey",
    }).subscribe({
      next: () => loadDashboard(),
    });

    const bidUpdateSub = client.models.Bid.onUpdate({
      authMode: "apiKey",
    }).subscribe({
      next: () => loadDashboard(),
    });

    const auctionUpdateSub = client.models.Auction.onUpdate({
      authMode: "apiKey",
    }).subscribe({
      next: () => loadDashboard(),
    });

    const stateUpdateSub = client.models.AuctionState.onUpdate({
      authMode: "apiKey",
    }).subscribe({
      next: () => loadDashboard(),
    });

    return () => {
      bidCreateSub.unsubscribe();
      bidUpdateSub.unsubscribe();
      auctionUpdateSub.unsubscribe();
      stateUpdateSub.unsubscribe();

      window.removeEventListener("focus", loadDashboard);
      window.removeEventListener("pageshow", loadDashboard);
      window.removeEventListener("bid-updated", loadDashboard);
    };
  }, [userKey, userId]);

  useEffect(() => {
    if (!userKey) return;

    async function loadWatchlist() {
      const result = await client.models.WatchlistItem.list({
        filter: {
          userEmail: { eq: userKey },
        },
        authMode: "userPool",
      });

      setWatchlist(result.data);
    }

    loadWatchlist();

    window.addEventListener("focus", loadWatchlist);
    window.addEventListener("pageshow", loadWatchlist);
    window.addEventListener("watchlist-updated", loadWatchlist);
    window.addEventListener("storage", loadWatchlist);

    return () => {
      window.removeEventListener("focus", loadWatchlist);
      window.removeEventListener("pageshow", loadWatchlist);
      window.removeEventListener("watchlist-updated", loadWatchlist);
      window.removeEventListener("storage", loadWatchlist);
    };
  }, [userKey]);

  const {
    myWinningBids,
    outbidLive,
    myWins,
    unpaidWins,
    paidWins,
    reserveNotMet,
    lostAuctions,
  } = useMemo(() => {
    const ended = auctions.filter(
      (a: any) => a.endsAt && new Date(a.endsAt).getTime() <= Date.now(),
    );

    const live = auctions.filter(
      (a: any) => !a.endsAt || new Date(a.endsAt).getTime() > Date.now(),
    );

    const isMeWinning = (auction: any) => {
      const winners = [
        auction.winnerUserId,
        auction.winnerEmail,
        auction.winnerDisplayName,
      ].map((v) => String(v || ""));

      const me = [
        user?.userId,
        user?.username,
        userKey,
        makeBidderDisplayName(user?.userId || ""),
        makeBidderDisplayName(user?.username || ""),
        makeBidderDisplayName(userKey || ""),
      ].map((v) => String(v || ""));

      return winners.some((winner) => me.includes(winner));
    };

    const highestMyBidByAuction = new Map<string, any>();

    for (const bid of bids) {
      const existing = highestMyBidByAuction.get(bid.auctionId);
      if (
        !existing ||
        moneyToNumber(bid.maxBid || bid.amount) >
          moneyToNumber(existing.maxBid || existing.amount)
      ) {
        highestMyBidByAuction.set(bid.auctionId, bid);
      }
    }

    const highestMyBids = Array.from(highestMyBidByAuction.values());

    const winningLive = highestMyBids.filter((bid: any) => {
      const auction = live.find((a: any) => a.id === bid.auctionId);

      if (!auction) return false;

      return isMeWinning(auction);
    });

    const outbid = highestMyBids.filter((bid: any) => {
      const auction = live.find((a: any) => a.id === bid.auctionId);

      if (!auction) return false;

      return !isMeWinning(auction);
    });

    const wins = ended
      .map((auction: any) => {
        const myBid = highestMyBidByAuction.get(auction.id);
        if (!myBid) return null;

        const finalPrice = moneyToNumber(auction.price);
        const reservePrice = moneyToNumber(auction.reservePrice);
        const reserveMet = !auction.reservePrice || finalPrice >= reservePrice;

        if (moneyToNumber(myBid.amount) < finalPrice || !reserveMet)
          return null;

        return {
          ...myBid,
          auctionId: auction.id,
          amount: auction.price,
        };
      })
      .filter(Boolean);

    const unpaid = wins.filter((bid: any) => {
      const auction = auctions.find((a: any) => a.id === bid.auctionId);
      return auction && auction.paid !== true;
    });

    const paid = wins.filter((bid: any) => {
      const auction = auctions.find((a: any) => a.id === bid.auctionId);
      return auction && auction.paid === true;
    });

    const reserveMisses = ended.filter((auction: any) => {
      const myBid = highestMyBidByAuction.get(auction.id);

      if (!myBid) return false;

      const reservePrice = moneyToNumber(auction.reservePrice || 0);

      const finalPrice = moneyToNumber(auction.price || 0);

      const userWon = isMeWinning(auction);

      return userWon && reservePrice > 0 && finalPrice < reservePrice;
    });

    const lost = ended.filter((auction: any) => {
      const myBid = highestMyBidByAuction.get(auction.id);
      if (!myBid) return false;

      return moneyToNumber(myBid.amount) < moneyToNumber(auction.price);
    });

    return {
      myWinningBids: winningLive,
      outbidLive: outbid,
      myWins: wins,
      unpaidWins: unpaid,
      paidWins: paid,
      reserveNotMet: reserveMisses,
      lostAuctions: lost,
    };
  }, [bids, auctions, user, userKey]);

  async function handleCheckout(auction: any) {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auctionId: auction.id,
        title: auction.title,
        amount: auction.price,
      }),
    });

    const data = await res.json();

    if (data.url) {
      window.location.href = data.url;
    } else {
      alert(data.error || "Checkout failed");
    }
  }

  async function handleMarketplaceCheckout(listing: any) {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        listingId: listing.id,
        title: listing.title,
        amount: listing.acceptedOfferAmount || listing.price,
        buyerEmail: userKey,
      }),
    });

    const data = await res.json();

    if (data.url) {
      window.location.href = data.url;
    } else {
      alert(data.error || "Checkout failed");
    }
  }

  async function removeFromWatchlist(itemId: string) {
    await client.models.WatchlistItem.delete(
      { id: itemId },
      { authMode: "userPool" },
    );

    setWatchlist((prev) => prev.filter((item: any) => item.id !== itemId));
    localStorage.setItem("watchlist-updated-at", String(Date.now()));
    window.dispatchEvent(new Event("watchlist-updated"));
  }

  async function dismissOfferNotification(offerId: string) {
    await client.models.Offer.update(
      {
        id: offerId,
        read: true,
      },
      {
        authMode: "userPool",
      } as any,
    );

    setBuyerOffers((prev: any[]) =>
      prev.map((offer: any) =>
        offer.id === offerId ? { ...offer, read: true } : offer,
      ),
    );
  }

  if (loadingUser) {
    return (
      <div className="min-h-screen bg-[#050607] p-10 text-white">
        Loading...
      </div>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050607] px-6 text-white">
        <div className="max-w-md rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <h1 className="font-serif text-3xl text-[#c0c0c0]">
            Buyer Sign In Required
          </h1>

          <p className="mt-3 text-gray-400">
            Please sign in to view your dashboard, bids, watchlist, and auction
            results.
          </p>

          <Link
            href="/signin"
            className="mt-6 inline-block rounded bg-[#c0c0c0] px-5 py-3 font-semibold text-black"
          >
            Sign In
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-serif text-5xl">Buyer Dashboard</h1>

            <p className="mt-3 text-gray-400">
              Track your bids, watched lots, and auction results.
            </p>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-[#08090b] px-7 py-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)] md:min-w-[280px]">
            <div className="text-[10px] uppercase tracking-[0.34em] text-gray-500">
              Verified Bidder
            </div>

            <div className="mt-4 h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            <div className="mt-5 text-3xl font-serif text-3xl tracking-[0.22em] text-[#d7d7d7]">
              Bidder{" "}
              {String(user?.userId || "")
                .slice(0, 4)
                .toUpperCase()}
            </div>

            <div className="mt-5 text-[11px] uppercase tracking-[0.30em] text-emerald-400/80">
              Identity Verified
            </div>
          </div>
        </div>

        <section className="mt-10 grid gap-5 md:grid-cols-4">
          <Stat icon={Gavel} label="My Bids" value={String(bids.length)} />
          <Stat
            icon={Heart}
            label="Watchlist"
            value={String(watchlist.length)}
          />
          <Stat
            icon={Trophy}
            label="Unpaid Wins"
            value={String(unpaidWins.length)}
          />
          <Stat icon={BadgeCheck} label="Status" value="Verified" />
        </section>

        <section className="mt-12 grid gap-8 lg:grid-cols-2">
          <Panel title="My Active / Winning Bids">
            {myWinningBids.length === 0 ? (
              <Empty text="No leading bids yet." />
            ) : (
              myWinningBids.map((bid: any) => (
                <BidRow key={bid.auctionId} bid={bid} auctions={auctions} />
              ))
            )}
          </Panel>

          <Panel title="Outbid (Live)">
            {outbidLive.length === 0 ? (
              <Empty text="No live outbid auctions." />
            ) : (
              outbidLive.map((bid: any) => (
                <BidRow
                  key={bid.auctionId}
                  bid={bid}
                  auctions={auctions}
                  danger
                />
              ))
            )}
          </Panel>

          <Panel title="Won Auctions">
            {myWins.length === 0 ? (
              <Empty text="No wins yet." />
            ) : (
              myWins.map((bid: any) => (
                <BidRow
                  key={bid.auctionId}
                  bid={bid}
                  auctions={auctions}
                  trophy
                />
              ))
            )}
          </Panel>

          <Panel title="Unpaid Wins">
            {unpaidWins.length === 0 ? (
              <Empty text="No unpaid wins." />
            ) : (
              unpaidWins.map((bid: any) => (
                <BidRow
                  key={bid.auctionId}
                  bid={bid}
                  auctions={auctions}
                  trophy
                  showPayButton
                  onCheckout={handleCheckout}
                />
              ))
            )}
          </Panel>

          <Panel title="Paid Wins">
            {paidWins.length === 0 ? (
              <Empty text="No paid wins yet." />
            ) : (
              paidWins.map((bid: any) => (
                <BidRow
                  key={bid.auctionId}
                  bid={bid}
                  auctions={auctions}
                  trophy
                />
              ))
            )}
          </Panel>

          <Panel title="Watchlist">
            {watchlist.length === 0 ? (
              <Empty text="No watched auctions yet." />
            ) : (
              watchlist
                .filter((item: any) => item.auctionId)
                .map((item: any) => {
                  const auction = auctions.find(
                    (a: any) => String(a.id) === String(item.auctionId),
                  );
                  const isEnded =
                    auction?.endsAt &&
                    new Date(auction.endsAt).getTime() <= Date.now();

                  const isPaid = auction?.paid === true;

                  const isLive = !!auction && !isEnded;

                  return (
                    <div
                      key={item.id}
                      className="mb-3 flex items-center justify-between gap-4 rounded border border-white/10 bg-black/30 p-3"
                    >
                      <Link
                        href={
                          isEnded
                            ? `/auctions/${item.auctionId}/results`
                            : `/auctions/${item.auctionId}`
                        }
                        className="flex flex-1 items-center gap-4"
                      >
                        <img
                          loading="lazy"
                          src={
                            auction?.imageUrl ||
                            cdnUrl(item.image) ||
                            "/logo.png"
                          }
                          onError={(e) => {
                            e.currentTarget.src = "/logo.png";
                          }}
                          className="h-16 w-16 rounded object-cover"
                        />

                        <div>
                          <div className="font-semibold">{item.title}</div>
                          <div className="mt-1 flex gap-2 text-xs">
                            {isLive && (
                              <span className="rounded bg-blue-400/10 px-2 py-0.5 text-blue-300">
                                Live
                              </span>
                            )}

                            {isEnded && !isPaid && (
                              <span className="rounded bg-yellow-400/10 px-2 py-0.5 text-yellow-300">
                                Ended
                              </span>
                            )}

                            {isPaid && (
                              <span className="rounded bg-green-500/10 px-2 py-0.5 text-green-400">
                                Paid
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>

                      <button
                        type="button"
                        onClick={() => removeFromWatchlist(item.id)}
                        className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/20 active:scale-95"
                      >
                        Remove
                      </button>
                    </div>
                  );
                })
            )}
          </Panel>

          <Panel title="Offer Notifications">
            {buyerOffers.length === 0 ? (
              <Empty text="No offer updates yet." />
            ) : (
              buyerOffers
                .filter((offer: any) => offer.read !== true)
                .map((offer: any) => (
                  <OfferNotificationRow
                    key={offer.id}
                    offer={offer}
                    onDismiss={dismissOfferNotification}
                  />
                ))
            )}
          </Panel>

          <Panel title="Marketplace Purchases">
            {marketplacePurchases.length === 0 ? (
              <Empty text="No marketplace purchases yet." />
            ) : (
              marketplacePurchases.map((listing: any) => (
                <MarketplacePurchaseRow key={listing.id} listing={listing} />
              ))
            )}
          </Panel>

          <Panel title="Accepted Marketplace Offers">
            {acceptedOffers.length === 0 ? (
              <Empty text="No accepted marketplace offers." />
            ) : (
              acceptedOffers.map((listing: any) => (
                <AcceptedMarketplaceRow
                  key={listing.id}
                  listing={listing}
                  onCheckout={handleMarketplaceCheckout}
                />
              ))
            )}
          </Panel>

          <Panel title="Reserve Not Met">
            {reserveNotMet.length === 0 ? (
              <Empty text="No reserve-not-met auctions." />
            ) : (
              reserveNotMet.map((auction: any) => (
                <ReserveNotMetRow key={auction.id} auction={auction} />
              ))
            )}
          </Panel>

          <Panel title="Lost Auctions">
            {lostAuctions.length === 0 ? (
              <Empty text="No lost auctions." />
            ) : (
              lostAuctions.map((auction: any) => (
                <LostAuctionRow key={auction.id} auction={auction} />
              ))
            )}
          </Panel>
        </section>
      </div>
    </main>
  );
}

function Stat({ icon: Icon, label, value }: any) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <Icon className="text-[#c0c0c0]" size={22} />
      <div className="mt-4 text-xs uppercase tracking-widest text-gray-500">
        {label}
      </div>
      <div className="mt-1 font-serif text-3xl text-[#c0c0c0]">{value}</div>
    </div>
  );
}

function Panel({ title, children }: any) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
      <h2 className="mb-5 font-serif text-2xl">{title}</h2>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-gray-500">{text}</p>;
}

//BID ROW

function BidRow({ bid, auctions, danger, showPayButton, onCheckout }: any) {
  const auction = auctions.find((a: any) => a.id === bid.auctionId);

  const isEnded =
    auction?.endsAt && new Date(auction.endsAt).getTime() <= Date.now();

  const isPaid = auction?.paid === true;

  const reservePrice = moneyToNumber(auction?.reservePrice || 0);

  const currentPrice = moneyToNumber(auction?.price || 0);

  const reserveNotMet = reservePrice > 0 && currentPrice < reservePrice;

  const isWinning =
    String(auction?.winnerUserId || "") === String(bid?.bidderUserId || "") ||
    String(auction?.winnerEmail || "") === String(bid?.bidderUserId || "") ||
    String(auction?.winnerEmail || "") === String(bid?.bidderEmail || "") ||
    String(auction?.winnerDisplayName || "") === String(bid?.bidderName || "");

  const isWinningLive = isWinning && !isEnded && !danger;

  const isWonEnded = isWinning && isEnded;

  const rowStyle = danger
    ? "border-red-500/30 bg-red-500/10"
    : isWonEnded
      ? "border-green-500/40 bg-green-500/10"
      : isWinningLive
        ? "border-blue-400/30 bg-blue-400/10"
        : "border-white/10 bg-black/30";

  return (
    <Link
      href={
        isEnded
          ? `/auctions/${bid.auctionId}/results`
          : `/auctions/${bid.auctionId}`
      }
      className={`mb-3 block rounded border p-4 ${rowStyle}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <img
            loading="lazy"
            src={auction?.imageUrl || "/logo.png"}
            onError={(e) => {
              e.currentTarget.src = "/logo.png";
            }}
            className="h-16 w-16 rounded object-cover"
          />

          <div>
            <div className="font-semibold">
              {isWonEnded ? "🏆 " : ""}
              {auction?.title || "Auction"}
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {isWinningLive && (
                <span className="rounded bg-blue-400/10 px-2 py-0.5 text-xs text-blue-300">
                  {reserveNotMet ? "Leading · Reserve Not Met" : "Leading"}
                </span>
              )}

              {danger && (
                <span className="rounded bg-red-500/10 px-2 py-0.5 text-xs text-red-300">
                  Outbid
                </span>
              )}

              {isWonEnded && !isPaid && (
                <span className="rounded bg-yellow-400/10 px-2 py-0.5 text-xs text-yellow-300">
                  Won · Payment Due
                </span>
              )}

              {isPaid && (
                <span className="rounded bg-green-500/10 px-2 py-0.5 text-xs text-green-400">
                  Paid
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="font-serif text-xl text-[#c0c0c0]">
          {auction?.price || bid.amount}
        </div>
      </div>

      {showPayButton && auction && !auction.paid && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onCheckout(auction);
          }}
          className="mt-4 w-full rounded bg-[#c0c0c0] px-4 py-3 font-semibold text-black hover:bg-white"
        >
          Pay Now
        </button>
      )}
    </Link>
  );
}

function LostAuctionRow({ auction }: any) {
  return (
    <Link
      href={`/auctions/${auction.id}/results`}
      className="mb-3 block rounded border border-red-500/30 bg-red-500/10 p-4"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">{auction.title}</div>
          <span className="mt-2 inline-block rounded bg-red-500/10 px-2 py-0.5 text-xs text-red-300">
            Lost
          </span>
        </div>

        <div className="font-serif text-xl text-[#c0c0c0]">{auction.price}</div>
      </div>
    </Link>
  );
}

function OfferNotificationRow({ offer, onDismiss }: any) {
  return (
    <div
      className="
    mb-4 rounded-2xl
    border border-white/10
    bg-gradient-to-br from-white/[0.05] to-white/[0.02]
    p-5
    shadow-[0_10px_40px_rgba(0,0,0,0.35)]
    backdrop-blur-sm
  "
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-serif text-lg text-[#d7d7d7]">
            Marketplace Offer
          </div>

          <div className="mt-2 text-sm text-gray-400">
            Offer amount: {offer.amount}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {offer.status === "ACCEPTED" ? (
            <span className="rounded bg-green-500/10 px-2 py-1 text-xs text-green-400">
              Accepted
            </span>
          ) : offer.status === "DECLINED" ? (
            <span className="rounded bg-red-500/10 px-2 py-1 text-xs text-red-300">
              Declined
            </span>
          ) : (
            <span className="rounded bg-yellow-400/10 px-2 py-1 text-xs text-yellow-300">
              Pending
            </span>
          )}

          <button
            type="button"
            onClick={() => onDismiss(offer.id)}
            className="
    group relative overflow-hidden rounded-xl
    border border-white/10
    bg-gradient-to-b from-white/[0.08] to-white/[0.03]
    px-4 py-2
    text-xs font-semibold uppercase tracking-[0.18em]
    text-[#d7d7d7]
    transition-all duration-300
    hover:border-[#c0c0c0]/40
    hover:bg-white/[0.08]
    hover:text-white
    hover:shadow-[0_0_30px_rgba(192,192,192,0.12)]
    active:scale-[0.97]
  "
          >
            <span className="relative z-10">Dismiss</span>

            <div
              className="
      absolute inset-0 opacity-0 transition-opacity duration-300
      group-hover:opacity-100
      bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_65%)]
    "
            />
          </button>
        </div>
      </div>
    </div>
  );
}

function MarketplacePurchaseRow({ listing }: any) {
  return (
    <Link
      href={`/marketplace/${listing.id}`}
      className="mb-3 block rounded border border-emerald-500/30 bg-emerald-500/10 p-4"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <img
            loading="lazy"
            src={listing.imageUrl || "/logo.png"}
            onError={(e) => {
              e.currentTarget.src = "/logo.png";
            }}
            className="h-16 w-16 rounded object-cover"
          />

          <div>
            <div className="font-semibold">{listing.title}</div>

            <div className="mt-2 flex flex-wrap gap-2">
              {listing.paid ? (
                <span className="rounded bg-green-500/10 px-2 py-0.5 text-xs text-green-400">
                  Paid
                </span>
              ) : (
                <span className="rounded bg-yellow-400/10 px-2 py-0.5 text-xs text-yellow-300">
                  Payment Pending
                </span>
              )}

              <span className="rounded bg-white/10 px-2 py-0.5 text-xs text-gray-300">
                Marketplace
              </span>
            </div>
          </div>
        </div>

        <div className="font-serif text-xl text-[#c0c0c0]">
          {listing.acceptedOfferAmount || listing.offerAmount || listing.price}
        </div>
      </div>
    </Link>
  );
}
function AcceptedMarketplaceRow({ listing, onCheckout }: any) {
  return (
    <div className="mb-3 rounded border border-yellow-400/30 bg-yellow-400/10 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <img
            loading="lazy"
            src={listing.imageUrl || "/logo.png"}
            onError={(e) => {
              e.currentTarget.src = "/logo.png";
            }}
            className="h-16 w-16 rounded object-cover"
          />

          <div>
            <div className="font-semibold">{listing.title}</div>

            <div className="mt-2 flex gap-2">
              <span className="rounded bg-yellow-400/10 px-2 py-0.5 text-xs text-yellow-300">
                Offer Accepted
              </span>
            </div>
          </div>
        </div>

        <div className="font-serif text-xl text-[#c0c0c0]">
          {listing.acceptedOfferAmount || listing.price}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onCheckout(listing)}
        className="mt-4 w-full rounded bg-[#c0c0c0] px-4 py-3 font-semibold text-black hover:bg-white"
      >
        Pay Now
      </button>
    </div>
  );
}

function ReserveNotMetRow({ auction }: any) {
  return (
    <Link
      href={`/auctions/${auction.id}/results`}
      className="mb-3 block rounded border border-yellow-400/30 bg-yellow-400/10 p-4"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">{auction.title}</div>
          <span className="mt-2 inline-block rounded bg-yellow-400/10 px-2 py-0.5 text-xs text-yellow-300">
            Reserve Not Met
          </span>
        </div>

        <div className="font-serif text-xl text-[#c0c0c0]">{auction.price}</div>
      </div>
    </Link>
  );
}
