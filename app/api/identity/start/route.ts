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

  const session = await stripe.identity.verificationSessions.create({
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
  });

  return NextResponse.json({ url: session.url, sessionId: session.id });
}
