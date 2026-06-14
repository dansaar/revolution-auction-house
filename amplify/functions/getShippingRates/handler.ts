import type { Schema } from "../../data/resource";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/getShippingRates";
import EasyPost from "@easypost/api";

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();
const EASYPOST_API_KEY = (env as any).EASYPOST_API_KEY || "";

export const handler: Schema["getShippingRates"]["functionHandler"] = async (event) => {
  const { itemId, itemType, weight, length, width, height, fromName, fromStreet1, fromStreet2, fromCity, fromState, fromZip, fromPhone } = event.arguments;

  const identity = event.identity as any;
  const callerSub = String(identity?.sub || identity?.claims?.sub || "");
  const callerGroups: string[] = identity?.claims?.["cognito:groups"] ?? [];
  const isAdmin = callerGroups.includes("Admin");

  try {
    if (!EASYPOST_API_KEY) {
      return { shipmentId: null, ratesJson: null, error: "EasyPost not configured" };
    }

    // Verify the caller owns the item
    let toAddress: { name: string; street1: string; street2?: string; city: string; state: string; zip: string; country: string; phone?: string } | null = null;

    // Look up the buyer's phone from their profile so the recipient address has a
    // contact number (UPS/FedEx require a phone on both addresses).
    async function buyerPhoneFor(invoice: any): Promise<string> {
      const buyerUserId = invoice?.buyerUserId;
      if (!buyerUserId) return "";
      try {
        const profile = await client.models.BuyerProfile.get(
          { userId: buyerUserId },
          { authMode: "iam" } as any,
        );
        return ((profile.data as any)?.phoneNumber as string) || "";
      } catch {
        return "";
      }
    }

    if (itemType === "AUCTION") {
      const result = await client.models.Auction.get({ id: itemId }, { authMode: "iam" } as any);
      const item = result.data as any;
      if (!item) return { shipmentId: null, ratesJson: null, error: "Auction not found" };
      if (!isAdmin && item.sellerUserId !== callerSub) {
        return { shipmentId: null, ratesJson: null, error: "Not authorized" };
      }
      const invoiceResult = await client.models.Invoice.list({
        filter: { auctionId: { eq: itemId } },
        authMode: "iam",
      } as any);
      const invoice = (invoiceResult.data || [])[0] as any;
      if (invoice?.shippingLine1) {
        toAddress = {
          name: invoice.shippingName || "",
          street1: invoice.shippingLine1,
          street2: invoice.shippingLine2 || undefined,
          city: invoice.shippingCity || "",
          state: invoice.shippingState || "",
          zip: invoice.shippingZip || "",
          country: invoice.shippingCountry || "US",
          phone: await buyerPhoneFor(invoice),
        };
      }
    } else {
      const result = await client.models.MarketplaceListing.get({ id: itemId }, { authMode: "iam" } as any);
      const item = result.data as any;
      if (!item) return { shipmentId: null, ratesJson: null, error: "Listing not found" };
      if (!isAdmin && item.sellerUserId !== callerSub) {
        return { shipmentId: null, ratesJson: null, error: "Not authorized" };
      }
      const invoiceResult = await client.models.Invoice.list({
        filter: { listingId: { eq: itemId } },
        authMode: "iam",
      } as any);
      const invoice = (invoiceResult.data || [])[0] as any;
      if (invoice?.shippingLine1) {
        toAddress = {
          name: invoice.shippingName || "",
          street1: invoice.shippingLine1,
          street2: invoice.shippingLine2 || undefined,
          city: invoice.shippingCity || "",
          state: invoice.shippingState || "",
          zip: invoice.shippingZip || "",
          country: invoice.shippingCountry || "US",
          phone: await buyerPhoneFor(invoice),
        };
      }
    }

    if (!toAddress) {
      return { shipmentId: null, ratesJson: null, error: "No shipping address on file for this buyer" };
    }

    // Carriers require a phone on both ends; fall back to the seller's number
    // for the recipient if the buyer has none on file.
    const recipientPhone = toAddress.phone || fromPhone || "";

    const ep = new EasyPost(EASYPOST_API_KEY);

    const shipment = await (ep.Shipment as any).create({
      options: {
        label_format: "PDF",
        label_size: "4x6",
      },
      to_address: {
        name: toAddress.name,
        street1: toAddress.street1,
        street2: toAddress.street2 || "",
        city: toAddress.city,
        state: toAddress.state,
        zip: toAddress.zip,
        country: toAddress.country,
        phone: recipientPhone,
      },
      from_address: {
        name: fromName,
        street1: fromStreet1,
        street2: fromStreet2 || "",
        city: fromCity,
        state: fromState,
        zip: fromZip,
        country: "US",
        phone: fromPhone || "",
      },
      parcel: {
        weight: weight,
        ...(length ? { length } : {}),
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
      },
    });

    const rates = ((shipment as any).rates || []).map((r: any) => ({
      id: r.id,
      carrier: r.carrier,
      service: r.service,
      rate: r.rate,
      currency: r.currency,
      delivery_days: r.delivery_days,
      delivery_date: r.delivery_date,
    }));

    // Sort by rate ascending
    rates.sort((a: any, b: any) => parseFloat(a.rate) - parseFloat(b.rate));

    return {
      shipmentId: (shipment as any).id,
      ratesJson: JSON.stringify(rates),
      error: null,
    };
  } catch (err: any) {
    console.error("GET_SHIPPING_RATES_ERROR", err);
    return { shipmentId: null, ratesJson: null, error: err?.message || "Failed to get rates" };
  }
};
