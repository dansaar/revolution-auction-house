import { defineFunction, secret } from "@aws-amplify/backend";

export const createFundsSession = defineFunction({
  name: "createFundsSession",
  entry: "./handler.ts",
  // Stripe API call.
  timeoutSeconds: 30,
  runtime: 22,
  resourceGroupName: "data",
  environment: {
    STRIPE_SECRET_KEY: secret("STRIPE_SECRET_KEY"),
  },
});
