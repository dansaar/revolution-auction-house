import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import outputs from "@/amplify_outputs.json";
import { serverLogError } from "@/lib/serverLogError";

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

  // Verify HMAC signature if a webhook secret is configured. EasyPost sends
  // X-Hmac-Signature; the value may or may not carry an "hmac-sha256-hex=" prefix,
  // and the secret should be NFKD-normalized per EasyPost's docs.
  if (webhookSecret) {
    const signature = request.headers.get("x-hmac-signature") || "";
    if (!signature) {
      console.error("EASYPOST_WEBHOOK: missing X-Hmac-Signature header");
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }
    const received = signature.replace(/^hmac-sha256-hex=/i, "").trim().toLowerCase();
    const expected = createHmac("sha256", Buffer.from(webhookSecret.normalize("NFKD")))
      .update(Buffer.from(rawBody, "utf8"))
      .digest("hex");

    const a = Buffer.from(received);
    const b = Buffer.from(expected);
    const ok = a.length === b.length && timingSafeEqual(a, b);
    if (!ok) {
      console.error(
        `EASYPOST_WEBHOOK: signature mismatch (received len ${received.length}, expected len ${expected.length}) — check the secret matches the EasyPost webhook`,
      );
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

  // Only act on statuses we map to a meaningful shippingStatus.
  if (!STATUS_MAP[epStatus]) {
    return NextResponse.json({ ok: true });
  }
  const newStatus = STATUS_MAP[epStatus];

  // Use the build-fresh AppSync endpoint + public API key (no stale env vars).
  // The privileged DB write happens inside the updateShippingByTracking Lambda,
  // which is gated by the shared secret below — so the public key can't spoof it.
  const apiUrl = (outputs as any).data?.url as string;
  const apiKey = (outputs as any).data?.api_key as string;
  const secret = process.env.EASYPOST_WEBHOOK_SECRET || "";

  if (!secret) {
    console.warn("EASYPOST_WEBHOOK: EASYPOST_WEBHOOK_SECRET unset, skipping DB update");
    await serverLogError({
      source: "easypost/webhook",
      message:
        "EASYPOST_WEBHOOK_SECRET is not set at runtime — DB update skipped. Add it to the Amplify HOSTING environment variables (not just the backend).",
      context: { trackingCode, status: newStatus },
      severity: "ERROR",
      url: "/api/easypost/webhook",
    });
    return NextResponse.json({ ok: true });
  }

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        query: `mutation UpdateShipping($trackingCode: String!, $status: String!, $secret: String!) {
          updateShippingByTracking(trackingCode: $trackingCode, status: $status, secret: $secret) {
            updated
            message
          }
        }`,
        variables: { trackingCode, status: newStatus, secret },
      }),
    });
    const data = await res.json();
    if (data?.errors) {
      console.error("EASYPOST_WEBHOOK_GQL_ERROR", JSON.stringify(data.errors));
      await serverLogError({
        source: "easypost/webhook",
        message: "updateShippingByTracking GraphQL error",
        context: data.errors,
        severity: "ERROR",
        url: "/api/easypost/webhook",
      });
    } else {
      // Surface the mutation's business result so a no-op isn't silent:
      // updated:0 = no matching order, message:"unauthorized" = secret mismatch.
      const result = data?.data?.updateShippingByTracking;
      console.log("EASYPOST_WEBHOOK_RESULT", JSON.stringify(result));
      if (!result || result.updated === 0 || result.message !== "ok") {
        await serverLogError({
          source: "easypost/webhook",
          message: `updateShippingByTracking did not update an order (${result?.message || "no result"})`,
          context: { trackingCode, status: newStatus, result },
          severity: "WARN",
          url: "/api/easypost/webhook",
        });
      }
    }
  } catch (err) {
    console.error("EASYPOST_WEBHOOK_ERROR", err);
    await serverLogError({
      source: "easypost/webhook",
      message: err instanceof Error ? err.message : String(err),
      context: err instanceof Error ? err.stack : undefined,
      severity: "ERROR",
      url: "/api/easypost/webhook",
    });
  }

  return NextResponse.json({ ok: true });
}
