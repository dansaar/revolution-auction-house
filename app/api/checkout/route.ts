import { NextResponse } from "next/server";
import Stripe from "stripe";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import outputs from "@/amplify_outputs.json";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { serverLogError } from "@/lib/serverLogError";
import { MARKETPLACE_PUBLIC_FIELDS } from "@/lib/marketplaceSelection";
import { AUCTION_PUBLIC_FIELDS } from "@/lib/auctionSelection";

Amplify.configure(outputs);

const client = generateClient<Schema>();

// Shared secret for the reserveListing mutation (only AMPLIFY_-prefixed vars are
// readable in the Next.js runtime). Reserving keeps a listing from being bought
// twice while a buyer is in Stripe checkout.
const RESERVE_SECRET =
  process.env.EASYPOST_WEBHOOK_SECRET || process.env.AMPLIFY_EASYPOST_WEBHOOK_SECRET || "";

// Abandoned Checkout Sessions expire after this, firing checkout.session.expired
// so the webhook releases the hold. 30 min is Stripe's minimum.
const CHECKOUT_EXPIRES_IN = 31 * 60;

// Stripe Tax computes destination-based sales tax at checkout. Off until the
// Stripe Tax dashboard is configured (origin address + registrations); flip
// AMPLIFY_STRIPE_TAX_ENABLED=true to turn it on. While off, no tax is added.
const STRIPE_TAX_ENABLED =
  (process.env.STRIPE_TAX_ENABLED || process.env.AMPLIFY_STRIPE_TAX_ENABLED) === "true";
const automaticTax = STRIPE_TAX_ENABLED ? { automatic_tax: { enabled: true } } : {};

async function reserveListings(listingIds: string[], buyerSub: string) {
  if (!RESERVE_SECRET || listingIds.length === 0) return;
  try {
    await client.mutations.reserveListing(
      { listingIds, action: "RESERVE", buyerSub: buyerSub || undefined, secret: RESERVE_SECRET },
      { authMode: "apiKey" } as any,
    );
  } catch (err) {
    // Non-fatal: the listing just isn't held. isListingAvailable + the
    // duplicate-payment refund in verifyPayment still guard against double-sale.
    console.error("checkout: reserveListing failed", err);
  }
}

const { aws_region: region, user_pool_id: userPoolId } = (outputs as any).auth;
const JWKS = createRemoteJWKSet(
  new URL(
    `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`,
  ),
);

async function getBuyerFromRequest(req: Request): Promise<{ email: string; sub: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { payload } = await jwtVerify(authHeader.slice(7), JWKS);
    const email = (payload.email as string) || "";
    const sub = (payload.sub as string) || "";
    if (!email || !sub) return null;
    return { email, sub };
  } catch {
    return null;
  }
}

function moneyToNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (!value) return 0;
  return Number(String(value).replace(/[$,]/g, ""));
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

// Stripe's hard per-transaction cap is $999,999.99 (99,999,999 cents) — applies
// to BOTH card and ACH. Lots above this can't be charged online and must settle
// by wire/escrow.
const STRIPE_MAX_CENTS = 99_999_999;
const HIGH_VALUE_MESSAGE =
  "This lot exceeds the $999,999.99 online payment limit. Our team will contact you to arrange a secure wire transfer or escrow.";

// Offer card AND bank debit (ACH via Financial Connections). ACH suits larger
// lots (lower fees, higher acceptance) but settles over several days.
// Card processing (2.9% + 30¢) dwarfs ACH (0.8%, $5 cap) on big-ticket sales, so
// for orders over this amount we surface bank payment first (preselected) and
// add a gentle nudge. Card is still available.
const ACH_NUDGE_OVER = 1000;

