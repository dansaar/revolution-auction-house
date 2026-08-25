import { defineFunction } from "@aws-amplify/backend";

export const submitVerificationRequest = defineFunction({
  name: "submitVerificationRequest",
  entry: "./handler.ts",
  // SES + SNS sends.
  timeoutSeconds: 30,
  runtime: 22,
  resourceGroupName: "data",
});
