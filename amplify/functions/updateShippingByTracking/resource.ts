import { defineFunction } from "@aws-amplify/backend";

export const updateShippingByTracking = defineFunction({
  name: "updateShippingByTracking",
  entry: "./handler.ts",
  runtime: 22,
  resourceGroupName: "data",
});
