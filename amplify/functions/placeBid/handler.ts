import type { Schema } from "../../data/resource";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/placeBid";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const { resourceConfig, libraryOptions } =
  await getAmplifyDataClientConfig(env);

Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const snsClient = new SNSClient({});
const sesClient = new SESClient({});

const SITE_URL = (env as any).SITE_URL || "https://www.revolutionauctionhouse.com";
const FROM_EMAIL = (env as any).FROM_EMAIL || "";

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
    const watchlistResult = await (client.models.WatchlistItem as any).watchlistByAuction(
      { auctionId },
      { authMode: "iam", limit: 100 } as any,
    );
    const watchers: any[] = watchlistResult?.data || [];

    await Promise.all(
      watchers.map(async (item: any) => {
        const watcherSub = item.userSub as string | undefined;
        const watcherEmail = item.userEmail as string | undefined;
        if (!watcherSub || excludeUserIds.has(watcherSub)) return;

        try {
          const profileResult = await dynamoClient.send(
            new GetCommand({
              TableName: BUYER_PROFILE_TABLE_NAME,
              Key: { userId: watcherSub },
            }),
          );
          const profile = profileResult.Item;
          const notifyWatchlist = (profile?.notifyWatchlist as string) || "none";
          if (!notifyWatchlist || notifyWatchlist === "none") return;

          await sendWatchlistNotification({
            to: watcherEmail || (profile?.email as string) || "",
            phone: profile?.phoneNumber as string | null,
            notifyWatchlist,
            auctionTitle,
            auctionId,
            newPrice,
          });
        } catch {
          // individual watcher failure is non-fatal
        }
      }),
    );
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

function defaultIncrement(amount: number): number {
  if (amount < 100) return 5;
  if (amount < 500) return 10;
  if (amount < 1000) return 25;
  if (amount < 2500) return 50;
  if (amount < 5000) return 100;
  if (amount < 10000) return 250;
  if (amount < 25000) return 500;
  if (amount < 50000) return 1000;
  if (amount < 100000) return 2500;
  if (amount < 250000) return 5000;
  if (amount < 500000) return 10000;
  return 25000;
}

