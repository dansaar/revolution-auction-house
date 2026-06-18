import { defineFunction } from "@aws-amplify/backend";

export const sendPhoneOtp = defineFunction({
  name: "sendPhoneOtp",
  entry: "./handler.ts",
  runtime: 22,
  resourceGroupName: "data",
});
