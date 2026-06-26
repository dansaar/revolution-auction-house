import { defineFunction } from "@aws-amplify/backend";

export const reserveListing = defineFunction({
  name: "reserveListing",
  entry: "./handler.ts",
  runtime: 22,
  resourceGroupName: "data",
});
