import { defineFunction } from "@aws-amplify/backend";

export const purchaseShippingLabel = defineFunction({
  name: "purchaseShippingLabel",
  entry: "./handler.ts",
  runtime: 22,
  resourceGroupName: "data",
  // Buying a label makes EasyPost call the carrier to generate postage, which
  // can take 5–15s+. The default 3s timeout was failing the purchase.
  timeoutSeconds: 60,
});
