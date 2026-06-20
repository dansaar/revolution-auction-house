"use client";

import "@/lib/amplifyclient";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchAuthSession } from "aws-amplify/auth";
import { isAdminUser } from "@/lib/sellers";

type Check = { ok: boolean; label: string; detail: string };

export default function StripeHealthPage() {
  const [status, setStatus] = useState("Checking…");
  const [checks, setChecks] = useState<Check[]>([]);
  const [mode, setMode] = useState("");
  const [allOk, setAllOk] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    setStatus("Running Stripe checks…");
    try {
      if (!(await isAdminUser())) {
        setStatus("Admin access required.");
        return;
      }
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      const res = await fetch("/api/admin/stripe-health", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || `Error ${res.status}`);
        return;
      }
      setMode(data.mode || "");
      setChecks(data.checks || []);
      setAllOk(data.allOk ?? null);
      setStatus("");
    } catch (err: any) {
      setStatus(err?.message || "Failed to run checks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    run();
  }, []);

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-2xl">
        <Link href="/admin" className="text-sm text-gray-500 hover:text-white">← Admin</Link>
        <h1 className="mt-4 font-serif text-3xl text-[#c0c0c0]">Stripe Health Check</h1>
        <p className="mt-1 text-sm text-gray-500">
          Confirms keys, ACH, and Financial Connections are wired{mode ? ` · mode: ${mode.toUpperCase()}` : ""}.
        </p>

        {allOk !== null && (
          <div className={`mt-5 rounded-lg border p-3 text-sm font-semibold ${
            allOk ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"
          }`}>
            {allOk ? "✓ All checks passed — Stripe is ready." : "Some checks need attention (see below)."}
          </div>
        )}

        {status && <p className="mt-5 text-sm text-gray-400">{status}</p>}

        <div className="mt-5 space-y-2">
          {checks.map((c, i) => (
            <div key={i} className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <span className={c.ok ? "text-emerald-400" : "text-red-400"}>{c.ok ? "✓" : "✗"}</span>
              <div>
                <div className="text-sm font-semibold text-white">{c.label}</div>
                <div className="text-xs text-gray-400">{c.detail}</div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="mt-6 rounded border border-[#d6aa55]/40 bg-[#1a1408] px-5 py-2.5 text-sm font-semibold text-[#e7c77f] hover:bg-[#221909] disabled:opacity-50"
        >
          {loading ? "Running…" : "Re-run checks"}
        </button>
      </div>
    </main>
  );
}
