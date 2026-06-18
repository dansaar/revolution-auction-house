"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { cartCount, CART_EVENT } from "@/lib/cart";

export default function CartLink({ onNavigate }: { onNavigate?: () => void }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const sync = () => setCount(cartCount());
    sync();
    // Update when this tab changes the cart, or another tab does (storage).
    window.addEventListener(CART_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CART_EVENT, sync);
      window.removeEventListener("storage", sync);
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
