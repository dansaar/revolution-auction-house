import { defineFunction } from "@aws-amplify/backend";

export const listGroupMembers = defineFunction({
  name: "listGroupMembers",
  entry: "./handler.ts",
  // Cognito ListUsers (paginates).
  timeoutSeconds: 30,
  runtime: 22,
  resourceGroupName: "data",
});
