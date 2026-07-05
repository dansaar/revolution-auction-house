/**
 * Bidding load test
 *
 * Config (AppSync URL, user-pool client id, region) is read from
 * amplify_outputs.json at the repo root — no hardcoded endpoints. Override the
 * file with --outputs <path> if pointing at a non-default env.
 *
 * Usage:
 *   node scripts/load-test-bidding.mjs \
 *     --auction-id <id> \
 *     --users-file scripts/test-users.json \
 *     --waves 5 \
 *     --concurrency 10 \
 *     --start-bid 50
 *
 * You supply your own users file (NOT committed — it holds plaintext
 * credentials). Format:
 *   [
 *     { "email": "user1@example.com", "password": "Pass1!" },
 *     { "email": "user2@example.com", "password": "Pass2!" }
 *   ]
 *
 * PREREQUISITES:
 *   1. The user-pool app client needs the USER_PASSWORD_AUTH flow (currently
 *      enabled). If a future deploy disables it, auth fails with "Auth flow
 *      not enabled for this client" — re-enable it on the client and the
 *      runtime hint below will point you here.
 *   2. Cognito threat protection is ENFORCED on this pool, which can flag
 *      scripted logins as risky and block them. For a load-test window, use
 *      accounts with known-good history, or relax the risk config temporarily.
 *
 * To stress the version-conflict retry path you need multiple users
 * (same-user bids are rate-limited to one per 3s by the cooldown check).
 *
 * To test raw concurrency without the cooldown, temporarily set
 * BID_COOLDOWN_MS = 0 in placeBid/handler.ts, deploy, then restore it.
 */

