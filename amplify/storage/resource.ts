import { defineStorage } from "@aws-amplify/backend";

export const storage = defineStorage({
  name: "auctionImages",
  access: (allow) => ({
    "auction-images/*": [
      allow.guest.to(["get", "list"]),
      allow.authenticated.to(["get", "list", "write", "delete"]),
    ],
    "marketplace-images/*": [
      allow.guest.to(["get", "list"]),
      allow.authenticated.to(["get", "list", "write", "delete"]),
    ],
  }),
});