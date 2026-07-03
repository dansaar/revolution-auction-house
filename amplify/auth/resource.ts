import { defineAuth } from "@aws-amplify/backend";

export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  // Optional TOTP: existing users are unaffected; enrolled users get a
  // second factor at sign-in (handled on the /signin page).
  multifactor: {
    mode: "OPTIONAL",
    totp: true,
  },
  groups: ["Admin", "Seller"],
  senders: {
    email: {
      fromEmail: "noreply@revolutionauctionhouse.com",
      fromName: "Revolution Auction House",
    },
  },
});
