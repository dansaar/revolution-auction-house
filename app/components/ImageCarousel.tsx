"use client";

import { useMemo, useState } from "react";
import { cdnUrl } from "@/lib/cdn";

export default function ImageCarousel({
  images,
  alt,
  className = "h-56",
}: {
  images?: string[] | null;
  alt?: string;
  className?: string;
}) {
  const resolvedImages = useMemo(() => {
    const clean = (images || [])
      .filter((img) => img && img !== "undefined" && img !== "/logo.png")
      .map((img) => cdnUrl(img));

    return clean.length > 0 ? clean : ["/logo.png"];
  }, [images]);

  const [index, setIndex] = useState(0);

  const current = resolvedImages[index] || "/logo.png";
  const hasMultiple = resolvedImages.length > 1;

  function previousImage() {
    setIndex((prev) => (prev === 0 ? resolvedImages.length - 1 : prev - 1));
  }

  function nextImage() {
    setIndex((prev) => (prev === resolvedImages.length - 1 ? 0 : prev + 1));
  }

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-white/10 bg-black ${className}`}
    >
      <img
        loading="lazy"
        src={current}
        alt={alt || "Listing image"}
        onError={(e) => {
          e.currentTarget.src = "/logo.png";
        }}
        className="h-full w-full object-contain bg-black"
      />

      {hasMultiple && (
        <>
          <button
            type="button"
            onClick={previousImage}
            className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/70 text-white transition hover:bg-black"
            aria-label="Previous image"
          >
            ‹
          </button>

          <button
            type="button"
            onClick={nextImage}
            className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/70 text-white transition hover:bg-black"
            aria-label="Next image"
          >
            ›
          </button>

          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {resolvedImages.map((_, dotIndex) => (
              <button
                key={dotIndex}
                type="button"
                onClick={() => setIndex(dotIndex)}
                className={`h-1.5 rounded-full transition ${
                  dotIndex === index ? "w-5 bg-[#e7c77f]" : "w-1.5 bg-white/40"
                }`}
                aria-label={`View image ${dotIndex + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
