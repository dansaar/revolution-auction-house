import { NextResponse } from "next/server";
import Stripe from "stripe";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import outputs from "@/amplify_outputs.json";
import { createRemoteJWKSet, jwtVerify } from "jose";

Amplify.configure(outputs);

const client = generateClient<Schema>();

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

function fmt(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function calcAuctionAmounts(auction: any) {
  const hammerPrice = moneyToNumber(auction.price || auction.winningBid || 0);
  const buyerPremiumRate = Number(auction.buyerPremiumRate ?? 18);
  const buyerPremium = hammerPrice * (buyerPremiumRate / 100);
  const taxableAmount = hammerPrice + buyerPremium;
  const taxRate = Number(auction.taxRate ?? 6.625);
  const tax = auction.chargeTax ? taxableAmount * (taxRate / 100) : 0;
  return {
    hammerPrice,
    buyerPremium,
    tax,
    total: hammerPrice + buyerPremium + tax,
  };
}

function calcListingAmounts(listing: any) {
  const price = moneyToNumber(
    listing.acceptedOfferAmount || listing.price || 0,
  );
  const taxRate = Number(listing.taxRate ?? 6.625);
  const tax = listing.chargeTax ? price * (taxRate / 100) : 0;
  return { price, tax, total: price + tax };
}

function buildAuctionLineItems(
  title: string,
  amounts: ReturnType<typeof calcAuctionAmounts>,
) {
  const items: any[] = [
    {
      price_data: {
        currency: "usd",
        product_data: { name: title },
        unit_amount: toCents(amounts.hammerPrice),
      },
      quantity: 1,
    },
  ];

  if (amounts.buyerPremium > 0) {
    items.push({
      price_data: {
        currency: "usd",
        product_data: { name: `${title} — Buyer Premium` },
        unit_amount: toCents(amounts.buyerPremium),
      },
      quantity: 1,
    });
  }

  if (amounts.tax > 0) {
    items.push({
      price_data: {
        currency: "usd",
        product_data: { name: `${title} — NJ Sales Tax` },
        unit_amount: toCents(amounts.tax),
      },
      quantity: 1,
    });
  }

  return items;
}

function buildListingLineItems(
  title: string,
  amounts: ReturnType<typeof calcListingAmounts>,
) {
  const items: any[] = [
    {
      price_data: {
        currency: "usd",
        product_data: { name: title },
        unit_amount: toCents(amounts.price),
      },
      quantity: 1,
    },
  ];

  if (amounts.tax > 0) {
    items.push({
      price_data: {
        currency: "usd",
        product_data: { name: `${title} — NJ Sales Tax` },
        unit_amount: toCents(amounts.tax),
      },
      quantity: 1,
    });
  }

  return items;
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

      for (const item of items) {
        if (item.type === "AUCTION") {
          const result = await client.models.Auction.get(
            { id: item.id },
            { authMode: "apiKey" } as any,
          );
          const auction = result.data;
          if (!auction) continue;

          if (
            buyerEmail &&
            auction.sellerEmail &&
            buyerEmail.toLowerCase() === auction.sellerEmail.toLowerCase()
          ) {
            return NextResponse.json(
              { error: "Sellers cannot purchase their own auctions." },
              { status: 400 },
            );
          }

          const amounts = calcAuctionAmounts(auction);
          const title = auction.title || "Auction";

          lineItems.push(...buildAuctionLineItems(title, amounts));
          cartMeta.push({
            id: item.id,
            type: "AUCTION",
            title,
            subtotal: fmt(amounts.hammerPrice),
            buyerPremium: fmt(amounts.buyerPremium),
            tax: fmt(amounts.tax),
            amount: fmt(amounts.total),
          });
        } else if (item.type === "MARKETPLACE") {
          const result = await client.models.MarketplaceListing.get(
            { id: item.id },
            { authMode: "apiKey" } as any,
          );
          const listing = result.data;
          if (!listing) continue;

          if (
            buyerEmail &&
            listing.sellerEmail &&
            buyerEmail.toLowerCase() === listing.sellerEmail.toLowerCase()
          ) {
            return NextResponse.json(
              { error: "Sellers cannot purchase their own listings." },
              { status: 400 },
            );
          }

          const amounts = calcListingAmounts(listing);
          const title = listing.title || "Marketplace Listing";

          lineItems.push(...buildListingLineItems(title, amounts));
          cartMeta.push({
            id: item.id,
            type: "MARKETPLACE",
            title,
            subtotal: fmt(amounts.price),
            buyerPremium: "$0.00",
            tax: fmt(amounts.tax),
            amount: fmt(amounts.total),
          });
        }
      }

      if (lineItems.length === 0) {
        return NextResponse.json(
          { error: "No valid items to check out" },
          { status: 400 },
        );
      }

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: buyerEmail || undefined,
        line_items: lineItems,
        shipping_address_collection: { allowed_countries: ["US"] },
        phone_number_collection: { enabled: true },
        metadata: {
          buyerEmail: buyerEmail || "",
          buyerSub: buyerSub || "",
          cartItems: JSON.stringify(cartMeta),
        },
        success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&type=cart`,
        cancel_url: `${siteUrl}/cart`,
      });

      return NextResponse.json({ url: session.url });
    }

    // Single auction checkout
    if (auctionId) {
      const result = await client.models.Auction.get(
        { id: auctionId },
        { authMode: "apiKey" } as any,
      );
      const auction = result.data;

      if (!auction) {
        return NextResponse.json(
          { error: "Auction not found" },
          { status: 404 },
        );
      }

      if (
        buyerEmail &&
        auction.sellerEmail &&
        buyerEmail.toLowerCase() === auction.sellerEmail.toLowerCase()
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

      const title = auction.title || "Auction";

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: buyerEmail || undefined,
        line_items: buildAuctionLineItems(title, amounts),
        shipping_address_collection: { allowed_countries: ["US"] },
        phone_number_collection: { enabled: true },
        metadata: {
          auctionId,
          buyerEmail: buyerEmail || "",
          buyerSub: buyerSub || "",
          subtotal: fmt(amounts.hammerPrice),
          buyerPremium: fmt(amounts.buyerPremium),
          tax: fmt(amounts.tax),
        },
        success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&type=auction`,
        cancel_url: `${siteUrl}/auctions/${auctionId}/results`,
      });

      return NextResponse.json({ url: session.url });
    }

    // Single listing checkout
    if (listingId) {
      const result = await client.models.MarketplaceListing.get(
        { id: listingId },
        { authMode: "apiKey" } as any,
      );
      const listing = result.data;

      if (!listing) {
        return NextResponse.json(
          { error: "Listing not found" },
          { status: 404 },
        );
      }

      if (
        buyerEmail &&
        listing.sellerEmail &&
        buyerEmail.toLowerCase() === listing.sellerEmail.toLowerCase()
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

      const title = listing.title || "Marketplace Listing";

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: buyerEmail || undefined,
        line_items: buildListingLineItems(title, amounts),
        shipping_address_collection: { allowed_countries: ["US"] },
        phone_number_collection: { enabled: true },
        metadata: {
          listingId,
          buyerEmail: buyerEmail || "",
          buyerSub: buyerSub || "",
          subtotal: fmt(amounts.price),
          buyerPremium: "$0.00",
          tax: fmt(amounts.tax),
        },
        success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&type=listing`,
        cancel_url: `${siteUrl}/marketplace/${listingId}`,
      });

      return NextResponse.json({ url: session.url });
    }

    return NextResponse.json(
      { error: "Missing auctionId, listingId, or items" },
      { status: 400 },
    );
  } catch (err: any) {
    console.error("CHECKOUT API ERROR:", err);

    return NextResponse.json(
      { error: err?.message || "Checkout failed" },
      { status: 500 },
    );
  }
}
