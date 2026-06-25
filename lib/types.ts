import type { Schema } from "@/amplify/data/resource";

// Shared aliases for the generated Amplify model types, so code can use these
// instead of `any`. Adopt incrementally — page state that spreads extra fields
// (e.g. a resolved `image` URL or `_shipType`) may need `Type & { ... }`.
export type Auction = Schema["Auction"]["type"];
export type AuctionState = Schema["AuctionState"]["type"];
export type MarketplaceListing = Schema["MarketplaceListing"]["type"];
export type Invoice = Schema["Invoice"]["type"];
export type BuyerProfile = Schema["BuyerProfile"]["type"];
export type SellerProfile = Schema["SellerProfile"]["type"];
export type Bid = Schema["Bid"]["type"];
export type Offer = Schema["Offer"]["type"];
export type WatchlistItem = Schema["WatchlistItem"]["type"];
