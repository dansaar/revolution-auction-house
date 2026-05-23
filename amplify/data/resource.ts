import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { placeBid } from "../functions/placeBid/resource";
import { finalizeAuction } from "../functions/finalizeAuction/resource";

const schema = a.schema({
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
      paid: a.boolean().default(false),
      paidAt: a.datetime(),
      stripeSessionId: a.string(),
      description: a.string(),
      grade: a.string(),
      certNumber: a.string(),
      year: a.string(),
      setName: a.string(),
      cardNumber: a.string(),
      population: a.string(),
      provenance: a.string(),
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
      featured: a.boolean().default(false),
      status: a.string().default("ACTIVE"),
      sold: a.boolean().default(false),
      sellerUserId: a.string(),
      sellerDisplayName: a.string(),
      sellerEmail: a.string(),
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

      index("bidderUserId").sortKeys(["createdAt"]).queryField("bidsByBidder"),

      index("bidderEmail")
        .sortKeys(["createdAt"])
        .queryField("bidsByBidderEmail"),
    ])
    .authorization((allow) => [allow.publicApiKey(), allow.authenticated()]),

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
});

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
