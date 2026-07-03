# Live Video Auctions — Architecture Sketch

**Status: design intent only.** Nothing here is scheduled or built. This page
captures the shape of the live-show feature (Whatnot-style video auctions) so
the design survives until it's staffed. Written 2026-07 against the codebase
as it stood then.

## Product shape

A seller schedules a **show** (a live video stream with a start time and a
queue of items), runs lots one at a time on camera — each open for 30–90
seconds of rapid bidding — and the winner pays through the exact checkout the
site already has. Items that don't sell live fall back to a timed auction or
marketplace listing: same catalog records, different sale mechanism.

One site, one login, one wallet. The buyer shouldn't be able to tell where the
timed-auction system ends and the live system begins — except that the live
one has video.

## What's reused unchanged (the spine)

- **Identity & trust**: Cognito accounts, verification tiers, per-tier bid
  limits, Admin/Seller groups. A user's bid limit applies in both formats.
- **Money**: Stripe checkout (`/api/checkout`), invoices, the webhook, sales
  tax handling. A live win produces the same "you won — pay now" obligation.
- **Fulfillment**: EasyPost labels, shipping status, buyer receipt confirmation.
- **Catalog**: `Auction`/`MarketplaceListing`-style item records with the same
  image pipeline (thumb/medium/full on the CDN).
- **Oversight**: BidAuditLog-equivalent records for every live bid, shill
  monitoring, admin tooling.

## What's new (the live subsystem)

### 1. Video — Amazon IVS
One IVS channel per show. IVS gives ~2–5s latency in standard mode and <1s in
real-time mode; start with low-latency standard (cheaper, adequate when price
updates arrive over the bid channel rather than burned into the video).
**Timed metadata** (`PutMetadata`) carries lot transitions and "going
once/twice" cues in sync with the video frames.

### 2. Bid channel — WebSockets, not request/response
Viewers hold one WebSocket for the whole show (API Gateway WebSockets or
AppSync Events). Bids go up it; price updates, leader changes, and lot state
fan out down it in <100ms. The existing AppSync model subscriptions stay for
the rest of the site but are not on the hot path here.

### 3. Live bid engine — serialize, don't contend
The timed-auction `placeBid` Lambda must NOT be reused. Its correctness tools
are wrong for this format:

| `placeBid` (timed) | Live requirement |
| --- | --- |
| 3s per-user cooldown | Re-bid within ~1s of being outbid |
| Soft close: +5 min extension | Fixed ~30–90s clock, host-controlled |
| Optimistic locking, 8 retries under contention | All bidders on ONE item — contention is the normal case |
| Proxy max-bids | Straight increments (matches live pacing) |

Instead: **one ordered stream per live lot**. All bids for the active lot
funnel to a single serialized processor — one Lambda consumer on a FIFO queue
keyed by lot, or Redis (ElastiCache) with an atomic accept script. No
compare-and-set races: bids are applied in arrival order, losers are told
"outbid" immediately, and the accepted price broadcasts to every socket. A
single serialized consumer comfortably clears hundreds of bids/sec on one lot
— far beyond human live-auction volume.

Bid validation (limits, groups, self-bid) reuses the same rules as `placeBid`,
reading the same BuyerProfile records.

### 4. Show runner — seller UI
The genuinely new frontend surface: start/stop stream, advance the lot queue,
set opening price/increment, trigger going-once/going-twice/sold, void a lot.
Seller-group gated like the existing `/seller` pages.

## Data model additions (sketch)

- `LiveShow`: sellerUserId, title, scheduledAt, ivsChannelArn, status
  (SCHEDULED/LIVE/ENDED), viewer counters.
- `LiveLot`: showId, itemRef (auction/listing id), openingPrice, increment,
  status (QUEUED/ACTIVE/SOLD/PASSED), winnerUserId, finalPrice, endedAt.
- Live bids: append-only per-lot records (audit parity with BidAuditLog).
- On SOLD: write the same Invoice/obligation records the timed flow writes, so
  cart, dashboard, and checkout pick the win up with zero changes.

## Settlement flow

Lot closes → engine writes `LiveLot.SOLD` + winner → invoice/obligation record
→ buyer's existing cart/dashboard shows "pay now" → Stripe checkout →
webhook → shipping. Nothing new after the moment of sale.

## Ops & security notes

- Rate-limit per WebSocket connection (messages/sec) — the WAF on AppSync does
  not cover a separate WebSocket API; add throttling at that layer.
- Verified-tier gating can be stricter for live shows (e.g. require phone
  verification to bid live) — one flag on the existing tier system.
- Host/mod controls: block user from show, void bid, void lot.
- Record shows (IVS auto-record to S3) for dispute resolution — the live
  equivalent of the bid audit log.

## Open questions (decide when scoping)

1. Economics: buyer premium on live lots? Whatnot-style shows usually price it
   into the hammer; the timed side charges a premium. Mixing models needs care
   in invoice copy.
2. IVS real-time vs low-latency standard (cost vs sub-second video).
3. Mobile: live bidding is thumb-driven; the show page must be designed
   mobile-first.
4. Payment friction: require a card on file to bid live (Whatnot does) to cut
   non-payment on impulse wins?
5. Scheduling/discovery surface: where do upcoming shows appear (homepage rail,
   push/SMS to followers)?
