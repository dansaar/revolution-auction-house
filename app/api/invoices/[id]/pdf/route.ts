import { NextResponse } from "next/server";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import outputs from "@/amplify_outputs.json";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import jsPDF from "jspdf";

Amplify.configure(outputs);

const client = generateClient<Schema>();

const verifier = CognitoJwtVerifier.create({
  userPoolId: outputs.auth.user_pool_id,
  tokenUse: "id",
  clientId: outputs.auth.user_pool_client_id,
});

function formatInvoiceAmount(value: string | number | null | undefined) {
  const amount = Number(String(value || "0").replace(/[$,]/g, ""));

  if (!Number.isFinite(amount)) return "$0";

  return `$${Math.round(amount).toLocaleString()}`;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const invoiceResult = await client.models.Invoice.get({ id }, {
      authMode: "apiKey",
    } as any);

    const invoice = invoiceResult.data;

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : "";

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let payload: any;

    try {
      payload = await verifier.verify(token);
    } catch (err) {
      console.error("INVOICE JWT VERIFY ERROR:", err);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentEmail = String(payload.email || "").toLowerCase();

    const sellerEmail = String(invoice.sellerEmail || "").toLowerCase();
    const buyerEmail = String(invoice.buyerEmail || "").toLowerCase();

    const canView = currentEmail === sellerEmail || currentEmail === buyerEmail;

    if (!canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const doc = new jsPDF();

    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 210, 297, "F");

    doc.setTextColor(20, 20, 20);
    doc.setFontSize(26);
    doc.text("Revolution Auction House", 20, 28);

    doc.setDrawColor(214, 170, 85);
    doc.line(20, 35, 190, 35);

    doc.setFontSize(12);
    doc.setTextColor(30, 30, 30);

    doc.text(`Invoice Type: ${invoice.type}`, 20, 55);
    doc.text(`Title: ${invoice.title}`, 20, 70);
    doc.text(`Buyer: ${invoice.buyerEmail}`, 20, 85);
    doc.text(`Seller: ${invoice.sellerEmail}`, 20, 100);
    doc.text(`Amount Paid: ${formatInvoiceAmount(invoice.amount)}`, 20, 115);
    doc.text(`Status: ${invoice.status}`, 20, 130);

    doc.text(
      `Paid At: ${
        invoice.paidAt ? new Date(invoice.paidAt).toLocaleString() : "-"
      }`,
      20,
      145,
    );

    const stripeSessionText = `Stripe Session: ${invoice.stripeSessionId || "-"}`;
    const stripeSessionLines = doc.splitTextToSize(stripeSessionText, 170);

    doc.text(stripeSessionLines, 20, 160);

    const pdfBuffer = doc.output("arraybuffer");

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="invoice-${invoice.id}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error("PDF INVOICE ERROR:", err);

    return NextResponse.json(
      {
        error: err?.message || "Failed to generate invoice PDF",
      },
      { status: 500 },
    );
  }
}
