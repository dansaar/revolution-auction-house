import { defineFunction } from "@aws-amplify/backend";

export const manageSellerGroup = defineFunction({
  name: "manageSellerGroup",
  entry: "./handler.ts",
  // Cognito group add/remove.
  timeoutSeconds: 30,
  runtime: 22,
  resourceGroupName: "data",
});
