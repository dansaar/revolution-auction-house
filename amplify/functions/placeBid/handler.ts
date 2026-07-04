import type { Schema } from "../../data/resource";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/placeBid";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  BatchGetCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { getIncrement, resolveBid } from "./bidEngine";

const { resourceConfig, libraryOptions } =
  await getAmplifyDataClientConfig(env);

Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const snsClient = new SNSClient({});
const sesClient = new SESClient({});

const SITE_URL = (env as any).SITE_URL || "https://www.revolutionauctionhouse.com";
const FROM_EMAIL = (env as any).FROM_EMAIL || "";
// Buyer SMS (outbid, watchlist) only when audience is "all".
const BUYER_SMS_ENABLED = ((env as any).SMS_AUDIENCE || "all") === "all";

async function sendOutbidSms({
  to,
  auctionTitle,
  auctionId,
  newPrice,
}: {
  to: string;
  auctionTitle: string;
  auctionId: string;
  newPrice: string;
}) {
  if (!to) return;
  const link = `${SITE_URL}/auctions/${auctionId}`;
  await snsClient.send(
    new PublishCommand({
      PhoneNumber: to,
      Message: `Revolution: You've been outbid on "${auctionTitle}". New price: ${newPrice}. Bid now: ${link}`,
    }),
  );
}

async function sendOutbidEmail({
  to,
  auctionTitle,
  auctionId,
  newPrice,
}: {
  to: string;
  auctionTitle: string;
  auctionId: string;
  newPrice: string;
}) {
  if (!FROM_EMAIL || !to) return;
  const link = `${SITE_URL}/auctions/${auctionId}`;
  await sesClient.send(
    new SendEmailCommand({
      Source: `Revolution Auction House <${FROM_EMAIL}>`,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: `You've been outbid on ${auctionTitle}` },
        Body: {
          Html: {
            Data: `
              <div style="background:#050607;color:#d7d7d7;font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.3em;color:#888;margin-bottom:24px">Revolution Auction House</div>
                <h1 style="font-size:28px;margin:0 0 8px;color:#ffffff">You've been outbid</h1>
                <p style="color:#999;margin:0 0 32px">Someone placed a higher bid on <strong style="color:#d7d7d7">${auctionTitle}</strong>.</p>
                <div style="background:#0d0d0f;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px 24px;margin-bottom:28px">
                  <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.2em;color:#666;margin-bottom:6px">New Price</div>
                  <div style="font-size:36px;color:#c0c0c0;font-weight:bold">${newPrice}</div>
                </div>
                <a href="${link}" style="display:inline-block;background:#c0c0c0;color:#000;font-weight:bold;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:14px">Bid Again →</a>
                <p style="margin-top:32px;font-size:12px;color:#444">You're receiving this because you have outbid email notifications enabled at Revolution Auction House.</p>
              </div>`,
          },
        },
      },
    }),
  );
}

async function sendWatchlistNotification({
  to,
  phone,
  notifyWatchlist,
  auctionTitle,
  auctionId,
  newPrice,
}: {
  to: string;
  phone?: string | null;
  notifyWatchlist: string;
  auctionTitle: string;
  auctionId: string;
  newPrice: string;
}) {
  const link = `${SITE_URL}/auctions/${auctionId}`;
  const sends: Promise<any>[] = [];

  if ((notifyWatchlist === "email" || notifyWatchlist === "both") && FROM_EMAIL && to) {
    sends.push(
      sesClient.send(
        new SendEmailCommand({
          Source: `Revolution Auction House <${FROM_EMAIL}>`,
          Destination: { ToAddresses: [to] },
          Message: {
            Subject: { Data: `New bid on watched item: ${auctionTitle}` },
            Body: {
              Html: {
                Data: `
                  <div style="background:#050607;color:#d7d7d7;font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
                    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.3em;color:#888;margin-bottom:24px">Revolution Auction House</div>
                    <h1 style="font-size:28px;margin:0 0 8px;color:#ffffff">New bid on your watchlist</h1>
                    <p style="color:#999;margin:0 0 32px">A new bid was placed on <strong style="color:#d7d7d7">${auctionTitle}</strong>, which you're watching.</p>
                    <div style="background:#0d0d0f;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px 24px;margin-bottom:28px">
                      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.2em;color:#666;margin-bottom:6px">Current Price</div>
                      <div style="font-size:36px;color:#c0c0c0;font-weight:bold">${newPrice}</div>
                    </div>
                    <a href="${link}" style="display:inline-block;background:#c0c0c0;color:#000;font-weight:bold;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:14px">View Auction →</a>
                    <p style="margin-top:32px;font-size:12px;color:#444">You're receiving this because you have watchlist notifications enabled at Revolution Auction House.</p>
                  </div>`,
              },
            },
          },
        }),
      ),
    );
  }

  if ((notifyWatchlist === "sms" || notifyWatchlist === "both") && phone) {
    sends.push(
      snsClient.send(
        new PublishCommand({
          PhoneNumber: phone,
          Message: `Revolution: New bid on "${auctionTitle}" you're watching. Price: ${newPrice}. View: ${link}`,
        }),
      ),
    );
  }

  if (sends.length > 0) await Promise.all(sends);
}

