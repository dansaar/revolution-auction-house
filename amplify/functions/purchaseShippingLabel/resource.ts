import { defineFunction } from "@aws-amplify/backend";

export const purchaseShippingLabel = defineFunction({
  name: "purchaseShippingLabel",
  entry: "./handler.ts",
  runtime: 22,
  resourceGroupName: "data",
});
