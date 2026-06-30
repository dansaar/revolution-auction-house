import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createRemoteJWKSet, jwtVerify } from "jose";
import outputs from "@/amplify_outputs.json";

const { aws_region: region, user_pool_id: userPoolId } = (outputs as any).auth;
const JWKS = createRemoteJWKSet(
  new URL(
    `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`,
  ),
);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (!stripeSecretKey) {
    return NextResponse.json({ error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
  }

  if (!siteUrl) {
    return NextResponse.json({ error: "Missing NEXT_PUBLIC_SITE_URL" }, { status: 500 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let buyerEmail: string;
  let buyerUserId: string;

  try {
    const { payload } = await jwtVerify(authHeader.slice(7), JWKS);
    buyerEmail = ((payload.email as string) || "").toLowerCase();
    buyerUserId = (payload.sub as string) || "";
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  if (!buyerEmail) {
    return NextResponse.json({ error: "Could not determine buyer email" }, { status: 400 });
  }

  const stripe = new Stripe(stripeSecretKey);

  // Guard against racking up paid verifications: Stripe bills ~$1.50 per
  // *submitted* verification session. A per-buyer idempotency key (cached by
  // Stripe for 24h) makes repeated "Verify" clicks — double-clicks, rapid
  // retries, accidental repeats — return the SAME session instead of creating
  // new billable ones. The buyer can retry within that one session for free;
  // a genuinely new session can only be created after the 24h window.
  let session;
  try {
    session = await stripe.identity.verificationSessions.create(
      {
        type: "document",
        metadata: {
          buyerEmail,
          buyerUserId,
        },
        options: {
          document: {
            allowed_types: ["driving_license", "passport", "id_card"],
            require_live_capture: true,
            require_matching_selfie: true,
          },
        },
        return_url: `${siteUrl}/verify?identity=complete`,
      },
      { idempotencyKey: `identity-verify-${buyerUserId}` },
    );
  } catch (err: any) {
    // If a prior request with this key used different params, Stripe rejects it.
    // Surface a clean message instead of a 500.
    return NextResponse.json(
      { error: err?.message || "Could not start verification. Please try again later." },
      { status: 409 },
    );
  }

  // If Stripe already returned a terminal result for this cached session, don't
  // send the buyer back into a flow that can't proceed.
  if (session.status === "verified") {
    return NextResponse.json(
      { error: "Your identity is already verified.", status: "verified" },
      { status: 409 },
    );
  }
  if (session.status === "processing") {
    return NextResponse.json(
      { error: "Your verification is still processing — please check back shortly.", status: "processing" },
      { status: 409 },
    );
  }

  return NextResponse.json({ url: session.url, sessionId: session.id });
}
