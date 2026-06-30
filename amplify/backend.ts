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
import { listGroupMembers } from "./functions/listGroupMembers/resource";
import { notifyOfferSms } from "./functions/notifyOfferSms/resource";
import { autoVerifyBuyer } from "./functions/autoVerifyBuyer/resource";
import { submitVerificationRequest } from "./functions/submitVerificationRequest/resource";
import { getRevenueStats } from "./functions/getRevenueStats/resource";
import { adminListInvoices } from "./functions/adminListInvoices/resource";
import { saveSellerPrefs } from "./functions/saveSellerPrefs/resource";
import { getShippingRates } from "./functions/getShippingRates/resource";
import { purchaseShippingLabel } from "./functions/purchaseShippingLabel/resource";
import { updateShippingByTracking } from "./functions/updateShippingByTracking/resource";
import { reserveListing } from "./functions/reserveListing/resource";
import { sendPhoneOtp } from "./functions/sendPhoneOtp/resource";
import { verifyPhoneOtp } from "./functions/verifyPhoneOtp/resource";
import { createFundsSession } from "./functions/createFundsSession/resource";
import { recordFunds } from "./functions/recordFunds/resource";
import { logError } from "./functions/logError/resource";
import { notifyRelist } from "./functions/notifyRelist/resource";
import { confirmReceipt } from "./functions/confirmReceipt/resource";
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
  listGroupMembers,
  notifyOfferSms,
  autoVerifyBuyer,
  submitVerificationRequest,
  getRevenueStats,
  adminListInvoices,
  saveSellerPrefs,
  getShippingRates,
  purchaseShippingLabel,
  updateShippingByTracking,
  reserveListing,
  sendPhoneOtp,
  verifyPhoneOtp,
  createFundsSession,
  recordFunds,
  logError,
  notifyRelist,
  confirmReceipt,
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
backend.sendPhoneOtp.resources.lambda.addToRolePolicy(snsPolicy);
backend.autoVerifyBuyer.resources.lambda.addToRolePolicy(snsPolicy);
backend.reviewBuyerVerification.resources.lambda.addToRolePolicy(snsPolicy);
backend.submitVerificationRequest.resources.lambda.addToRolePolicy(sesPolicy);
backend.submitVerificationRequest.resources.lambda.addToRolePolicy(snsPolicy);

// getRevenueStats: read-only access to Invoice table
invoiceTable.grantReadData(backend.getRevenueStats.resources.lambda);
const getRevenueStatsCfn = backend.getRevenueStats.resources.lambda.node
  .defaultChild as CfnFunction;
getRevenueStatsCfn.addPropertyOverride(
  "Environment.Variables.INVOICE_TABLE_NAME",
  invoiceTable.tableName,
);

// adminListInvoices: read-only access to Invoice table
invoiceTable.grantReadData(backend.adminListInvoices.resources.lambda);
const adminListInvoicesCfn = backend.adminListInvoices.resources.lambda.node
  .defaultChild as CfnFunction;
adminListInvoicesCfn.addPropertyOverride(
  "Environment.Variables.INVOICE_TABLE_NAME",
  invoiceTable.tableName,
);

const FROM_EMAIL = "noreply@revolutionauctionhouse.com";
const SITE_URL = "https://www.revolutionauctionhouse.com";

// Who receives SMS notifications. Set the SMS_AUDIENCE env var in Amplify to
// flip this without code changes:
//   "all"     → buyers + sellers (default)
//   "sellers" → sellers only (no buyer outbid/watchlist/won texts)
//   "none"    → SMS disabled entirely
const SMS_AUDIENCE = process.env.SMS_AUDIENCE || "all";

placeBidCfn.addPropertyOverride("Environment.Variables.FROM_EMAIL", FROM_EMAIL);
placeBidCfn.addPropertyOverride("Environment.Variables.SITE_URL", SITE_URL);
placeBidCfn.addPropertyOverride("Environment.Variables.SMS_AUDIENCE", SMS_AUDIENCE);

const finalizeAuctionCfn = backend.finalizeAuction.resources.lambda.node
  .defaultChild as CfnFunction;

finalizeAuctionCfn.addPropertyOverride("Environment.Variables.FROM_EMAIL", FROM_EMAIL);
finalizeAuctionCfn.addPropertyOverride("Environment.Variables.SITE_URL", SITE_URL);
finalizeAuctionCfn.addPropertyOverride("Environment.Variables.SMS_AUDIENCE", SMS_AUDIENCE);

// Read the auction straight from DynamoDB so the Lambda gets reservePrice (a
// field-restricted attribute that iam/apiKey reads via AppSync don't return for
// a function). A Lambda has no API key, so the old apiKey read threw
// "No api-key configured".
auctionTable.grantReadData(backend.finalizeAuction.resources.lambda);
finalizeAuctionCfn.addPropertyOverride(
  "Environment.Variables.AUCTION_TABLE_NAME",
  auctionTable.tableName,
);

// Same fix for the scheduled (cron) finalizer.
const scheduledFinalizeCfn = backend.scheduledFinalize.resources.lambda.node
  .defaultChild as CfnFunction;
auctionTable.grantReadData(backend.scheduledFinalize.resources.lambda);
scheduledFinalizeCfn.addPropertyOverride(
  "Environment.Variables.AUCTION_TABLE_NAME",
  auctionTable.tableName,
);

const notifyOfferSmsCfn = backend.notifyOfferSms.resources.lambda.node
  .defaultChild as CfnFunction;

notifyOfferSmsCfn.addPropertyOverride("Environment.Variables.SITE_URL", SITE_URL);
notifyOfferSmsCfn.addPropertyOverride("Environment.Variables.FROM_EMAIL", FROM_EMAIL);
notifyOfferSmsCfn.addPropertyOverride("Environment.Variables.SMS_AUDIENCE", SMS_AUDIENCE);
backend.notifyOfferSms.resources.lambda.addToRolePolicy(sesPolicy);

