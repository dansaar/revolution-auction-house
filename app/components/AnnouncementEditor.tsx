"use client";

import "@/lib/amplifyclient";

import { useEffect, useState } from "react";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { toast } from "sonner";

const client = generateClient<Schema>();
const ID = "GLOBAL";

const VARIANTS = [
  { value: "info", label: "Gold (info)" },
  { value: "special", label: "Green (special)" },
  { value: "alert", label: "Red (alert)" },
];

export default function AnnouncementEditor() {
  const [message, setMessage] = useState("");
  const [active, setActive] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [variant, setVariant] = useState("info");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await client.models.SiteAnnouncement.get(
          { id: ID },
          { authMode: "userPool" } as any,
        );
        const a = res.data as any;
        if (a) {
          setMessage(a.message || "");
          setActive(!!a.active);
          setLinkUrl(a.linkUrl || "");
          setLinkLabel(a.linkLabel || "");
          setVariant(a.variant || "info");
        }
      } catch { /* none yet */ }
      finally { setLoading(false); }
    })();
  }, []);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const fields = { id: ID, message, active, linkUrl: linkUrl || null, linkLabel: linkLabel || null, variant };
      const existing = await client.models.SiteAnnouncement.get({ id: ID }, { authMode: "userPool" } as any);
      if (existing.data) {
        await client.models.SiteAnnouncement.update(fields as any, { authMode: "userPool" } as any);
      } else {
        await client.models.SiteAnnouncement.create(fields as any, { authMode: "userPool" } as any);
      }
      toast.success(active ? "Announcement live" : "Announcement saved (hidden)");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save announcement");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  const inputCls =
    "w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none placeholder:text-gray-600 focus:border-[#d6aa55]/50";

  return (
    <section className="mt-10 rounded-2xl border border-[#d6aa55]/25 bg-[#1a1408]/40 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl text-[#c0c0c0]">Announcement Ticker</h2>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-[#d6aa55]" />
          Show on site
        </label>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        A scrolling banner under the nav bar, visible to everyone. Use for specials, notices, or events.
      </p>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="e.g. Spring Premier Auction — bidding opens Friday 7PM ET. Free shipping over $500 this week!"
        rows={2}
        className={`mt-4 ${inputCls}`}
      />

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="Link URL (optional, e.g. /auctions)" className={inputCls} />
        <input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="Link text (e.g. View →)" className={inputCls} />
        <select value={variant} onChange={(e) => setVariant(e.target.value)} className={inputCls}>
          {VARIANTS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
        </select>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-4 rounded-lg border border-[#d6aa55]/40 bg-[#1a1408] px-5 py-2.5 text-sm font-semibold text-[#e7c77f] hover:bg-[#221909] disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save Announcement"}
      </button>
    </section>
  );
}
