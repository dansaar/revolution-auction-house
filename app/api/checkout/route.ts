import { NextResponse } from "next/server";
import Stripe from "stripe";

function moneyToCents(value: string | number) {
  return Math.round(
    Number(String(value).replace("$", "").replaceAll(",", "")) * 100,
  );
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

    const { auctionId, listingId, title, amount, buyerEmail } =
      await req.json();

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
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: title,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        auctionId: auctionId || "",
        listingId: listingId || "",
        buyerEmail: buyerEmail || "",
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
