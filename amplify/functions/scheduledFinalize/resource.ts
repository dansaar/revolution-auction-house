import { defineFunction } from "@aws-amplify/backend";

export const scheduledFinalize = defineFunction({
  name: "scheduledFinalize",
  entry: "./handler.ts",
  // Scans the auction table every minute. Capped at 60s so a slow
  // scan cannot overlap the next cron tick (peaked ~1.4s at 18 auctions).
  timeoutSeconds: 60,
  schedule: "every 1m",
  resourceGroupName: "data",
});