// Cap how many watchers a single bid will notify, and how many notification
// sends run concurrently, so a heavily-watched item can't blow Lambda time or
// SES/SNS throughput limits. Tune as needed.
const MAX_WATCHERS_NOTIFIED = 2000;
const WATCHER_SEND_CONCURRENCY = 25;

// Run an async mapper over items with a bounded number in flight at once.
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
) {
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++];
      await worker(current);
    }
  });
  await Promise.all(runners);
}

async function notifyWatchers({
  auctionId,
  auctionTitle,
  newPrice,
  excludeUserIds,
}: {
  auctionId: string;
  auctionTitle: string;
  newPrice: string;
  excludeUserIds: Set<string>;
}) {
  try {
    // 1. Page through all watchers for this auction (the GSI query is capped per
    //    page, so follow nextToken until exhausted or we hit the cap).
    const watcherSubs = new Map<string, string | undefined>(); // sub -> email
    let nextToken: string | undefined;

    do {
      const page: any = await (client.models.WatchlistItem as any).watchlistByAuction(
        { auctionId },
        { authMode: "iam", limit: 200, nextToken } as any,
      );
      for (const item of page?.data || []) {
        const sub = item.userSub as string | undefined;
        if (!sub || excludeUserIds.has(sub) || watcherSubs.has(sub)) continue;
        watcherSubs.set(sub, item.userEmail as string | undefined);
      }
      nextToken = page?.nextToken;
    } while (nextToken && watcherSubs.size < MAX_WATCHERS_NOTIFIED);

    const subs = [...watcherSubs.keys()].slice(0, MAX_WATCHERS_NOTIFIED);
    if (subs.length === 0) return;

    // 2. Batch-read buyer profiles (DynamoDB BatchGet allows 100 keys/request).
    const profiles = new Map<string, any>();
    for (let i = 0; i < subs.length; i += 100) {
      const chunk = subs.slice(i, i + 100);
      let keys = chunk.map((userId) => ({ userId }));
      // BatchGet may return UnprocessedKeys; retry those a few times.
      for (let attempt = 0; attempt < 4 && keys.length > 0; attempt++) {
        const res = await dynamoClient.send(
          new BatchGetCommand({
            RequestItems: { [BUYER_PROFILE_TABLE_NAME]: { Keys: keys } },
          }),
        );
        for (const item of res.Responses?.[BUYER_PROFILE_TABLE_NAME] || []) {
          profiles.set(item.userId as string, item);
        }
        const unprocessed = res.UnprocessedKeys?.[BUYER_PROFILE_TABLE_NAME]?.Keys;
        keys = (unprocessed as { userId: string }[] | undefined) || [];
        if (keys.length > 0) await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
      }
    }

    // 3. Fan out notifications with bounded concurrency.
    await mapWithConcurrency(subs, WATCHER_SEND_CONCURRENCY, async (sub) => {
      const profile = profiles.get(sub);
      const notifyWatchlist = (profile?.notifyWatchlist as string) || "none";
      if (!notifyWatchlist || notifyWatchlist === "none") return;
      try {
        await sendWatchlistNotification({
          to: watcherSubs.get(sub) || (profile?.email as string) || "",
          // Only text verified numbers, and only when buyer SMS is enabled.
          phone: (BUYER_SMS_ENABLED && profile?.phoneVerified) ? (profile?.phoneNumber as string | null) : null,
          notifyWatchlist,
          auctionTitle,
          auctionId,
          newPrice,
        });
      } catch {
        // individual watcher failure is non-fatal
      }
    });
  } catch (err) {
    console.warn("NOTIFY_WATCHERS_FAILED", err);
  }
}

