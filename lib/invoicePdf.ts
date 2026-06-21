import { fetchAuthSession } from "aws-amplify/auth";

// Fetch an invoice PDF (server route is gated to buyer/seller/admin).
async function fetchInvoicePdf(invoiceId: string): Promise<Blob | null> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) {
    alert("Please sign in again to view this invoice.");
    return null;
  }
  const res = await fetch(`/api/invoices/${invoiceId}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    alert(`Unable to open invoice PDF. Status: ${res.status}`);
    return null;
  }
  return res.blob();
}

export async function viewInvoicePdf(invoiceId: string) {
  const blob = await fetchInvoicePdf(invoiceId);
  if (blob) window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
}

export async function downloadInvoicePdf(invoiceId: string) {
  const blob = await fetchInvoicePdf(invoiceId);
  if (!blob) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `invoice-${invoiceId}.pdf`;
  a.click();
}
