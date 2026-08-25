import { defineFunction } from "@aws-amplify/backend";

export const autoVerifyBuyer = defineFunction({
  name: "autoVerifyBuyer",
  entry: "./handler.ts",
  // Stripe session lookup + SNS.
  timeoutSeconds: 30,
  runtime: 22,
  resourceGroupName: "data",
});
