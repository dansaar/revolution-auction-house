import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

// Maps EasyPost tracker statuses to our internal shippingStatus values
const STATUS_MAP: Record<string, string> = {
  pre_transit: "SHIPPED",
  in_transit: "IN_TRANSIT",
  out_for_delivery: "OUT_FOR_DELIVERY",
  available_for_pickup: "OUT_FOR_DELIVERY",
  delivered: "DELIVERED",
  return_to_sender: "RETURN_TO_SENDER",
  failure: "DELIVERY_FAILED",
  unknown: "SHIPPED",
};

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.EASYPOST_WEBHOOK_SECRET;
  const rawBody = await request.text();

  // Verify HMAC signature if a webhook secret is configured
  if (webhookSecret) {
    const signature = request.headers.get("x-hmac-signature");
    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }
    const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    if (`hmac-sha256-hex=${expected}` !== signature) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (event.description !== "tracker.updated" && event.description !== "tracker.created") {
    return NextResponse.json({ ok: true });
  }

  const tracker = event.result;
  if (!tracker?.tracking_code) {
    return NextResponse.json({ ok: true });
  }

  const trackingCode: string = tracker.tracking_code;
  const epStatus: string = tracker.status || "unknown";
  const newStatus = STATUS_MAP[epStatus] || "SHIPPED";

  // Only update DB when status advances to something meaningful
  if (!STATUS_MAP[epStatus]) {
    return NextResponse.json({ ok: true });
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
  const apiKey = process.env.AMPLIFY_API_KEY || "";

  if (!apiUrl || !apiKey) {
    console.warn("EASYPOST_WEBHOOK: missing API URL or key, skipping DB update");
    return NextResponse.json({ ok: true });
  }

  // GraphQL calls to update Auction and MarketplaceListing by tracking number
  const updateAuctionQuery = /* GraphQL */ `
    query FindAuctionByTracking($filter: ModelAuctionFilterInput) {
      listAuctions(filter: $filter) {
        items { id shippingStatus }
      }
    }
  `;

  try {
    // Search Auctions for this tracking number
    const auctionSearch = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        query: updateAuctionQuery,
        variables: { filter: { trackingNumber: { eq: trackingCode } } },
      }),
    });
    const auctionData = await auctionSearch.json();
    const auctions = auctionData?.data?.listAuctions?.items || [];

    for (const auction of auctions) {
      if (shouldAdvance(auction.shippingStatus, newStatus)) {
        const updates: Record<string, any> = { id: auction.id, shippingStatus: newStatus };
        if (newStatus === "DELIVERED") updates.deliveredAt = new Date().toISOString();
        await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey },
          body: JSON.stringify({
            query: `mutation UpdateAuction($input: UpdateAuctionInput!) { updateAuction(input: $input) { id } }`,
            variables: { input: updates },
          }),
        });
      }
    }

    // Search MarketplaceListings for this tracking number
    const listingSearch = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        query: `query FindListingByTracking($filter: ModelMarketplaceListingFilterInput) {
          listMarketplaceListings(filter: $filter) { items { id shippingStatus } }
        }`,
        variables: { filter: { trackingNumber: { eq: trackingCode } } },
      }),
    });
    const listingData = await listingSearch.json();
    const listings = listingData?.data?.listMarketplaceListings?.items || [];

    for (const listing of listings) {
      if (shouldAdvance(listing.shippingStatus, newStatus)) {
        const updates: Record<string, any> = { id: listing.id, shippingStatus: newStatus };
        if (newStatus === "DELIVERED") updates.deliveredAt = new Date().toISOString();
        await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey },
          body: JSON.stringify({
            query: `mutation UpdateMarketplaceListing($input: UpdateMarketplaceListingInput!) { updateMarketplaceListing(input: $input) { id } }`,
            variables: { input: updates },
          }),
        });
      }
    }
  } catch (err) {
    console.error("EASYPOST_WEBHOOK_ERROR", err);
  }

  return NextResponse.json({ ok: true });
}

const STATUS_ORDER = ["PAID", "SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"];

function shouldAdvance(current: string | null | undefined, next: string): boolean {
  const currentIdx = STATUS_ORDER.indexOf(current || "PAID");
  const nextIdx = STATUS_ORDER.indexOf(next);
  return nextIdx > currentIdx;
}
