import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.INVOICE_TABLE_NAME!;

function moneyToNumber(value: string | number | null | undefined): number {
  if (!value) return 0;
  if (typeof value === "number") return value;
  return Number(String(value).replace(/[$,]/g, "")) || 0;
}

function monthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

async function getAllInvoices(): Promise<any[]> {
  const all: any[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await ddb.send(
      new ScanCommand({
        TableName: TABLE,
        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      }),
    );
    all.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return all;
}

function computeStats(invoices: any[]) {
  const paid = invoices.filter((i) => i.status === "PAID" || i.paidAt);
  const pending = invoices.filter((i) => !i.paidAt && i.status !== "PAID");

  const auctionInvoices = paid.filter((i) => i.type === "AUCTION" || (i.auctionId && !i.listingId));
  const marketInvoices  = paid.filter((i) => i.type === "MARKETPLACE" || (i.listingId && !i.auctionId));

  function aggregate(list: any[]) {
    let gross = 0, hammer = 0, premium = 0, tax = 0;
    const monthMap: Record<string, { gross: number; premium: number }> = {};
    const sellerMap: Record<string, number> = {};

    for (const inv of list) {
      const g = moneyToNumber(inv.amount);
      const h = moneyToNumber(inv.subtotal);
      const p = moneyToNumber(inv.buyerPremium);
      const t = moneyToNumber(inv.tax);
      gross   += g;
      hammer  += h;
      premium += p;
      tax     += t;

      if (inv.paidAt) {
        const k = monthKey(inv.paidAt);
        if (!monthMap[k]) monthMap[k] = { gross: 0, premium: 0 };
        monthMap[k].gross   += g;
        monthMap[k].premium += p;
      }

      if (inv.sellerEmail) {
        sellerMap[inv.sellerEmail] = (sellerMap[inv.sellerEmail] || 0) + g;
      }
    }

    const monthly = Object.keys(monthMap)
      .sort()
      .slice(-12)
      .map((k) => ({ key: k, label: monthLabel(k), ...monthMap[k] }));

    const topSellers = Object.entries(sellerMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([email, revenue]) => ({
        email,
        revenue,
        share: gross > 0 ? Math.round((revenue / gross) * 1000) / 10 : 0,
      }));

    return { gross, hammer, premium, tax, count: list.length, monthly, topSellers };
  }

  const allStats     = aggregate(paid);
  const auctionStats = aggregate(auctionInvoices);
  const marketStats  = aggregate(marketInvoices);
  const pendingValue = pending.reduce((s, i) => s + moneyToNumber(i.amount), 0);

  const statsJson = JSON.stringify({
    all:        allStats,
    auctions:   auctionStats,
    marketplace: marketStats,
    pending:    { value: pendingValue, count: pending.length },
  });

  // Most recent 100 paid transactions
  const recent = [...paid]
    .sort((a, b) =>
      new Date(b.paidAt || b.updatedAt || 0).getTime() -
      new Date(a.paidAt || a.updatedAt || 0).getTime(),
    )
    .slice(0, 100)
    .map((i) => ({
      id:           i.id,
      paidAt:       i.paidAt,
      title:        i.title,
      buyerEmail:   i.buyerEmail,
      sellerEmail:  i.sellerEmail,
      subtotal:     i.subtotal,
      buyerPremium: i.buyerPremium,
      tax:          i.tax,
      amount:       i.amount,
      type:         i.type || (i.auctionId ? "AUCTION" : "MARKETPLACE"),
    }));

  return { statsJson, recentJson: JSON.stringify(recent) };
}

export const handler = async () => {
  try {
    const invoices = await getAllInvoices();
    return computeStats(invoices);
  } catch (err: any) {
    console.error("GET_REVENUE_STATS_ERROR", err);
    return {
      statsJson: JSON.stringify({ all: {}, auctions: {}, marketplace: {}, pending: {} }),
      recentJson: "[]",
    };
  }
};
