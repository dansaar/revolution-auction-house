import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { storage } from "./storage/resource";
import { placeBid } from "./functions/placeBid/resource";
import { finalizeAuction } from "./functions/finalizeAuction/resource";
import { scheduledFinalize } from "./functions/scheduledFinalize/resource";

defineBackend({
  auth,
  data,
  storage,
  placeBid,
  finalizeAuction,
  scheduledFinalize,
});