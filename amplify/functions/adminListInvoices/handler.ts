import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.INVOICE_TABLE_NAME!;

export const handler = async () => {
  const items: any[] = [];
  let lastKey: Record<string, any> | undefined;

  do {
    const result = await ddb.send(
      new ScanCommand({ TableName: TABLE, ExclusiveStartKey: lastKey }),
    );
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return { invoicesJson: JSON.stringify(items) };
};
