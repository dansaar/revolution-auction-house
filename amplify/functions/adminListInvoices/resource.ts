import { defineFunction } from "@aws-amplify/backend";

export const adminListInvoices = defineFunction({
  name: "adminListInvoices",
  entry: "./handler.ts",
  runtime: 22,
  resourceGroupName: "data",
  timeoutSeconds: 30,
});
