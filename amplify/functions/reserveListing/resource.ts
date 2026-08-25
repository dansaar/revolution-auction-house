import { defineFunction } from "@aws-amplify/backend";

export const reserveListing = defineFunction({
  name: "reserveListing",
  entry: "./handler.ts",
  // Stripe + EasyPost calls.
  timeoutSeconds: 30,
  runtime: 22,
  resourceGroupName: "data",
});
