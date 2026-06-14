import { NextResponse } from "next/server";

// Proxy an EasyPost shipping-label file so the browser can fetch it same-origin.
// EasyPost label URLs are cross-origin and block the CORS fetch print-js needs
// to print a PDF directly to a printer, so they otherwise fall back to opening
// a webpage. Serving the bytes from our own origin lets print-js print directly.

// Allowlist of hosts we'll proxy from (prevents this becoming an open SSRF proxy).
const ALLOWED_HOST_SUFFIXES = [
  ".easypost.com",
  "easypost-files.s3.amazonaws.com",
  ".s3.amazonaws.com", // easypost-files.s3-<region>.amazonaws.com
];

function isAllowed(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return (
    host === "easypost.com" ||
    ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix)) ||
    host.includes("easypost")
  );
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const target = searchParams.get("url");

    if (!target) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      return NextResponse.json({ error: "Invalid url" }, { status: 400 });
    }

    if (!isAllowed(parsed)) {
      return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
    }

    const upstream = await fetch(parsed.toString());
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${upstream.status}` },
        { status: 502 },
      );
    }

    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";
    const body = await upstream.arrayBuffer();

    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
        // inline so it can render in an iframe / print frame rather than download
        "Content-Disposition": "inline",
      },
    });
  } catch (err: any) {
    console.error("SHIPPING_LABEL_PROXY_ERROR:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to load label" },
      { status: 500 },
    );
  }
}
