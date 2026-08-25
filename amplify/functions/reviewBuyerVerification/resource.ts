import { defineFunction } from "@aws-amplify/backend";

export const reviewBuyerVerification = defineFunction({
  name: "reviewBuyerVerification",
  entry: "./handler.ts",
  // SNS notification.
  timeoutSeconds: 30,
  runtime: 22,
  resourceGroupName: "data",
});
