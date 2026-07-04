// amplify/functions/placeBid/resource.ts
import { defineFunction } from "@aws-amplify/backend";

export const placeBid = defineFunction({
  name: "placeBid",
  entry: "./handler.ts",
  runtime: 22,
  resourceGroupName: "data",
  // Notifications are awaited before returning (Lambda freezes at return);
  // a heavily-watched lot can take several seconds to fan out.
  timeoutSeconds: 30,
});
