import { defineFunction } from "@aws-amplify/backend";

export const saveSellerPrefs = defineFunction({
  name: "saveSellerPrefs",
  entry: "./handler.ts",
  runtime: 22,
  resourceGroupName: "data",
});
