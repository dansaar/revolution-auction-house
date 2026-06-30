import { defineFunction } from "@aws-amplify/backend";

export const listGroupMembers = defineFunction({
  name: "listGroupMembers",
  entry: "./handler.ts",
  runtime: 22,
  resourceGroupName: "data",
});
