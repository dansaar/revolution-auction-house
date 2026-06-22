// Pure bidding math, extracted from the placeBid handler so it can be unit
// tested in isolation (no DynamoDB / Amplify). The handler imports these and
// stays responsible for I/O, concurrency, and side effects.

// Minimum step between bids, scaled to the current price.
export function defaultIncrement(amount: number): number {
  if (amount < 100) return 5;
  if (amount < 500) return 10;
  if (amount < 1000) return 25;
  if (amount < 2500) return 50;
  if (amount < 5000) return 100;
  if (amount < 10000) return 250;
  if (amount < 25000) return 500;
  if (amount < 50000) return 1000;
  if (amount < 100000) return 2500;
  if (amount < 250000) return 5000;
  if (amount < 500000) return 10000;
  return 25000;
}

// A seller can set a larger custom increment, but never below the default ladder.
export function getIncrement(amount: number, custom?: number | null): number {
  return Math.max(custom || 0, defaultIncrement(amount));
}

export interface BidState {
  currentPrice: number;
  leaderUserId: string;
  leaderMaxBid: number;
  secondUserId: string;
  secondMaxBid: number;
}

export interface BidResolution {
  newLeaderUserId: string;
  newLeaderMaxBid: number;
  newSecondUserId: string;
  newSecondMaxBid: number;
  visiblePrice: number;
  // When set, the leader's proxy auto-bid responded — the handler records a
  // second (proxy) bid row for this user.
  proxyUserId: string;
}

// Resolve a new max-bid against current auction state. Mirrors English-auction
// proxy bidding: the visible price only rises enough to stay one increment above
// the runner-up, capped by the winner's max.
export function resolveBid(
  state: BidState,
  bidderUserId: string,
  maxBid: number,
  minimumBid: number,
  customIncrement?: number | null,
): BidResolution {
  const { currentPrice, leaderUserId, leaderMaxBid, secondUserId, secondMaxBid } = state;

  let newLeaderUserId = leaderUserId;
  let newLeaderMaxBid = leaderMaxBid;
  let newSecondUserId = secondUserId;
  let newSecondMaxBid = secondMaxBid;
  let visiblePrice = currentPrice;
  let proxyUserId = "";

  if (!leaderUserId) {
    // First bid on the auction.
    newLeaderUserId = bidderUserId;
    newLeaderMaxBid = maxBid;
    visiblePrice = minimumBid;
  } else if (bidderUserId === leaderUserId) {
    // Current leader raising their own max — price doesn't move.
    newLeaderMaxBid = Math.max(leaderMaxBid, maxBid);
    visiblePrice = currentPrice;
  } else if (maxBid > leaderMaxBid) {
    // New high bidder takes the lead; old leader becomes runner-up.
    newSecondUserId = leaderUserId;
    newSecondMaxBid = leaderMaxBid;
    newLeaderUserId = bidderUserId;
    newLeaderMaxBid = maxBid;
    visiblePrice = Math.min(maxBid, leaderMaxBid + getIncrement(leaderMaxBid, customIncrement));
  } else if (maxBid === leaderMaxBid) {
    // Tie — earlier leader keeps the lead at the tied amount.
    newSecondUserId = bidderUserId;
    newSecondMaxBid = maxBid;
    visiblePrice = leaderMaxBid;
    proxyUserId = leaderUserId;
  } else {
    // Bid below leader's max — leader's proxy outbids, becomes runner-up.
    newSecondUserId = bidderUserId;
    newSecondMaxBid = Math.max(secondMaxBid, maxBid);
    visiblePrice = Math.min(leaderMaxBid, maxBid + getIncrement(maxBid, customIncrement));
    proxyUserId = leaderUserId;
  }

  return {
    newLeaderUserId,
    newLeaderMaxBid,
    newSecondUserId,
    newSecondMaxBid,
    visiblePrice,
    proxyUserId,
  };
}
