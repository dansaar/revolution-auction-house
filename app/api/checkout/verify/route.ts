import { NextResponse } from "next/server";
import Stripe from "stripe";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import outputs from "@/amplify_outputs.json";

Amplify.configure(outputs);

const client = generateClient<Schema>();

export async function POST(req: Request) {
  try {
    const stripeSecretKey =
      process.env.STRIPE_SECRET_KEY || process.env.AMPLIFY_STRIPE_SECRET_KEY;

    if (!stripeSecretKey) {
      return NextResponse.json(
        { error: "Missing Stripe key" },
        { status: 500 },
      );
    }

    const stripe = new Stripe(stripeSecretKey);

    const { sessionId } = await req.json();

    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return NextResponse.json({ paid: false });
    }

    const auctionId = session.metadata?.auctionId || "";
    const listingId = session.metadata?.listingId || "";
    const cartItemsRaw = session.metadata?.cartItems || "";

    const buyerEmail =
      session.metadata?.buyerEmail ||
      session.customer_details?.email ||
      session.customer_email ||
      "";

    let cartItems: any[] = [];

    if (cartItemsRaw) {
      try {
        cartItems = JSON.parse(cartItemsRaw);
      } catch {
        cartItems = [];
      }
    }

    const amount = session.amount_total
      ? `$${(session.amount_total / 100).toFixed(2)}`
      : "$0.00";

    const subtotal = session.metadata?.subtotal || amount;
    const buyerPremium = session.metadata?.buyerPremium || "$0.00";
    const tax = session.metadata?.tax || "$0.00";

    const existingInvoices = await client.models.Invoice.list({
      filter: {
        stripeSessionId: {
          eq: session.id,
        },
      },
      authMode: "apiKey",
    } as any);

    const existingInvoiceData = existingInvoices.data || [];
    const invoiceAlreadyExists = existingInvoiceData.length > 0;

    if (cartItems.length > 0) {
      for (const item of cartItems) {
        if (item.type === "AUCTION") {
          const auctionResult = await client.models.Auction.get(
            { id: item.id },
            { authMode: "apiKey" } as any,
          );

          const auction = auctionResult.data;

          await client.models.Auction.update(
            {
              id: item.id,
              paid: true,
              paidAt: new Date().toISOString(),
              stripeSessionId: session.id,
              status: "PAID",
            },
            { authMode: "apiKey" } as any,
          );

          const invoiceExistsForItem = existingInvoiceData.some(
            (invoice: any) => invoice.auctionId === item.id,
          );

          if (!invoiceExistsForItem) {
            await client.models.Invoice.create(
              {
                type: "AUCTION",
                auctionId: item.id,
                title: auction?.title || item.title || "Auction",
                buyerEmail,
                sellerEmail: auction?.sellerEmail || "",

                subtotal: item.subtotal || item.amount,
                buyerPremium: item.buyerPremium || "$0",
                tax: item.tax || "$0",
                amount: item.amount,

                status: "PAID",
                stripeSessionId: session.id,
                paidAt: new Date().toISOString(),
              },
              { authMode: "apiKey" } as any,
            );
          }
        }

        if (item.type === "MARKETPLACE") {
          const listingResult = await client.models.MarketplaceListing.get(
            { id: item.id },
            { authMode: "apiKey" } as any,
          );

          const listing = listingResult.data;

          await client.models.MarketplaceListing.update(
            {
              id: item.id,
              sold: true,
              paid: true,
              paidAt: new Date().toISOString(),
              stripeSessionId: session.id,
              buyerEmail,
              status: "SOLD",
            },
            { authMode: "apiKey" } as any,
          );

          const invoiceExistsForItem = existingInvoiceData.some(
            (invoice: any) => invoice.listingId === item.id,
          );

          if (!invoiceExistsForItem) {
            await client.models.Invoice.create(
              {
                type: "MARKETPLACE",
                listingId: item.id,
                title: listing?.title || item.title || "Marketplace Listing",
                buyerEmail,
                sellerEmail: listing?.sellerEmail || "",

                subtotal: item.subtotal || item.amount,
                buyerPremium: item.buyerPremium || "$0",
                tax: item.tax || "$0",
                amount: item.amount,

                status: "PAID",
                stripeSessionId: session.id,
                paidAt: new Date().toISOString(),
              },
              { authMode: "apiKey" } as any,
            );
          }
        }
      }

      return NextResponse.json({
        paid: true,
        type: "cart",
        itemCount: cartItems.length,
      });
    }

    if (listingId) {
      const listingResult = await client.models.MarketplaceListing.get(
        { id: listingId },
        { authMode: "apiKey" } as any,
      );

      const listing = listingResult.data;

      await client.models.MarketplaceListing.update(
        {
          id: listingId,
          sold: true,
          paid: true,
          paidAt: new Date().toISOString(),
          stripeSessionId: session.id,
          buyerEmail,
          status: "SOLD",
        },
        {
          authMode: "apiKey",
        } as any,
      );

      if (!invoiceAlreadyExists) {
        await client.models.Invoice.create(
          {
            type: "MARKETPLACE",
            listingId,
            title: listing?.title || "Marketplace Listing",
            buyerEmail,
            sellerEmail: listing?.sellerEmail || "",

            subtotal,
            buyerPremium,
            tax,
            amount,

            status: "PAID",
            stripeSessionId: session.id,
            paidAt: new Date().toISOString(),
          },
          { authMode: "apiKey" } as any,
        );
      }

      return NextResponse.json({ paid: true, listingId });
    }

    if (auctionId) {
      const auctionResult = await client.models.Auction.get({ id: auctionId }, {
        authMode: "apiKey",
      } as any);

      const auction = auctionResult.data;

      await client.models.Auction.update(
        {
          id: auctionId,
          paid: true,
          paidAt: new Date().toISOString(),
          stripeSessionId: session.id,
          status: "PAID",
        },
        {
          authMode: "apiKey",
        } as any,
      );

      if (!invoiceAlreadyExists) {
        await client.models.Invoice.create(
          {
            type: "AUCTION",
            auctionId,
            title: auction?.title || "Auction",
            buyerEmail,
            sellerEmail: auction?.sellerEmail || "",

            subtotal,
            buyerPremium,
            tax,
            amount,

            status: "PAID",
            stripeSessionId: session.id,
            paidAt: new Date().toISOString(),
          },
          { authMode: "apiKey" } as any,
        );
      }

      return NextResponse.json({ paid: true, auctionId });
    }

    return NextResponse.json(
      { error: "Missing auctionId or listingId" },
      { status: 400 },
    );
  } catch (err: any) {
    console.error("CHECKOUT VERIFY ERROR:", err);

    return NextResponse.json(
      {
        error: err?.message || "Payment verification failed",
      },
      { status: 500 },
    );
  }
}
