import { defineFunction } from "@aws-amplify/backend";

export const notifyOfferSms = defineFunction({
  name: "notifyOfferSms",
  entry: "./handler.ts",
  runtime: 22,
  resourceGroupName: "data",
});
