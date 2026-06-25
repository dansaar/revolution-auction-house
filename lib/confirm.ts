"use client";

// Promise-based confirm dialog — a styled replacement for window.confirm().
// Usage:  if (!(await confirmDialog({ message: "Delete this?", danger: true }))) return;
// A single <ConfirmHost /> (mounted in the root layout) renders the UI.

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};

type ConfirmRequest = { opts: ConfirmOptions; resolve: (ok: boolean) => void };

let listener: ((req: ConfirmRequest) => void) | null = null;

export function _setConfirmListener(fn: ((req: ConfirmRequest) => void) | null) {
  listener = fn;
}

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!listener) {
      // Fallback if the host isn't mounted (SSR or edge case).
      if (typeof window !== "undefined") resolve(window.confirm(opts.message));
      else resolve(false);
      return;
    }
    listener({ opts, resolve });
  });
}
