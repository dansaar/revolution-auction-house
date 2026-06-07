import type { Schema } from "../../data/resource";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/verifyPayment";
import Stripe from "stripe";

const { resourceConfig, libraryOptions } =
  await getAmplifyDataClientConfig(env);

Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();

export const handler: Schema["verifyPayment"]["functionHandler"] = async (
  event,
) => {
  try {
    const { sessionId } = event.arguments;

    const identity = event.identity as any;
    const claims = identity?.claims ?? {};
    const callerEmail = (claims["email"] as string | undefined)?.toLowerCase();

    if (!callerEmail) {
      return { paid: false, error: "Unauthorized" };
    }

    const stripeKey = (env as any).STRIPE_SECRET_KEY;

    if (!stripeKey) {
      return { paid: false, error: "Missing Stripe key" };
    }

    const stripe = new Stripe(stripeKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return { paid: false };
    }

    const sessionBuyerEmail = (
      session.metadata?.buyerEmail ||
      session.customer_details?.email ||
      session.customer_email ||
      ""
    ).toLowerCase();

    if (!sessionBuyerEmail || sessionBuyerEmail !== callerEmail) {
      return { paid: false, error: "Unauthorized" };
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
      filter: { stripeSessionId: { eq: session.id } },
    });
    const existingInvoiceData = existingInvoices.data || [];

    // Cart checkout
    if (cartItems.length > 0) {
      for (const item of cartItems) {
        if (item.type === "AUCTION") {
          await client.models.Auction.update({
            id: item.id,
            paid: true,
            paidAt: new Date().toISOString(),
            stripeSessionId: session.id,
            status: "PAID",
          });

          const invoiceExistsForItem = existingInvoiceData.some(
            (inv: any) => inv.auctionId === item.id,
          );

          if (!invoiceExistsForItem) {
            const auctionResult = await client.models.Auction.get({
              id: item.id,
            });

            await client.models.Invoice.create({
              type: "AUCTION",
              auctionId: item.id,
              title: auctionResult.data?.title || item.title || "Auction",
              buyerEmail,
              sellerEmail: auctionResult.data?.sellerEmail || "",
              subtotal: item.subtotal || item.amount,
              buyerPremium: item.buyerPremium || "$0.00",
              tax: item.tax || "$0.00",
              amount: item.amount,
              status: "PAID",
              stripeSessionId: session.id,
              paidAt: new Date().toISOString(),
            });
          }
        } else if (item.type === "MARKETPLACE") {
          await client.models.MarketplaceListing.update({
            id: item.id,
            sold: true,
            paid: true,
            paidAt: new Date().toISOString(),
            stripeSessionId: session.id,
            buyerEmail,
            status: "SOLD",
          });

          const invoiceExistsForItem = existingInvoiceData.some(
            (inv: any) => inv.listingId === item.id,
          );

          if (!invoiceExistsForItem) {
            const listingResult = await client.models.MarketplaceListing.get({
              id: item.id,
            });

            await client.models.Invoice.create({
              type: "MARKETPLACE",
              listingId: item.id,
              title:
                listingResult.data?.title ||
                item.title ||
                "Marketplace Listing",
              buyerEmail,
              sellerEmail: listingResult.data?.sellerEmail || "",
              subtotal: item.subtotal || item.amount,
              buyerPremium: "$0.00",
              tax: item.tax || "$0.00",
              amount: item.amount,
              status: "PAID",
              stripeSessionId: session.id,
              paidAt: new Date().toISOString(),
            });
          }
        }
      }

      return { paid: true, type: "cart", itemCount: cartItems.length };
    }

    // Single listing
    if (listingId) {
      await client.models.MarketplaceListing.update({
        id: listingId,
        sold: true,
        paid: true,
        paidAt: new Date().toISOString(),
        stripeSessionId: session.id,
        buyerEmail,
        status: "SOLD",
      });

      const invoiceAlreadyExists = existingInvoiceData.length > 0;

      if (!invoiceAlreadyExists) {
        const listingResult = await client.models.MarketplaceListing.get({
          id: listingId,
        });

        await client.models.Invoice.create({
          type: "MARKETPLACE",
          listingId,
          title: listingResult.data?.title || "Marketplace Listing",
          buyerEmail,
          sellerEmail: listingResult.data?.sellerEmail || "",
          subtotal,
          buyerPremium,
          tax,
          amount,
          status: "PAID",
          stripeSessionId: session.id,
          paidAt: new Date().toISOString(),
        });
      }

      return { paid: true, type: "listing", listingId };
    }

    // Single auction
    if (auctionId) {
      await client.models.Auction.update({
        id: auctionId,
        paid: true,
        paidAt: new Date().toISOString(),
        stripeSessionId: session.id,
        status: "PAID",
      });

      const invoiceAlreadyExists = existingInvoiceData.length > 0;

      if (!invoiceAlreadyExists) {
        const auctionResult = await client.models.Auction.get({ id: auctionId });

        await client.models.Invoice.create({
          type: "AUCTION",
          auctionId,
          title: auctionResult.data?.title || "Auction",
          buyerEmail,
          sellerEmail: auctionResult.data?.sellerEmail || "",
          subtotal,
          buyerPremium,
          tax,
          amount,
          status: "PAID",
          stripeSessionId: session.id,
          paidAt: new Date().toISOString(),
        });
      }

      return { paid: true, type: "auction", auctionId };
    }

    return { paid: false, error: "Missing auctionId, listingId, or cartItems" };
  } catch (err: any) {
    console.error("VERIFY PAYMENT ERROR", err);
    return { paid: false, error: err?.message || "Payment verification failed" };
  }
};
