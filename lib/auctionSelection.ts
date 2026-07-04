// Public (apiKey) selection sets for the auction models, mirroring
// lib/marketplaceSelection.ts: every field EXCEPT the ones with field-level
// auth, which return a per-item "Not Authorized" error when requested under
// apiKey. Keep in sync with amplify/data/resource.ts.

// Excludes winnerEmail, sellerName, sellerEmail, stripeSessionId,
// easypostShipmentId, shippingLabelUrl (Admin/Seller/owner only — the label
// URL is a PDF with the buyer's address).
export const AUCTION_PUBLIC_FIELDS = [
  "id",
  "title",
  "subtitle",
  "price",
  "winnerUserId",
  "winnerDisplayName",
  "image",
  "images",
  "thumbImages",
  "mediumImages",
  "fullImages",
  "bids",
  "endsAt",
  "ended",
  "status",
  "reservePrice",
  "reserveMet",
  "relistedAt",
  "winningBid",
  "sellerUserId",
  "sellerPublicId",
  "sellerDisplayName",
  "paid",
  "paidAt",
  "chargeTax",
  "taxRate",
  "buyerPremiumRate",
  "description",
  "grade",
  "certNumber",
  "year",
  "setName",
  "cardNumber",
  "population",
  "provenance",
  "shippingStatus",
  "trackingNumber",
  "carrier",
  "trackingUrl",
  "shippedAt",
  "deliveredAt",
  "buyerReceivedAt",
  "startsAt",
  "increment",
  "createdAt",
  "updatedAt",
] as const;

// Excludes leaderMaxBid, secondMaxBid, leaderEmail, secondEmail (Admin only).
export const AUCTION_STATE_PUBLIC_FIELDS = [
  "auctionId",
  "currentPrice",
  "leaderUserId",
  "leaderDisplayName",
  "secondUserId",
  "bidCount",
  "version",
  "endsAt",
  "ended",
  "createdAt",
  "updatedAt",
] as const;

// Excludes bidderEmail, maxBid (Admin only).
export const BID_PUBLIC_FIELDS = [
  "id",
  "auctionId",
  "bidderName",
  "bidderUserId",
  "amount",
  "isProxy",
  "createdAt",
  "updatedAt",
] as const;
