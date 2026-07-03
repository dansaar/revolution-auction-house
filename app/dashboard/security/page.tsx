"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, ShieldOff, Copy } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";
import "@/lib/amplifyclient";
import {
  getCurrentUser,
  fetchMFAPreference,
  setUpTOTP,
  verifyTOTPSetup,
  updateMFAPreference,
} from "aws-amplify/auth";
import { confirmDialog } from "@/lib/confirm";

const ISSUER = "Revolution Auction House";

export default function SecurityPage() {
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);

  // Enrollment flow
  const [settingUp, setSettingUp] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [sharedSecret, setSharedSecret] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [disabling, setDisabling] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        await getCurrentUser();
        setSignedIn(true);
        const prefs = await fetchMFAPreference();
        setMfaEnabled(
          prefs.enabled?.includes("TOTP") ||
            prefs.preferred === "TOTP" ||
            false,
        );
      } catch {
        // not signed in
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function startSetup() {
    try {
      const user = await getCurrentUser();
      const accountName =
        user.signInDetails?.loginId || user.username || "account";
      const totpSetup = await setUpTOTP();
      const uri = totpSetup.getSetupUri(ISSUER, accountName).toString();
      setSharedSecret(totpSetup.sharedSecret);
      setQrDataUrl(
        await QRCode.toDataURL(uri, { margin: 1, width: 220 }),
      );
      setSettingUp(true);
    } catch (err: any) {
      console.error("TOTP setup failed:", err);
      toast.error(err?.message || "Could not start two-factor setup");
    }
  }

  async function verifyAndEnable(e: React.FormEvent) {
    e.preventDefault();
    if (verifying) return;
    setVerifying(true);
    try {
      await verifyTOTPSetup({ code: code.trim() });
      await updateMFAPreference({ totp: "PREFERRED" });
      setMfaEnabled(true);
      setSettingUp(false);
      setCode("");
      setQrDataUrl("");
      setSharedSecret("");
      toast.success("Two-factor authentication is on.");
    } catch (err: any) {
      console.error("TOTP verify failed:", err);
      toast.error(
        err?.name === "EnableSoftwareTokenMFAException"
          ? "That code didn't match. Check your authenticator app and try again."
          : err?.message || "Could not verify the code",
      );
    } finally {
      setVerifying(false);
    }
  }

  async function disableMfa() {
    const ok = await confirmDialog({
      title: "Turn off two-factor authentication?",
      message:
        "Your account will be protected by your password alone. You can re-enable it here at any time.",
      confirmText: "Turn Off",
      danger: true,
    });
    if (!ok) return;
    setDisabling(true);
    try {
      await updateMFAPreference({ totp: "DISABLED" });
      setMfaEnabled(false);
      toast.success("Two-factor authentication is off.");
    } catch (err: any) {
      toast.error(err?.message || "Could not turn off two-factor");
    } finally {
      setDisabling(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050607] p-10 text-white">
        Loading...
      </main>
    );
  }

  if (!signedIn) {
    return (
      <main className="min-h-screen bg-[#050607] p-10 text-white">
        <div className="mx-auto max-w-2xl rounded-xl border border-white/10 bg-white/[0.03] p-8">
          Please{" "}
          <Link href="/signin" className="text-[#e7c77f] underline">
            sign in
          </Link>{" "}
          to manage account security.
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-white"
        >
          <ArrowLeft size={14} /> Back to Dashboard
        </Link>

        <h1 className="mt-6 font-serif text-4xl text-[#c0c0c0]">
          Account Security
        </h1>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-lg font-semibold">
                {mfaEnabled ? (
                  <ShieldCheck className="h-5 w-5 text-emerald-400" />
                ) : (
                  <ShieldOff className="h-5 w-5 text-gray-500" />
                )}
                Two-Factor Authentication
              </div>
              <p className="mt-2 max-w-md text-sm leading-6 text-gray-400">
                Adds a second step at sign-in: a 6-digit code from an
                authenticator app (Google Authenticator, Authy, 1Password,
                etc.). Protects your account — and your bidding limit — even
                if your password leaks.
              </p>
            </div>
            <span
              className={`shrink-0 rounded border px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] ${
                mfaEnabled
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-white/15 bg-white/[0.04] text-gray-400"
              }`}
            >
              {mfaEnabled ? "On" : "Off"}
            </span>
          </div>

          {!mfaEnabled && !settingUp && (
            <button
              type="button"
              onClick={startSetup}
              className="mt-6 rounded border border-[#d6aa55]/40 bg-[#d6aa55]/10 px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-[#e7c77f] hover:bg-[#d6aa55]/20"
            >
              Set Up Two-Factor
            </button>
          )}

          {settingUp && (
            <div className="mt-8 border-t border-white/10 pt-6">
              <div className="text-sm font-semibold text-white">
                1. Scan this QR code with your authenticator app
              </div>
              {qrDataUrl && (
                <img
                  src={qrDataUrl}
                  alt="TOTP setup QR code"
                  className="mt-4 rounded-lg border border-white/10 bg-white p-2"
                  width={220}
                  height={220}
                />
              )}

              <div className="mt-4 text-xs text-gray-500">
                Can&apos;t scan? Enter this key manually:
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(sharedSecret);
                    toast.success("Key copied");
                  }}
                  className="ml-2 inline-flex items-center gap-1 break-all rounded border border-white/10 bg-black px-2 py-1 font-mono text-gray-300 hover:border-white/30"
                >
                  {sharedSecret} <Copy size={12} />
                </button>
              </div>

              <form onSubmit={verifyAndEnable} className="mt-6">
                <div className="text-sm font-semibold text-white">
                  2. Enter the 6-digit code from the app
                </div>
                <div className="mt-3 flex gap-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    maxLength={6}
                    required
                    className="w-40 rounded border border-white/10 bg-black px-4 py-3 tracking-[0.3em]"
                  />
                  <button
                    type="submit"
                    disabled={verifying}
                    className="rounded bg-[#c0c0c0] px-5 py-3 text-sm font-bold text-black disabled:opacity-50"
                  >
                    {verifying ? "Verifying..." : "Verify & Turn On"}
                  </button>
                </div>
              </form>

              <button
                type="button"
                onClick={() => {
                  setSettingUp(false);
                  setCode("");
                  setQrDataUrl("");
                  setSharedSecret("");
                }}
                className="mt-4 text-xs text-gray-500 underline hover:text-white"
              >
                Cancel setup
              </button>
            </div>
          )}

          {mfaEnabled && (
            <button
              type="button"
              onClick={disableMfa}
              disabled={disabling}
              className="mt-6 rounded border border-red-500/30 bg-red-500/10 px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-red-300 hover:bg-red-500/20 disabled:opacity-50"
            >
              {disabling ? "Turning Off..." : "Turn Off Two-Factor"}
            </button>
          )}
        </div>

        <p className="mt-6 text-xs leading-5 text-gray-600">
          If you lose access to your authenticator app, contact support to
          regain access to your account.
        </p>
      </div>
    </main>
  );
}
