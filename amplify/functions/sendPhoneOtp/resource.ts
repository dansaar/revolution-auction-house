import { defineFunction } from "@aws-amplify/backend";

export const sendPhoneOtp = defineFunction({
  name: "sendPhoneOtp",
  entry: "./handler.ts",
  // SNS SMS send.
  timeoutSeconds: 30,
  runtime: 22,
  resourceGroupName: "data",
});