function paymentOptions(totalDollars: number) {
  const types: Array<"card" | "us_bank_account"> =
    totalDollars > ACH_NUDGE_OVER
      ? ["us_bank_account", "card"]
      : ["card", "us_bank_account"];
  const base = {
    payment_method_types: types,
    customer_creation: "always" as const,
  };
  if (totalDollars > ACH_NUDGE_OVER) {
    return {
      ...base,
      custom_text: {
        submit: {
          message:
            "Tip: paying by bank account (ACH) avoids card fees and helps us keep prices low.",
        },
      },
    };
  }
  return base;
}

function fmt(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

// Sales tax is computed by Stripe Tax at checkout (destination-based), not here.
function calcAuctionAmounts(auction: any) {
  const hammerPrice = moneyToNumber(auction.price || auction.winningBid || 0);
  const buyerPremiumRate = Number(auction.buyerPremiumRate ?? 18);
  const buyerPremium = hammerPrice * (buyerPremiumRate / 100);
  return {
    hammerPrice,
    buyerPremium,
    total: hammerPrice + buyerPremium,
  };
}

// A marketplace listing can only be bought when it's still active — not sold,
// paid, or reserved by an accepted/pending offer.
function isListingAvailable(listing: any, buyerSub?: string): boolean {
  if (listing.sold === true || listing.paid === true) return false;
  // A reserved listing is available only to the buyer who placed the hold (so
  // they can retry their own checkout); everyone else is blocked.
  if (listing.status === "PENDING_PAYMENT") {
    return !!buyerSub && listing.pendingBuyerSub === buyerSub;
  }
  const blocked = ["SOLD", "OFFER_PENDING", "OFFER_ACCEPTED"];
  if (blocked.includes(listing.status)) return false;
  return true;
}

function calcListingAmounts(listing: any) {
  const price = moneyToNumber(
    listing.acceptedOfferAmount || listing.price || 0,
  );
  return { price, total: price };
}

// General tangible-goods tax code; tax_behavior "exclusive" = Stripe Tax adds
// tax on top of these amounts at checkout (only when automatic_tax is enabled).
const GOODS_TAX_CODE = "txcd_99999999";

function priceLine(name: string, dollars: number) {
  return {
    price_data: {
      currency: "usd",
      product_data: { name, tax_code: GOODS_TAX_CODE },
      unit_amount: toCents(dollars),
      tax_behavior: "exclusive" as const,
    },
    quantity: 1,
  };
}

function buildAuctionLineItems(
  title: string,
  amounts: ReturnType<typeof calcAuctionAmounts>,
) {
  const items: any[] = [priceLine(title, amounts.hammerPrice)];
  if (amounts.buyerPremium > 0) {
    items.push(priceLine(`${title} — Buyer Premium`, amounts.buyerPremium));
  }
  return items;
}

function buildListingLineItems(
  title: string,
  amounts: ReturnType<typeof calcListingAmounts>,
) {
  return [priceLine(title, amounts.price)];
}

export async function POST(req: Request) {
  try {
    const buyer = await getBuyerFromRequest(req);

    if (!buyer) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const { email: buyerEmail, sub: buyerSub } = buyer;

    const stripeSecretKey =
      process.env.STRIPE_SECRET_KEY || process.env.AMPLIFY_STRIPE_SECRET_KEY;

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

    if (!stripeSecretKey) {
      return NextResponse.json(
        { error: "Missing STRIPE_SECRET_KEY on server" },
        { status: 500 },
      );
    }

    if (!siteUrl) {
      return NextResponse.json(
        { error: "Missing NEXT_PUBLIC_SITE_URL on server" },
        { status: 500 },
      );
    }

    const stripe = new Stripe(stripeSecretKey);

    const { auctionId, listingId, items } = await req.json();

    // Cart checkout — look up each item from the DB, ignore client-provided amounts
    if (Array.isArray(items) && items.length > 0) {
      const lineItems: any[] = [];
      const cartMeta: any[] = [];
      let cartTotalCents = 0;

      for (const item of items) {
        if (item.type === "AUCTION") {
          const result = await client.models.Auction.get(
            { id: item.id },
            { authMode: "apiKey", selectionSet: AUCTION_PUBLIC_FIELDS } as any,
          );
          const auction = result.data;
          if (!auction) continue;

          // Compare subs, not emails: sellerEmail is field-restricted and
          // always null on apiKey reads, so an email check never fires.
          if (
            buyerSub &&
            auction.sellerUserId &&
            buyerSub === auction.sellerUserId
          ) {
            return NextResponse.json(
              { error: "Sellers cannot purchase their own auctions." },
              { status: 400 },
            );
          }

          const amounts = calcAuctionAmounts(auction);
          cartTotalCents += toCents(amounts.total);
          const title = auction.title || "Auction";

          lineItems.push(...buildAuctionLineItems(title, amounts));
          cartMeta.push({
            id: item.id,
            type: "AUCTION",
            title,
            subtotal: fmt(amounts.hammerPrice),
            buyerPremium: fmt(amounts.buyerPremium),            amount: fmt(amounts.total),
          });
        } else if (item.type === "MARKETPLACE") {
          const result = await client.models.MarketplaceListing.get(
            { id: item.id },
            { authMode: "apiKey", selectionSet: MARKETPLACE_PUBLIC_FIELDS } as any,
          );
          const listing = result.data;
          if (!listing) continue;

          // Skip items that sold / went to an accepted offer since being added.
          if (!isListingAvailable(listing, buyerSub)) {
            return NextResponse.json(
              { error: `"${listing.title || "An item"}" is no longer available. Remove it and try again.` },
              { status: 409 },
            );
          }

          if (
            buyerSub &&
            listing.sellerUserId &&
            buyerSub === listing.sellerUserId
          ) {
            return NextResponse.json(
              { error: "Sellers cannot purchase their own listings." },
              { status: 400 },
            );
          }

          const amounts = calcListingAmounts(listing);
          cartTotalCents += toCents(amounts.total);
          const title = listing.title || "Marketplace Listing";

          lineItems.push(...buildListingLineItems(title, amounts));
          cartMeta.push({
            id: item.id,
            type: "MARKETPLACE",
            title,
            subtotal: fmt(amounts.price),
            buyerPremium: "$0.00",            amount: fmt(amounts.total),
          });
        }
      }

      if (lineItems.length === 0) {
        return NextResponse.json(
          { error: "No valid items to check out" },
          { status: 400 },
        );
      }

      if (cartTotalCents > STRIPE_MAX_CENTS) {
        return NextResponse.json({ error: HIGH_VALUE_MESSAGE, highValue: true }, { status: 409 });
      }

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        ...paymentOptions(cartTotalCents / 100),
        customer_email: buyerEmail || undefined,
        line_items: lineItems,
        shipping_address_collection: { allowed_countries: ["US"] },
        ...automaticTax,
        phone_number_collection: { enabled: true },
        metadata: {
          buyerEmail: buyerEmail || "",
          buyerSub: buyerSub || "",
          cartItems: JSON.stringify(cartMeta),
        },
        success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&type=cart`,
        cancel_url: `${siteUrl}/cart`,
        expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_EXPIRES_IN,
      });

      // Hold the marketplace listings so they can't be bought twice mid-checkout.
      await reserveListings(
        cartMeta.filter((m) => m.type === "MARKETPLACE").map((m) => String(m.id)),
        buyerSub,
      );

      return NextResponse.json({ url: session.url });
    }

    // Single auction checkout
    if (auctionId) {
      const result = await client.models.Auction.get(
        { id: auctionId },
        { authMode: "apiKey", selectionSet: AUCTION_PUBLIC_FIELDS } as any,
      );
      const auction = result.data;

      if (!auction) {
        return NextResponse.json(
          { error: "Auction not found" },
          { status: 404 },
        );
      }

      if (
        buyerSub &&
        auction.sellerUserId &&
        buyerSub === auction.sellerUserId
      ) {
        return NextResponse.json(
          { error: "Sellers cannot purchase their own auctions." },
          { status: 400 },
        );
      }

      const amounts = calcAuctionAmounts(auction);

      if (amounts.total < 0.5) {
        return NextResponse.json(
          { error: "Invalid auction price" },
          { status: 400 },
        );
      }

      if (toCents(amounts.total) > STRIPE_MAX_CENTS) {
        return NextResponse.json({ error: HIGH_VALUE_MESSAGE, highValue: true }, { status: 409 });
      }

      const title = auction.title || "Auction";

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        ...paymentOptions(amounts.total),
        customer_email: buyerEmail || undefined,
        line_items: buildAuctionLineItems(title, amounts),
        shipping_address_collection: { allowed_countries: ["US"] },
        ...automaticTax,
        phone_number_collection: { enabled: true },
        metadata: {
          auctionId,
          buyerEmail: buyerEmail || "",
          buyerSub: buyerSub || "",
          subtotal: fmt(amounts.hammerPrice),
          buyerPremium: fmt(amounts.buyerPremium),        },
        success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&type=auction`,
        cancel_url: `${siteUrl}/auctions/${auctionId}/results`,
      });

      return NextResponse.json({ url: session.url });
    }

    // Single listing checkout
    if (listingId) {
      const result = await client.models.MarketplaceListing.get(
        { id: listingId },
        { authMode: "apiKey", selectionSet: MARKETPLACE_PUBLIC_FIELDS } as any,
      );
      const listing = result.data;

      if (!listing) {
        return NextResponse.json(
          { error: "Listing not found" },
          { status: 404 },
        );
      }

      // Availability check — close the common race where the item sold (or went
      // to an accepted offer) before this buyer checks out.
      if (!isListingAvailable(listing, buyerSub)) {
        return NextResponse.json(
          { error: "This item is no longer available." },
          { status: 409 },
        );
      }

      if (
        buyerSub &&
        listing.sellerUserId &&
        buyerSub === listing.sellerUserId
      ) {
        return NextResponse.json(
          { error: "Sellers cannot purchase their own listings." },
          { status: 400 },
        );
      }

      const amounts = calcListingAmounts(listing);

      if (amounts.total < 0.5) {
        return NextResponse.json(
          { error: "Invalid listing price" },
          { status: 400 },
        );
      }

      if (toCents(amounts.total) > STRIPE_MAX_CENTS) {
        return NextResponse.json({ error: HIGH_VALUE_MESSAGE, highValue: true }, { status: 409 });
      }

      const title = listing.title || "Marketplace Listing";

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        ...paymentOptions(amounts.total),
        customer_email: buyerEmail || undefined,
        line_items: buildListingLineItems(title, amounts),
        shipping_address_collection: { allowed_countries: ["US"] },
        ...automaticTax,
        phone_number_collection: { enabled: true },
        metadata: {
          listingId,
          buyerEmail: buyerEmail || "",
          buyerSub: buyerSub || "",
          subtotal: fmt(amounts.price),
          buyerPremium: "$0.00",        },
        success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&type=listing`,
        cancel_url: `${siteUrl}/marketplace/${listingId}`,
        expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_EXPIRES_IN,
      });

      // Hold the listing so it can't be bought twice mid-checkout.
      await reserveListings([String(listingId)], buyerSub);

      return NextResponse.json({ url: session.url });
    }

    return NextResponse.json(
      { error: "Missing auctionId, listingId, or items" },
      { status: 400 },
    );
  } catch (err: any) {
    console.error("CHECKOUT API ERROR:", err);
    await serverLogError({
      source: "checkout",
      message: err?.message || "Checkout failed",
      context: err?.stack,
      severity: "ERROR",
      url: "/api/checkout",
    });

    return NextResponse.json(
      { error: err?.message || "Checkout failed" },
      { status: 500 },
    );
  }
}
