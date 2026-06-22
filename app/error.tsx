"use client";

// Route-level error boundary — catches errors within a page/segment while
// keeping the site chrome (header/nav) intact. Reports to Sentry.
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import Link from "next/link";

export default function Error({
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
    <main className="flex min-h-[70vh] flex-col items-center justify-center bg-[#050607] px-6 py-20 text-center text-white">
      <div className="mb-5 text-[11px] uppercase tracking-[0.3em] text-gray-500">
        Revolution Auction House
      </div>
      <h1 className="font-serif text-4xl text-white">Something went wrong</h1>
      <p className="mt-3 max-w-md text-sm text-gray-400">
        An unexpected error occurred on this page. Our team has been notified.
        You can try again or head back home.
      </p>
      <div className="mt-8 flex gap-3">
        <button
          onClick={() => reset()}
          className="rounded-lg bg-[#c0c0c0] px-6 py-3 text-sm font-semibold text-black hover:bg-white"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-lg border border-white/15 px-6 py-3 text-sm font-semibold text-gray-300 hover:text-white"
        >
          Go home
        </Link>
      </div>
      {error.digest && (
        <p className="mt-6 font-mono text-[11px] text-gray-600">Ref: {error.digest}</p>
      )}
    </main>
  );
}
