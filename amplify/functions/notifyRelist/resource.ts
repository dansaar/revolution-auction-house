import { defineFunction } from "@aws-amplify/backend";

export const notifyRelist = defineFunction({
  name: "notifyRelist",
  entry: "./handler.ts",
  runtime: 22,
  resourceGroupName: "data",
  timeoutSeconds: 120,
});
