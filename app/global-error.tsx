"use client";

// Catches errors thrown in the root layout / anywhere not caught by a nested
// error boundary. Must render its own <html>/<body>. Reports to Sentry.
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#050607", color: "#d7d7d7", fontFamily: "Georgia, serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", textAlign: "center" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.3em", textTransform: "uppercase", color: "#888", marginBottom: "20px" }}>
            Revolution Auction House
          </div>
          <h1 style={{ fontSize: "32px", margin: "0 0 12px", color: "#fff" }}>Something went wrong</h1>
          <p style={{ color: "#999", maxWidth: "420px", margin: "0 0 28px", fontFamily: "Arial, sans-serif", fontSize: "14px" }}>
            An unexpected error occurred. Our team has been notified. Please try again.
          </p>
          <button
            onClick={() => reset()}
            style={{ background: "#c0c0c0", color: "#000", fontWeight: "bold", padding: "12px 28px", borderRadius: "8px", border: "none", cursor: "pointer", fontFamily: "Arial, sans-serif", fontSize: "14px" }}
          >
            Try again
          </button>
          {error.digest && (
            <p style={{ marginTop: "24px", fontSize: "11px", color: "#444", fontFamily: "monospace" }}>
              Ref: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
