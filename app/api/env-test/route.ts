import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    hasStripeKey: !!process.env.AMPLIFY_STRIPE_SECRET_KEY,
    hasRegularStripeKey: !!process.env.STRIPE_SECRET_KEY,
    hasAmplifyStripeKey: !!process.env.AMPLIFY_STRIPE_SECRET_KEY,
    hasSiteUrl: !!process.env.NEXT_PUBLIC_SITE_URL,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || null,
    AmplifyStripeKey: !!process.env.STRIPE_SECRET_KEY,
  });
}