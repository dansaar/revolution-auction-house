import { defineFunction } from "@aws-amplify/backend";

export const scheduledFinalize = defineFunction({
  name: "scheduledFinalize",
  entry: "./handler.ts",
  schedule: "every 1m",
});
