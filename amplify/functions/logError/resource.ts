import { defineFunction } from "@aws-amplify/backend";

export const logError = defineFunction({
  name: "logError",
  entry: "./handler.ts",
  runtime: 22,
  resourceGroupName: "data",
});
