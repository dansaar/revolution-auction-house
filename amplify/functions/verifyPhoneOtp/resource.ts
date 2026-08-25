import { defineFunction } from "@aws-amplify/backend";

export const verifyPhoneOtp = defineFunction({
  name: "verifyPhoneOtp",
  entry: "./handler.ts",
  // DynamoDB read/write only, but 3s leaves no headroom.
  timeoutSeconds: 15,
  runtime: 22,
  resourceGroupName: "data",
});
