import { NextResponse } from "next/server";
import outputs from "@/amplify_outputs.json";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import jsPDF from "jspdf";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { serverLogError } from "@/lib/serverLogError";

const verifier = CognitoJwtVerifier.create({
  userPoolId: outputs.auth.user_pool_id,
  tokenUse: "id",
  clientId: outputs.auth.user_pool_client_id,
});

function formatInvoiceAmount(value: string | number | null | undefined) {
  const amount = Number(String(value || "0").replace(/[$,]/g, ""));

  if (!Number.isFinite(amount)) return "$0.00";

  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function moneyToNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  return Number(String(value).replace(/[$,]/g, ""));
}

function getInvoiceNumber(invoice: any) {
  return `RAH-INV-${String(invoice.id || "")
    .slice(0, 8)
    .toUpperCase()}`;
}

function getLogoDataUrl() {
  try {
    const logoPath = join(process.cwd(), "public", "invoice-logo.png");

    if (!existsSync(logoPath)) return null;

    const logoBuffer = readFileSync(logoPath);
    return `data:image/png;base64,${logoBuffer.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

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

    const gqlResponse = await fetch(outputs.data.url as string, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: token,
      },
      body: JSON.stringify({
        query: `query GetInvoice($id: ID!) {
          getInvoice(id: $id) {
            id type auctionId listingId title
            buyerEmail sellerEmail
            subtotal buyerPremium tax amount
            status stripeSessionId paidAt
            shippingName shippingPhone shippingLine1 shippingLine2
            shippingCity shippingState shippingZip shippingCountry
          }
        }`,
        variables: { id },
      }),
    });

    const gqlData = await gqlResponse.json();
    const invoice = gqlData?.data?.getInvoice;

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const currentEmail = String(payload.email || "").toLowerCase();
    const groups = (payload["cognito:groups"] as string[]) || [];
    const isAdmin = groups.includes("Admin");

    const sellerEmail = String(invoice.sellerEmail || "").toLowerCase();
    const buyerEmail = String(invoice.buyerEmail || "").toLowerCase();

    const canView =
      isAdmin || currentEmail === sellerEmail || currentEmail === buyerEmail;

    if (!canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const doc = new jsPDF();

    const invoiceNumber = getInvoiceNumber(invoice);
    const logoDataUrl = getLogoDataUrl();

    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 210, 297, "F");

    // Header
    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, "PNG", 20, 14, 28, 28);
      } catch {
        // Keep invoice generation working even if logo render fails.
      }
    }

    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.text("Revolution Auction House", logoDataUrl ? 55 : 20, 27);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(90, 90, 90);
    doc.text("Buyer & Seller Invoice", logoDataUrl ? 55 : 20, 35);

    doc.setDrawColor(214, 170, 85);
    doc.setLineWidth(0.5);
    doc.line(20, 48, 190, 48);

    // Invoice heading
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(20, 20, 20);
    doc.text("INVOICE", 20, 65);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    doc.text(`Invoice #: ${invoiceNumber}`, 20, 74);

    doc.text(
      `Paid At: ${
        invoice.paidAt ? new Date(invoice.paidAt).toLocaleString("en-US", { timeZone: "America/New_York" }) : "-"
      }`,
      20,
      82,
    );

    // Amount box
    doc.setFillColor(248, 245, 238);
    doc.setDrawColor(214, 170, 85);
    doc.roundedRect(135, 58, 55, 28, 3, 3, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(120, 90, 40);
    doc.text("AMOUNT PAID", 141, 68);

    doc.setFontSize(18);
    doc.setTextColor(20, 20, 20);
    doc.text(formatInvoiceAmount(invoice.amount), 141, 79);

    const subtotal = invoice.subtotal || invoice.amount;
    const buyerPremium = invoice.buyerPremium || "$0";
    const tax = invoice.tax || "$0";

    // Pre-calculate box height based on content
    const titleLines = doc.splitTextToSize(`Title: ${invoice.title || "-"}`, 150);
    const stripeSessionText = `Stripe Session: ${invoice.stripeSessionId || "-"}`;
    const stripeSessionLines = doc.splitTextToSize(stripeSessionText, 150);

    let contentHeight = 28; // top padding (box top 98 → first y 126)
    contentHeight += 11; // Invoice Type
    contentHeight += titleLines.length * 7 + 4; // Title
    contentHeight += 11; // Buyer
    contentHeight += 11; // Seller
    contentHeight += 11; // Status
    contentHeight += 11; // Subtotal
    if (moneyToNumber(buyerPremium) > 0) contentHeight += 11;
    if (moneyToNumber(tax) > 0) contentHeight += 11;
    contentHeight += 12; // Total Paid
    if (invoice.shippingLine1) {
      contentHeight += 14; // "Ship To:" header + gap
      if (invoice.shippingName) contentHeight += 7;
      if (invoice.shippingPhone) contentHeight += 7;
      contentHeight += 7; // line1
      if (invoice.shippingLine2) contentHeight += 7;
      contentHeight += 12; // city/state/zip
    }
    contentHeight += stripeSessionLines.length * 6 + 10; // Stripe session + bottom padding

    // Details card — height adjusts to content
    doc.setDrawColor(225, 225, 225);
    doc.setFillColor(252, 252, 252);
    doc.roundedRect(20, 98, 170, contentHeight, 3, 3, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(20, 20, 20);
    doc.text("Transaction Details", 28, 112);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(45, 45, 45);

    let y = 126;

    doc.text(`Invoice Type: ${invoice.type || "-"}`, 28, y);
    y += 11;

    doc.text(titleLines, 28, y);
    y += titleLines.length * 7 + 4;

    doc.text(`Buyer: ${invoice.buyerEmail || "-"}`, 28, y);
    y += 11;

    doc.text(`Seller: ${invoice.sellerEmail || "-"}`, 28, y);
    y += 11;

    doc.text(`Status: ${invoice.status || "PAID"}`, 28, y);
    y += 11;

    doc.text(`Subtotal: ${formatInvoiceAmount(subtotal)}`, 28, y);
    y += 11;

    if (moneyToNumber(buyerPremium) > 0) {
      doc.text(`Buyer Premium: ${formatInvoiceAmount(buyerPremium)}`, 28, y);
      y += 11;
    }

    if (moneyToNumber(tax) > 0) {
      doc.text(`Tax: ${formatInvoiceAmount(tax)}`, 28, y);
      y += 11;
    }

    doc.setFont("helvetica", "bold");
    doc.text(`Total Paid: ${formatInvoiceAmount(invoice.amount)}`, 28, y);
    y += 12;

    if (invoice.shippingLine1) {
      y += 6;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(60, 60, 60);
      doc.text("Ship To:", 28, y);
      y += 8;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      if (invoice.shippingName) { doc.text(invoice.shippingName, 28, y); y += 7; }
      doc.text(invoice.shippingLine1, 28, y); y += 7;
      if (invoice.shippingLine2) { doc.text(invoice.shippingLine2, 28, y); y += 7; }
      doc.text(
        `${invoice.shippingCity || ""}, ${invoice.shippingState || ""} ${invoice.shippingZip || ""}`.trim(),
        28, y,
      );
      y += 7;
      if (invoice.shippingPhone) { doc.text(invoice.shippingPhone, 28, y); y += 7; }
      y += 5;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(70, 70, 70);

    doc.text(stripeSessionLines, 28, y);
    y += stripeSessionLines.length * 6 + 14;

    // Footer — positioned below the card with a minimum clearance
    const footerY = Math.max(y + 10, 260);
    doc.setDrawColor(230, 230, 230);
    doc.line(20, footerY, 190, footerY);

    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text("Thank you for using Revolution Auction House.", 20, footerY + 10);
    doc.text("This invoice is generated electronically.", 20, footerY + 17);

    const pdfBuffer = doc.output("arraybuffer");

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="invoice-${invoice.id}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error("PDF INVOICE ERROR:", err);
    await serverLogError({
      source: "invoices/pdf",
      message: err?.message || "Failed to generate invoice PDF",
      context: err?.stack,
      severity: "ERROR",
      url: "/api/invoices/[id]/pdf",
    });

    return NextResponse.json(
      {
        error: err?.message || "Failed to generate invoice PDF",
      },
      { status: 500 },
    );
  }
}
