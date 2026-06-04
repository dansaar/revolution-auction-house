import { NextResponse } from "next/server";
import Stripe from "stripe";

function moneyToCents(value: string | number) {
  return Math.round(
    Number(String(value).replace("$", "").replaceAll(",", "")) * 100,
  );
}

function buildLineItemsForItem(item: any) {
  const subtotal = item.subtotal || item.amount;
  const buyerPremium = item.buyerPremium || "$0.00";
  const tax = item.tax || "$0.00";

  const lineItems: any[] = [
    {
      price_data: {
        currency: "usd",
        product_data: {
          name: item.title,
        },
        unit_amount: moneyToCents(subtotal),
      },
      quantity: 1,
    },
  ];

  if (moneyToCents(buyerPremium) > 0) {
    lineItems.push({
      price_data: {
        currency: "usd",
        product_data: {
          name: `${item.title} — Buyer Premium`,
        },
        unit_amount: moneyToCents(buyerPremium),
      },
      quantity: 1,
    });
  }

  if (moneyToCents(tax) > 0) {
    lineItems.push({
      price_data: {
        currency: "usd",
        product_data: {
          name: `${item.title} — NJ Sales Tax`,
        },
        unit_amount: moneyToCents(tax),
      },
      quantity: 1,
    });
  }

  return lineItems;
}
export async function POST(req: Request) {
  try {
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

    const {
      auctionId,
      listingId,
      title,
      amount,
      buyerEmail,
      items,
      subtotal,
      buyerPremium,
      tax,
    } = await req.json();

    if (Array.isArray(items) && items.length > 0) {
      const lineItems = items.flatMap((item: any) =>
        buildLineItemsForItem(item),
      );

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: lineItems,
        metadata: {
          buyerEmail: buyerEmail || "",
          cartItems: JSON.stringify(
            items.map((item: any) => ({
              id: item.id,
              type: item.type,
              title: item.title,
              subtotal: item.subtotal || item.amount,
              buyerPremium: item.buyerPremium || "$0.00",
              tax: item.tax || "$0.00",
              amount: item.amount,
            })),
          ),
        },
        success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&type=cart`,
        cancel_url: `${siteUrl}/cart`,
      });

      return NextResponse.json({ url: session.url });
    }

    const amountCents = moneyToCents(amount);

    if (!title || !amount || !amountCents || amountCents < 50) {
      return NextResponse.json(
        { error: "Missing title or invalid amount" },
        { status: 400 },
      );
    }

    const successUrl = listingId
      ? `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&type=listing`
      : `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&type=auction`;

    const cancelUrl = listingId
      ? `${siteUrl}/marketplace/${listingId}`
      : `${siteUrl}/auctions/${auctionId}/results`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: buildLineItemsForItem({
        title,
        subtotal: subtotal || amount,
        buyerPremium: buyerPremium || "$0.00",
        tax: tax || "$0.00",
        amount,
      }),
      metadata: {
        auctionId: auctionId || "",
        listingId: listingId || "",
        buyerEmail: buyerEmail || "",
        subtotal: subtotal || amount || "",
        buyerPremium: buyerPremium || "$0.00",
        tax: tax || "$0.00",
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("CHECKOUT API ERROR:", err);

    return NextResponse.json(
      {
        error: err?.message || "Checkout failed",
      },
      { status: 500 },
    );
  }
}
