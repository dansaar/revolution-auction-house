/**
 * One-time: clear `featured` on listings that are already sold/paid.
 * Dry-run by default; pass --apply to write.
 *
 *   node scripts/unfeature-sold.mjs --api-id k53c2xozcfbgbp25b4pdxpfzau
 *   node scripts/unfeature-sold.mjs --api-id k53c2xozcfbgbp25b4pdxpfzau --apply
 */
import { DynamoDBClient, ListTablesCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
const APPLY = process.argv.includes("--apply");
const REGION = arg("region", "us-east-1");
const API_ID = arg("api-id", "");

const ddb = new DynamoDBClient({ region: REGION });
const doc = DynamoDBDocumentClient.from(ddb);

async function pickTable() {
  const names = [];
  let start;
  do {
    const r = await ddb.send(new ListTablesCommand({ ExclusiveStartTableName: start }));
    names.push(...(r.TableNames || []));
    start = r.LastEvaluatedTableName;
  } while (start);
  let m = names.filter((t) => t.startsWith("MarketplaceListing-"));
  if (API_ID) m = m.filter((t) => t.includes(API_ID));
  if (m.length !== 1) throw new Error(`Need exactly one MarketplaceListing table; found:\n  ${m.join("\n  ")}\nUse --api-id`);
  return m[0];
}

async function main() {
  const table = await pickTable();
  console.log(`Table: ${table}\nMode:  ${APPLY ? "APPLY" : "DRY RUN"}\n`);

  const items = [];
  let start;
  do {
    const r = await doc.send(new ScanCommand({ TableName: table, ExclusiveStartKey: start }));
    items.push(...(r.Items || []));
    start = r.LastEvaluatedKey;
  } while (start);

  const targets = items.filter((l) => l.featured === true && (l.sold === true || l.status === "SOLD"));
  console.log(`Scanned ${items.length} listings; ${targets.length} sold-but-featured.\n`);

  for (const l of targets) {
    console.log(`  ${APPLY ? "→" : "would clear"} ${l.id}  "${l.title || ""}"`);
    if (APPLY) {
      await doc.send(new UpdateCommand({
        TableName: table,
        Key: { id: l.id },
        UpdateExpression: "SET featured = :f, updatedAt = :u",
        ExpressionAttributeValues: { ":f": false, ":u": new Date().toISOString() },
      }));
    }
  }
  console.log(`\n${APPLY ? "Cleared" : "Would clear"}: ${targets.length}`);
  if (!APPLY) console.log("Re-run with --apply to write.");
}
main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
