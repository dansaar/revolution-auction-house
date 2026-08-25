import { defineFunction } from "@aws-amplify/backend";

export const updateShippingByTracking = defineFunction({
  name: "updateShippingByTracking",
  entry: "./handler.ts",
  // EasyPost API call.
  timeoutSeconds: 30,
  runtime: 22,
  resourceGroupName: "data",
});
