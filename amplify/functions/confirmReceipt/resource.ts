import { defineFunction } from "@aws-amplify/backend";

export const confirmReceipt = defineFunction({
  name: "confirmReceipt",
  entry: "./handler.ts",
  // SES + SNS sends.
  timeoutSeconds: 30,
  runtime: 22,
  resourceGroupName: "data",
});
