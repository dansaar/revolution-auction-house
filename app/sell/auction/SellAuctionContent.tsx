"use client";

import "@/lib/amplifyclient";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { moneyToNumber } from "@/lib/money";
import imageCompression from "browser-image-compression";
import { cdnUrl } from "@/lib/cdn";
import { uploadData } from "aws-amplify/storage";
import { isApprovedSeller } from "@/lib/sellers";

export default function SellAuctionContent() {
  const clientRef = React.useRef(generateClient<Schema>());
  const client = clientRef.current;
  const router = useRouter();
  const searchParams = useSearchParams();
  const relistId = searchParams.get("relist");

  const [form, setForm] = useState({
    title: "",
    subtitle: "",
    description: "",
    grade: "",
    certNumber: "",
    year: "",
    setName: "",
    cardNumber: "",
    population: "",
    provenance: "",
    image: "",
    startingPrice: "",
    reservePrice: "",
    increment: "",
    endsAt: `${new Date().toISOString().split("T")[0]}T12:00`,
    chargeTax: false,
    taxRate: "6.625",
    buyerPremiumRate: "18",
  });

  const [scheduled, setScheduled] = useState(false);
  const [startsAt, setStartsAt] = useState(`${new Date().toISOString().split("T")[0]}T12:00`);

  const [loading, setLoading] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  const [checkingSeller, setCheckingSeller] = useState(true);
  const [isSeller, setIsSeller] = useState(false);
  const [existingImagePaths, setExistingImagePaths] = useState<string[]>([]);
  const [existingThumbPaths, setExistingThumbPaths] = useState<string[]>([]);
  const [existingMediumPaths, setExistingMediumPaths] = useState<string[]>([]);
  const [existingFullPaths, setExistingFullPaths] = useState<string[]>([]);

  useEffect(() => {
    async function checkSeller() {
      try {
        const user = await getCurrentUser();
        const email = user.signInDetails?.loginId || user.username;

        setIsSeller(await isApprovedSeller(email));
      } catch {
        setIsSeller(false);
      } finally {
        setCheckingSeller(false);
      }
    }

    checkSeller();
  }, []);

  useEffect(() => {
    async function loadRelistAuction() {
      if (!relistId) return;

      try {
        const result = await client.models.Auction.get(
          { id: relistId },
          { authMode: "apiKey" },
        );

        const auction = result.data;
        if (!auction) return;

        setForm((prev) => ({
          ...prev,
          title: auction.title || "",
          subtitle: auction.subtitle || "",
          description: auction.description || "",
          grade: auction.grade || "",
          certNumber: auction.certNumber || "",
          year: auction.year || "",
          setName: auction.setName || "",
          cardNumber: auction.cardNumber || "",
          population: auction.population || "",
          provenance: auction.provenance || "",
          image: auction.image || "",
          startingPrice: moneyToNumber(auction.price || 0).toString(),
          reservePrice: auction.reservePrice
            ? moneyToNumber(auction.reservePrice).toString()
            : "",
        }));

        const validPaths = (arr: (string | null | undefined)[] | null | undefined) =>
          arr?.filter((p): p is string => !!p && p !== "undefined") || [];

        const oldThumbPaths = validPaths(auction.thumbImages);
        const oldMediumPaths = validPaths(auction.mediumImages);
        const oldFullPaths = validPaths(auction.fullImages?.length ? auction.fullImages : auction.images);

        setExistingThumbPaths(oldThumbPaths);
        setExistingMediumPaths(oldMediumPaths);
        setExistingFullPaths(oldFullPaths);

        const oldImagePaths = oldFullPaths.length ? oldFullPaths : validPaths(auction.images);
        setExistingImagePaths(oldImagePaths);
        setPreviews([]);

        const previewUrls = await Promise.all(
          (oldThumbPaths.length ? oldThumbPaths : oldImagePaths).map(async (path: string) => {
            try {
              if (path.startsWith("http") || path.startsWith("/")) {
                return path;
              }

              return cdnUrl(path);
            } catch {
              return "/logo.png";
            }
          }),
        );

        setPreviews(previewUrls);
      } catch (err) {
        console.error("RELIST LOAD ERROR", err);
      }
    }

    loadRelistAuction();
  }, [relistId, client]);

  function update(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (!form.title || !form.startingPrice || !form.endsAt) {
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

          const thumbPath = `auction-images/thumb/${baseName}`;
          const mediumPath = `auction-images/medium/${baseName}`;
          const fullPath = `auction-images/full/${baseName}`;

          await uploadData({ path: thumbPath, data: thumbFile }).result;
          await uploadData({ path: mediumPath, data: mediumFile }).result;
          await uploadData({ path: fullPath, data: file }).result;

          thumbUrls.push(thumbPath);
          mediumUrls.push(mediumPath);
          fullUrls.push(fullPath);
        }
      }

      const finalThumbImages =
        thumbUrls.length > 0
          ? thumbUrls
          : existingThumbPaths.length > 0
            ? existingThumbPaths
            : existingImagePaths.length > 0
              ? existingImagePaths
              : form.image
                ? [form.image]
                : ["/logo.png"];

      const finalMediumImages =
        mediumUrls.length > 0
          ? mediumUrls
          : existingMediumPaths.length > 0
            ? existingMediumPaths
            : existingImagePaths.length > 0
              ? existingImagePaths
              : form.image
                ? [form.image]
                : ["/logo.png"];

      const finalFullImages =
        fullUrls.length > 0
          ? fullUrls
          : existingFullPaths.length > 0
            ? existingFullPaths
            : existingImagePaths.length > 0
              ? existingImagePaths
              : form.image
                ? [form.image]
                : ["/logo.png"];

      const finalImages = finalFullImages;

      const mainImage = finalImages[0];

      let currentUser;

      try {
        await fetchAuthSession({ forceRefresh: true });
        currentUser = await getCurrentUser();
      } catch {
        window.location.href = "/signin";
        return;
      }

      const sellerUserId =
        (currentUser as any).userId || currentUser.username || "";

      const sellerEmail =
        currentUser.signInDetails?.loginId || currentUser.username || "";

      const sellerSource = sellerUserId || sellerEmail;

      const sellerPublicId = `RAH-${sellerSource
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 10)
        .toUpperCase()}`;

      console.log("CREATE AUCTION: sellerUserId =", sellerUserId, "sellerEmail =", sellerEmail);
      const auctionResult = await client.models.Auction.create({
        title: form.title,
        subtitle: form.subtitle,
        description: form.description,
        grade: form.grade,
        certNumber: form.certNumber,
        year: form.year,
        setName: form.setName,
        cardNumber: form.cardNumber,
        population: form.population,
        provenance: form.provenance,

        image: mainImage,
        images: finalFullImages,

        thumbImages: finalThumbImages,
        mediumImages: finalMediumImages,
        fullImages: finalFullImages,

        price: `$${Number(form.startingPrice).toLocaleString()}`,

        reservePrice: form.reservePrice
          ? `$${Number(form.reservePrice).toLocaleString()}`
          : null,

        chargeTax: form.chargeTax,
        taxRate: form.chargeTax ? 6.625 : 0,
        buyerPremiumRate: 18,

        endsAt: new Date(form.endsAt).toISOString(),
        ...(scheduled ? {
          startsAt: new Date(startsAt).toISOString(),
          status: "SCHEDULED",
        } : {}),

        bids: 0,

        sellerEmail,
        sellerUserId,
        sellerPublicId,
        sellerDisplayName: sellerPublicId,
        sellerName: sellerPublicId,
      });

      console.log("CREATE AUCTION RESULT:", auctionResult.data ? "OK id=" + auctionResult.data.id : "FAILED", auctionResult.errors);
      const auction = auctionResult.data;

      if (!auction) {
        const errMsg = auctionResult.errors?.map((e: any) => e.message).join(", ") || "Unknown error";
        throw new Error(`Auction creation failed: ${errMsg}`);
      }

      await client.models.AuctionState.create({
        auctionId: auction.id,
        currentPrice: auction.price || "$0",

        leaderUserId: null,
        leaderMaxBid: null,

        secondUserId: null,
        secondMaxBid: null,

        bidCount: 0,
        version: 1,

        endsAt: auction.endsAt,
        ended: false,
      });

      router.push("/auctions");
    } catch (err) {
      console.error(err);
      alert("Failed to create auction");
    }

    setLoading(false);
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
            You must be approved as a seller to create auctions.
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
        <h1 className="mb-4 font-serif text-5xl">
          {relistId ? "Re-list Auction" : "Create Auction"}
        </h1>

        {relistId && (
          <p className="mb-6 rounded border border-[#d6aa55]/20 bg-[#1a1408] px-4 py-3 text-sm text-[#e7c77f]">
            Re-listing auction. Existing images will be reused unless you upload
            new ones.
          </p>
        )}

        <p className="mb-10 text-gray-400">
          List a high-value collectible for auction.
        </p>

        <div className="space-y-6">
          <Input
            label="Title"
            value={form.title}
            onChange={(v) => update("title", v)}
          />

          <Input
            label="Subtitle"
            value={form.subtitle}
            onChange={(v) => update("subtitle", v)}
          />

          <TextArea
            label="Description"
            value={form.description}
            onChange={(v) => update("description", v)}
          />

          <div className="grid gap-6 md:grid-cols-2">
            <Input
              label="Grade"
              value={form.grade}
              onChange={(v) => update("grade", v)}
            />
            <Input
              label="Certification #"
              value={form.certNumber}
              onChange={(v) => update("certNumber", v)}
            />
            <Input
              label="Year"
              value={form.year}
              onChange={(v) => update("year", v)}
            />
            <Input
              label="Set"
              value={form.setName}
              onChange={(v) => update("setName", v)}
            />
            <Input
              label="Card Number"
              value={form.cardNumber}
              onChange={(v) => update("cardNumber", v)}
            />
            <Input
              label="Population"
              value={form.population}
              onChange={(v) => update("population", v)}
            />
          </div>

          <TextArea
            label="Provenance"
            value={form.provenance}
            onChange={(v) => update("provenance", v)}
          />

          {/* IMAGE UPLOADER */}
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
              Auction Images
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
                        onClick={() => {
                          const nextPreviews = [...previews];
                          const nextFiles = [...imageFiles];
                          const nextExisting = [...existingImagePaths];

                          [nextPreviews[index - 1], nextPreviews[index]] = [
                            nextPreviews[index],
                            nextPreviews[index - 1],
                          ];

                          [nextFiles[index - 1], nextFiles[index]] = [
                            nextFiles[index],
                            nextFiles[index - 1],
                          ];

                          [nextExisting[index - 1], nextExisting[index]] = [
                            nextExisting[index],
                            nextExisting[index - 1],
                          ];

                          setPreviews(nextPreviews);
                          setImageFiles(nextFiles);
                          setExistingImagePaths(nextExisting);
                        }}
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
                        onClick={() => {
                          const nextPreviews = [...previews];
                          const nextFiles = [...imageFiles];
                          const nextExisting = [...existingImagePaths];

                          [nextPreviews[index + 1], nextPreviews[index]] = [
                            nextPreviews[index],
                            nextPreviews[index + 1],
                          ];

                          [nextFiles[index + 1], nextFiles[index]] = [
                            nextFiles[index],
                            nextFiles[index + 1],
                          ];

                          [nextExisting[index + 1], nextExisting[index]] = [
                            nextExisting[index],
                            nextExisting[index + 1],
                          ];

                          setPreviews(nextPreviews);
                          setImageFiles(nextFiles);
                          setExistingImagePaths(nextExisting);
                        }}
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

          <div className="grid gap-6 md:grid-cols-2">
            <Input
              label="Starting Price ($)"
              value={form.startingPrice}
              onChange={(v) => update("startingPrice", v)}
            />

            <Input
              label="Reserve Price ($)"
              placeholder="Optional"
              value={form.reservePrice}
              onChange={(v) => update("reservePrice", v)}
            />
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="font-semibold text-white">Buyer Premium</div>

              <div className="text-sm text-gray-500">
                18% added to the winning auction price at checkout
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4">
            <label className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.chargeTax}
                  onChange={(e) =>
                    setForm((prev: any) => ({
                      ...prev,
                      chargeTax: e.target.checked,
                      taxRate: "6.625",
                    }))
                  }
                  className="h-5 w-5 accent-[#d6aa55]"
                />

                <div className="font-semibold text-white">
                  Charge NJ Sales Tax
                </div>
              </div>

              <div className="text-sm text-gray-500">
                Adds 6.625% sales tax at checkout
              </div>
            </label>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Input
              label="Bid Increment ($)"
              placeholder="Optional"
              value={form.increment}
              onChange={(v) => update("increment", v)}
            />

            <div>
              <div className="mb-2 text-xs uppercase text-gray-500">
                End Time
              </div>

              <div className="grid grid-cols-[1.6fr_1fr_1fr] gap-3">
                <input
                  type="date"
                  value={form.endsAt.split("T")[0] || ""}
                  onChange={(e) => {
                    const time = form.endsAt.split("T")[1] || "12:00";

                    update("endsAt", `${e.target.value}T${time}`);
                  }}
                  className="rounded border border-white/10 bg-black px-4 py-3"
                />

                <select
                  value={form.endsAt.split("T")[1]?.split(":")[0] || "12"}
                  onChange={(e) => {
                    const date = form.endsAt.split("T")[0];

                    const minute =
                      form.endsAt.split("T")[1]?.split(":")[1] || "00";

                    update("endsAt", `${date}T${e.target.value}:${minute}`);
                  }}
                  className="rounded border border-white/10 bg-black px-4 py-3"
                >
                  {Array.from({ length: 24 }).map((_, hour) => (
                    <option key={hour} value={String(hour).padStart(2, "0")}>
                      {String(hour).padStart(2, "0")}
                    </option>
                  ))}
                </select>

                <select
                  value={form.endsAt.split("T")[1]?.split(":")[1] || "00"}
                  onChange={(e) => {
                    const date = form.endsAt.split("T")[0];

                    const hour =
                      form.endsAt.split("T")[1]?.split(":")[0] || "12";

                    update("endsAt", `${date}T${hour}:${e.target.value}`);
                  }}
                  className="rounded border border-white/10 bg-black px-4 py-3"
                >
                  {["00", "15", "30", "45"].map((minute) => (
                    <option key={minute} value={minute}>
                      {minute}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-2 text-xs text-gray-500">
                Date · Hour · Minute
              </div>
            </div>
          </div>

          {/* Scheduling */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <label className="flex cursor-pointer items-center justify-between">
              <div>
                <div className="font-medium text-white">Schedule for Later</div>
                <div className="mt-0.5 text-xs text-gray-500">
                  Auction stays hidden until the start time
                </div>
              </div>
              <button
                type="button"
                onClick={() => setScheduled((s) => !s)}
                className={`relative h-6 w-11 rounded-full border transition ${
                  scheduled
                    ? "border-[#d6aa55]/60 bg-[#d6aa55]/30"
                    : "border-white/10 bg-white/[0.06]"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full border transition-all ${
                    scheduled
                      ? "left-5 border-[#d6aa55] bg-[#e7c77f]"
                      : "left-0.5 border-white/20 bg-white/30"
                  }`}
                />
              </button>
            </label>

            {scheduled && (
              <div className="mt-4">
                <div className="mb-2 text-xs uppercase text-gray-500">Start Time</div>
                <div className="grid grid-cols-[1.6fr_1fr_1fr] gap-3">
                  <input
                    type="date"
                    value={startsAt.split("T")[0] || ""}
                    onChange={(e) => {
                      const time = startsAt.split("T")[1] || "12:00";
                      setStartsAt(`${e.target.value}T${time}`);
                    }}
                    className="rounded border border-white/10 bg-black px-4 py-3 text-white"
                  />
                  <select
                    value={startsAt.split("T")[1]?.split(":")[0] || "12"}
                    onChange={(e) => {
                      const date = startsAt.split("T")[0];
                      const minute = startsAt.split("T")[1]?.split(":")[1] || "00";
                      setStartsAt(`${date}T${e.target.value}:${minute}`);
                    }}
                    className="rounded border border-white/10 bg-black px-4 py-3 text-white"
                  >
                    {Array.from({ length: 24 }).map((_, h) => (
                      <option key={h} value={String(h).padStart(2, "0")}>
                        {String(h).padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                  <select
                    value={startsAt.split("T")[1]?.split(":")[1] || "00"}
                    onChange={(e) => {
                      const date = startsAt.split("T")[0];
                      const hour = startsAt.split("T")[1]?.split(":")[0] || "12";
                      setStartsAt(`${date}T${hour}:${e.target.value}`);
                    }}
                    className="rounded border border-white/10 bg-black px-4 py-3 text-white"
                  >
                    {["00", "15", "30", "45"].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="mt-2 text-xs text-gray-500">Date · Hour · Minute</div>
              </div>
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="mt-6 w-full rounded bg-[#c0c0c0] py-4 font-semibold text-black"
          >
            {loading
              ? relistId
                ? "Re-Listing..."
                : "Creating..."
              : relistId
                ? "Re-List Auction"
                : "Create Auction"}
          </button>
        </div>
      </div>
    </main>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <div className="mb-2 text-xs uppercase text-gray-500">{label}</div>

      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-white/10 bg-black px-4 py-3 placeholder:text-gray-600"
      />
    </div>
  );
}
function TextArea({
  label,
  value,
  onChange,
  placeholder = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <div className="mb-2 text-xs uppercase text-gray-500">{label}</div>

      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        className="w-full rounded border border-white/10 bg-black px-4 py-3 placeholder:text-gray-600"
      />
    </div>
  );
}
