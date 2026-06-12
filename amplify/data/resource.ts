import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { placeBid } from "../functions/placeBid/resource";
import { finalizeAuction } from "../functions/finalizeAuction/resource";
import { scheduledFinalize } from "../functions/scheduledFinalize/resource";
import { verifyPayment } from "../functions/verifyPayment/resource";
import { reviewBuyerVerification } from "../functions/reviewBuyerVerification/resource";
import { notifyOfferSms } from "../functions/notifyOfferSms/resource";
import { manageSellerGroup } from "../functions/manageSellerGroup/resource";
import { autoVerifyBuyer } from "../functions/autoVerifyBuyer/resource";
import { submitVerificationRequest } from "../functions/submitVerificationRequest/resource";
import { getRevenueStats } from "../functions/getRevenueStats/resource";
import { adminListInvoices } from "../functions/adminListInvoices/resource";

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

        buyerPremiumRate: a.float().default(18),

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
        startsAt: a.datetime(),
      })
      .secondaryIndexes((index) => [
        index("sellerUserId").queryField("auctionsBySellerUserId"),
      ])
      .authorization((allow) => [
        allow.publicApiKey().to(['read']),
        allow.group("Seller").to(['create']),
        allow.ownerDefinedIn("sellerUserId").to(['read', 'update']),
        allow.group("Admin"),
      ]),

    AuctionState: a
      .model({
        auctionId: a.string().required(),

        currentPrice: a.string().required(),

        leaderUserId: a.string(),
        leaderDisplayName: a.string(),
        leaderEmail: a.string(),
        leaderMaxBid: a.string().authorization((allow) => [allow.group("Admin")]),

        secondUserId: a.string(),
        secondEmail: a.string(),
        secondMaxBid: a.string().authorization((allow) => [allow.group("Admin")]),

        bidCount: a.integer().default(0),

        version: a.integer().default(1),

        endsAt: a.datetime(),
        ended: a.boolean().default(false),
      })
      .identifier(["auctionId"])
      .authorization((allow) => [
        allow.publicApiKey().to(['read']),
        allow.authenticated().to(['create']),
        allow.group("Admin"),
      ]),

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
        lastOfferSmsAt: a.datetime(),
      })
      .secondaryIndexes((index) => [
        index("sellerUserId").queryField("listingsBySellerUserId"),
      ])
      .authorization((allow) => [
        allow.publicApiKey().to(['read']),
        allow.group("Seller").to(['create']),
        allow.ownerDefinedIn("sellerUserId").to(['read', 'update']),
        allow.group("Admin"),
      ]),

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
      .authorization((allow) => [
        allow.ownerDefinedIn("buyerUserId"),
        allow.ownerDefinedIn("sellerUserId").to(["read", "update", "delete"]),
        allow.group("Admin"),
      ]),

    Bid: a
      .model({
        auctionId: a.string().required(),
        bidderName: a.string(),
        bidderUserId: a.string(),
        bidderEmail: a.string(),
        amount: a.string(),
        maxBid: a.string().authorization((allow) => [allow.group("Admin")]),
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
      .authorization((allow) => [
        allow.publicApiKey().to(['read']),
        allow.group("Admin"),
      ]),

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
      .authorization((allow) => [allow.group("Admin").to(["read"])]),

    BuyerProfile: a
      .model({
        userId: a.string().required(),
        email: a.string().required(),

        displayName: a.string(),

        verificationTier: a.string().default("BASIC").authorization((allow) => [allow.group("Admin"), allow.group("Seller").to(["read"])]),
        bidLimit: a.integer().default(1000).authorization((allow) => [allow.group("Admin"), allow.group("Seller").to(["read"])]),

        status: a.string().default("APPROVED").authorization((allow) => [
          allow.group("Admin"),
          allow.ownerDefinedIn("userId").to(["read"]),
          allow.authenticated().to(["read"]),
        ]),

        lastSeenAt: a.datetime(),
        lastSeenPage: a.string(),

        phoneNumber: a.string(),
        smsOptIn: a.boolean().default(false),

        notifyOutbid: a.string().default("sms"),
        notifyWon: a.string().default("both"),
        notifyWatchlist: a.string().default("none"),

        requestedTier: a.string(),
        requestedLimit: a.integer(),
        verificationNotes: a.string(),

        reviewedBy: a.string().authorization((allow) => [allow.group("Admin")]),
        reviewedAt: a.datetime().authorization((allow) => [allow.group("Admin")]),
      })
      .identifier(["userId"])
      .secondaryIndexes((index) => [
        index("email").queryField("buyerProfileByEmail"),
      ])
      .authorization((allow) => [
        allow.ownerDefinedIn("userId"),
        allow.authenticated().to(["read"]),
        allow.group("Admin"),
      ]),

    SellerProfile: a
      .model({
        email: a.string().required(),
        displayName: a.string(),

        status: a.string().default("APPROVED"),

        approvedBy: a.string(),
        approvedAt: a.datetime(),

        revokedBy: a.string(),
        revokedAt: a.datetime(),

        // Notification preferences
        notifyVerifications: a.string().default("email"), // "email" | "sms" | "both" | "none"
        notifyOffers: a.string().default("email"),        // "email" | "sms" | "both" | "none"
        phoneNumber: a.string(),
      })
      .identifier(["email"])
      .authorization((allow) => [
        allow.authenticated().to(["read"]),
        allow.ownerDefinedIn("email").identityClaim("email").to(["read", "update"]),
        allow.group("Admin"),
      ]),

    WatchlistItem: a
      .model({
        auctionId: a.string().required(),
        title: a.string().required(),
        image: a.string(),
        href: a.string(),
        userEmail: a.string(),
        userSub: a.string(),
      })
      .secondaryIndexes((index) => [
        index("auctionId").queryField("watchlistByAuction"),
      ])
      .authorization((allow) => [
        allow.ownerDefinedIn("userSub"),
        allow.group("Admin"),
      ]),

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
    buyerUserId: a.string(),
    sellerEmail: a.string(),

    subtotal: a.string(),
    buyerPremium: a.string(),
    tax: a.string(),
    amount: a.string(),

    status: a.string(),
    stripeSessionId: a.string(),
    paidAt: a.datetime(),

    shippingName: a.string(),
    shippingLine1: a.string(),
    shippingLine2: a.string(),
    shippingCity: a.string(),
    shippingState: a.string(),
    shippingZip: a.string(),
    shippingCountry: a.string(),
  })
      .secondaryIndexes((index) => [
        index("sellerEmail").queryField("invoicesBySellerEmail"),
        index("buyerUserId").queryField("invoicesByBuyer"),
      ])
      .authorization((allow) => [
        allow.ownerDefinedIn("buyerUserId"),
        allow.ownerDefinedIn("sellerEmail").identityClaim("email"),
        allow.group("Admin"),
      ]),

    verifyPayment: a
      .mutation()
      .arguments({
        sessionId: a.string().required(),
      })
      .returns(
        a.customType({
          paid: a.boolean(),
          type: a.string(),
          itemCount: a.integer(),
          auctionId: a.string(),
          listingId: a.string(),
          error: a.string(),
        }),
      )
      .authorization((allow) => [allow.authenticated(), allow.publicApiKey()])
      .handler(a.handler.function(verifyPayment)),

    reviewBuyerVerification: a
      .mutation()
      .arguments({
        userId: a.string().required(),
        approved: a.boolean().required(),
        tier: a.string(),
      })
      .returns(
        a.customType({
          success: a.boolean(),
          message: a.string(),
        }),
      )
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(reviewBuyerVerification)),

    manageSellerGroup: a
      .mutation()
      .arguments({
        email: a.string().required(),
        action: a.string().required(),
      })
      .returns(
        a.customType({
          success: a.boolean(),
          message: a.string(),
        }),
      )
      .authorization((allow) => [allow.group("Admin")])
      .handler(a.handler.function(manageSellerGroup)),

    notifySellerOfferSms: a
      .mutation()
      .arguments({
        sellerEmail: a.string().required(),
        listingId: a.string().required(),
        listingTitle: a.string().required(),
        offerAmount: a.string().required(),
      })
      .returns(a.customType({ sent: a.boolean() }))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(notifyOfferSms)),

    autoVerifyBuyer: a
      .mutation()
      .arguments({
        email: a.string().required(),
        stripeSessionId: a.string().required(),
        webhookToken: a.string().required(),
      })
      .returns(a.customType({ success: a.boolean() }))
      .authorization((allow) => [allow.publicApiKey()])
      .handler(a.handler.function(autoVerifyBuyer)),

    submitVerificationRequest: a
      .mutation()
      .arguments({
        requestedTier: a.string().required(),
        verificationNotes: a.string(),
      })
      .returns(a.customType({ success: a.boolean(), message: a.string() }))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(submitVerificationRequest)),

    getRevenueStats: a
      .query()
      .arguments({ startDate: a.string(), endDate: a.string() })
      .returns(a.customType({
        statsJson: a.string(),
        recentJson: a.string(),
      }))
      .authorization((allow) => [allow.group("Admin"), allow.group("Seller")])
      .handler(a.handler.function(getRevenueStats)),

    adminListInvoices: a
      .query()
      .arguments({})
      .returns(a.customType({
        invoicesJson: a.string(),
      }))
      .authorization((allow) => [allow.group("Admin")])
      .handler(a.handler.function(adminListInvoices)),
  })
  .authorization((allow) => [
    allow.resource(placeBid),
    allow.resource(finalizeAuction),
    allow.resource(scheduledFinalize),
    allow.resource(verifyPayment),
    allow.resource(reviewBuyerVerification),
    allow.resource(manageSellerGroup),
    allow.resource(notifyOfferSms),
    allow.resource(autoVerifyBuyer),
    allow.resource(submitVerificationRequest),
    allow.resource(getRevenueStats),
    allow.resource(adminListInvoices),
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
