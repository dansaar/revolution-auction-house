import { defineFunction, secret } from "@aws-amplify/backend";

export const verifyPayment = defineFunction({
  name: "verifyPayment",
  entry: "./handler.ts",
  // Stripe payment verification.
  timeoutSeconds: 30,
  runtime: 22,
  resourceGroupName: "data",
  environment: {
    STRIPE_SECRET_KEY: secret("STRIPE_SECRET_KEY"),
  },
});
