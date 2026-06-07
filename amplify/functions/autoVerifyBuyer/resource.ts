import { defineFunction } from "@aws-amplify/backend";

export const autoVerifyBuyer = defineFunction({
  name: "autoVerifyBuyer",
  entry: "./handler.ts",
  runtime: 22,
  resourceGroupName: "data",
});
