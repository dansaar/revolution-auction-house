"use client";

import "@/lib/amplifyclient";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { getCurrentUser } from "aws-amplify/auth";
import { uploadData } from "aws-amplify/storage";
import Link from "next/link";
import imageCompression from "browser-image-compression";

export default function CreateListingPage() {
  const clientRef = React.useRef(generateClient<Schema>());
  const client = clientRef.current;
  const router = useRouter();

  const SELLERS = ["dansaar52@gmail.com"];

  const [form, setForm] = useState({
    title: "",
    subtitle: "",
    price: "",
    condition: "",
    description: "",
  });

  const [loading, setLoading] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [checkingSeller, setCheckingSeller] = useState(true);
  const [isSeller, setIsSeller] = useState(false);

  useEffect(() => {
    async function checkSeller() {
      try {
        const user = await getCurrentUser();
        const email = user.signInDetails?.loginId || user.username;
        setIsSeller(SELLERS.includes(email));
      } catch {
        setIsSeller(false);
      } finally {
        setCheckingSeller(false);
      }
    }

    checkSeller();
  }, []);

  function update(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function moveImage(index: number, direction: "left" | "right") {
    const newIndex = direction === "left" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= imageFiles.length) return;

    setImageFiles((prev) => {
      const copy = [...prev];
      [copy[index], copy[newIndex]] = [copy[newIndex], copy[index]];
      return copy;
    });

    setPreviews((prev) => {
      const copy = [...prev];
      [copy[index], copy[newIndex]] = [copy[newIndex], copy[index]];
      return copy;
    });
  }

  async function handleSubmit() {
    if (!form.title || !form.price) {
      alert("Missing required fields");
      return;
    }

    setLoading(true);

    try {
      let thumbUrls: string[] = [];
      let mediumUrls: string[] = [];
      let fullUrls: string[] = [];

      if (imageFiles.length > 0) {
        for (const file of imageFiles) {
          const safeName = file.name.replaceAll(" ", "-");
          const baseName = `${Date.now()}-${safeName}`;

          const thumbFile = await imageCompression(file, {
            maxWidthOrHeight: 500,
            maxSizeMB: 0.25,
            useWebWorker: true,
          });

          const mediumFile = await imageCompression(file, {
            maxWidthOrHeight: 1400,
            maxSizeMB: 1.2,
            useWebWorker: true,
          });

          const thumbPath = `marketplace-images/thumb/${baseName}`;
          const mediumPath = `marketplace-images/medium/${baseName}`;
          const fullPath = `marketplace-images/full/${baseName}`;

          await uploadData({ path: thumbPath, data: thumbFile }).result;
          await uploadData({ path: mediumPath, data: mediumFile }).result;
          await uploadData({ path: fullPath, data: file }).result;

          thumbUrls.push(thumbPath);
          mediumUrls.push(mediumPath);
          fullUrls.push(fullPath);
        }
      }

      const currentUser = await getCurrentUser();

      const sellerUserId =
        (currentUser as any).userId || currentUser.username || "";

      const sellerEmail =
        currentUser.signInDetails?.loginId || currentUser.username || "";

      const sellerSource = sellerUserId || sellerEmail;

      const sellerPublicId = `RAH-${sellerSource
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 10)
        .toUpperCase()}`;

      await client.models.MarketplaceListing.create({
        title: form.title,
        subtitle: form.subtitle,
        description: form.description,
        condition: form.condition,
        price: `$${Number(form.price).toLocaleString()}`,

        image: fullUrls[0] || "/logo.png",
        images: fullUrls.length ? fullUrls : ["/logo.png"],
        thumbImages: thumbUrls.length ? thumbUrls : ["/logo.png"],
        mediumImages: mediumUrls.length ? mediumUrls : ["/logo.png"],
        fullImages: fullUrls.length ? fullUrls : ["/logo.png"],
        sellerEmail,
        sellerUserId,
        sellerPublicId,
        sellerDisplayName: sellerPublicId,
        status: "ACTIVE",
      });

      router.push("/marketplace");
    } catch (err) {
      console.error(err);
      alert("Failed to create listing");
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
            You must be approved as a seller to create marketplace listings.
          </p>

          <Link
            href="/"
            className="mt-6 inline-block rounded bg-[#c0c0c0] px-5 py-3 font-semibold text-black"
          >
            Back Home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-4 font-serif text-5xl">Create Marketplace Listing</h1>

        <p className="mb-10 text-gray-400">
          List a collectible for direct sale.
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

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const files = Array.from(e.dataTransfer.files).filter((file) =>
                file.type.startsWith("image/"),
              );
              setImageFiles((prev) => [...prev, ...files]);

              setPreviews((prev) => [
                ...prev,
                ...files.map((file) => URL.createObjectURL(file)),
              ]);
            }}
            className="rounded-2xl border border-dashed border-white/15 bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-10 text-center transition hover:border-[#c0c0c0]/40"
          >
            <div className="text-xs uppercase tracking-[0.3em] text-gray-500">
              Listing Images
            </div>

            <div className="mt-4 text-2xl font-serif text-[#c0c0c0]">
              Drag & Drop Photos
            </div>

            <div className="mt-6">
              <label className="inline-flex cursor-pointer items-center rounded-lg border border-[#c0c0c0]/20 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-[#c0c0c0] transition hover:border-[#c0c0c0]/50 hover:bg-white/[0.08]">
                Upload Images
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    setImageFiles((prev) => [...prev, ...files]);

                    setPreviews((prev) => [
                      ...prev,
                      ...files.map((file) => URL.createObjectURL(file)),
                    ]);
                  }}
                  className="hidden"
                />
              </label>
            </div>

            {previews.length > 0 && (
              <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
                {previews.map((src, index) => (
                  <div
                    key={index}
                    className="relative overflow-hidden rounded-xl border border-white/10"
                  >
                    {index === 0 && (
                      <div className="absolute left-2 top-2 z-10 rounded bg-[#c0c0c0] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-black">
                        Cover
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setImageFiles((prev) =>
                          prev.filter((_, i) => i !== index),
                        );
                        setPreviews((prev) =>
                          prev.filter((_, i) => i !== index),
                        );
                      }}
                      className="absolute right-2 top-2 z-10 rounded bg-red-500/90 px-2 py-1 text-xs font-bold text-white"
                    >
                      ✕
                    </button>

                    <div className="absolute bottom-2 left-2 right-2 z-10 flex justify-between gap-2">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => moveImage(index, "left")}
                        className="rounded bg-black/80 px-2 py-1 text-xs font-bold text-white disabled:opacity-30"
                      >
                        ←
                      </button>

                      <button
                        type="button"
                        disabled={index === previews.length - 1}
                        onClick={() => moveImage(index, "right")}
                        className="rounded bg-black/80 px-2 py-1 text-xs font-bold text-white disabled:opacity-30"
                      >
                        →
                      </button>
                    </div>

                    <img
                      src={src}
                      alt={`Preview ${index + 1}`}
                      className="h-36 w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="mt-6 w-full rounded bg-[#c0c0c0] py-4 font-semibold text-black disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Listing"}
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
