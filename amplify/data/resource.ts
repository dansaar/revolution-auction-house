import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { placeBid } from "../functions/placeBid/resource";
import { finalizeAuction } from "../functions/finalizeAuction/resource";
import { scheduledFinalize } from "../functions/scheduledFinalize/resource";
import { verifyPayment } from "../functions/verifyPayment/resource";
import { reviewBuyerVerification } from "../functions/reviewBuyerVerification/resource";
import { notifyOfferSms } from "../functions/notifyOfferSms/resource";
import { manageSellerGroup } from "../functions/manageSellerGroup/resource";
import { listGroupMembers } from "../functions/listGroupMembers/resource";
import { autoVerifyBuyer } from "../functions/autoVerifyBuyer/resource";
import { submitVerificationRequest } from "../functions/submitVerificationRequest/resource";
import { getRevenueStats } from "../functions/getRevenueStats/resource";
import { adminListInvoices } from "../functions/adminListInvoices/resource";
import { saveSellerPrefs } from "../functions/saveSellerPrefs/resource";
import { getShippingRates } from "../functions/getShippingRates/resource";
import { purchaseShippingLabel } from "../functions/purchaseShippingLabel/resource";
import { updateShippingByTracking } from "../functions/updateShippingByTracking/resource";
import { reserveListing } from "../functions/reserveListing/resource";
import { sendPhoneOtp } from "../functions/sendPhoneOtp/resource";
import { verifyPhoneOtp } from "../functions/verifyPhoneOtp/resource";
import { createFundsSession } from "../functions/createFundsSession/resource";
import { recordFunds } from "../functions/recordFunds/resource";
import { logError } from "../functions/logError/resource";
import { notifyRelist } from "../functions/notifyRelist/resource";
import { confirmReceipt } from "../functions/confirmReceipt/resource";

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
        // Explicit field auth so the owning seller can set/edit reserve (mirrors
        // the model rules — otherwise updates fail with "Unauthorized"). The
        // finalize functions read reserve via apiKey (public read below).
        reservePrice: a.string().authorization((allow) => [
          allow.publicApiKey().to(["read"]),
          allow.group("Seller").to(["create"]),
          allow.ownerDefinedIn("sellerUserId").to(["read", "update"]),
          allow.group("Admin"),
        ]),
        reserveMet: a.boolean(),
        // Set when this auction has been re-listed, so it drops out of the
        // seller's "Unsold" / re-list prompt (avoids duplicate re-lists).
        relistedAt: a.datetime(),
        winningBid: a.string(),
        // PII — not public. Written by placeBid via direct DynamoDB (bypasses
        // field auth); the public browses with the display-name/public-id fields.
        winnerEmail: a.string().authorization((allow) => [
          allow.group("Admin"),
          allow.group("Seller").to(["read"]),
          allow.ownerDefinedIn("sellerUserId").to(["read"]),
        ]),
        // PII — restrict reads; sellers still create/read these.
        sellerName: a.string().authorization((allow) => [
          allow.group("Admin"),
          allow.group("Seller"),
          allow.ownerDefinedIn("sellerUserId").to(["read"]),
        ]),
        sellerEmail: a.string().authorization((allow) => [
          allow.group("Admin"),
          allow.group("Seller"),
          allow.ownerDefinedIn("sellerUserId").to(["read"]),
        ]),
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
        trackingUrl: a.string(), // EasyPost public tracking page (fallback link)
        shippedAt: a.datetime(),
        deliveredAt: a.datetime(),
        buyerReceivedAt: a.datetime(), // buyer-confirmed receipt
        startsAt: a.datetime(),
        increment: a.integer().authorization((allow) => [
          allow.publicApiKey().to(["read"]),
          allow.group("Seller").to(["create"]),
          allow.ownerDefinedIn("sellerUserId").to(["read", "update"]),
          allow.group("Admin"),
        ]),
        easypostShipmentId: a.string(),
        shippingLabelUrl: a.string(),
      })
      .secondaryIndexes((index) => [
        index("sellerUserId").queryField("auctionsBySellerUserId"),
      ])
      .authorization((allow) => [
        allow.publicApiKey().to(['read']),
        // Shared ops model: any approved Seller can read/update any auction
        // (e.g. manage shipping), not just the owner.
        allow.group("Seller").to(['create', 'read', 'update']),
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

        // Buyer identity is keyed on the Cognito sub (not PII) so the buyer can
        // query their own purchases; buyerEmail is restricted (PII).
        buyerUserId: a.string(),
        buyerEmail: a.string().authorization((allow) => [
          allow.group("Admin"),
          allow.group("Seller").to(["read"]),
          allow.ownerDefinedIn("sellerUserId").to(["read"]),
        ]),
        paid: a.boolean().default(false),
        paidAt: a.datetime(),
        stripeSessionId: a.string(),
        chargeTax: a.boolean().default(false),
        taxRate: a.float().default(6.625),

        sellerUserId: a.string(),
        sellerDisplayName: a.string(),
        // PII — restrict reads; sellers still create/read these.
        sellerEmail: a.string().authorization((allow) => [
          allow.group("Admin"),
          allow.group("Seller"),
          allow.ownerDefinedIn("sellerUserId").to(["read"]),
        ]),
        sellerPublicId: a.string(),
        shippingStatus: a.string(),
        trackingNumber: a.string(),
        carrier: a.string(),
        trackingUrl: a.string(), // EasyPost public tracking page (fallback link)
        shippedAt: a.datetime(),
        deliveredAt: a.datetime(),
        buyerReceivedAt: a.datetime(), // buyer-confirmed receipt
        pendingBuyerSub: a.string(), // who holds the PENDING_PAYMENT checkout reservation
        lastOfferSmsAt: a.datetime(),
        easypostShipmentId: a.string(),
        shippingLabelUrl: a.string(),
      })
      .secondaryIndexes((index) => [
        index("sellerUserId").queryField("listingsBySellerUserId"),
      ])
      .authorization((allow) => [
        allow.publicApiKey().to(['read']),
        // Shared ops model: any approved Seller can read/update any listing
        // (e.g. manage shipping), not just the owner.
        allow.group("Seller").to(['create', 'read', 'update']),
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
      .secondaryIndexes((index) => [
        index("sellerUserId").queryField("offersBySellerUserId"),
      ])
      .authorization((allow) => [
        allow.ownerDefinedIn("buyerUserId"),
        allow.ownerDefinedIn("sellerUserId").to(["read", "update", "delete"]),
        allow.group("Seller").to(["read"]),
        allow.group("Admin"),
      ]),

    Bid: a
      .model({
        auctionId: a.string().required(),
        bidderName: a.string(),
        bidderUserId: a.string(),
        // PII — not exposed on the public (apiKey) bid history; the public sees
        // the anonymized bidderName. Admin only (shill review uses BidAuditLog).
        bidderEmail: a.string().authorization((allow) => [allow.group("Admin")]),
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

        verificationTier: a.string().default("BASIC").authorization((allow) => [allow.group("Admin"), allow.group("Seller").to(["read"]), allow.ownerDefinedIn("userId").to(["read"])]),
        bidLimit: a.integer().default(1000).authorization((allow) => [allow.group("Admin"), allow.group("Seller").to(["read"]), allow.ownerDefinedIn("userId").to(["read"])]),

        status: a.string().default("APPROVED").authorization((allow) => [
          allow.group("Admin"),
          allow.ownerDefinedIn("userId").to(["read"]),
          allow.authenticated().to(["read"]),
        ]),

        lastSeenAt: a.datetime(),
        lastSeenPage: a.string(),

        // PII — restrict to owner/Admin/Seller (not all authenticated users).
        // Optional field, so this doesn't trigger the required-field auth rule.
        phoneNumber: a.string().authorization((allow) => [
          allow.ownerDefinedIn("userId"),
          allow.group("Admin"),
          allow.group("Seller").to(["read"]),
        ]),
        smsOptIn: a.boolean().default(false),

        // Phone OTP verification. phoneVerified is owner-readable (so the UI can
        // show status) but only written by the OTP Lambdas (IAM) / Admin — the
        // user can't self-mark verified. The OTP secrets are Admin-only (hidden
        // from the owner), accessed by the Lambdas via IAM.
        phoneVerified: a.boolean().default(false).authorization((allow) => [
          allow.group("Admin"),
          allow.ownerDefinedIn("userId").to(["read"]),
        ]),
        phoneOtpHash: a.string().authorization((allow) => [allow.group("Admin")]),
        phoneOtpExpiresAt: a.datetime().authorization((allow) => [allow.group("Admin")]),
        phoneOtpAttempts: a.integer().authorization((allow) => [allow.group("Admin")]),

        // Proof of funds via Stripe Financial Connections (bank balance). The
        // balance is sensitive, so it's readable only by the owner, sellers, and
        // admins (reviewers) — NOT all authenticated users. Written by the
        // recordFunds Lambda (IAM) / Admin only. stripeCustomerId is internal.
        stripeCustomerId: a.string().authorization((allow) => [allow.group("Admin")]),
        proofOfFundsAmount: a.integer().authorization((allow) => [
          allow.group("Admin"),
          allow.group("Seller").to(["read"]),
          allow.ownerDefinedIn("userId").to(["read"]),
        ]),
        proofOfFundsCurrency: a.string().authorization((allow) => [
          allow.group("Admin"),
          allow.group("Seller").to(["read"]),
          allow.ownerDefinedIn("userId").to(["read"]),
        ]),
        proofOfFundsBank: a.string().authorization((allow) => [
          allow.group("Admin"),
          allow.group("Seller").to(["read"]),
          allow.ownerDefinedIn("userId").to(["read"]),
        ]),
        proofOfFundsAt: a.datetime().authorization((allow) => [
          allow.group("Admin"),
          allow.group("Seller").to(["read"]),
          allow.ownerDefinedIn("userId").to(["read"]),
        ]),
        proofOfFundsStatus: a.string().authorization((allow) => [
          allow.group("Admin"),
          allow.group("Seller").to(["read"]),
          allow.ownerDefinedIn("userId").to(["read"]),
        ]),

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
        notifyVerifications: a.string().default("none"), // "email" | "sms" | "both" | "none"
        notifyOffers: a.string().default("none"),        // "email" | "sms" | "both" | "none"
        notifyReceipt: a.string().default("email"),      // buyer-confirmed-receipt alerts
        phoneNumber: a.string(),

        // Phone OTP verification (written only by the OTP Lambdas via IAM —
        // sellers can't self-mark verified; OTP secrets are Admin-only).
        phoneVerified: a.boolean().default(false),
        phoneOtpHash: a.string().authorization((allow) => [allow.group("Admin")]),
        phoneOtpExpiresAt: a.datetime().authorization((allow) => [allow.group("Admin")]),
        phoneOtpAttempts: a.integer().authorization((allow) => [allow.group("Admin")]),

        // Ship-from address for label generation
        shipFromName: a.string(),
        shipFromStreet1: a.string(),
        shipFromStreet2: a.string(),
        shipFromCity: a.string(),
        shipFromState: a.string(),
        shipFromZip: a.string(),
        shipFromPhone: a.string(),
      })
      .identifier(["email"])
      .authorization((allow) => [
        // Email is the lookup key/contact data only — not an auth identity.
        // Reads are open to any authenticated user (needed for seller lookups);
        // writes go through the Admin panel (Admin group) and the saveSellerPrefs
        // Lambda (IAM), so no case-sensitive email-identity rule is needed.
        allow.authenticated().to(["read"]),
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

    // Site-wide announcement ticker. Singleton row (id = "GLOBAL"); public read
    // so every visitor sees it, sellers/admins write.
    SiteAnnouncement: a
      .model({
        message: a.string(),
        active: a.boolean().default(false),
        linkUrl: a.string(),
        linkLabel: a.string(),
        variant: a.string(), // "info" | "special" | "alert" — controls color
        updatedBy: a.string(),
      })
      .authorization((allow) => [
        allow.publicApiKey().to(["read"]),
        allow.authenticated().to(["read"]),
        allow.group("Seller"),
        allow.group("Admin"),
      ]),

    // In-app error backstop. Written by the logError Lambda (direct DynamoDB);
    // only admins can read/manage from the dashboard.
    ErrorLog: a
      .model({
        source: a.string(),
        message: a.string(),
        context: a.string(),
        severity: a.string(),
        url: a.string(),
      })
      .authorization((allow) => [allow.group("Admin")]),

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
    sellerUserId: a.string(),

    subtotal: a.string(),
    buyerPremium: a.string(),
    tax: a.string(),
    amount: a.string(),

    status: a.string(),
    stripeSessionId: a.string(),
    paidAt: a.datetime(),

    shippingName: a.string(),
    shippingPhone: a.string(),
    shippingLine1: a.string(),
    shippingLine2: a.string(),
    shippingCity: a.string(),
    shippingState: a.string(),
    shippingZip: a.string(),
    shippingCountry: a.string(),
  })
      .secondaryIndexes((index) => [
        index("sellerEmail").queryField("invoicesBySellerEmail"),
        index("sellerUserId").queryField("invoicesBySellerUserId"),
        index("buyerUserId").queryField("invoicesByBuyer"),
      ])
      .authorization((allow) => [
        // Identity/authorization is keyed off the Cognito sub (buyer/seller
        // userId), never email. Email remains only as display/contact data and
        // for the legacy invoicesBySellerEmail lookup index.
        allow.ownerDefinedIn("buyerUserId"),
        allow.ownerDefinedIn("sellerUserId"),
        // Shared ops: any Seller can read invoices (e.g. ship-to for any order).
        allow.group("Seller").to(["read"]),
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
        bidLimit: a.integer(), // exact limit for PRIVATE ($10K–$1M); ignored for fixed tiers
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

    listGroupMembers: a
      .query()
      .returns(
        a.customType({
          admin: a.string().array(),
          seller: a.string().array(),
          error: a.string(),
        }),
      )
      .authorization((allow) => [allow.group("Admin")])
      .handler(a.handler.function(listGroupMembers)),

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
        requestedLimit: a.integer(), // buyer's desired limit ($10K–$1M) for PRIVATE
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

    saveSellerPrefs: a
      .mutation()
      .arguments({
        notifyVerifications: a.string(),
        notifyOffers: a.string(),
        notifyReceipt: a.string(),
        phoneNumber: a.string(),
        shipFromName: a.string(),
        shipFromStreet1: a.string(),
        shipFromStreet2: a.string(),
        shipFromCity: a.string(),
        shipFromState: a.string(),
        shipFromZip: a.string(),
        shipFromPhone: a.string(),
      })
      .returns(a.customType({ success: a.boolean() }))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(saveSellerPrefs)),

    getShippingRates: a
      .mutation()
      .arguments({
        itemId: a.string().required(),
        itemType: a.string().required(),
        weight: a.float().required(),
        length: a.float(),
        width: a.float(),
        height: a.float(),
        fromName: a.string().required(),
        fromStreet1: a.string().required(),
        fromStreet2: a.string(),
        fromCity: a.string().required(),
        fromState: a.string().required(),
        fromZip: a.string().required(),
        fromPhone: a.string(),
        // Optional manual recipient address; overrides the invoice address.
        toName: a.string(),
        toStreet1: a.string(),
        toStreet2: a.string(),
        toCity: a.string(),
        toState: a.string(),
        toZip: a.string(),
        toPhone: a.string(),
      })
      .returns(a.customType({
        shipmentId: a.string(),
        ratesJson: a.string(),
        error: a.string(),
      }))
      .authorization((allow) => [allow.group("Seller"), allow.group("Admin")])
      .handler(a.handler.function(getShippingRates)),

    purchaseShippingLabel: a
      .mutation()
      .arguments({
        itemId: a.string().required(),
        itemType: a.string().required(),
        shipmentId: a.string().required(),
        rateId: a.string().required(),
      })
      .returns(a.customType({
        success: a.boolean(),
        trackingNumber: a.string(),
        carrier: a.string(),
        labelUrl: a.string(),
        error: a.string(),
      }))
      .authorization((allow) => [allow.group("Seller"), allow.group("Admin")])
      .handler(a.handler.function(purchaseShippingLabel)),

    // Called by the EasyPost tracking webhook to advance shippingStatus by
    // tracking number. Public apiKey so the webhook route can reach it, but the
    // Lambda requires a shared secret so it can't be spoofed.
    updateShippingByTracking: a
      .mutation()
      .arguments({
        trackingCode: a.string().required(),
        status: a.string().required(),
        secret: a.string().required(),
        trackingUrl: a.string(), // EasyPost public tracking page (backfill)
      })
      .returns(a.customType({
        updated: a.integer(),
        message: a.string(),
      }))
      .authorization((allow) => [allow.publicApiKey()])
      .handler(a.handler.function(updateShippingByTracking)),

    // Reserve/release a marketplace listing during checkout. Gated by the shared
    // secret so a public apiKey caller can't flip listing status.
    reserveListing: a
      .mutation()
      .arguments({
        listingIds: a.string().array().required(),
        action: a.string().required(), // "RESERVE" | "RELEASE"
        buyerSub: a.string(), // reserver, so they can retry their own checkout
        secret: a.string().required(),
      })
      .returns(a.customType({
        updated: a.integer(),
        message: a.string(),
      }))
      .authorization((allow) => [allow.publicApiKey()])
      .handler(a.handler.function(reserveListing)),

    // Phone verification: send a one-time code by SMS, then verify it.
    sendPhoneOtp: a
      .mutation()
      .arguments({ phoneNumber: a.string().required(), target: a.string() })
      .returns(a.customType({ success: a.boolean(), message: a.string() }))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(sendPhoneOtp)),

    verifyPhoneOtp: a
      .mutation()
      .arguments({ code: a.string().required(), target: a.string() })
      .returns(a.customType({ success: a.boolean(), verified: a.boolean(), message: a.string() }))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(verifyPhoneOtp)),

    // Proof of funds (Stripe Financial Connections — bank balance).
    createFundsSession: a
      .mutation()
      .arguments({})
      .returns(a.customType({ clientSecret: a.string(), error: a.string() }))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(createFundsSession)),

    recordFunds: a
      .mutation()
      .arguments({ accountId: a.string().required() })
      .returns(a.customType({
        success: a.boolean(),
        amount: a.integer(),
        bank: a.string(),
        status: a.string(),
        message: a.string(),
      }))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(recordFunds)),

    // In-app error backstop. publicApiKey so server API routes can call it; the
    // Lambda requires a shared secret so the public key can't spoof entries.
    logError: a
      .mutation()
      .arguments({
        source: a.string().required(),
        message: a.string().required(),
        context: a.string(),
        severity: a.string(),
        url: a.string(),
        secret: a.string().required(),
      })
      .returns(a.customType({ ok: a.boolean() }))
      .authorization((allow) => [allow.publicApiKey()])
      .handler(a.handler.function(logError)),

    // Buyer confirms they received the item (records buyerReceivedAt + notifies
    // the seller per their notifyReceipt pref). Buyer-only; handler verifies.
    confirmReceipt: a
      .mutation()
      .arguments({
        itemId: a.string().required(),
        itemType: a.string().required(),
      })
      .returns(a.customType({ success: a.boolean(), message: a.string() }))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(confirmReceipt)),

    // Notify the original auction's bidders + watchers that it's been re-listed.
    // Seller/Admin only (the handler also verifies caller owns the new auction).
    notifyRelist: a
      .mutation()
      .arguments({
        originalAuctionId: a.string().required(),
        newAuctionId: a.string().required(),
      })
      .returns(a.customType({ success: a.boolean(), notified: a.integer(), message: a.string() }))
      .authorization((allow) => [allow.group("Seller"), allow.group("Admin")])
      .handler(a.handler.function(notifyRelist)),
  })
  .authorization((allow) => [
    allow.resource(placeBid),
    allow.resource(finalizeAuction),
    allow.resource(scheduledFinalize),
    allow.resource(verifyPayment),
    allow.resource(reviewBuyerVerification),
    allow.resource(manageSellerGroup),
    allow.resource(listGroupMembers),
    allow.resource(notifyOfferSms),
    allow.resource(autoVerifyBuyer),
    allow.resource(submitVerificationRequest),
    allow.resource(getRevenueStats),
    allow.resource(adminListInvoices),
    allow.resource(saveSellerPrefs),
    allow.resource(getShippingRates),
    allow.resource(purchaseShippingLabel),
    allow.resource(updateShippingByTracking),
    allow.resource(reserveListing),
    allow.resource(sendPhoneOtp),
    allow.resource(verifyPhoneOtp),
    allow.resource(createFundsSession),
    allow.resource(recordFunds),
    allow.resource(logError),
    allow.resource(notifyRelist),
    allow.resource(confirmReceipt),
  ]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
    apiKeyAuthorizationMode: {
      // Public reads (homepage live ticker, auction/marketplace listings) use
      // this key. It rotates on backend deploy; a longer TTL avoids it silently
      // expiring (max 365). Regenerate amplify_outputs.json after each backend
      // deploy so the committed key/introspection stays in sync.
      expiresInDays: 365,
    },
  },
});
