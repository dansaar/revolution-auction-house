"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bell, MessageSquare, Check } from "lucide-react";
import "@/lib/amplifyclient";
import { getCurrentUser } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";

const client = generateClient<Schema>();

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw.trim();
}

export default function NotificationsPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [phone, setPhone] = useState("");
  const [smsOptIn, setSmsOptIn] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
        const userId = currentUser.userId;

        const result = await client.models.BuyerProfile.get(
          { userId },
          { authMode: "userPool" } as any,
        );

        const profile = result.data;

        if (profile) {
          setPhone(profile.phoneNumber || "");
          setSmsOptIn(profile.smsOptIn ?? false);
        } else {
          // Pre-fill from sign-up localStorage if profile doesn't exist yet
          const pendingPhone = localStorage.getItem("pendingPhone") || "";
          const pendingSms = localStorage.getItem("pendingSmsOptIn") === "true";
          setPhone(pendingPhone);
          setSmsOptIn(pendingSms);
        }
      } catch {
        // not signed in
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setSaved(false);

    try {
      const userId = user.userId;
      const email = user.signInDetails?.loginId || user.username || "";
      const formattedPhone = phone ? formatPhone(phone) : "";

      const existing = await client.models.BuyerProfile.get(
        { userId },
        { authMode: "userPool" } as any,
      );

      if (existing.data) {
        await client.models.BuyerProfile.update(
          { userId, phoneNumber: formattedPhone || null, smsOptIn } as any,
          { authMode: "userPool" } as any,
        );
      } else {
        await client.models.BuyerProfile.create(
          { userId, email, phoneNumber: formattedPhone || null, smsOptIn } as any,
          { authMode: "userPool" } as any,
        );
      }

      // Clear any pending sign-up values
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
            <h1 className="font-serif text-4xl text-[#d7d7d7]">
              Notification Preferences
            </h1>
          </div>
          <p className="mt-3 text-gray-400">
            Manage how Revolution Auction House contacts you during live auctions.
          </p>
        </div>

        <form onSubmit={handleSave} className="mt-8 space-y-5">
          {/* SMS section */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-center gap-3">
              <MessageSquare className="text-[#c0c0c0]" size={20} />
              <h2 className="font-semibold text-white">Text Message Alerts</h2>
            </div>

            <p className="mt-3 text-sm text-gray-400">
              Get a text the moment you're outbid so you can respond instantly.
            </p>

            <div className="mt-5">
              <label className="mb-2 block text-xs uppercase tracking-[0.16em] text-gray-500">
                Mobile Number
              </label>
              <input
                type="tel"
                placeholder="+1 (555) 000-0000"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (!e.target.value) setSmsOptIn(false);
                }}
                className="w-full rounded-lg border border-white/10 bg-black px-4 py-3 text-white placeholder-gray-700 focus:border-white/30 focus:outline-none"
              />
              <p className="mt-1 text-xs text-gray-600">
                Include country code, e.g. +1 for US
              </p>
            </div>

            {phone && (
              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <input
                  type="checkbox"
                  checked={smsOptIn}
                  onChange={(e) => setSmsOptIn(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[#d6aa55]"
                />
                <div>
                  <div className="text-sm font-semibold text-white">
                    Text me when I'm outbid
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Standard message & data rates apply. Reply STOP to
                    unsubscribe at any time.
                  </div>
                </div>
              </label>
            )}

            {!phone && (
              <p className="mt-5 text-sm text-gray-600">
                Enter a mobile number above to enable text alerts.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#c0c0c0] px-6 py-4 font-bold text-black transition hover:bg-white disabled:opacity-60"
          >
            {saved ? (
              <>
                <Check size={16} /> Saved
              </>
            ) : saving ? (
              "Saving…"
            ) : (
              "Save Preferences"
            )}
          </button>

          {saved && (
            <p className="text-center text-sm text-emerald-400">
              Preferences updated — you&apos;ll receive texts when outbid.
            </p>
          )}
        </form>
      </main>
    </div>
  );
}
