import { defineFunction } from "@aws-amplify/backend";

export const getRevenueStats = defineFunction({
  name: "getRevenueStats",
  entry: "./handler.ts",
  runtime: 22,
  resourceGroupName: "data",
  timeoutSeconds: 30,
});
