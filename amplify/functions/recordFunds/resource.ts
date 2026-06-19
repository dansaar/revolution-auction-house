import { defineFunction, secret } from "@aws-amplify/backend";

export const recordFunds = defineFunction({
  name: "recordFunds",
  entry: "./handler.ts",
  runtime: 22,
  timeoutSeconds: 30, // balance refresh is async; we poll briefly
  resourceGroupName: "data",
  environment: {
    STRIPE_SECRET_KEY: secret("STRIPE_SECRET_KEY"),
  },
});
