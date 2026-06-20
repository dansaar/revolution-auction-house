import { NextResponse } from "next/server";
import outputs from "@/amplify_outputs.json";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import Stripe from "stripe";

const verifier = CognitoJwtVerifier.create({
  userPoolId: outputs.auth.user_pool_id,
  tokenUse: "id",
  clientId: outputs.auth.user_pool_client_id,
});

type Check = { ok: boolean; label: string; detail: string };

export async function GET(req: Request) {
  // Admin only.
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let payload: any;
  try {
    payload = await verifier.verify(token);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const groups: string[] = payload["cognito:groups"] || [];
  if (!groups.includes("Admin")) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const checks: Check[] = [];
  const secret = process.env.STRIPE_SECRET_KEY || "";
  const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
  const whsec = process.env.STRIPE_WEBHOOK_SECRET || "";

  const secretMode = secret.startsWith("sk_test_") ? "test" : secret.startsWith("sk_live_") ? "live" : "unknown";
  const pkMode = pk.startsWith("pk_test_") ? "test" : pk.startsWith("pk_live_") ? "live" : "unknown";

  // 1. Secret key present + valid
  checks.push({
    ok: !!secret,
    label: "STRIPE_SECRET_KEY set",
    detail: secret ? `mode: ${secretMode}` : "missing",
  });

  // 2. Publishable key present + mode matches
  checks.push({
    ok: !!pk && pkMode === secretMode,
    label: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY set",
    detail: !pk ? "missing" : pkMode === secretMode ? `mode: ${pkMode}` : `MODE MISMATCH (pk=${pkMode}, sk=${secretMode})`,
  });

  // 3. Webhook secret present
  checks.push({
    ok: !!whsec,
    label: "STRIPE_WEBHOOK_SECRET set",
    detail: whsec ? "present" : "missing — webhook events won't verify",
  });

  if (!secret) {
    return NextResponse.json({ mode: secretMode, checks });
  }

  const stripe = new Stripe(secret);

  // 4. Secret key actually works
  try {
    await stripe.balance.retrieve();
    checks.push({ ok: true, label: "Stripe API reachable", detail: "balance.retrieve ok" });
  } catch (e: any) {
    checks.push({ ok: false, label: "Stripe API reachable", detail: e?.message || "failed" });
    return NextResponse.json({ mode: secretMode, checks });
  }

  // 5. ACH (us_bank_account) enabled — probe by creating a tiny PaymentIntent, then cancel it.
  try {
    const pi = await stripe.paymentIntents.create({
      amount: 50,
      currency: "usd",
      payment_method_types: ["us_bank_account"],
      capture_method: "manual",
    });
    await stripe.paymentIntents.cancel(pi.id).catch(() => {});
    checks.push({ ok: true, label: "ACH Direct Debit enabled", detail: "us_bank_account accepted" });
  } catch (e: any) {
    checks.push({
      ok: false,
      label: "ACH Direct Debit enabled",
      detail: `${e?.message || "rejected"} — enable in Settings → Payments → Payment methods`,
    });
  }

  // 6. Financial Connections works — create a throwaway customer + FC session, then clean up.
  try {
    const cust = await stripe.customers.create({ metadata: { healthcheck: "1" } });
    const fc = await stripe.financialConnections.sessions.create({
      account_holder: { type: "customer", customer: cust.id },
      permissions: ["balances"],
      filters: { countries: ["US"] },
    });
    await stripe.customers.del(cust.id).catch(() => {});
    checks.push({
      ok: !!fc.client_secret,
      label: "Financial Connections (proof of funds)",
      detail: fc.client_secret ? "session created ok" : "no client_secret",
    });
  } catch (e: any) {
    checks.push({
      ok: false,
      label: "Financial Connections (proof of funds)",
      detail: `${e?.message || "failed"} — enable Financial Connections in Stripe`,
    });
  }

  const allOk = checks.every((c) => c.ok);
  return NextResponse.json({ mode: secretMode, allOk, checks });
}
