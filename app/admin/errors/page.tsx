"use client";

import "@/lib/amplifyclient";

import { useEffect, useState } from "react";
import Link from "next/link";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { isAdminUser } from "@/lib/sellers";
import { toast } from "sonner";

const client = generateClient<Schema>();

function sevColor(sev?: string | null) {
  switch ((sev || "ERROR").toUpperCase()) {
    case "WARN": return "text-yellow-300 border-yellow-400/30 bg-yellow-400/10";
    case "INFO": return "text-sky-300 border-sky-400/30 bg-sky-400/10";
    default: return "text-red-300 border-red-400/30 bg-red-400/10";
  }
}

export default function AdminErrorsPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await client.models.ErrorLog.list({ authMode: "userPool", limit: 500 } as any);
      const rows = (res.data || []).sort(
        (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setErrors(rows);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load error log.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      if (!(await isAdminUser())) {
        setLoading(false);
        return;
      }
      setIsAdmin(true);
      await load();
    })();
  }, []);

  async function deleteOne(id: string) {
    setBusy(true);
    try {
      await client.models.ErrorLog.delete({ id }, { authMode: "userPool" } as any);
      setErrors((prev) => prev.filter((e) => e.id !== id));
    } catch {
      toast.error("Failed to delete.");
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    if (!confirm(`Delete all ${errors.length} error log entries?`)) return;
    setBusy(true);
    try {
      await Promise.all(
        errors.map((e) => client.models.ErrorLog.delete({ id: e.id }, { authMode: "userPool" } as any)),
      );
      setErrors([]);
      toast.success("Cleared.");
    } catch {
      toast.error("Failed to clear some entries.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="min-h-screen bg-[#050607] p-10 text-white">Loading…</main>;
  if (!isAdmin) return <main className="min-h-screen bg-[#050607] p-10 text-white">Admin access required.</main>;

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin" className="text-sm text-gray-400 hover:text-white">← Back to Admin</Link>

        <div className="mt-6 flex items-end justify-between">
          <div>
            <h1 className="font-serif text-5xl text-[#c0c0c0]">Error Log</h1>
            <p className="mt-2 text-gray-400">
              In-app backstop to Sentry — server-side failures captured here. Showing {errors.length}.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={load}
              disabled={busy}
              className="rounded border border-white/10 px-4 py-2 text-sm text-gray-300 hover:text-white disabled:opacity-50"
            >
              Refresh
            </button>
            {errors.length > 0 && (
              <button
                onClick={clearAll}
                disabled={busy}
                className="rounded border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300 hover:bg-red-500/20 disabled:opacity-50"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        <div className="mt-8 grid gap-3">
          {errors.length === 0 ? (
            <p className="text-gray-500">No errors logged. 🎉</p>
          ) : (
            errors.map((e: any) => (
              <div key={e.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-wide ${sevColor(e.severity)}`}>
                        {e.severity || "ERROR"}
                      </span>
                      <span className="text-xs text-gray-500">{e.source}</span>
                      {e.url && <span className="text-xs text-gray-600">· {e.url}</span>}
                    </div>
                    <p className="mt-2 break-words text-sm text-gray-200">{e.message}</p>
                    <p className="mt-1 text-[11px] text-gray-600">
                      {e.createdAt ? new Date(e.createdAt).toLocaleString("en-US", { timeZone: "America/New_York" }) : ""}
                    </p>
                    {e.context && (
                      <button
                        onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                        className="mt-2 text-[11px] text-[#e7c77f] hover:underline"
                      >
                        {expanded === e.id ? "Hide details" : "Show details"}
                      </button>
                    )}
                    {expanded === e.id && e.context && (
                      <pre className="mt-2 max-h-64 overflow-auto rounded bg-black/40 p-3 text-[11px] text-gray-400">
                        {e.context}
                      </pre>
                    )}
                  </div>
                  <button
                    onClick={() => deleteOne(e.id)}
                    disabled={busy}
                    className="shrink-0 rounded border border-white/10 px-3 py-1.5 text-xs text-gray-400 hover:text-white disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
