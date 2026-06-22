import type { Schema } from "../../data/resource";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { env } from "$amplify/env/logError";

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Shared secret so the public apiKey caller (server API routes) can't be spoofed.
const SECRET = (env as any).ERROR_LOG_SECRET || "";
const TABLE = (env as any).ERROR_LOG_TABLE_NAME || "";

// Writes are direct to DynamoDB (granted in backend.ts), so the admin page can
// read them back via AppSync (Admin-only). Cap field sizes to keep items small.
function clamp(v: unknown, max: number): string {
  const s = v == null ? "" : String(v);
  return s.length > max ? s.slice(0, max) : s;
}

export const handler: Schema["logError"]["functionHandler"] = async (event) => {
  const { source, message, context, severity, url, secret } = event.arguments;

  if (!SECRET || secret !== SECRET) {
    return { ok: false };
  }
  if (!TABLE) {
    console.error("LOG_ERROR_NO_TABLE");
    return { ok: false };
  }

  const now = new Date().toISOString();
  try {
    await doc.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          __typename: "ErrorLog",
          id: crypto.randomUUID(),
          source: clamp(source, 200),
          message: clamp(message, 4000),
          context: clamp(context, 8000),
          severity: clamp(severity || "ERROR", 20),
          url: clamp(url, 500),
          createdAt: now,
          updatedAt: now,
        },
      }),
    );
    return { ok: true };
  } catch (err) {
    console.error("LOG_ERROR_WRITE_FAILED", err);
    return { ok: false };
  }
};
