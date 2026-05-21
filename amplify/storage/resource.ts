import { defineStorage } from "@aws-amplify/backend";

export const storage = defineStorage({
  name: "auctionImages",
  access: (allow) => ({
    "auction-images/*": [
      allow.guest.to(["read"]),
      allow.authenticated.to(["read", "write", "delete"]),
    ],
  }),
});
