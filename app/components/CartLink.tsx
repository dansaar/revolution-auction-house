"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { CART_EVENT } from "@/lib/cart";
import { fetchCartCountDetail, localTotalFrom, type CartCountDetail } from "@/lib/cartCount";

export default function CartLink({ onNavigate }: { onNavigate?: () => void }) {
  const [count, setCount] = useState(0);
  const detailRef = useRef<CartCountDetail | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Full refresh: re-fetches payment obligations + recomputes total.
    async function fullRefresh() {
      const detail = await fetchCartCountDetail();
      if (cancelled) return;
      detailRef.current = detail;
      setCount(detail.total);
    }

    // Local refresh: cheap recompute on add/remove using cached obligations.
    function localRefresh() {
      if (detailRef.current) setCount(localTotalFrom(detailRef.current));
      else fullRefresh();
    }

    fullRefresh();
    window.addEventListener(CART_EVENT, localRefresh); // this tab added/removed
    window.addEventListener("storage", fullRefresh); // another tab changed it
    window.addEventListener("focus", fullRefresh); // returning to the tab
    return () => {
      cancelled = true;
      window.removeEventListener(CART_EVENT, localRefresh);
      window.removeEventListener("storage", fullRefresh);
      window.removeEventListener("focus", fullRefresh);
    };
  }, []);

  return (
    <Link
      href="/cart"
      onClick={onNavigate}
      aria-label={`Cart${count ? ` (${count} item${count === 1 ? "" : "s"})` : ""}`}
      className="relative flex items-center gap-2 hover:text-white"
    >
      <ShoppingCart size={18} />
      <span className="lg:hidden">Cart</span>
      {count > 0 && (
        <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#d6aa55] px-1 text-[10px] font-bold text-black lg:-right-3">
          {count}
        </span>
      )}
    </Link>
  );
}