const AUCTION_TABLE_NAME = (env as any).AUCTION_TABLE_NAME;
const AUCTION_STATE_TABLE_NAME = (env as any).AUCTION_STATE_TABLE_NAME;
const BID_TABLE_NAME = (env as any).BID_TABLE_NAME;
const BUYER_PROFILE_TABLE_NAME = (env as any).BUYER_PROFILE_TABLE_NAME;
const BID_AUDIT_LOG_TABLE_NAME = (env as any).BID_AUDIT_LOG_TABLE_NAME;

for (const [name, val] of [
  ["AUCTION_TABLE_NAME", AUCTION_TABLE_NAME],
  ["AUCTION_STATE_TABLE_NAME", AUCTION_STATE_TABLE_NAME],
  ["BID_TABLE_NAME", BID_TABLE_NAME],
  ["BUYER_PROFILE_TABLE_NAME", BUYER_PROFILE_TABLE_NAME],
  ["BID_AUDIT_LOG_TABLE_NAME", BID_AUDIT_LOG_TABLE_NAME],
]) {
  if (!val) throw new Error(`Missing env var: ${name}`);
}

const BID_COOLDOWN_MS = 3000;

// Optimistic-concurrency retry tuning. Under a hot auction many bids contend on
// the single AuctionState version, so we retry the compare-and-set a number of
// times with jittered backoff to avoid a synchronized retry storm.
const MAX_BID_ATTEMPTS = 8;
const RETRY_BASE_MS = 60;
const RETRY_MAX_MS = 600;

function retryDelayMs(attempt: number): number {
  // Exponential backoff capped at RETRY_MAX_MS, with full jitter.
  const ceiling = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** attempt);
  return Math.floor(Math.random() * ceiling);
}

function formatMoney(amount: number) {
  return `$${amount.toLocaleString()}`;
}

function moneyToNumber(value: string | number | null | undefined) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  return Number(String(value).replace(/[$,]/g, ""));
}

function makeBidderDisplayName(value: string) {
  if (!value) return "Verified Bidder";
  return `Bidder ${value.slice(0, 4).toUpperCase()}`;
}

async function getAuctionStateDirect(auctionId: string) {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: AUCTION_STATE_TABLE_NAME,
      Key: {
        auctionId,
      },
    }),
  );

  return result.Item || null;
}

async function getBuyerProfileDirect(userId: string) {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: BUYER_PROFILE_TABLE_NAME,
      Key: {
        userId,
      },
    }),
  );

  return result.Item || null;
}

async function getBidAuditLogDirect(bidRequestId: string) {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: BID_AUDIT_LOG_TABLE_NAME,
      Key: { bidRequestId },
    }),
  );
  return result.Item || null;
}

async function getAuctionDirect(auctionId: string) {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: AUCTION_TABLE_NAME,
      Key: { id: auctionId },
    }),
  );
  return result.Item || null;
}

