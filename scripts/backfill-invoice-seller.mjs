/**
 * One-time backfill: set Invoice.sellerUserId on older records.
 *
 * Invoices created before the sellerUserId change have no sellerUserId, so the
 * seller dashboard (which now keys off sellerUserId) can't match them. This
 * script fills it in from the related Auction / MarketplaceListing record.
 *
 * Uses your local AWS credentials (DynamoDB admin). Dry-run by default.
 *
 * Usage:
 *   node scripts/backfill-invoice-seller.mjs                 # dry run, shows what would change
 *   node scripts/backfill-invoice-seller.mjs --apply         # actually write
 *   node scripts/backfill-invoice-seller.mjs --api-id abc123 # disambiguate if multiple envs
 *   node scripts/backfill-invoice-seller.mjs --region us-east-1
 */

import {
  DynamoDBClient,
  ListTablesCommand,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  GetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return process.argv[i + 1];
}
const APPLY = process.argv.includes("--apply");
const REGION = arg("region", "us-east-1");
const API_ID = arg("api-id", ""); // optional substring to disambiguate tables

const ddb = new DynamoDBClient({ region: REGION });
const doc = DynamoDBDocumentClient.from(ddb);

// ── Discover the Amplify-generated table names ──────────────────────────────
async function listAllTables() {
  const names = [];
  let ExclusiveStartTableName;
  do {
    const res = await ddb.send(new ListTablesCommand({ ExclusiveStartTableName }));
    names.push(...(res.TableNames || []));
    ExclusiveStartTableName = res.LastEvaluatedTableName;
  } while (ExclusiveStartTableName);
  return names;
}

function pickTable(all, model) {
  // Amplify names look like: Model-<apiId>-<branch> (e.g. Invoice-abc123-NONE)
  let matches = all.filter((t) => t.startsWith(`${model}-`));
  if (API_ID) matches = matches.filter((t) => t.includes(API_ID));
  if (matches.length === 0) {
    throw new Error(`No DynamoDB table found for model "${model}".`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Multiple "${model}" tables found:\n  ${matches.join("\n  ")}\n` +
        `Re-run with --api-id <id> to pick one.`,
    );
  }
  return matches[0];
}

async function scanAll(TableName) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await doc.send(
      new ScanCommand({ TableName, ExclusiveStartKey }),
    );
    items.push(...(res.Items || []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function main() {
  const all = await listAllTables();
  const INVOICE = pickTable(all, "Invoice");
  const AUCTION = pickTable(all, "Auction");
  const LISTING = pickTable(all, "MarketplaceListing");

  console.log(`Region:   ${REGION}`);
  console.log(`Mode:     ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes)"}`);
  console.log(`Invoice:  ${INVOICE}`);
  console.log(`Auction:  ${AUCTION}`);
  console.log(`Listing:  ${LISTING}\n`);

  const invoices = await scanAll(INVOICE);
  console.log(`Scanned ${invoices.length} invoices.\n`);

  // Cache source records so we don't refetch the same auction/listing.
  const sourceCache = new Map();
  async function sellerSubFor(invoice) {
    if (invoice.auctionId) {
      const key = `A:${invoice.auctionId}`;
      if (!sourceCache.has(key)) {
        const r = await doc.send(
          new GetCommand({ TableName: AUCTION, Key: { id: invoice.auctionId } }),
        );
        sourceCache.set(key, r.Item?.sellerUserId || "");
      }
      return sourceCache.get(key);
    }
    if (invoice.listingId) {
      const key = `L:${invoice.listingId}`;
      if (!sourceCache.has(key)) {
        const r = await doc.send(
          new GetCommand({ TableName: LISTING, Key: { id: invoice.listingId } }),
        );
        sourceCache.set(key, r.Item?.sellerUserId || "");
      }
      return sourceCache.get(key);
    }
    return "";
  }

  let already = 0;
  let updated = 0;
  let unresolved = 0;

  for (const inv of invoices) {
    if (inv.sellerUserId) {
      already++;
      continue;
    }
    const sub = await sellerSubFor(inv);
    if (!sub) {
      unresolved++;
      console.log(
        `  ⚠ ${inv.id} — no sellerUserId on source (auctionId=${inv.auctionId || "-"} listingId=${inv.listingId || "-"})`,
      );
      continue;
    }

    console.log(`  ${APPLY ? "→" : "would set"} ${inv.id}  sellerUserId=${sub}  (seller ${inv.sellerEmail || "?"})`);
    if (APPLY) {
      await doc.send(
        new UpdateCommand({
          TableName: INVOICE,
          Key: { id: inv.id },
          UpdateExpression: "SET sellerUserId = :s, updatedAt = :u",
          // Don't clobber a value written in the meantime.
          ConditionExpression: "attribute_not_exists(sellerUserId) OR sellerUserId = :empty",
          ExpressionAttributeValues: {
            ":s": sub,
            ":u": new Date().toISOString(),
            ":empty": "",
          },
        }),
      ).catch((err) => {
        if (err?.name === "ConditionalCheckFailedException") return; // already set concurrently
        throw err;
      });
      updated++;
    } else {
      updated++;
    }
  }

  console.log(`\nSummary:`);
  console.log(`  already had sellerUserId: ${already}`);
  console.log(`  ${APPLY ? "updated" : "would update"}:            ${updated}`);
  console.log(`  unresolved (no source):   ${unresolved}`);
  if (!APPLY) console.log(`\nRe-run with --apply to write these changes.`);
}

main().catch((err) => {
  console.error("BACKFILL FAILED:", err);
  process.exit(1);
});
