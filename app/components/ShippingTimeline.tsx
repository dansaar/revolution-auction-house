"use client";

// Linear shipping progress for a buyer's order. The status values match what the
// EasyPost webhook advances (PAID → SHIPPED → IN_TRANSIT → OUT_FOR_DELIVERY →
// DELIVERED). Source of truth lives on the Auction / MarketplaceListing record.

const STEPS = [
  { code: "PAID", label: "Paid" },
  { code: "SHIPPED", label: "Shipped" },
  { code: "IN_TRANSIT", label: "In transit" },
  { code: "OUT_FOR_DELIVERY", label: "Out for delivery" },
  { code: "DELIVERED", label: "Delivered" },
];

function carrierTrackingUrl(carrier?: string | null, tracking?: string | null): string | null {
  if (!tracking) return null;
  const c = (carrier || "").toUpperCase();
  if (c.includes("USPS")) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tracking}`;
  if (c.includes("UPS")) return `https://www.ups.com/track?tracknum=${tracking}`;
  if (c.includes("FEDEX")) return `https://www.fedex.com/fedextrack/?trknbr=${tracking}`;
  if (c.includes("DHL")) return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${tracking}`;
  return null;
}

export default function ShippingTimeline({
  status,
  trackingNumber,
  carrier,
}: {
  status?: string | null;
  trackingNumber?: string | null;
  carrier?: string | null;
}) {
  const current = (status || "PAID").toUpperCase();
  const activeIndex = Math.max(0, STEPS.findIndex((s) => s.code === current));
  const url = carrierTrackingUrl(carrier, trackingNumber);

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Shipping</span>
        {trackingNumber && (
          <span className="text-xs text-gray-400">
            {carrier ? `${carrier} · ` : ""}
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-[#e7c77f] underline underline-offset-2 hover:opacity-80">
                {trackingNumber}
              </a>
            ) : (
              <span className="text-gray-300">{trackingNumber}</span>
            )}
          </span>
        )}
      </div>

      <div className="flex items-center">
        {STEPS.map((step, i) => {
          const done = i <= activeIndex;
          const isLast = i === STEPS.length - 1;
          return (
            <div key={step.code} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full border text-[10px] ${
                    done
                      ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-300"
                      : "border-white/10 bg-black text-gray-600"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </div>
                <span className={`mt-1 max-w-[60px] text-center text-[9px] leading-tight ${done ? "text-gray-300" : "text-gray-600"}`}>
                  {step.label}
                </span>
              </div>
              {!isLast && (
                <div className={`mx-1 h-px flex-1 ${i < activeIndex ? "bg-emerald-400/40" : "bg-white/10"}`} />
              )}
            </div>
          );
        })}
      </div>

      {!trackingNumber && (
        <p className="mt-3 text-[11px] text-gray-500">
          Tracking will appear here once the seller ships your item.
        </p>
      )}
    </div>
  );
}
