import { defineFunction } from "@aws-amplify/backend";

export const manageSellerGroup = defineFunction({
  name: "manageSellerGroup",
  entry: "./handler.ts",
  runtime: 22,
  resourceGroupName: "data",
});