async function writeBidAuditLogDirect(log: {
  bidRequestId: string;
  auctionId: string;
  bidderUserId?: string;
  bidderEmail?: string;
  bidderName?: string;
  requestedMaxBid?: string;
  accepted: boolean;
  rejectionReason?: string;
  previousPrice?: string;
  newPrice?: string;
  previousLeaderUserId?: string;
  newLeaderUserId?: string;
  buyerTier?: string;
  buyerBidLimit?: number;
  attemptCount?: number;
  resultMessage?: string;
}) {
  await dynamoClient.send(
    new UpdateCommand({
      TableName: BID_AUDIT_LOG_TABLE_NAME,

      Key: {
        bidRequestId: log.bidRequestId,
      },

      UpdateExpression: `

    SET #typename = :typename,
        auctionId = :auctionId,
        bidderUserId = :bidderUserId,
        bidderEmail = :bidderEmail,
        bidderName = :bidderName,
        requestedMaxBid = :requestedMaxBid,
        accepted = :accepted,
        rejectionReason = :rejectionReason,
        previousPrice = :previousPrice,
        newPrice = :newPrice,
        previousLeaderUserId = :previousLeaderUserId,
        newLeaderUserId = :newLeaderUserId,
        buyerTier = :buyerTier,
        buyerBidLimit = :buyerBidLimit,
        attemptCount = :attemptCount,
        resultMessage = :resultMessage,
        updatedAt = :updatedAt,
        createdAt = if_not_exists(createdAt, :createdAt)
  `,
      ExpressionAttributeNames: {
        "#typename": "__typename",
      },

      ExpressionAttributeValues: {
        ":typename": "BidAuditLog",
        ":auctionId": log.auctionId,
        ":bidderUserId": log.bidderUserId || null,
        ":bidderEmail": log.bidderEmail || null,
        ":bidderName": log.bidderName || null,
        ":requestedMaxBid": log.requestedMaxBid || null,
        ":accepted": log.accepted,
        ":rejectionReason": log.rejectionReason || null,
        ":previousPrice": log.previousPrice || null,
        ":newPrice": log.newPrice || null,
        ":previousLeaderUserId": log.previousLeaderUserId || null,
        ":newLeaderUserId": log.newLeaderUserId || null,
        ":buyerTier": log.buyerTier || null,
        ":buyerBidLimit": log.buyerBidLimit || null,
        ":attemptCount": log.attemptCount || 0,
        ":resultMessage": log.resultMessage || null,
        ":updatedAt": new Date().toISOString(),
        ":createdAt": new Date().toISOString(),
      },
    }),
  );
}