const submitVerificationRequestCfn = backend.submitVerificationRequest.resources.lambda.node
  .defaultChild as CfnFunction;

submitVerificationRequestCfn.addPropertyOverride("Environment.Variables.FROM_EMAIL", FROM_EMAIL);
submitVerificationRequestCfn.addPropertyOverride("Environment.Variables.SITE_URL", SITE_URL);
submitVerificationRequestCfn.addPropertyOverride("Environment.Variables.SMS_AUDIENCE", SMS_AUDIENCE);

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

// listGroupMembers: read Admin/Seller group membership from Cognito.
backend.listGroupMembers.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ["cognito-idp:ListUsersInGroup"],
    resources: [userPool.userPoolArn],
  }),
);
const listGroupMembersCfn = backend.listGroupMembers.resources.lambda.node
  .defaultChild as CfnFunction;
listGroupMembersCfn.addPropertyOverride("Environment.Variables.USER_POOL_ID", userPool.userPoolId);

const autoVerifyBuyerCfn = backend.autoVerifyBuyer.resources.lambda.node
  .defaultChild as CfnFunction;

autoVerifyBuyerCfn.addPropertyOverride(
  "Environment.Variables.STRIPE_SECRET_KEY",
  process.env.STRIPE_SECRET_KEY || "",
);

const EASYPOST_API_KEY = process.env.EASYPOST_API_KEY || "";

const getShippingRatesCfn = backend.getShippingRates.resources.lambda.node
  .defaultChild as CfnFunction;
getShippingRatesCfn.addPropertyOverride("Environment.Variables.EASYPOST_API_KEY", EASYPOST_API_KEY);

const purchaseShippingLabelCfn = backend.purchaseShippingLabel.resources.lambda.node
  .defaultChild as CfnFunction;
purchaseShippingLabelCfn.addPropertyOverride("Environment.Variables.EASYPOST_API_KEY", EASYPOST_API_KEY);

// Shared secret guarding the tracking-webhook mutation (same value the
// /api/easypost/webhook route uses to verify EasyPost + call the mutation).
const updateShippingByTrackingCfn = backend.updateShippingByTracking.resources.lambda.node
  .defaultChild as CfnFunction;
// Prefer the AMPLIFY_-prefixed value — that's what the Next.js webhook route can
// read at runtime, so the Lambda must check against the SAME value or the
// mutation rejects with "unauthorized".
updateShippingByTrackingCfn.addPropertyOverride(
  "Environment.Variables.WEBHOOK_SECRET",
  process.env.AMPLIFY_EASYPOST_WEBHOOK_SECRET || process.env.EASYPOST_WEBHOOK_SECRET || "",
);

// reserveListing reuses the same shared secret — the /api/checkout route and the
// Stripe webhook pass it to reserve/release listings during checkout.
const reserveListingCfn = backend.reserveListing.resources.lambda.node
  .defaultChild as CfnFunction;
reserveListingCfn.addPropertyOverride(
  "Environment.Variables.WEBHOOK_SECRET",
  process.env.AMPLIFY_EASYPOST_WEBHOOK_SECRET || process.env.EASYPOST_WEBHOOK_SECRET || "",
);

// In-app ErrorLog: the logError Lambda writes directly to its table (so the
// admin page can read it back via AppSync). Gated by a shared secret; reuses the
// EasyPost webhook secret unless ERROR_LOG_SECRET is set.
const errorLogTable = backend.data.resources.tables["ErrorLog"];
errorLogTable.grantWriteData(backend.logError.resources.lambda);
const logErrorCfn = backend.logError.resources.lambda.node.defaultChild as CfnFunction;
logErrorCfn.addPropertyOverride("Environment.Variables.ERROR_LOG_TABLE_NAME", errorLogTable.tableName);
logErrorCfn.addPropertyOverride(
  "Environment.Variables.ERROR_LOG_SECRET",
  process.env.ERROR_LOG_SECRET ||
    process.env.AMPLIFY_EASYPOST_WEBHOOK_SECRET ||
    process.env.EASYPOST_WEBHOOK_SECRET ||
    "",
);

// notifyRelist: emails/texts the original auction's bidders + watchers when an
// item is re-listed. Needs SES + SNS, and the notification env vars.
backend.notifyRelist.resources.lambda.addToRolePolicy(sesPolicy);
backend.notifyRelist.resources.lambda.addToRolePolicy(snsPolicy);
const notifyRelistCfn = backend.notifyRelist.resources.lambda.node.defaultChild as CfnFunction;
notifyRelistCfn.addPropertyOverride("Environment.Variables.FROM_EMAIL", FROM_EMAIL);
notifyRelistCfn.addPropertyOverride("Environment.Variables.SITE_URL", SITE_URL);
notifyRelistCfn.addPropertyOverride("Environment.Variables.SMS_AUDIENCE", SMS_AUDIENCE);

// confirmReceipt: buyer-confirms-receipt → notify seller (SES/SNS).
backend.confirmReceipt.resources.lambda.addToRolePolicy(sesPolicy);
backend.confirmReceipt.resources.lambda.addToRolePolicy(snsPolicy);
const confirmReceiptCfn = backend.confirmReceipt.resources.lambda.node.defaultChild as CfnFunction;
confirmReceiptCfn.addPropertyOverride("Environment.Variables.FROM_EMAIL", FROM_EMAIL);
confirmReceiptCfn.addPropertyOverride("Environment.Variables.SITE_URL", SITE_URL);
confirmReceiptCfn.addPropertyOverride("Environment.Variables.SMS_AUDIENCE", SMS_AUDIENCE);
