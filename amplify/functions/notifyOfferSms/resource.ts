import { defineFunction } from "@aws-amplify/backend";

export const notifyOfferSms = defineFunction({
  name: "notifyOfferSms",
  entry: "./handler.ts",
  // SES + SNS sends.
  timeoutSeconds: 30,
  runtime: 22,
  resourceGroupName: "data",
});
