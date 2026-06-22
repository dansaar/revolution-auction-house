// TEMPORARY: confirms Sentry capture + email alerts work end to end.
// Visit /api/sentry-test on the deployed site, then check Sentry / your inbox.
// Remove this route once verified. (Sentry only sends in production builds.)
import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const err = new Error(
    "Sentry test error — Revolution Auction House (safe to ignore)",
  );
  Sentry.captureException(err);
  // Ensure the event is delivered before the serverless response returns.
  await Sentry.flush(2000);

  return NextResponse.json({
    ok: true,
    message:
      "Test error sent to Sentry. Check Sentry Issues and your email in a minute.",
  });
}
