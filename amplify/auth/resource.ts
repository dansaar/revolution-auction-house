import { defineAuth } from "@aws-amplify/backend";

export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  groups: ["Admin", "Seller"],
  senders: {
    email: {
      fromEmail: "noreply@revolutionauctionhouse.com",
      fromName: "Revolution Auction House",
    },
  },
});
