"use client";

import "@/lib/amplifyclient";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { getCurrentUser } from "aws-amplify/auth";
import Link from "next/link";

export default function EditListingPage() {
  const clientRef = React.useRef(generateClient<Schema>());
  const client = clientRef.current;
  const router = useRouter();
  const params = useParams();
  const listingId = params.id as string;

  const SELLERS = ["dansaar52@gmail.com"];

  const [checkingSeller, setCheckingSeller] = useState(true);
  const [isSeller, setIsSeller] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listing, setListing] = useState<any>(null);

  const [form, setForm] = useState({
    title: "",
    subtitle: "",
    price: "",
    condition: "",
    description: "",
    status: "ACTIVE",
  });

  useEffect(() => {
    async function load() {
      try {
        const user = await getCurrentUser();
        const email = user.signInDetails?.loginId || user.username || "";

        if (!SELLERS.includes(email)) {
          setIsSeller(false);
          return;
        }

        setIsSeller(true);

        const result = await client.models.MarketplaceListing.get(
          { id: listingId },
          { authMode: "apiKey" },
        );

        if (!result.data) return;

        setListing(result.data);

        setForm({
          title: result.data.title || "",
          subtitle: result.data.subtitle || "",
          price: String(result.data.price || "").replace(/[$,]/g, ""),
          condition: result.data.condition || "",
          description: result.data.description || "",
          status: result.data.status || "ACTIVE",
        });
      } catch (err) {
        console.error("LISTING EDIT LOAD ERROR", err);
      } finally {
        setCheckingSeller(false);
      }
    }

    load();
  }, [listingId, client]);

  function update(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (!form.title || !form.price) {
      alert("Missing required fields");
      return;
    }

    setLoading(true);

    try {
      await client.models.MarketplaceListing.update(
        {
          id: listingId,
          title: form.title,
          subtitle: form.subtitle,
          description: form.description,
          condition: form.condition,
          price: `$${Number(form.price).toLocaleString()}`,
          status: form.status,
        },
        { authMode: "apiKey" } as any,
      );

      router.push(`/marketplace/${listingId}`);
    } catch (err) {
      console.error("LISTING EDIT SAVE ERROR", err);
      alert("Failed to save listing");
    } finally {
      setLoading(false);
    }
  }

  if (checkingSeller) {
    return (
      <main className="min-h-screen bg-[#050607] p-10 text-white">
        Checking access...
      </main>
    );
  }

  if (!isSeller) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050607] px-6 text-white">
        <div className="max-w-md rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <h1 className="font-serif text-3xl text-[#c0c0c0]">
            Seller Access Required
          </h1>
          <p className="mt-3 text-gray-400">
            You must be approved as a seller to edit listings.
          </p>
          <Link
            href="/seller"
            className="mt-6 inline-block rounded bg-[#c0c0c0] px-5 py-3 font-semibold text-black"
          >
            Back to Seller Dashboard
          </Link>
        </div>
      </main>
    );
  }

  if (!listing) {
    return (
      <main className="min-h-screen bg-[#050607] p-10 text-white">
        Listing not found.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-3xl">
        <Link href="/seller" className="text-sm text-[#c0c0c0]">
          ← Back to Seller Dashboard
        </Link>

        <h1 className="mt-6 mb-4 font-serif text-5xl">Edit Listing</h1>

        <p className="mb-10 text-gray-400">
          Update marketplace listing details.
        </p>

        <div className="space-y-6">
          <Input
            label="Title"
            value={form.title}
            onChange={(v: string) => update("title", v)}
          />

          <Input
            label="Subtitle"
            value={form.subtitle}
            onChange={(v: string) => update("subtitle", v)}
          />

          <Input
            label="Price ($)"
            value={form.price}
            onChange={(v: string) => update("price", v)}
          />

          <Input
            label="Condition"
            placeholder="PSA 10, Raw NM, Sealed, etc."
            value={form.condition}
            onChange={(v: string) => update("condition", v)}
          />

          <Textarea
            label="Description"
            value={form.description}
            onChange={(v: string) => update("description", v)}
          />

          <div>
            <div className="mb-2 text-xs uppercase text-gray-500">Status</div>
            <select
              value={form.status}
              onChange={(e) => update("status", e.target.value)}
              className="w-full rounded border border-white/10 bg-black px-4 py-3"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="PAUSED">PAUSED</option>
              <option value="SOLD">SOLD</option>
            </select>
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="mt-6 w-full rounded bg-[#c0c0c0] py-4 font-semibold text-black disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save Listing"}
          </button>
        </div>
      </div>
    </main>
  );
}

function Input({ label, value, onChange, placeholder = "" }: any) {
  return (
    <div>
      <div className="mb-2 text-xs uppercase text-gray-500">{label}</div>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-white/10 bg-black px-4 py-3 placeholder:text-gray-600"
      />
    </div>
  );
}

function Textarea({ label, value, onChange }: any) {
  return (
    <div>
      <div className="mb-2 text-xs uppercase text-gray-500">{label}</div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        className="w-full rounded border border-white/10 bg-black px-4 py-3"
      />
    </div>
  );
}
