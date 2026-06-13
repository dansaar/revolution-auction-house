import { defineFunction } from "@aws-amplify/backend";

export const getShippingRates = defineFunction({
  name: "getShippingRates",
  entry: "./handler.ts",
  runtime: 22,
  resourceGroupName: "data",
});
