import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { storage } from "./storage/resource";
import { placeBid } from "./functions/placeBid/resource";
import { finalizeAuction } from "./functions/finalizeAuction/resource";
import { scheduledFinalize } from "./functions/scheduledFinalize/resource";
import { verifyPayment } from "./functions/verifyPayment/resource";
import { reviewBuyerVerification } from "./functions/reviewBuyerVerification/resource";
import { manageSellerGroup } from "./functions/manageSellerGroup/resource";
import { notifyOfferSms } from "./functions/notifyOfferSms/resource";
import { autoVerifyBuyer } from "./functions/autoVerifyBuyer/resource";
import { submitVerificationRequest } from "./functions/submitVerificationRequest/resource";
import { getRevenueStats } from "./functions/getRevenueStats/resource";
import { CfnFunction } from "aws-cdk-lib/aws-lambda";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";

const backend = defineBackend({
  auth,
  data,
  storage,
  placeBid,
  finalizeAuction,
  scheduledFinalize,
  verifyPayment,
  reviewBuyerVerification,
  manageSellerGroup,
  notifyOfferSms,
  autoVerifyBuyer,
  submitVerificationRequest,
  getRevenueStats,
});

const auctionTable = backend.data.resources.tables["Auction"];
const auctionStateTable = backend.data.resources.tables["AuctionState"];
const bidTable = backend.data.resources.tables["Bid"];
const buyerProfileTable = backend.data.resources.tables["BuyerProfile"];
const bidAuditLogTable = backend.data.resources.tables["BidAuditLog"];
const invoiceTable = backend.data.resources.tables["Invoice"];

auctionTable.grantReadWriteData(backend.placeBid.resources.lambda);
auctionStateTable.grantReadWriteData(backend.placeBid.resources.lambda);
bidTable.grantReadWriteData(backend.placeBid.resources.lambda);
buyerProfileTable.grantReadWriteData(backend.placeBid.resources.lambda);
bidAuditLogTable.grantReadWriteData(backend.placeBid.resources.lambda);

const placeBidCfn = backend.placeBid.resources.lambda.node
  .defaultChild as CfnFunction;

placeBidCfn.addPropertyOverride("Environment.Variables.AUCTION_TABLE_NAME", auctionTable.tableName);
placeBidCfn.addPropertyOverride("Environment.Variables.AUCTION_STATE_TABLE_NAME", auctionStateTable.tableName);
placeBidCfn.addPropertyOverride("Environment.Variables.BID_TABLE_NAME", bidTable.tableName);
placeBidCfn.addPropertyOverride("Environment.Variables.BUYER_PROFILE_TABLE_NAME", buyerProfileTable.tableName);
placeBidCfn.addPropertyOverride("Environment.Variables.BID_AUDIT_LOG_TABLE_NAME", bidAuditLogTable.tableName);

// SES for winner emails — FROM_EMAIL must be SES-verified in console
const sesPolicy = new PolicyStatement({
  actions: ["ses:SendEmail", "ses:SendRawEmail"],
  resources: ["*"],
});

// SNS for SMS notifications
const snsPolicy = new PolicyStatement({
  actions: ["sns:Publish"],
  resources: ["*"],
});

backend.placeBid.resources.lambda.addToRolePolicy(snsPolicy);
backend.placeBid.resources.lambda.addToRolePolicy(sesPolicy);
backend.finalizeAuction.resources.lambda.addToRolePolicy(sesPolicy);
backend.finalizeAuction.resources.lambda.addToRolePolicy(snsPolicy);
backend.notifyOfferSms.resources.lambda.addToRolePolicy(snsPolicy);
backend.autoVerifyBuyer.resources.lambda.addToRolePolicy(snsPolicy);
backend.reviewBuyerVerification.resources.lambda.addToRolePolicy(snsPolicy);

// getRevenueStats: read-only access to Invoice table
invoiceTable.grantReadData(backend.getRevenueStats.resources.lambda);
const getRevenueStatsCfn = backend.getRevenueStats.resources.lambda.node
  .defaultChild as CfnFunction;
getRevenueStatsCfn.addPropertyOverride(
  "Environment.Variables.INVOICE_TABLE_NAME",
  invoiceTable.tableName,
);

const FROM_EMAIL = "noreply@revolutionauctionhouse.com";
const SITE_URL = "https://www.revolutionauctionhouse.com";

placeBidCfn.addPropertyOverride("Environment.Variables.FROM_EMAIL", FROM_EMAIL);
placeBidCfn.addPropertyOverride("Environment.Variables.SITE_URL", SITE_URL);

const finalizeAuctionCfn = backend.finalizeAuction.resources.lambda.node
  .defaultChild as CfnFunction;

finalizeAuctionCfn.addPropertyOverride("Environment.Variables.FROM_EMAIL", FROM_EMAIL);
finalizeAuctionCfn.addPropertyOverride("Environment.Variables.SITE_URL", SITE_URL);

const notifyOfferSmsCfn = backend.notifyOfferSms.resources.lambda.node
  .defaultChild as CfnFunction;

notifyOfferSmsCfn.addPropertyOverride("Environment.Variables.SITE_URL", SITE_URL);

const userPool = backend.auth.resources.userPool;

backend.manageSellerGroup.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: [
      "cognito-idp:ListUsers",
      "cognito-idp:AdminAddUserToGroup",
      "cognito-idp:AdminRemoveUserFromGroup",
    ],
    resources: [userPool.userPoolArn],
  }),
);

const manageSellerGroupCfn = backend.manageSellerGroup.resources.lambda.node
  .defaultChild as CfnFunction;

manageSellerGroupCfn.addPropertyOverride("Environment.Variables.USER_POOL_ID", userPool.userPoolId);

// AUTO_VERIFY_TOKEN is a shared secret between the Next.js webhook handler and this Lambda.
// Set the actual value in Amplify console environment variables (never commit it).
const autoVerifyBuyerCfn = backend.autoVerifyBuyer.resources.lambda.node
  .defaultChild as CfnFunction;

autoVerifyBuyerCfn.addPropertyOverride(
  "Environment.Variables.AUTO_VERIFY_TOKEN",
  process.env.AUTO_VERIFY_TOKEN || "",
);
