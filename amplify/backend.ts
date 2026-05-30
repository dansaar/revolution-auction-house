import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { storage } from "./storage/resource";
import { placeBid } from "./functions/placeBid/resource";
import { finalizeAuction } from "./functions/finalizeAuction/resource";
import { scheduledFinalize } from "./functions/scheduledFinalize/resource";
import { CfnFunction } from "aws-cdk-lib/aws-lambda";

const backend = defineBackend({
  auth,
  data,
  storage,
  placeBid,
  finalizeAuction,
  scheduledFinalize,
});

const auctionTable = backend.data.resources.tables["Auction"];
const auctionStateTable = backend.data.resources.tables["AuctionState"];
const bidTable = backend.data.resources.tables["Bid"];
const buyerProfileTable = backend.data.resources.tables["BuyerProfile"];

auctionTable.grantReadWriteData(backend.placeBid.resources.lambda);
auctionStateTable.grantReadWriteData(backend.placeBid.resources.lambda);
bidTable.grantReadWriteData(backend.placeBid.resources.lambda);
buyerProfileTable.grantReadWriteData(backend.placeBid.resources.lambda);

const placeBidCfn = backend.placeBid.resources.lambda.node
  .defaultChild as CfnFunction;

placeBidCfn.addPropertyOverride(
  "Environment.Variables.AUCTION_TABLE_NAME",
  auctionTable.tableName,
);

placeBidCfn.addPropertyOverride(
  "Environment.Variables.AUCTION_STATE_TABLE_NAME",
  auctionStateTable.tableName,
);

placeBidCfn.addPropertyOverride(
  "Environment.Variables.BID_TABLE_NAME",
  bidTable.tableName,
);

placeBidCfn.addPropertyOverride(
  "Environment.Variables.BUYER_PROFILE_TABLE_NAME",
  buyerProfileTable.tableName,
);
