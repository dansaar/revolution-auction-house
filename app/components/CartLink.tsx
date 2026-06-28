"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { CART_EVENT } from "@/lib/cart";
import { fetchCartCountDetail, localTotalFrom, type CartCountDetail } from "@/lib/cartCount";

export default function CartLink({ onNavigate }: { onNavigate?: () => void }) {
  const [count, setCount] = useState(0);
  const detailRef = useRef<CartCountDetail | null>(null);
  const pathname = usePathname();

  // Full refresh: re-fetches payment obligations + recomputes total.
  const fullRefresh = useCallback(async () => {
    const detail = await fetchCartCountDetail();
    detailRef.current = detail;
    setCount(detail.total);
  }, []);

  useEffect(() => {
    // Local refresh: cheap recompute on add/remove using cached obligations.
    function localRefresh() {
      if (detailRef.current) setCount(localTotalFrom(detailRef.current));
      else fullRefresh();
    }
    window.addEventListener(CART_EVENT, localRefresh); // this tab added/removed
    window.addEventListener("storage", fullRefresh); // another tab changed it
    window.addEventListener("focus", fullRefresh); // returning to the tab
    return () => {
      window.removeEventListener(CART_EVENT, localRefresh);
      window.removeEventListener("storage", fullRefresh);
      window.removeEventListener("focus", fullRefresh);
    };
  }, [fullRefresh]);

  // Re-sync on every in-app navigation so the badge reflects server-side changes
  // (a purchase, an item selling) without waiting for the tab to lose/regain focus.
  useEffect(() => {
    fullRefresh();
  }, [pathname, fullRefresh]);

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
