import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { placeBid } from "../functions/placeBid/resource";
import { finalizeAuction } from "../functions/finalizeAuction/resource";
import { scheduledFinalize } from "../functions/scheduledFinalize/resource";

const schema = a
  .schema({
    Auction: a
      .model({
        title: a.string().required(),
        subtitle: a.string(),
        price: a.string(),
        winnerUserId: a.string(),
        winnerDisplayName: a.string(),
        image: a.string(),
        images: a.string().array(),

        thumbImages: a.string().array(),
        mediumImages: a.string().array(),
        fullImages: a.string().array(),
        bids: a.integer().default(0),
        endsAt: a.datetime(),
        ended: a.boolean().default(false),
        status: a.string(),
        reservePrice: a.string(),
        reserveMet: a.boolean(),
        winningBid: a.string(),
        winnerEmail: a.string(),
        sellerName: a.string(),
        sellerEmail: a.string(),
        sellerUserId: a.string(),
        sellerPublicId: a.string(),
        sellerDisplayName: a.string(),
        paid: a.boolean().default(false),
        paidAt: a.datetime(),
        stripeSessionId: a.string(),

        chargeTax: a.boolean().default(false),
        taxRate: a.float().default(6.625),

        buyerPremiumRate: a.float().default(20),

        description: a.string(),
        grade: a.string(),
        certNumber: a.string(),
        year: a.string(),
        setName: a.string(),
        cardNumber: a.string(),
        population: a.string(),
        provenance: a.string(),
        shippingStatus: a.string(),
        trackingNumber: a.string(),
        carrier: a.string(),
        shippedAt: a.datetime(),
        deliveredAt: a.datetime(),
      })
      .authorization((allow) => [allow.publicApiKey(), allow.authenticated()]),

    AuctionState: a
      .model({
        auctionId: a.string().required(),

        currentPrice: a.string().required(),

        leaderUserId: a.string(),
        leaderDisplayName: a.string(),
        leaderEmail: a.string(),
        leaderMaxBid: a.string(),

        secondUserId: a.string(),
        secondEmail: a.string(),
        secondMaxBid: a.string(),

        bidCount: a.integer().default(0),

        version: a.integer().default(1),

        endsAt: a.datetime(),
        ended: a.boolean().default(false),
      })
      .identifier(["auctionId"])
      .authorization((allow) => [allow.publicApiKey(), allow.authenticated()]),

    MarketplaceListing: a
      .model({
        title: a.string().required(),
        subtitle: a.string(),
        description: a.string(),
        price: a.string().required(),
        condition: a.string(),
        category: a.string(),
        image: a.string(),
        images: a.string().array(),
        thumbImages: a.string().array(),
        mediumImages: a.string().array(),
        fullImages: a.string().array(),
        quantity: a.integer().default(1),
        acceptsOffers: a.boolean().default(false),
        acceptedOfferAmount: a.string(),
        featured: a.boolean().default(false),
        status: a.string().default("ACTIVE"),
        sold: a.boolean().default(false),

        buyerEmail: a.string(),
        paid: a.boolean().default(false),
        paidAt: a.datetime(),
        stripeSessionId: a.string(),
        chargeTax: a.boolean().default(false),
        taxRate: a.float().default(6.625),

        sellerUserId: a.string(),
        sellerDisplayName: a.string(),
        sellerEmail: a.string(),
        sellerPublicId: a.string(),
        shippingStatus: a.string(),
        trackingNumber: a.string(),
        carrier: a.string(),
        shippedAt: a.datetime(),
        deliveredAt: a.datetime(),
      })
      .authorization((allow) => [allow.publicApiKey(), allow.authenticated()]),

    Offer: a
      .model({
        listingId: a.string().required(),

        buyerUserId: a.string().required(),
        buyerEmail: a.string(),
        buyerDisplayName: a.string(),

        sellerUserId: a.string().required(),
        sellerEmail: a.string(),

        amount: a.string().required(),
        message: a.string(),

        status: a.string().default("PENDING"),
        read: a.boolean().default(false),
      })
      .authorization((allow) => [allow.authenticated()]),

    Bid: a
      .model({
        auctionId: a.string().required(),
        bidderName: a.string(),
        bidderUserId: a.string(),
        bidderEmail: a.string(),
        amount: a.string(),
        maxBid: a.string(),
        isProxy: a.boolean(),
        createdAt: a.datetime(),
      })
      .secondaryIndexes((index) => [
        index("auctionId").sortKeys(["createdAt"]).queryField("bidsByAuction"),

        index("bidderUserId")
          .sortKeys(["createdAt"])
          .queryField("bidsByBidder"),

        index("bidderEmail")
          .sortKeys(["createdAt"])
          .queryField("bidsByBidderEmail"),
      ])
      .authorization((allow) => [allow.publicApiKey(), allow.authenticated()]),

    BidAuditLog: a
      .model({
        bidRequestId: a.string().required(),

        auctionId: a.string().required(),

        bidderUserId: a.string(),
        bidderEmail: a.string(),
        bidderName: a.string(),

        requestedMaxBid: a.string(),

        accepted: a.boolean().default(false),
        rejectionReason: a.string(),

        previousPrice: a.string(),
        newPrice: a.string(),

        previousLeaderUserId: a.string(),
        newLeaderUserId: a.string(),

        buyerTier: a.string(),
        buyerBidLimit: a.integer(),

        attemptCount: a.integer(),
        resultMessage: a.string(),

        createdAt: a.datetime(),
      })
      .identifier(["bidRequestId"])
      .secondaryIndexes((index) => [
        index("auctionId")
          .sortKeys(["createdAt"])
          .queryField("bidAuditByAuction"),
        index("bidderUserId")
          .sortKeys(["createdAt"])
          .queryField("bidAuditByBidder"),
      ])
      .authorization((allow) => [allow.authenticated()]),

    BuyerProfile: a
      .model({
        userId: a.string().required(),
        email: a.string().required(),

        displayName: a.string(),

        verificationTier: a.string().default("BASIC"),
        bidLimit: a.integer().default(1000),

        status: a.string().default("APPROVED"),

        lastSeenAt: a.datetime(),
        lastSeenPage: a.string(),

        requestedTier: a.string(),
        requestedLimit: a.integer(),
        verificationNotes: a.string(),

        reviewedBy: a.string(),
        reviewedAt: a.datetime(),
      })
      .identifier(["userId"])
      .secondaryIndexes((index) => [
        index("email").queryField("buyerProfileByEmail"),
      ])
      .authorization((allow) => [allow.authenticated()]),

    SellerProfile: a
      .model({
        email: a.string().required(),
        displayName: a.string(),

        status: a.string().default("APPROVED"),

        approvedBy: a.string(),
        approvedAt: a.datetime(),

        revokedBy: a.string(),
        revokedAt: a.datetime(),
      })
      .identifier(["email"])
      .authorization((allow) => [allow.authenticated()]),

    WatchlistItem: a
      .model({
        auctionId: a.string().required(),
        title: a.string().required(),
        image: a.string(),
        href: a.string(),
        userEmail: a.string().required(),
      })
      .authorization((allow) => [allow.authenticated()]),

    placeBid: a
      .mutation()
      .arguments({
        auctionId: a.string().required(),
        maxBid: a.integer().required(),
        bidRequestId: a.string(),
      })
      .returns(
        a.customType({
          success: a.boolean(),
          message: a.string(),
          currentPrice: a.integer(),
          winner: a.string(),
        }),
      )
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(placeBid)),

    finalizeAuction: a
      .mutation()
      .arguments({
        auctionId: a.string().required(),
      })
      .returns(
        a.customType({
          success: a.boolean(),
          message: a.string(),
          status: a.string(),
        }),
      )
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(finalizeAuction)),

    Invoice: a
      .model({
        type: a.string(),
        auctionId: a.string(),
        listingId: a.string(),
        title: a.string(),
        buyerEmail: a.string(),
        sellerEmail: a.string(),
        amount: a.string(),
        status: a.string(),
        stripeSessionId: a.string(),
        paidAt: a.datetime(),
      })
      .authorization((allow) => [allow.publicApiKey(), allow.authenticated()]),
  })
  .authorization((allow) => [
    allow.resource(placeBid),
    allow.resource(finalizeAuction),
    allow.resource(scheduledFinalize),
  ]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
    apiKeyAuthorizationMode: {
      expiresInDays: 30,
    },
  },
});
