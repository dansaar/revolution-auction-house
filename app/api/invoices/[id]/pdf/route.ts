import { NextResponse } from "next/server";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import outputs from "@/amplify_outputs.json";
import { cookies } from "next/headers";
import { runWithAmplifyServerContext } from "@/lib/amplify-server-utils";
import { getCurrentUser } from "aws-amplify/auth/server";

import jsPDF from "jspdf";

Amplify.configure(outputs);

const client = generateClient<Schema>();

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

    let currentUser;

    try {
      currentUser = await runWithAmplifyServerContext({
        nextServerContext: { cookies },
        operation: (contextSpec: any) => getCurrentUser(contextSpec),
      });
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentEmail =
      currentUser.signInDetails?.loginId || currentUser.username || "";

    const canView =
      invoice.sellerEmail === currentEmail ||
      invoice.buyerEmail === currentEmail;

    if (!canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const doc = new jsPDF();

    doc.setFillColor(5, 6, 7);
    doc.rect(0, 0, 210, 297, "F");

    doc.setTextColor(192, 192, 192);
    doc.setFontSize(26);
    doc.text("Revolution Auction House", 20, 28);

    doc.setFontSize(12);
    doc.setTextColor(230, 230, 230);

    doc.text(`Invoice Type: ${invoice.type}`, 20, 55);
    doc.text(`Title: ${invoice.title}`, 20, 70);
    doc.text(`Buyer: ${invoice.buyerEmail}`, 20, 85);
    doc.text(`Seller: ${invoice.sellerEmail}`, 20, 100);
    doc.text(`Amount Paid: ${invoice.amount}`, 20, 115);
    doc.text(`Status: ${invoice.status}`, 20, 130);

    doc.text(
      `Paid At: ${
        invoice.paidAt ? new Date(invoice.paidAt).toLocaleString() : "-"
      }`,
      20,
      145,
    );

    doc.text(`Stripe Session: ${invoice.stripeSessionId || "-"}`, 20, 160);

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
