import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function moneyToCents(value: string) {
  return Math.round(
    Number(String(value).replace("$", "").replaceAll(",", "")) * 100,
  );
}

export async function POST(req: Request) {
  const { auctionId, listingId, title, amount } = await req.json();

  if (!title || !amount) {
    return NextResponse.json(
      { error: "Missing title or amount" },
      { status: 400 },
    );
  }

  const successUrl = listingId
    ? `${process.env.NEXT_PUBLIC_SITE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}&type=listing`
    : `${process.env.NEXT_PUBLIC_SITE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}&type=auction`;

  const cancelUrl = listingId
    ? `${process.env.NEXT_PUBLIC_SITE_URL}/marketplace/${listingId}`
    : `${process.env.NEXT_PUBLIC_SITE_URL}/auctions/${auctionId}/results`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: title,
          },
          unit_amount: moneyToCents(amount),
        },
        quantity: 1,
      },
    ],
    metadata: {
      auctionId: auctionId || "",
      listingId: listingId || "",
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  return NextResponse.json({ url: session.url });
}
