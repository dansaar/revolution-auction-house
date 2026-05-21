// amplify/functions/placeBid/resource.ts
import { defineFunction } from "@aws-amplify/backend";

export const placeBid = defineFunction({
  name: "placeBid",
  entry: "./handler.ts",
  runtime: 22,
});
