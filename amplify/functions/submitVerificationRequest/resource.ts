import { defineFunction } from "@aws-amplify/backend";

export const submitVerificationRequest = defineFunction({
  name: "submitVerificationRequest",
  entry: "./handler.ts",
  runtime: 22,
  resourceGroupName: "data",
});
