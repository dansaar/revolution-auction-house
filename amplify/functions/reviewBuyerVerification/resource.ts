import { defineFunction } from "@aws-amplify/backend";

export const reviewBuyerVerification = defineFunction({
  name: "reviewBuyerVerification",
  entry: "./handler.ts",
  runtime: 22,
  resourceGroupName: "data",
});
