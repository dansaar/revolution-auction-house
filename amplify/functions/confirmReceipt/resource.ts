import { defineFunction } from "@aws-amplify/backend";

export const confirmReceipt = defineFunction({
  name: "confirmReceipt",
  entry: "./handler.ts",
  runtime: 22,
  resourceGroupName: "data",
});
