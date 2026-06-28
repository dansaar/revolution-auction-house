import { defineFunction } from "@aws-amplify/backend";

export const finalizeAuction = defineFunction({
  name: "finalizeAuction",
  entry: "./handler.ts",
  // In the data stack — it's a data resolver AND reads the Auction table, which
  // would otherwise create a circular dependency between the data/function stacks.
  resourceGroupName: "data",
});
