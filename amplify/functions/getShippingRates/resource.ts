import { defineFunction } from "@aws-amplify/backend";

export const getShippingRates = defineFunction({
  name: "getShippingRates",
  entry: "./handler.ts",
  runtime: 22,
  resourceGroupName: "data",
  // Rate lookups hit carrier APIs; give headroom over the 3s default so a slow
  // carrier response doesn't fail the lookup.
  timeoutSeconds: 30,
});
