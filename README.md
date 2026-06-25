# Revolution Auction House

A high-end Pokémon collectibles **auction + marketplace** platform: live proxy
bidding with reserves and soft-close, a fixed-price/offers marketplace, tiered
buyer verification (incl. proof-of-funds), Stripe checkout (card + ACH), EasyPost
shipping with live tracking, and email/SMS notifications.

> ⚠️ This is **not** stock Next.js. It targets **Next.js 16** (App Router) with
> breaking changes from older versions. Before writing code, read the relevant
> guide in `node_modules/next/dist/docs/` (see `AGENTS.md`).

## Tech stack

- **Next.js 16** (App Router, SSR + route handlers) — hosted on **AWS Amplify Hosting**
- **AWS Amplify Gen 2** backend (`amplify/`): AppSync (GraphQL/DynamoDB models),
  Cognito auth, Lambda functions, S3 storage — all TypeScript via `defineBackend`
- **Stripe** (Checkout, ACH, Financial Connections, Identity)
- **EasyPost** (shipping labels + tracking webhooks)
- **Sentry** (`@sentry/nextjs`) + an in-app `ErrorLog` model as a backstop
- **sonner** toasts, **Vitest** unit tests, **ESLint** (flat config)

## Prerequisites

- Node 22+
- An AWS account with Amplify Gen 2 configured (for backend deploys)
- Stripe, EasyPost, and (optional) Sentry accounts

## Local development

```bash
npm install
npm run dev        # Next dev server at http://localhost:3000
```

`amplify_outputs.json` is **build-generated and gitignored** — it's produced by
the Amplify backend deploy (`ampx pipeline-deploy`) and imported throughout the
app. Public reads use the AppSync **API key**.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Next dev server |
| `npm run build` | `lint:ci` → `test` → `next build` (the full CI gate) |
| `npm run test` | Vitest unit tests (bidding engine, tiers, money) |
| `npm run test:watch` | Vitest watch mode |
| `npm run lint` | Full ESLint (errors + warnings) |
| `npm run lint:ci` | ESLint errors only (what the build enforces) |

## Environment variables

Set in the **Amplify Console → Environment variables**. Note Amplify's split:
build-time vars feed the backend (Lambdas) at synth; the **Next.js runtime (API
routes) only sees vars prefixed `AMPLIFY_`** — so secrets used by route handlers
are duplicated under an `AMPLIFY_` name.

| Variable | Used by | Purpose |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | backend + routes | Stripe API key |
| `AMPLIFY_STRIPE_SECRET_KEY` | Next.js runtime | Same value; readable by API routes |
| `STRIPE_WEBHOOK_SECRET` | stripe webhook route | Verify Stripe webhook signatures |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | client | Stripe.js publishable key |
| `EASYPOST_API_KEY` | shipping Lambdas | Buy labels / fetch rates |
| `EASYPOST_WEBHOOK_SECRET` | backend (Lambda) | Gate the tracking webhook mutation |
| `AMPLIFY_EASYPOST_WEBHOOK_SECRET` | Next.js runtime | Same value; the webhook **route** reads this |
| `ERROR_LOG_SECRET` | logError | Gate the in-app error-log mutation (falls back to the EasyPost secret) |
| `AUTO_VERIFY_TOKEN` | autoVerifyBuyer | Gate Stripe-Identity auto-verify |
| `SMS_AUDIENCE` | notify Lambdas | `all` \| `sellers` \| `none` — who gets SMS |
| `NEXT_PUBLIC_SITE_URL` | app | Canonical site URL (emails, redirects) |
| `NEXT_PUBLIC_CDN_URL` | client | Image CDN base |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry | Override the inlined DSN (optional) |
| `SENTRY_AUTH_TOKEN` | build | Source-map upload (optional) |

`STRIPE_SECRET_KEY` must also be set as an Amplify **backend secret** for the
functions that use it.

## Backend (Amplify Gen 2)

- `amplify/data/resource.ts` — AppSync schema: models (`Auction`,
  `MarketplaceListing`, `Invoice`, `BuyerProfile`, `SellerProfile`, `Bid`,
  `Offer`, `AuctionState`, `WatchlistItem`, `ErrorLog`, …) and custom mutations.
- `amplify/functions/*` — Lambdas: `placeBid` (proxy/soft-close engine),
  `finalizeAuction` / `scheduledFinalize`, `verifyPayment`, shipping
  (`getShippingRates`, `purchaseShippingLabel`, `updateShippingByTracking`),
  notifications (`notifyRelist`, `confirmReceipt`, …), and more.

**Auth model:** identity is keyed on the Cognito **`sub`**, never email (email is
contact data only). Public listing/auction data is `publicApiKey`-readable;
sensitive models (Invoice, BuyerProfile, SellerProfile, Offer, ErrorLog) are
owner/Admin-only, and PII fields on otherwise-public models (e.g. `Bid.maxBid`,
`Bid.bidderEmail`, `AuctionState.*MaxBid`) are field-level restricted to Admin.

## Deployment

Deploys via **AWS Amplify Hosting** on push to `main`:
1. Backend pipeline (`ampx pipeline-deploy`) synthesizes the backend and writes a
   fresh `amplify_outputs.json` (which is why it's gitignored).
2. Frontend build runs `npm run build` (lint → tests → `next build`).

Backend-only TypeScript errors (e.g. in `amplify/functions/**/handler.ts`) surface
**only during backend synth**, not local `next build` — watch the Amplify build
log after backend changes.

External webhooks (Stripe, EasyPost) must point at the deployed URL; update them
(and `NEXT_PUBLIC_SITE_URL`) when the custom domain goes live.

## Testing

`npm run test` runs Vitest over pure logic (the proxy-bid engine, tier math,
money helpers). Add `*.test.ts` beside the unit under test. Full end-to-end
(real Stripe/EasyPost flows) is manual.
