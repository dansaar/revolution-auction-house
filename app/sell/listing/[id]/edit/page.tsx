"use client";

import "@/lib/amplifyclient";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { getCurrentUser } from "aws-amplify/auth";
import Link from "next/link";
import { cdnUrl } from "@/lib/cdn";
import { uploadData } from "aws-amplify/storage";
import imageCompression from "browser-image-compression";

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

  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [existingImagePaths, setExistingImagePaths] = useState<string[]>([]);

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

        const existing = result.data.fullImages?.length
          ? result.data.fullImages
          : result.data.images?.length
            ? result.data.images
            : result.data.image
              ? [result.data.image]
              : [];

        const cleanExisting = existing.filter(
          (path: string | null | undefined): path is string =>
            !!path && path !== "undefined",
        );

        setExistingImagePaths(cleanExisting);
        setPreviews(cleanExisting.map((path: string) => cdnUrl(path)));
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

  function moveImage(index: number, direction: "left" | "right") {
    const newIndex = direction === "left" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= previews.length) return;

    setPreviews((prev) => {
      const copy = [...prev];
      [copy[index], copy[newIndex]] = [copy[newIndex], copy[index]];
      return copy;
    });

    setImageFiles((prev) => {
      const copy = [...prev];
      [copy[index], copy[newIndex]] = [copy[newIndex], copy[index]];
      return copy;
    });

    setExistingImagePaths((prev) => {
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
        for (const file of imageFiles.filter(Boolean)) {
          const safeName = (file.name || "listing-image.jpg").replaceAll(
            " ",
            "-",
          );
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

      const finalFullImages =
        existingImagePaths.length > 0 || fullUrls.length > 0
          ? [...existingImagePaths, ...fullUrls]
          : ["/logo.png"];

      const finalMediumImages =
        existingImagePaths.length > 0 || mediumUrls.length > 0
          ? [...existingImagePaths, ...mediumUrls]
          : ["/logo.png"];

      const finalThumbImages =
        existingImagePaths.length > 0 || thumbUrls.length > 0
          ? [...existingImagePaths, ...thumbUrls]
          : ["/logo.png"];

      const mainImage = finalFullImages[0];
      await client.models.MarketplaceListing.update(
        {
          id: listingId,
          title: form.title,
          subtitle: form.subtitle,
          description: form.description,
          condition: form.condition,
          price: `$${Number(form.price).toLocaleString()}`,
          status: form.status,
          image: mainImage,
          images: finalFullImages,
          thumbImages: finalThumbImages,
          mediumImages: finalMediumImages,
          fullImages: finalFullImages,
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

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();

              const files = Array.from(e.dataTransfer.files).filter((file) =>
                file.type.startsWith("image/"),
              );

              const remainingSlots = 12 - previews.length;
              const limited = files.slice(0, remainingSlots);

              setImageFiles((prev) => [...prev, ...limited]);

              setPreviews((prev) => [
                ...prev,
                ...limited.map((file) => URL.createObjectURL(file)),
              ]);
            }}
            className="rounded-2xl border border-dashed border-white/15 bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-10 text-center transition hover:border-[#c0c0c0]/40"
          >
            <div className="text-xs uppercase tracking-[0.3em] text-gray-500">
              Listing Images
              <div className="mt-2 text-xs text-gray-500">
                {previews.length}/12 images
              </div>
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

                    const remainingSlots = 12 - previews.length;
                    const limited = files.slice(0, remainingSlots);

                    setImageFiles((prev) => [...prev, ...limited]);

                    setPreviews((prev) => [
                      ...prev,
                      ...limited.map((file) => URL.createObjectURL(file)),
                    ]);

                    e.currentTarget.value = "";
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
                    className="group relative overflow-hidden rounded-xl border border-white/10 bg-black"
                  >
                    {index === 0 && (
                      <div className="absolute left-2 top-2 z-10 rounded bg-[#c0c0c0] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-black">
                        Cover
                      </div>
                    )}

                    <img
                      src={src}
                      alt={`Preview ${index + 1}`}
                      className="h-36 w-full object-contain bg-black"
                    />

                    <div className="absolute inset-x-2 bottom-2 flex justify-between gap-2">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => moveImage(index, "left")}
                        className="rounded bg-black/70 px-2 py-1 text-xs text-white disabled:opacity-30"
                      >
                        ←
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPreviews((prev) =>
                            prev.filter((_, i) => i !== index),
                          );

                          setImageFiles((prev) =>
                            prev.filter((_, i) => i !== index),
                          );

                          setExistingImagePaths((prev) =>
                            prev.filter((_, i) => i !== index),
                          );
                        }}
                        className="rounded bg-red-600/80 px-2 py-1 text-xs text-white"
                      >
                        Remove
                      </button>

                      <button
                        type="button"
                        disabled={index === previews.length - 1}
                        onClick={() => moveImage(index, "right")}
                        className="rounded bg-black/70 px-2 py-1 text-xs text-white disabled:opacity-30"
                      >
                        →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

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
