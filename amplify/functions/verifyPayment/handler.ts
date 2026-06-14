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
    // callerSub is empty when called via apiKey (e.g. Stripe webhook) — identity is null
    const callerSub = (claims["sub"] as string | undefined) || "";
    const isWebhookCall = !callerSub;

    const stripeKey = (env as any).STRIPE_SECRET_KEY;

    if (!stripeKey) {
      return { paid: false, error: "Missing Stripe key" };
    }

    const stripe = new Stripe(stripeKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return { paid: false };
    }

    // Ownership check — skip when called from the webhook (Stripe already verified the signature)
    if (!isWebhookCall) {
      const sessionBuyerSub = session.metadata?.buyerSub || "";
      const sessionBuyerEmail = (
        session.metadata?.buyerEmail ||
        session.customer_details?.email ||
        session.customer_email ||
        ""
      ).toLowerCase();
      const callerEmail = (claims["email"] as string | undefined)?.toLowerCase() || "";

      const subMatch = sessionBuyerSub && callerSub && sessionBuyerSub === callerSub;
      const emailMatch = sessionBuyerEmail && callerEmail && sessionBuyerEmail === callerEmail;

      if (!subMatch && !emailMatch) {
        return { paid: false, error: "Unauthorized" };
      }
    }

    const auctionId = session.metadata?.auctionId || "";
    const listingId = session.metadata?.listingId || "";
    const cartItemsRaw = session.metadata?.cartItems || "";

    const buyerEmailRaw =
      session.metadata?.buyerEmail ||
      session.customer_details?.email ||
      session.customer_email ||
      "";
    const buyerEmail = buyerEmailRaw.toLowerCase();
    // buyerUserId: used for Invoice owner auth (sub-based, no casing issues)
    // Falls back to metadata when called via apiKey (webhook path, callerSub is empty)
    const buyerUserId = callerSub || session.metadata?.buyerSub || "";

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

    const shippingObj = (session as any).shipping_details
      || (session as any).collected_information?.shipping_details
      || (session as any).shipping
      || null;
    // Fall back to billing address when no separate shipping was collected
    const shippingAddress = shippingObj?.address || session.customer_details?.address || null;
    const shippingName = shippingObj?.name || session.customer_details?.name || "";
    // Phone collected by Stripe Checkout (phone_number_collection) — used as the
    // recipient phone for shipping labels (UPS/FedEx require it).
    const shippingPhone = (session.customer_details as any)?.phone || "";
    const shippingFields = shippingAddress ? {
      shippingName,
      shippingPhone,
      shippingLine1:   shippingAddress.line1 || "",
      shippingLine2:   shippingAddress.line2 || "",
      shippingCity:    shippingAddress.city || "",
      shippingState:   shippingAddress.state || "",
      shippingZip:     shippingAddress.postal_code || "",
      shippingCountry: shippingAddress.country || "",
    } : {};

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
              buyerEmail: buyerEmailRaw,
              buyerUserId,
              sellerEmail: auctionResult.data?.sellerEmail || "",
              sellerUserId: auctionResult.data?.sellerUserId || "",
              subtotal: item.subtotal || item.amount,
              buyerPremium: item.buyerPremium || "$0.00",
              tax: item.tax || "$0.00",
              amount: item.amount,
              status: "PAID",
              stripeSessionId: session.id,
              paidAt: new Date().toISOString(),
              ...shippingFields,
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
              buyerEmail: buyerEmailRaw,
              buyerUserId,
              sellerEmail: listingResult.data?.sellerEmail || "",
              sellerUserId: listingResult.data?.sellerUserId || "",
              subtotal: item.subtotal || item.amount,
              buyerPremium: "$0.00",
              tax: item.tax || "$0.00",
              amount: item.amount,
              status: "PAID",
              stripeSessionId: session.id,
              paidAt: new Date().toISOString(),
              ...shippingFields,
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
          buyerEmail: buyerEmailRaw,
          buyerUserId,
          sellerEmail: listingResult.data?.sellerEmail || "",
          sellerUserId: listingResult.data?.sellerUserId || "",
          subtotal,
          buyerPremium,
          tax,
          amount,
          status: "PAID",
          stripeSessionId: session.id,
          paidAt: new Date().toISOString(),
          ...shippingFields,
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
          buyerEmail: buyerEmailRaw,
          buyerUserId,
          sellerEmail: auctionResult.data?.sellerEmail || "",
          sellerUserId: auctionResult.data?.sellerUserId || "",
          subtotal,
          buyerPremium,
          tax,
          amount,
          status: "PAID",
          stripeSessionId: session.id,
          paidAt: new Date().toISOString(),
          ...shippingFields,
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