function getIncrement(amount: number, custom?: number | null): number {
  return Math.max(custom || 0, defaultIncrement(amount));
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

async function writeBidDirect(bid: {
  auctionId: string;
  bidderUserId: string;
  bidderEmail: string;
  bidderName: string;
  amount: string;
  maxBid: string;
  isProxy: boolean;
  createdAt: string;
}) {
  const id = crypto.randomUUID();
  await dynamoClient.send(
    new PutCommand({
      TableName: BID_TABLE_NAME,
      Item: {
        __typename: "Bid",
        id,
        ...bid,
        updatedAt: bid.createdAt,
      },
    }),
  );
  return id;
}

async function updateAuctionPriceDirect({
  auctionId,
  price,
  bids,
  winnerUserId,
  winnerDisplayName,
  winnerEmail,
  winningBid,
  endsAt,
  stateVersion,
}: {
  auctionId: string;
  price: string;
  bids: number;
  winnerUserId: string;
  winnerDisplayName: string;
  winnerEmail: string;
  winningBid: string;
  endsAt: string | null | undefined;
  stateVersion: number;
}) {
  try {
    await dynamoClient.send(
      new UpdateCommand({
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
        ConditionExpression:
          "attribute_not_exists(stateVersion) OR stateVersion < :stateVersion",
        ExpressionAttributeValues: {
          ":price": price,
          ":bids": bids,
          ":winnerUserId": winnerUserId,
          ":winnerDisplayName": winnerDisplayName,
          ":winnerEmail": winnerEmail,
          ":winningBid": winningBid,
          ":endsAt": endsAt ?? null,
          ":updatedAt": new Date().toISOString(),
          ":stateVersion": stateVersion,
        },
      }),
    );
  } catch (err: any) {
    if (err?.name === "ConditionalCheckFailedException") {
      // A later bid already wrote a higher stateVersion — our update is stale, skip it
      return;
    }
    throw err;
  }
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

async function updateAuctionStateDirect({
  auctionId,
  visiblePrice,
  newLeaderUserId,
  leaderEmail,
  newLeaderMaxBid,
  newSecondUserId,
  secondEmail,
  newSecondMaxBid,
  newBidCount,
  expectedVersion,
  updatedEndsAt,
  ended,
}: {
  auctionId: string;
  visiblePrice: number;
  newLeaderUserId: string;
  leaderEmail?: string | null;
  newLeaderMaxBid: number;
  newSecondUserId: string;
  secondEmail?: string | null;
  newSecondMaxBid: number;
  newBidCount: number;
  expectedVersion: number;
  updatedEndsAt?: string | null;
  ended: boolean;
}) {
  try {
    const result = await dynamoClient.send(
      new UpdateCommand({
        TableName: AUCTION_STATE_TABLE_NAME,
        Key: {
          auctionId,
        },
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
        ExpressionAttributeNames: {
          "#version": "version",
        },
        ExpressionAttributeValues: {
          ":currentPrice": formatMoney(visiblePrice),
          ":leaderUserId": newLeaderUserId || null,
          ":leaderEmail": leaderEmail || null,
          ":leaderMaxBid": formatMoney(newLeaderMaxBid),
          ":secondUserId": newSecondUserId || null,
          ":secondEmail": secondEmail || null,
          ":secondMaxBid": formatMoney(newSecondMaxBid),
          ":bidCount": newBidCount,
          ":nextVersion": expectedVersion + 1,
          ":endsAt": updatedEndsAt || null,
          ":ended": ended,
          ":updatedAt": new Date().toISOString(),
          ":expectedVersion": expectedVersion,
        },
        ReturnValues: "ALL_NEW",
      }),
    );

    return result.Attributes || null;
  } catch (err: any) {
    if (err?.name === "ConditionalCheckFailedException") {
      return null;
    }

    throw err;
  }
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
      const recentUserBids = await client.models.Bid.bidsByBidder(
        { bidderUserId },
        {
          limit: 5,
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

    for (let attempt = 0; attempt < 5; attempt++) {
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

      if (state.ended) {
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
      const secondUserId = state.secondUserId || "";
      const secondMaxBid = moneyToNumber(state.secondMaxBid);

      let newLeaderUserId = leaderUserId;
      let newLeaderMaxBid = leaderMaxBid;
      let newSecondUserId = secondUserId;
      let newSecondMaxBid = secondMaxBid;
      let visiblePrice = currentPrice;
      let proxyUserId = "";

      if (!leaderUserId) {
        newLeaderUserId = bidderUserId;
        newLeaderMaxBid = maxBid;
        visiblePrice = minimumBid;
      } else if (bidderUserId === leaderUserId) {
        newLeaderMaxBid = Math.max(leaderMaxBid, maxBid);
        visiblePrice = currentPrice;
      } else if (maxBid > leaderMaxBid) {
        newSecondUserId = leaderUserId;
        newSecondMaxBid = leaderMaxBid;

        newLeaderUserId = bidderUserId;
        newLeaderMaxBid = maxBid;

        visiblePrice = Math.min(
          maxBid,
          leaderMaxBid + getIncrement(leaderMaxBid, customIncrement),
        );
      } else if (maxBid === leaderMaxBid) {
        newSecondUserId = bidderUserId;
        newSecondMaxBid = maxBid;

        visiblePrice = leaderMaxBid;
        proxyUserId = leaderUserId;
      } else {
        newSecondUserId = bidderUserId;
        newSecondMaxBid = Math.max(secondMaxBid, maxBid);

        visiblePrice = Math.min(leaderMaxBid, maxBid + getIncrement(maxBid, customIncrement));

        proxyUserId = leaderUserId;
      }

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

      const updateResult = await updateAuctionStateDirect({
        auctionId,
        visiblePrice,

        newLeaderUserId,
        leaderEmail:
          newLeaderUserId === bidderUserId ? bidderEmail : state.leaderEmail,
        newLeaderMaxBid,

        newSecondUserId,
        secondEmail:
          newSecondUserId === bidderUserId ? bidderEmail : state.secondEmail,
        newSecondMaxBid,

        newBidCount,
        expectedVersion,

        updatedEndsAt,
        ended: state.ended || false,
      });

      if (!updateResult) {
        console.warn("PLACE_BID_CONFLICT", {
          auctionId,
          attempt: attempt + 1,
          expectedVersion,
          currentPrice,
        });

        if (attempt === 4) {
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
          setTimeout(resolve, 100 + attempt * 100),
        );

        continue;
      }

      const now = new Date().toISOString();
      await writeBidDirect({
        auctionId,
        bidderUserId,
        bidderEmail,
        bidderName: bidderDisplayName,
        amount: formatMoney(visiblePrice),
        maxBid: formatMoney(maxBid),
        isProxy: false,
        createdAt: now,
      });

      if (proxyUserId) {
        await writeBidDirect({
          auctionId,
          bidderUserId: proxyUserId,
          bidderEmail: "proxy-bid",
          bidderName: makeBidderDisplayName(proxyUserId),
          amount: formatMoney(visiblePrice),
          maxBid: formatMoney(leaderMaxBid),
          isProxy: true,
          createdAt: now,
        });
      }

      await updateAuctionPriceDirect({
        auctionId,
        price: formatMoney(visiblePrice),
        bids: newBidCount,
        winnerUserId: newLeaderUserId,
        winnerDisplayName: makeBidderDisplayName(newLeaderUserId),
        winnerEmail: newLeaderUserId === bidderUserId ? bidderEmail : "",
        winningBid: formatMoney(visiblePrice),
        endsAt: updatedEndsAt,
        stateVersion: expectedVersion + 1,
      });

      await writeBidAuditLogDirect({
        bidRequestId,
        auctionId,
        bidderUserId,
        bidderEmail,
        bidderName: bidderDisplayName,
        requestedMaxBid: formatMoney(maxBid),
        accepted: true,
        previousPrice: state.currentPrice,
        newPrice: formatMoney(visiblePrice),
        previousLeaderUserId: leaderUserId || "",
        newLeaderUserId,
        buyerTier,
        buyerBidLimit,
        attemptCount: attempt + 1,
        resultMessage: "Bid placed",
      });

      const auctionTitle = auctionOwnerCheck?.title || "this auction";
      const formattedPrice = formatMoney(visiblePrice);

      // Notify displaced leader (fire-and-forget)
      if (leaderUserId && leaderUserId !== bidderUserId && newLeaderUserId === bidderUserId) {
        getBuyerProfileDirect(leaderUserId).then(async (profile) => {
          if (!profile) return;
          const notifyOutbid = (profile.notifyOutbid as string) ?? (profile.smsOptIn ? "sms" : "none");
          const leaderEmail = (profile.email as string) || state?.leaderEmail || "";
          const sends: Promise<any>[] = [];
          if ((notifyOutbid === "sms" || notifyOutbid === "both") && profile.phoneNumber) {
            sends.push(sendOutbidSms({ to: profile.phoneNumber as string, auctionTitle, auctionId, newPrice: formattedPrice }));
          }
          if ((notifyOutbid === "email" || notifyOutbid === "both") && leaderEmail) {
            sends.push(sendOutbidEmail({ to: leaderEmail, auctionTitle, auctionId, newPrice: formattedPrice }));
          }
          if (sends.length) await Promise.all(sends);
        }).catch((err: unknown) => console.warn("OUTBID_NOTIFY_FAILED", err));
      }

      // Notify watchlist watchers (fire-and-forget)
      notifyWatchers({
        auctionId,
        auctionTitle,
        newPrice: formattedPrice,
        excludeUserIds: new Set([bidderUserId, leaderUserId].filter(Boolean) as string[]),
      }).catch((err: unknown) => console.warn("WATCHLIST_NOTIFY_FAILED", err));

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
