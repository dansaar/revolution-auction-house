import { defineFunction } from "@aws-amplify/backend";

export const verifyPhoneOtp = defineFunction({
  name: "verifyPhoneOtp",
  entry: "./handler.ts",
  runtime: 22,
  resourceGroupName: "data",
});
