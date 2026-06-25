"use client";

import { useEffect, useState } from "react";
import { _setConfirmListener, type ConfirmOptions } from "@/lib/confirm";

export default function ConfirmHost() {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (ok: boolean) => void } | null>(null);

  useEffect(() => {
    _setConfirmListener((req) => setState(req));
    return () => _setConfirmListener(null);
  }, []);

  if (!state) return null;

  const { opts, resolve } = state;
  const close = (ok: boolean) => {
    resolve(ok);
    setState(null);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4"
      onClick={() => close(false)}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-[#d6aa55]/30 bg-[#0b0c0e] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.65)]"
        onClick={(e) => e.stopPropagation()}
      >
        {opts.title && (
          <h3 className="font-serif text-xl text-[#c0c0c0]">{opts.title}</h3>
        )}
        <p className={`${opts.title ? "mt-2" : ""} text-sm text-gray-300`}>{opts.message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => close(false)}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-white/[0.06]"
          >
            {opts.cancelText || "Cancel"}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => close(true)}
            className={
              opts.danger
                ? "rounded-lg border border-red-500/40 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/25"
                : "rounded-lg bg-[#c0c0c0] px-4 py-2 text-sm font-semibold text-black hover:bg-white"
            }
          >
            {opts.confirmText || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
