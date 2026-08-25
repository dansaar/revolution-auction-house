import { defineFunction } from "@aws-amplify/backend";

export const saveSellerPrefs = defineFunction({
  name: "saveSellerPrefs",
  entry: "./handler.ts",
  // DynamoDB write only, but 3s leaves no headroom.
  timeoutSeconds: 15,
  runtime: 22,
  resourceGroupName: "data",
});
