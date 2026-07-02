import "@/lib/amplifyclient";

import { getCurrentUser } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { getCart } from "@/lib/cart";
import { moneyToNumber } from "@/lib/money";
import { MARKETPLACE_PUBLIC_FIELDS } from "@/lib/marketplaceSelection";
import { AUCTION_PUBLIC_FIELDS } from "@/lib/auctionSelection";

const client = generateClient<Schema>();

export type CartCountDetail = {
  total: number;
  // Cached so the badge can recompute locally on add/remove without refetching.
  obligationCount: number;
  obligationIds: string[];
  soldOrPaidIds: string[];
};

// Mirrors the /cart page: payment obligations (unpaid auction wins + accepted/
// pending marketplace purchases) plus locally added items, deduped. Used by the
// header badge so it reflects the true number of items on the cart page.
export async function fetchCartCountDetail(): Promise<CartCountDetail> {
  let userId = "";
  let email = "";
  try {
    const user = await getCurrentUser();
    userId = user.userId || user.username || "";
    email = (user as any).signInDetails?.loginId || user.username || "";
  } catch {
    // Signed out — only locally-added items count.
    return { total: getCart().length, obligationCount: 0, obligationIds: [], soldOrPaidIds: [] };
  }

  try {
    const [auctionRes, listingRes] = await Promise.all([
      client.models.Auction.list({
        authMode: "apiKey",
        selectionSet: AUCTION_PUBLIC_FIELDS,
        limit: 1000,
      } as any),
      client.models.MarketplaceListing.list({
        authMode: "apiKey",
        limit: 1000,
        selectionSet: MARKETPLACE_PUBLIC_FIELDS,
      } as any),
    ]);

    const unpaidWins = (auctionRes.data || []).filter((a: any) => {
      const winnerMatches =
        a.winnerUserId === userId || a.winnerEmail === email || a.winnerDisplayName === userId;
      const ended = a.ended || (a.endsAt && new Date(a.endsAt).getTime() <= Date.now());
      // Reserve gate: an unmet reserve means no sale, so it isn't an obligation.
      // Matches the buyer dashboard, which already checks this.
      const finalPrice = moneyToNumber(a.price);
      const reservePrice = moneyToNumber(a.reservePrice);
      const reserveMet = !a.reservePrice || finalPrice >= reservePrice;
      const notVoided = a.status !== "RESERVE_NOT_MET" && a.status !== "CANCELLED";
      return winnerMatches && ended && a.paid !== true && reserveMet && notVoided;
    });

    const listings = listingRes.data || [];
    const unpaidPurchases = listings.filter((l: any) => {
      const buyerMatches =
        l.buyerEmail === email || l.buyerEmail === userId || l.buyerUserId === userId;
      const payable = l.status === "OFFER_ACCEPTED" || l.status === "PENDING_PAYMENT";
      return buyerMatches && payable && l.paid !== true;
    });

    const obligationIds = [...unpaidWins, ...unpaidPurchases].map((i: any) => i.id);
    const obligationSet = new Set(obligationIds);
    const soldOrPaidIds = listings
      .filter((l: any) => l.paid === true || l.status === "SOLD" || l.sold === true)
      .map((l: any) => l.id);
    const soldOrPaidSet = new Set(soldOrPaidIds);

    const obligationCount = obligationIds.length;
    const added = getCart().filter((c) => !obligationSet.has(c.id) && !soldOrPaidSet.has(c.id));

    return {
      total: obligationCount + added.length,
      obligationCount,
      obligationIds,
      soldOrPaidIds,
    };
  } catch {
    // Query failed — fall back to the local count so the badge still shows.
    return { total: getCart().length, obligationCount: 0, obligationIds: [], soldOrPaidIds: [] };
  }
}

// Recompute the total locally from a cached detail + the current local cart.
export function localTotalFrom(detail: CartCountDetail): number {
  const oblig = new Set(detail.obligationIds);
  const soldPaid = new Set(detail.soldOrPaidIds);
  const added = getCart().filter((c) => !oblig.has(c.id) && !soldPaid.has(c.id));
  return detail.obligationCount + added.length;
}
