"use client";

import "@/lib/amplifyclient";
import { toast } from "sonner";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCurrentUser } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { isApprovedSeller, isAdminUser } from "@/lib/sellers";

const client = generateClient<Schema>();

export default function SellerNotificationsPage() {
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  const [myEmail, setMyEmail] = useState("");
  const [notifyVerifPref, setNotifyVerifPref] = useState("none");
  const [notifyOffersPref, setNotifyOffersPref] = useState("none");
  const [notifyReceiptPref, setNotifyReceiptPref] = useState("email");
  const [notifyPhone, setNotifyPhone] = useState("");
  const [savingNotify, setSavingNotify] = useState(false);
  const [notifySaved, setNotifySaved] = useState(false);

  // Phone OTP verification
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [verifiedPhone, setVerifiedPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpMsg, setOtpMsg] = useState("");

  const normalize = (p: string) => p.replace(/[^\d+]/g, "");
  const phoneIsVerified =
    phoneVerified && !!notifyPhone && normalize(notifyPhone) === normalize(verifiedPhone);

  async function handleSendOtp() {
    if (sendingOtp) return;
    setOtpMsg("");
    setSendingOtp(true);
    try {
      const res = await client.mutations.sendPhoneOtp(
        { phoneNumber: notifyPhone, target: "SELLER" },
        { authMode: "userPool" } as any,
      );
      if (res.data?.success) { setOtpSent(true); setOtpMsg(res.data.message || "Code sent."); }
      else setOtpMsg(res.data?.message || "Could not send code.");
    } catch { setOtpMsg("Could not send code. Try again."); }
    finally { setSendingOtp(false); }
  }

  async function handleVerifyOtp() {
    if (verifyingOtp) return;
    setOtpMsg("");
    setVerifyingOtp(true);
    try {
      const res = await client.mutations.verifyPhoneOtp(
        { code: otpCode, target: "SELLER" },
        { authMode: "userPool" } as any,
      );
      if (res.data?.verified) {
        setPhoneVerified(true);
        setVerifiedPhone(notifyPhone);
        setOtpSent(false);
        setOtpCode("");
        setOtpMsg("Phone number verified ✓");
      } else setOtpMsg(res.data?.message || "Incorrect code.");
    } catch { setOtpMsg("Verification failed. Try again."); }
    finally { setVerifyingOtp(false); }
  }

  async function loadMyNotifySettings(email: string) {
    try {
      const result = await client.models.SellerProfile.get({ email }, { authMode: "userPool" } as any);
      const profile = result.data as any;
      if (profile) {
        setNotifyVerifPref(profile.notifyVerifications ?? "email");
        setNotifyOffersPref(profile.notifyOffers ?? "email");
        setNotifyReceiptPref(profile.notifyReceipt ?? "email");
        setNotifyPhone(profile.phoneNumber ?? "");
        if (profile.phoneVerified) {
          setPhoneVerified(true);
          setVerifiedPhone(profile.phoneNumber ?? "");
        }
      }
    } catch {
      // non-fatal
    }
  }

  async function saveNotifySettings() {
    if (savingNotify || !myEmail) return;
    setSavingNotify(true);
    try {
      const result = await client.mutations.saveSellerPrefs(
        {
          notifyVerifications: notifyVerifPref,
          notifyOffers: notifyOffersPref,
          notifyReceipt: notifyReceiptPref,
          phoneNumber: notifyPhone || null,
        } as any,
        { authMode: "userPool" } as any,
      );
      const errors = (result as any).errors;
      if (errors?.length) throw new Error(errors[0].message);
      if ((result as any).data?.success === false) throw new Error("Unauthorized — seller profile not found");
      setNotifySaved(true);
      setTimeout(() => setNotifySaved(false), 3000);
    } catch (err: any) {
      toast.error(err?.message || "Failed to save settings.");
    } finally {
      setSavingNotify(false);
    }
  }

  useEffect(() => {
    async function init() {
      try {
        const user = await getCurrentUser();
        const email = ((user as any).signInDetails?.loginId || "").toLowerCase();
        setMyEmail(email);
        const [seller, admin] = await Promise.all([isApprovedSeller(email), isAdminUser()]);
        if (!seller && !admin) return;
        setAllowed(true);
        if (email) await loadMyNotifySettings(email);
      } finally {
        setChecking(false);
      }
    }
    init();
  }, []);

  if (checking) return <main className="min-h-screen bg-[#050607] p-10 text-white">Loading…</main>;

  if (!allowed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050607] px-6 text-white">
        <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <h1 className="font-serif text-3xl text-[#c0c0c0]">Seller Access Required</h1>
          <p className="mt-3 text-gray-400">You must be an approved seller to view this page.</p>
          <Link href="/" className="mt-6 inline-block rounded bg-[#c0c0c0] px-5 py-3 font-semibold text-black">Back Home</Link>
        </div>
      </main>
    );
  }

  const smsSelected =
    notifyVerifPref === "sms" || notifyVerifPref === "both" ||
    notifyOffersPref === "sms" || notifyOffersPref === "both" ||
    notifyReceiptPref === "sms" || notifyReceiptPref === "both";

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-2xl">
        <Link href="/seller" className="text-sm text-gray-500 hover:text-white">← Seller Dashboard</Link>

        <h1 className="mt-6 font-serif text-5xl text-[#c0c0c0]">Notifications</h1>
        <div className="mt-2 h-px w-48 bg-gradient-to-r from-transparent via-[#d6aa55]/60 to-transparent" />
        <p className="mt-4 text-gray-400">
          Choose how you want to hear about verification requests, offers, and
          confirmed deliveries. SMS goes only to a verified phone number.
        </p>

        <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="mb-5 text-xs uppercase tracking-[0.2em] text-gray-400">My Notification Preferences</h2>
          <div className="space-y-5">
            <NotifyRow label="Verification requests" value={notifyVerifPref} onChange={setNotifyVerifPref} />
            <NotifyRow label="New offers on listings" value={notifyOffersPref} onChange={setNotifyOffersPref} />
            <NotifyRow label="Buyer confirmed receipt" value={notifyReceiptPref} onChange={setNotifyReceiptPref} />

            {smsSelected && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-[0.15em] text-gray-500">Phone number (with country code)</label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="tel"
                    value={notifyPhone}
                    onChange={(e) => { setNotifyPhone(e.target.value); setOtpSent(false); setOtpMsg(""); }}
                    placeholder="+1 555 000 0000"
                    className="w-56 rounded border border-white/10 bg-black px-3 py-1.5 text-sm text-white outline-none focus:border-[#d6aa55]/50"
                  />
                  {phoneIsVerified ? (
                    <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">✓ Verified</span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={!notifyPhone || sendingOtp}
                      className="rounded border border-[#d6aa55]/40 bg-[#1a1408] px-3 py-1.5 text-xs font-semibold text-[#e7c77f] hover:bg-[#221909] disabled:opacity-50"
                    >
                      {sendingOtp ? "Sending…" : otpSent ? "Resend code" : "Send code"}
                    </button>
                  )}
                </div>
                {otpSent && !phoneIsVerified && (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="6-digit code"
                      className="w-32 rounded border border-white/10 bg-black px-3 py-1.5 text-sm tracking-[0.3em] text-white outline-none focus:border-[#d6aa55]/50"
                    />
                    <button
                      type="button"
                      onClick={handleVerifyOtp}
                      disabled={otpCode.length !== 6 || verifyingOtp}
                      className="rounded bg-[#c0c0c0] px-4 py-1.5 text-xs font-bold text-black hover:bg-white disabled:opacity-50"
                    >
                      {verifyingOtp ? "Verifying…" : "Verify"}
                    </button>
                  </div>
                )}
                {otpMsg && (
                  <p className={`text-xs ${phoneIsVerified ? "text-emerald-400" : "text-gray-400"}`}>{otpMsg}</p>
                )}
                <p className="text-[10px] text-gray-600">Texts only go to verified numbers. Reply STOP to opt out.</p>
              </div>
            )}

            <button
              type="button"
              disabled={savingNotify}
              onClick={saveNotifySettings}
              className="rounded border border-emerald-500/30 bg-emerald-500/10 px-5 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
            >
              {savingNotify ? "Saving…" : notifySaved ? "Saved ✓" : "Save Preferences"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

const NOTIFY_OPTIONS = ["email", "sms", "both", "none"] as const;

function NotifyRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-48 text-xs text-gray-400">{label}</span>
      <div className="flex gap-2">
        {NOTIFY_OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`rounded border px-3 py-1 text-xs font-semibold capitalize transition ${
              value === opt
                ? "border-[#d6aa55]/50 bg-[#d6aa55]/15 text-[#e7c77f]"
                : "border-white/10 text-gray-500 hover:text-white"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
