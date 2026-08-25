import { defineFunction } from "@aws-amplify/backend";

export const finalizeAuction = defineFunction({
  name: "finalizeAuction",
  entry: "./handler.ts",
  // Table scan plus SES/SNS per finalized auction; on-demand, so no
  // cron-overlap concern.
  timeoutSeconds: 120,
  // In the data stack — it's a data resolver AND reads the Auction table, which
  // would otherwise create a circular dependency between the data/function stacks.
  resourceGroupName: "data",
});