export const handler: Schema["placeBid"]["functionHandler"] = async (event) => {
  try {
    const { auctionId, maxBid } = event.arguments;

    const bidRequestId =
      event.arguments.bidRequestId ||
      `${auctionId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const identity = event.identity as any;

    const bidderUserId =
      identity?.sub ||
      identity?.claims?.sub ||
      identity?.username ||
      identity?.claims?.["cognito:username"] ||
      "guest";

    const bidderEmail =
      identity?.claims?.email ||
      identity?.claims?.["cognito:email"] ||
      `user-${bidderUserId}`;

    const bidderDisplayName = makeBidderDisplayName(bidderUserId);

    const callerGroups: string[] =
      identity?.claims?.["cognito:groups"] ?? [];

    if (callerGroups.includes("Admin") || callerGroups.includes("Seller")) {
      return {
        success: false,
        message: "Admins and sellers cannot place bids.",
        currentPrice: 0,
        winner: "",
      };
    }

    const auctionOwnerCheck = await getAuctionDirect(auctionId);
    if (auctionOwnerCheck?.sellerUserId === bidderUserId) {
      return {
        success: false,
        message: "Sellers cannot bid on their own auctions.",
        currentPrice: 0,
        winner: "",
      };
    }

    if (auctionOwnerCheck?.status === "CANCELLED") {
      return {
        success: false,
        message: "This auction has been cancelled.",
        currentPrice: 0,
        winner: "",
      };
    }

    // Scheduled auctions: the UI hides the bid console, but the mutation is
    // callable directly — enforce the start time server-side too.
    if (
      auctionOwnerCheck?.startsAt &&
      new Date(auctionOwnerCheck.startsAt).getTime() > Date.now()
    ) {
      return {
        success: false,
        message: "This auction has not started yet.",
        currentPrice: 0,
        winner: "",
      };
    }

    const customIncrement: number | null =
      typeof auctionOwnerCheck?.increment === "number" && auctionOwnerCheck.increment > 0
        ? auctionOwnerCheck.increment
        : null;

    const existingAuditLog = await getBidAuditLogDirect(bidRequestId);

    if (existingAuditLog) {
      return {
        success: Boolean(existingAuditLog.accepted),
        message:
          existingAuditLog.resultMessage ||
          (existingAuditLog.accepted
            ? "Bid already processed"
            : "Bid rejected"),
        currentPrice: moneyToNumber(existingAuditLog.newPrice),
        winner: existingAuditLog.newLeaderUserId
          ? makeBidderDisplayName(existingAuditLog.newLeaderUserId)
          : "",
      };
    }

    const buyerProfile = await getBuyerProfileDirect(bidderUserId);

    const buyerBidLimit = Number(buyerProfile?.bidLimit || 1000);
    const buyerTier = String(buyerProfile?.verificationTier || "BASIC");

    if (buyerProfile?.status === "DECLINED") {
      const message =
        "Your account is not approved for bidding. Please contact support.";

      await writeBidAuditLogDirect({
        bidRequestId,
        auctionId,
        bidderUserId,
        bidderEmail,
        bidderName: bidderDisplayName,
        requestedMaxBid: formatMoney(maxBid),
        accepted: false,
        rejectionReason: "BUYER_DECLINED",
        buyerTier,
        buyerBidLimit,
        resultMessage: message,
      });

      return {
        success: false,
        message,
        currentPrice: 0,
        winner: "",
      };
    }

    if (maxBid > buyerBidLimit) {
      const message = `Your ${buyerTier} bidding limit is ${formatMoney(
        buyerBidLimit,
      )}. Please request a higher limit before placing this bid.`;

      await writeBidAuditLogDirect({
        bidRequestId,
        auctionId,
        bidderUserId,
        bidderEmail,
        bidderName: bidderDisplayName,
        requestedMaxBid: formatMoney(maxBid),
        accepted: false,
        rejectionReason: "BID_LIMIT_EXCEEDED",
        buyerTier,
        buyerBidLimit,
        resultMessage: message,
      });

      return {
        success: false,
        message,
        currentPrice: 0,
        winner: "",
      };
    }

    if (BID_COOLDOWN_MS > 0) {
      // Newest first — without the sort this returned the user's 5 OLDEST
      // bids, so the cooldown never fired for anyone with bid history.
      const recentUserBids = await client.models.Bid.bidsByBidder(
        { bidderUserId },
        {
          limit: 5,
          sortDirection: "DESC",
        } as any,
      );

      const tooRecent = (recentUserBids.data || []).some((bid: any) => {
        if (bid.auctionId !== auctionId || !bid.createdAt) return false;
        return Date.now() - new Date(bid.createdAt).getTime() < BID_COOLDOWN_MS;
      });

      if (tooRecent) {
        return {
          success: false,
          message: "Please wait a few seconds before bidding again.",
          currentPrice: 0,
          winner: "",
        };
      }
    }

    for (let attempt = 0; attempt < MAX_BID_ATTEMPTS; attempt++) {
      let state = await getAuctionStateDirect(auctionId);

      if (!state) {
        const auction = await getAuctionDirect(auctionId);

        if (!auction) {
          return {
            success: false,
            message: `Auction not found: ${auctionId}`,
            currentPrice: 0,
            winner: "",
          };
        }

        const initNow = new Date().toISOString();
        const initState = {
          __typename: "AuctionState",
          auctionId,
          currentPrice: auction.price || "$0",
          leaderUserId: null,
          leaderMaxBid: null,
          secondUserId: null,
          secondMaxBid: null,
          bidCount: auction.bids || 0,
          version: 1,
          endsAt: auction.endsAt || null,
          ended: auction.ended || false,
          createdAt: initNow,
          updatedAt: initNow,
        };

        try {
          await dynamoClient.send(
            new PutCommand({
              TableName: AUCTION_STATE_TABLE_NAME,
              Item: initState,
              ConditionExpression: "attribute_not_exists(auctionId)",
            }),
          );
          state = initState;
        } catch (err: any) {
          if (err?.name === "ConditionalCheckFailedException") {
            // Another invocation just initialized it — re-read
            state = await getAuctionStateDirect(auctionId);
          } else {
            throw err;
          }
        }
      }

      if (!state) {
        return {
          success: false,
          message: "Could not initialize auction state",
          currentPrice: 0,
          winner: "",
        };
      }

      // The ended flag is flipped by the finalizer (runs every minute), so on
      // its own it leaves a late-bid window — enforce the deadline here too.
      const deadlinePassed =
        state.endsAt && new Date(state.endsAt).getTime() <= Date.now();

      if (state.ended || deadlinePassed) {
        const message = "Auction has ended";

        await writeBidAuditLogDirect({
          bidRequestId,
          auctionId,
          bidderUserId,
          bidderEmail,
          bidderName: bidderDisplayName,
          requestedMaxBid: formatMoney(maxBid),
          accepted: false,
          rejectionReason: "AUCTION_ENDED",
          previousPrice: state.currentPrice,
          previousLeaderUserId: state.leaderUserId || "",
          newPrice: state.currentPrice,
          newLeaderUserId: state.leaderUserId || "",
          buyerTier,
          buyerBidLimit,
          resultMessage: message,
        });

        return {
          success: false,
          message,
          currentPrice: moneyToNumber(state.currentPrice),
          winner: state.leaderUserId
            ? makeBidderDisplayName(state.leaderUserId)
            : "",
        };
      }

      const currentPrice = moneyToNumber(state.currentPrice);
      const minimumBid = currentPrice + getIncrement(currentPrice, customIncrement);

      if (maxBid < minimumBid) {
        const message = `Minimum bid is ${formatMoney(minimumBid)}`;

        await writeBidAuditLogDirect({
          bidRequestId,
          auctionId,
          bidderUserId,
          bidderEmail,
          bidderName: bidderDisplayName,
          requestedMaxBid: formatMoney(maxBid),
          accepted: false,
          rejectionReason: "BELOW_MINIMUM_BID",
          previousPrice: state.currentPrice,
          previousLeaderUserId: state.leaderUserId || "",
          newPrice: state.currentPrice,
          newLeaderUserId: state.leaderUserId || "",
          buyerTier,
          buyerBidLimit,
          resultMessage: message,
        });

        return {
          success: false,
          message,
          currentPrice,
          winner: state.leaderUserId
            ? makeBidderDisplayName(state.leaderUserId)
            : "",
        };
      }

      const leaderUserId = state.leaderUserId || "";
      const leaderMaxBid = moneyToNumber(state.leaderMaxBid);

      const {
        newLeaderUserId,
        newLeaderMaxBid,
        newSecondUserId,
        newSecondMaxBid,
        visiblePrice,
        proxyUserId,
      } = resolveBid(
        {
          currentPrice,
          leaderUserId,
          leaderMaxBid,
          secondUserId: state.secondUserId || "",
          secondMaxBid: moneyToNumber(state.secondMaxBid),
        },
        bidderUserId,
        maxBid,
        minimumBid,
        customIncrement,
        moneyToNumber(auctionOwnerCheck?.reservePrice || 0),
      );

      const newBidCount = (state.bidCount || 0) + (proxyUserId ? 2 : 1);
      const SOFT_CLOSE_WINDOW_SEC = 60;
      const SOFT_CLOSE_EXTENSION_SEC = 300;

      let updatedEndsAt = state.endsAt;

      if (state.endsAt) {
        const remainingMs = new Date(state.endsAt).getTime() - Date.now();

        if (remainingMs > 0 && remainingMs <= SOFT_CLOSE_WINDOW_SEC * 1000) {
          updatedEndsAt = new Date(
            Date.now() + SOFT_CLOSE_EXTENSION_SEC * 1000,
          ).toISOString();
        }
      }

      const expectedVersion = state.version || 1;
      const nextVersion = expectedVersion + 1;
      const nowIso = new Date().toISOString();

      // One atomic commit: state CAS + bid rows + auction projection + audit
      // record succeed or fail together, so a bidder can never become leader
      // while the response reports failure, and a concurrently retried
      // bidRequestId can't double-apply (the audit Put doubles as the
      // idempotency lock). The projection update carries no condition of its
      // own — the state version check is the single serialization gate.
      const transactItems: any[] = [
        {
          Update: {
            TableName: AUCTION_STATE_TABLE_NAME,
            Key: { auctionId },
            UpdateExpression: `
              SET currentPrice = :currentPrice,
                  leaderUserId = :leaderUserId,
                  leaderEmail = :leaderEmail,
                  leaderMaxBid = :leaderMaxBid,
                  secondUserId = :secondUserId,
                  secondEmail = :secondEmail,
                  secondMaxBid = :secondMaxBid,
                  bidCount = :bidCount,
                  version = :nextVersion,
                  endsAt = :endsAt,
                  ended = :ended,
                  updatedAt = :updatedAt
            `,
            ConditionExpression: "#version = :expectedVersion",
            ExpressionAttributeNames: { "#version": "version" },
            ExpressionAttributeValues: {
              ":currentPrice": formatMoney(visiblePrice),
              ":leaderUserId": newLeaderUserId || null,
              ":leaderEmail":
                (newLeaderUserId === bidderUserId
                  ? bidderEmail
                  : state.leaderEmail) || null,
              ":leaderMaxBid": formatMoney(newLeaderMaxBid),
              ":secondUserId": newSecondUserId || null,
              ":secondEmail":
                (newSecondUserId === bidderUserId
                  ? bidderEmail
                  : state.secondEmail) || null,
              ":secondMaxBid": formatMoney(newSecondMaxBid),
              ":bidCount": newBidCount,
              ":nextVersion": nextVersion,
              ":endsAt": updatedEndsAt || null,
              ":ended": state.ended || false,
              ":updatedAt": nowIso,
              ":expectedVersion": expectedVersion,
            },
          },
        },
        {
          Put: {
            TableName: BID_TABLE_NAME,
            Item: {
              __typename: "Bid",
              id: crypto.randomUUID(),
              auctionId,
              bidderUserId,
              bidderEmail,
              bidderName: bidderDisplayName,
              amount: formatMoney(visiblePrice),
              maxBid: formatMoney(maxBid),
              isProxy: false,
              createdAt: nowIso,
              updatedAt: nowIso,
            },
          },
        },
        ...(proxyUserId
          ? [
              {
                Put: {
                  TableName: BID_TABLE_NAME,
                  Item: {
                    __typename: "Bid",
                    id: crypto.randomUUID(),
                    auctionId,
                    bidderUserId: proxyUserId,
                    bidderEmail: "proxy-bid",
                    bidderName: makeBidderDisplayName(proxyUserId),
                    amount: formatMoney(visiblePrice),
                    maxBid: formatMoney(leaderMaxBid),
                    isProxy: true,
                    createdAt: nowIso,
                    updatedAt: nowIso,
                  },
                },
              },
            ]
          : []),
        {
          Update: {
            TableName: AUCTION_TABLE_NAME,
            Key: { id: auctionId },
            UpdateExpression: `SET price = :price,
              bids = :bids,
              winnerUserId = :winnerUserId,
              winnerDisplayName = :winnerDisplayName,
              winnerEmail = :winnerEmail,
              winningBid = :winningBid,
              endsAt = :endsAt,
              updatedAt = :updatedAt,
              stateVersion = :stateVersion`,
            ExpressionAttributeValues: {
              ":price": formatMoney(visiblePrice),
              ":bids": newBidCount,
              ":winnerUserId": newLeaderUserId,
              ":winnerDisplayName": makeBidderDisplayName(newLeaderUserId),
              ":winnerEmail":
                newLeaderUserId === bidderUserId ? bidderEmail : "",
              ":winningBid": formatMoney(visiblePrice),
              ":endsAt": updatedEndsAt ?? null,
              ":updatedAt": nowIso,
              ":stateVersion": nextVersion,
            },
          },
        },
        {
          Put: {
            TableName: BID_AUDIT_LOG_TABLE_NAME,
            Item: {
              __typename: "BidAuditLog",
              bidRequestId,
              auctionId,
              bidderUserId,
              bidderEmail,
              bidderName: bidderDisplayName,
              requestedMaxBid: formatMoney(maxBid),
              accepted: true,
              rejectionReason: null,
              previousPrice: state.currentPrice ?? null,
              newPrice: formatMoney(visiblePrice),
              previousLeaderUserId: leaderUserId || "",
              newLeaderUserId,
              buyerTier,
              buyerBidLimit,
              attemptCount: attempt + 1,
              resultMessage: "Bid placed",
              createdAt: nowIso,
              updatedAt: nowIso,
            },
            ConditionExpression: "attribute_not_exists(bidRequestId)",
          },
        },
      ];
      const auditItemIndex = transactItems.length - 1;

      try {
        await dynamoClient.send(
          new TransactWriteCommand({ TransactItems: transactItems }),
        );
      } catch (err: any) {
        if (err?.name !== "TransactionCanceledException") throw err;

        const reasons: any[] = err.CancellationReasons || [];

        // A concurrent retry of the same bidRequestId already committed —
        // return the recorded outcome instead of double-applying.
        if (reasons[auditItemIndex]?.Code === "ConditionalCheckFailed") {
          const dup = await getBidAuditLogDirect(bidRequestId);
          return {
            success: Boolean(dup?.accepted),
            message: dup?.resultMessage || "Bid already processed",
            currentPrice: moneyToNumber(dup?.newPrice),
            winner: dup?.newLeaderUserId
              ? makeBidderDisplayName(dup.newLeaderUserId)
              : "",
          };
        }

        // Otherwise the state version moved under us — classic conflict.
        console.warn("PLACE_BID_CONFLICT", {
          auctionId,
          attempt: attempt + 1,
          expectedVersion,
          currentPrice,
        });

        if (attempt === MAX_BID_ATTEMPTS - 1) {
          const message = "High bidding activity. Please retry.";

          console.error("PLACE_BID_RETRY_EXHAUSTED", {
            auctionId,
            bidderUserId,
            expectedVersion,
            currentPrice,
          });

          await writeBidAuditLogDirect({
            bidRequestId,
            auctionId,
            bidderUserId,
            bidderEmail,
            bidderName: bidderDisplayName,
            requestedMaxBid: formatMoney(maxBid),
            accepted: false,
            rejectionReason: "RETRY_EXHAUSTED",
            previousPrice: state.currentPrice,
            previousLeaderUserId: state.leaderUserId || "",
            newPrice: state.currentPrice,
            newLeaderUserId: state.leaderUserId || "",
            buyerTier,
            buyerBidLimit,
            attemptCount: attempt + 1,
            resultMessage: message,
          });

          return {
            success: false,
            message,
            currentPrice,
            winner: state.leaderUserId
              ? makeBidderDisplayName(state.leaderUserId)
              : "",
          };
        }

        await new Promise((resolve) =>
          setTimeout(resolve, retryDelayMs(attempt)),
        );

        continue;
      }

      const auctionTitle = auctionOwnerCheck?.title || "this auction";
      const formattedPrice = formatMoney(visiblePrice);

      // Notifications must complete before the handler returns — Lambda
      // freezes the execution environment at return, so fire-and-forget
      // promises silently stall until (maybe) a later invocation. Failures
      // stay non-fatal to the bid itself.
      const notifyTasks: Promise<unknown>[] = [];

      // Notify displaced leader
      if (leaderUserId && leaderUserId !== bidderUserId && newLeaderUserId === bidderUserId) {
        notifyTasks.push(
          getBuyerProfileDirect(leaderUserId).then(async (profile) => {
            if (!profile) return;
            const notifyOutbid = (profile.notifyOutbid as string) ?? (profile.smsOptIn ? "sms" : "none");
            const leaderEmail = (profile.email as string) || state?.leaderEmail || "";
            const sends: Promise<any>[] = [];
            if (BUYER_SMS_ENABLED && (notifyOutbid === "sms" || notifyOutbid === "both") && profile.phoneNumber && profile.phoneVerified) {
              sends.push(sendOutbidSms({ to: profile.phoneNumber as string, auctionTitle, auctionId, newPrice: formattedPrice }));
            }
            if ((notifyOutbid === "email" || notifyOutbid === "both") && leaderEmail) {
              sends.push(sendOutbidEmail({ to: leaderEmail, auctionTitle, auctionId, newPrice: formattedPrice }));
            }
            if (sends.length) await Promise.all(sends);
          }).catch((err: unknown) => console.warn("OUTBID_NOTIFY_FAILED", err)),
        );
      }

      // Notify watchlist watchers
      notifyTasks.push(
        notifyWatchers({
          auctionId,
          auctionTitle,
          newPrice: formattedPrice,
          excludeUserIds: new Set([bidderUserId, leaderUserId].filter(Boolean) as string[]),
        }).catch((err: unknown) => console.warn("WATCHLIST_NOTIFY_FAILED", err)),
      );

      await Promise.allSettled(notifyTasks);

      return {
        success: true,
        message: "Bid placed",
        currentPrice: visiblePrice,
        winner: makeBidderDisplayName(newLeaderUserId),
      };
    }

    return {
      success: false,
      message: "High bidding activity. Please retry.",
      currentPrice: 0,
      winner: "",
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || JSON.stringify(err) || "Failed to place bid",
      currentPrice: 0,
      winner: "",
    };
  }
};
