import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function moneyToCents(value: string) {
  return Math.round(
    Number(String(value).replace("$", "").replaceAll(",", "")) * 100,
  );
}

export async function POST(req: Request) {
  const { auctionId, title, amount } = await req.json();

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
      auctionId,
    },
    success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/auctions/${auctionId}/results`,
  });

  return NextResponse.json({ url: session.url });
}
