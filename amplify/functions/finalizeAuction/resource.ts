import { defineFunction } from "@aws-amplify/backend";

export const finalizeAuction = defineFunction({
  name: "finalizeAuction",
  entry: "./handler.ts",
});
