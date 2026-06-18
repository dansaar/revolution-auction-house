"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bell, Check } from "lucide-react";
import "@/lib/amplifyclient";
import { getCurrentUser } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";

const client = generateClient<Schema>();

type Channel = "email" | "sms" | "both" | "none";

const CHANNELS: { value: Channel; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "sms",   label: "Text" },
  { value: "both",  label: "Both" },
  { value: "none",  label: "Off" },
];

const EVENTS = [
  {
    key: "notifyOutbid" as const,
    label: "Outbid",
    description: "When someone places a higher bid and you lose the lead.",
  },
  {
    key: "notifyWon" as const,
    label: "Auction Won",
    description: "When an auction you won has closed and payment is due.",
  },
  {
    key: "notifyWatchlist" as const,
    label: "Watchlist Activity",
    description: "When the price changes on an auction you're watching.",
  },
];

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw.trim();
}

function needsPhone(prefs: Record<string, Channel>) {
  return Object.values(prefs).some((v) => v === "sms" || v === "both");
}

export default function NotificationsPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [phone, setPhone] = useState("");
  const [verified, setVerified] = useState(false);
  const [verifiedPhone, setVerifiedPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [otpMsg, setOtpMsg] = useState("");
  const [prefs, setPrefs] = useState<Record<string, Channel>>({
    notifyOutbid: "sms",
    notifyWon: "both",
    notifyWatchlist: "none",
  });

  // The number is "verified" only if the server says so AND the input still
  // matches the verified number (editing it invalidates the badge).
  const isVerified =
    verified && !!phone && formatPhone(phone) === formatPhone(verifiedPhone);

  async function handleSendOtp() {
    if (sendingOtp) return;
    setOtpMsg("");
    setSendingOtp(true);
    try {
      const res = await client.mutations.sendPhoneOtp(
        { phoneNumber: phone },
        { authMode: "userPool" } as any,
      );
      if (res.data?.success) {
        setOtpSent(true);
        setOtpMsg(res.data.message || "Code sent.");
      } else {
        setOtpMsg(res.data?.message || "Could not send code.");
      }
    } catch {
      setOtpMsg("Could not send code. Try again.");
    } finally {
      setSendingOtp(false);
    }
  }

  async function handleVerifyOtp() {
    if (verifying) return;
    setOtpMsg("");
    setVerifying(true);
    try {
      const res = await client.mutations.verifyPhoneOtp(
        { code },
        { authMode: "userPool" } as any,
      );
      if (res.data?.verified) {
        setVerified(true);
        setVerifiedPhone(phone);
        setOtpSent(false);
        setCode("");
        setOtpMsg("Phone number verified ✓");
      } else {
        setOtpMsg(res.data?.message || "Incorrect code.");
      }
    } catch {
      setOtpMsg("Verification failed. Try again.");
    } finally {
      setVerifying(false);
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);

        const result = await client.models.BuyerProfile.get(
          { userId: currentUser.userId },
          { authMode: "userPool" } as any,
        );

        const profile = result.data;
        if (profile) {
          setPhone(profile.phoneNumber || "");
          if ((profile as any).phoneVerified) {
            setVerified(true);
            setVerifiedPhone(profile.phoneNumber || "");
          }
          setPrefs({
            notifyOutbid: (profile.notifyOutbid as Channel) || (profile.smsOptIn ? "sms" : "none"),
            notifyWon: (profile.notifyWon as Channel) || "both",
            notifyWatchlist: (profile.notifyWatchlist as Channel) || "none",
          });
        } else {
          const pendingPhone = localStorage.getItem("pendingPhone") || "";
          const pendingSms = localStorage.getItem("pendingSmsOptIn") === "true";
          setPhone(pendingPhone);
          if (pendingSms) setPrefs((p) => ({ ...p, notifyOutbid: "sms" }));
        }
      } catch {
        // not signed in
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function setChannel(key: string, value: Channel) {
    setPrefs((p) => ({ ...p, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const smsEnabled = needsPhone(prefs);
    if (smsEnabled && !phone.trim()) {
      alert("Enter a mobile number to enable text notifications.");
      return;
    }

    setSaving(true);
    setSaved(false);

    try {
      const userId = user.userId;
      const email = user.signInDetails?.loginId || user.username || "";
      const formattedPhone = phone ? formatPhone(phone) : "";
      const smsOptIn = smsEnabled;

      const existing = await client.models.BuyerProfile.get(
        { userId },
        { authMode: "userPool" } as any,
      );

      const fields = {
        userId,
        phoneNumber: formattedPhone || null,
        smsOptIn,
        notifyOutbid: prefs.notifyOutbid,
        notifyWon: prefs.notifyWon,
        notifyWatchlist: prefs.notifyWatchlist,
      } as any;

      if (existing.data) {
        await client.models.BuyerProfile.update(fields, { authMode: "userPool" } as any);
      } else {
        await client.models.BuyerProfile.create(
          { ...fields, email },
          { authMode: "userPool" } as any,
        );
      }

      localStorage.removeItem("pendingPhone");
      localStorage.removeItem("pendingSmsOptIn");

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("SAVE_NOTIFICATIONS_ERROR", err);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050607] text-white">
        <div className="mx-auto max-w-xl px-6 py-10">
          <div className="h-8 w-40 animate-pulse rounded bg-white/10" />
          <div className="mt-8 h-64 animate-pulse rounded-2xl bg-white/[0.04]" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050607] text-white">
        <div className="text-center">
          <p className="text-gray-400">Please sign in to manage your preferences.</p>
          <Link href="/signin" className="mt-4 inline-block text-sm text-[#c0c0c0] underline">
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  const smsRequired = needsPhone(prefs);

  return (
    <div className="min-h-screen bg-[#050607] text-white">
      <main className="mx-auto max-w-xl px-6 py-10">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-gray-500 transition hover:text-white"
        >
          <ArrowLeft size={15} />
          Back to Dashboard
        </Link>

        <div className="mt-8">
          <div className="flex items-center gap-3">
            <Bell className="text-[#d6aa55]" size={24} />
            <h1 className="font-serif text-4xl text-[#d7d7d7]">Notification Preferences</h1>
          </div>
          <p className="mt-3 text-gray-400">
            Choose how you want to be notified for each event.
          </p>
        </div>

        <form onSubmit={handleSave} className="mt-8 space-y-4">

          {/* Per-event preference cards */}
          {EVENTS.map(({ key, label, description }) => (
            <div key={key} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="mb-1 font-semibold text-white">{label}</div>
              <div className="mb-4 text-sm text-gray-500">{description}</div>

              <div className="grid grid-cols-4 gap-2">
                {CHANNELS.map(({ value, label: clabel }) => {
                  const active = prefs[key] === value;
                  const isSmsChannel = value === "sms" || value === "both";
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setChannel(key, value)}
                      className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                        active
                          ? "border-[#d6aa55]/60 bg-[#1a1408] text-[#e7c77f]"
                          : "border-white/10 text-gray-400 hover:border-white/20 hover:text-white"
                      }`}
                    >
                      {clabel}
                      {isSmsChannel && (
                        <div className="mt-0.5 text-[9px] uppercase tracking-wide opacity-50">
                          needs phone
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Phone number — shown when any SMS channel is selected */}
          <div className={`overflow-hidden rounded-2xl border transition-all ${
            smsRequired ? "border-white/10 bg-white/[0.03]" : "border-white/[0.06] bg-white/[0.01] opacity-50"
          }`}>
            <div className="p-5">
              <div className="mb-1 font-semibold text-white">Mobile Number</div>
              <div className="mb-4 text-sm text-gray-500">
                {smsRequired
                  ? "Required for text notifications."
                  : "Only needed if you choose Text or Both above."}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  value={phone}
                  disabled={!smsRequired}
                  onChange={(e) => { setPhone(e.target.value); setOtpSent(false); setOtpMsg(""); }}
                  className="w-full flex-1 rounded-lg border border-white/10 bg-black px-4 py-3 text-white placeholder-gray-700 focus:border-white/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
                />
                {smsRequired && (
                  isVerified ? (
                    <span className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-300">
                      <Check size={15} /> Verified
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={!phone || sendingOtp}
                      className="rounded-lg border border-[#d6aa55]/40 bg-[#1a1408] px-4 py-3 text-sm font-semibold text-[#e7c77f] hover:bg-[#221909] disabled:opacity-50"
                    >
                      {sendingOtp ? "Sending…" : otpSent ? "Resend code" : "Send code"}
                    </button>
                  )
                )}
              </div>

              {smsRequired && otpSent && !isVerified && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="6-digit code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    className="w-full flex-1 rounded-lg border border-white/10 bg-black px-4 py-3 tracking-[0.4em] text-white placeholder-gray-700 focus:border-white/30 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleVerifyOtp}
                    disabled={code.length !== 6 || verifying}
                    className="rounded-lg bg-[#c0c0c0] px-5 py-3 text-sm font-bold text-black hover:bg-white disabled:opacity-50"
                  >
                    {verifying ? "Verifying…" : "Verify"}
                  </button>
                </div>
              )}

              {otpMsg && (
                <p className={`mt-2 text-xs ${isVerified ? "text-emerald-400" : "text-gray-400"}`}>
                  {otpMsg}
                </p>
              )}

              <p className="mt-2 text-xs text-gray-600">
                Include country code, e.g. +1 for US. Standard message &amp; data rates apply. Reply STOP to unsubscribe.
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#c0c0c0] px-6 py-4 font-bold text-black transition hover:bg-white disabled:opacity-60"
          >
            {saved ? (
              <><Check size={16} /> Saved</>
            ) : saving ? (
              "Saving…"
            ) : (
              "Save Preferences"
            )}
          </button>

          {saved && (
            <p className="text-center text-sm text-emerald-400">
              Preferences saved.
            </p>
          )}
        </form>
      </main>
    </div>
  );
}