import { CognitoIdentityProviderClient, InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function argEarly(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

// Endpoints come from the generated outputs, not stale hardcoded values.
const OUTPUTS_PATH = resolve(
  __dirname,
  "..",
  argEarly("outputs", "amplify_outputs.json"),
);
let outputs;
try {
  outputs = JSON.parse(await readFile(OUTPUTS_PATH, "utf8"));
} catch {
  console.error(`ERROR: could not read ${OUTPUTS_PATH}`);
  console.error("Run `npx ampx generate outputs --branch main --app-id <id>` first.");
  process.exit(1);
}

const APPSYNC_URL = outputs?.data?.url;
const USER_POOL_CLIENT_ID = outputs?.auth?.user_pool_client_id;
const REGION = outputs?.data?.aws_region || outputs?.auth?.aws_region || "us-east-1";

if (!APPSYNC_URL || !USER_POOL_CLIENT_ID) {
  console.error("ERROR: amplify_outputs.json is missing data.url or auth.user_pool_client_id");
  process.exit(1);
}

// ── CLI args ──────────────────────────────────────────────────────────────────

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return process.argv[i + 1];
}

const AUCTION_ID  = arg("auction-id", "");
const USERS_FILE  = arg("users-file", "scripts/test-users.json");
const WAVES       = parseInt(arg("waves", "5"), 10);
const CONCURRENCY = parseInt(arg("concurrency", "10"), 10);
const START_BID   = parseInt(arg("start-bid", "50"), 10);
const BID_SPREAD  = parseInt(arg("bid-spread", "0"), 10); // 0 = all same; >0 = spread bids i*(spread/concurrency) apart
const WAVE_DELAY  = parseInt(arg("wave-delay", "500"), 10); // ms between waves; 0 = fire continuously

if (!AUCTION_ID) {
  console.error("ERROR: --auction-id is required");
  process.exit(1);
}

// ── Auth ──────────────────────────────────────────────────────────────────────

const cognito = new CognitoIdentityProviderClient({ region: REGION });

async function getToken(email, password) {
  const res = await cognito.send(new InitiateAuthCommand({
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: USER_POOL_CLIENT_ID,
    AuthParameters: { USERNAME: email, PASSWORD: password },
  }));
  if (!res.AuthenticationResult?.IdToken) {
    // e.g. a challenge (MFA/new password) instead of tokens.
    throw new Error(`no tokens returned (challenge: ${res.ChallengeName || "unknown"})`);
  }
  return res.AuthenticationResult.IdToken;
}

// ── GraphQL ───────────────────────────────────────────────────────────────────

const PLACE_BID_MUTATION = `
  mutation PlaceBid($auctionId: String!, $maxBid: Int!, $bidRequestId: String) {
    placeBid(auctionId: $auctionId, maxBid: $maxBid, bidRequestId: $bidRequestId) {
      success
      message
      currentPrice
      winner
    }
  }
`;

async function placeBid(token, auctionId, maxBid, bidRequestId) {
  const t0 = Date.now();
  try {
    const res = await fetch(APPSYNC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: token,
      },
      body: JSON.stringify({
        query: PLACE_BID_MUTATION,
        variables: { auctionId, maxBid, bidRequestId },
      }),
    });

    const json = await res.json();
    const ms = Date.now() - t0;
    const data = json?.data?.placeBid;
    const errors = json?.errors;

    if (errors?.length) {
      return { ok: false, reason: "GRAPHQL_ERROR", message: errors[0]?.message, ms };
    }

    return {
      ok: data?.success ?? false,
      reason: data?.success ? "ACCEPTED" : "REJECTED",
      message: data?.message,
      currentPrice: data?.currentPrice,
      winner: data?.winner,
      ms,
    };
  } catch (err) {
    return { ok: false, reason: "FETCH_ERROR", message: err.message, ms: Date.now() - t0 };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

let users;
try {
  users = JSON.parse(await readFile(USERS_FILE, "utf8"));
} catch {
  console.error(`ERROR: could not read ${USERS_FILE}`);
  console.error('Create it with: [{"email":"...","password":"..."}]  (not committed — plaintext credentials)');
  process.exit(1);
}

console.log(`\nAuthenticating ${users.length} user(s)...`);

const tokens = [];
let sawFlowDisabled = false;
for (const u of users) {
  try {
    const token = await getToken(u.email, u.password);
    tokens.push({ email: u.email, token });
    console.log(`  ✓ ${u.email}`);
  } catch (err) {
    console.error(`  ✗ ${u.email}: ${err.message}`);
    if (/auth flow not enabled/i.test(err.message || "")) sawFlowDisabled = true;
  }
}

if (sawFlowDisabled) {
  console.error(
    "\nHINT: enable the USER_PASSWORD_AUTH flow on user-pool client " +
      `${USER_POOL_CLIENT_ID} (see the prerequisites at the top of this file).`,
  );
}

if (tokens.length === 0) {
  console.error("No users authenticated — aborting.");
  process.exit(1);
}

console.log(`\nTarget: auction ${AUCTION_ID}`);
console.log(`Config: ${WAVES} waves × ${CONCURRENCY} concurrent bids`);
console.log(`Spread: ${BID_SPREAD > 0 ? `$${BID_SPREAD} across bids (forces version conflicts)` : "none (same maxBid per wave)"}`);
console.log(`Users:  ${tokens.length} (bids rotate round-robin across users)\n`);

const allResults = [];
let currentBid = START_BID;

for (let wave = 0; wave < WAVES; wave++) {
  const waveStart = Date.now();
  const step = BID_SPREAD > 0 ? Math.ceil(BID_SPREAD / CONCURRENCY) : 0;
  const bids = Array.from({ length: CONCURRENCY }, (_, i) => {
    const userIdx = i % tokens.length;
    const { token } = tokens[userIdx];
    const bidRequestId = `loadtest-w${wave}-b${i}-${Date.now()}`;
    // Spread: each bid is slightly higher so all are above minimum and race concurrently
    const maxBid = currentBid + i * step;
    return placeBid(token, AUCTION_ID, maxBid, bidRequestId);
  });

  const results = await Promise.all(bids);
  const waveMs = Date.now() - waveStart;

  const accepted   = results.filter(r => r.reason === "ACCEPTED");
  const rejected   = results.filter(r => r.reason === "REJECTED");
  const errors     = results.filter(r => r.reason === "GRAPHQL_ERROR" || r.reason === "FETCH_ERROR");
  const avgMs      = Math.round(results.reduce((s, r) => s + r.ms, 0) / results.length);
  const maxMs      = Math.max(...results.map(r => r.ms));

  // Advance bid for next wave so it's always above minimum
  const lastAccepted = accepted[accepted.length - 1];
  if (lastAccepted?.currentPrice) {
    currentBid = lastAccepted.currentPrice + 100;
  } else {
    currentBid += 100;
  }

  console.log(`Wave ${wave + 1}/${WAVES}  (${waveMs}ms wall-clock)`);
  console.log(`  Accepted: ${accepted.length}  Rejected: ${rejected.length}  Errors: ${errors.length}`);
  console.log(`  Latency:  avg ${avgMs}ms  max ${maxMs}ms`);

  if (accepted.length > 0) {
    const last = accepted[accepted.length - 1];
    console.log(`  Price now: $${last.currentPrice}  Leader: ${last.winner}`);
  }

  if (rejected.length > 0) {
    const reasons = {};
    for (const r of rejected) {
      const key = r.message?.split(".")[0]?.trim() || "unknown";
      reasons[key] = (reasons[key] || 0) + 1;
    }
    console.log(`  Reject reasons: ${JSON.stringify(reasons)}`);
  }

  if (errors.length > 0) {
    console.log(`  Error sample: ${errors[0].message}`);
  }

  console.log();
  allResults.push(...results);

  if (wave < WAVES - 1 && WAVE_DELAY > 0) await new Promise(r => setTimeout(r, WAVE_DELAY));
}

// ── Summary ───────────────────────────────────────────────────────────────────

const totalAccepted = allResults.filter(r => r.reason === "ACCEPTED").length;
const totalRejected = allResults.filter(r => r.reason === "REJECTED").length;
const totalErrors   = allResults.filter(r => r.reason === "GRAPHQL_ERROR" || r.reason === "FETCH_ERROR").length;
const p50           = allResults.map(r => r.ms).sort((a,b)=>a-b)[Math.floor(allResults.length * 0.5)];
const p95           = allResults.map(r => r.ms).sort((a,b)=>a-b)[Math.floor(allResults.length * 0.95)];
const p99           = allResults.map(r => r.ms).sort((a,b)=>a-b)[Math.floor(allResults.length * 0.99)];

console.log("════════════════════════════════════════");
console.log("SUMMARY");
console.log(`Total bids:  ${allResults.length}`);
console.log(`Accepted:    ${totalAccepted}  (${Math.round(totalAccepted/allResults.length*100)}%)`);
console.log(`Rejected:    ${totalRejected}  (${Math.round(totalRejected/allResults.length*100)}%)`);
console.log(`Errors:      ${totalErrors}`);
console.log(`Latency p50: ${p50}ms  p95: ${p95}ms  p99: ${p99}ms`);
console.log("════════════════════════════════════════");
