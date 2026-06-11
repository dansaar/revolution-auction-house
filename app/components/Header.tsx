"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import NavUser from "./NavUser";
import SellerOnly from "./SellerOnly";
import BuyerDashboardLink from "./BuyerDashboardLink";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/auctions", label: "Auctions" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/verify", label: "Verify" },
];

export default function Header() {
  const [open, setOpen] = useState(false);

  // Close on route change / resize past breakpoint
  useEffect(() => {
    function onResize() {
      if (window.innerWidth >= 1024) setOpen(false);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Lock body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const Logo = (
    <Link href="/" className="flex items-center gap-3" onClick={() => setOpen(false)}>
      <img src="/logo.png" alt="Revolution Auction House" className="h-12 w-auto object-contain lg:h-16" />
      <div className="leading-tight hidden sm:block">
        <div className="font-serif text-lg tracking-[0.4em] text-[#c0c0c0]">REVOLUTION</div>
        <div className="text-[10px] tracking-[0.4em] text-[#c0c0c0]">AUCTION HOUSE</div>
      </div>
    </Link>
  );

  return (
    <>
      <header className="w-full border-b border-white/10 bg-[#050607] px-6 py-5">
        {/* Desktop */}
        <div className="mx-auto hidden max-w-7xl lg:flex lg:items-center lg:justify-between">
          {Logo}
          <nav className="flex flex-wrap items-center justify-end gap-4 text-sm text-gray-400">
            {NAV_LINKS.map(({ href, label }) => (
              <Link key={href} href={href} className="hover:text-white">{label}</Link>
            ))}
            <BuyerDashboardLink />
            <NavUser />
            <SellerOnly />
          </nav>
        </div>

        {/* Mobile */}
        <div className="flex items-center justify-between lg:hidden">
          {Logo}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            className="rounded-lg border border-white/10 p-2 text-gray-400 transition hover:border-white/20 hover:text-white"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#050607] lg:hidden">
          {/* Drawer header */}
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            {Logo}
            <button
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="rounded-lg border border-white/10 p-2 text-gray-400 transition hover:border-white/20 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>

          {/* Links */}
          <nav className="flex flex-1 flex-col overflow-y-auto px-6 py-8 gap-1">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-4 text-lg text-gray-300 transition hover:bg-white/[0.04] hover:text-white"
              >
                {label}
              </Link>
            ))}
            <BuyerDashboardLink onNavigate={() => setOpen(false)} />

            <div className="my-4 border-t border-white/10" />

            {/* Auth + seller links — rendered inline so they can read their own auth state */}
            <div className="flex flex-col gap-3 px-4">
              <NavUser onNavigate={() => setOpen(false)} />
              <SellerOnly onNavigate={() => setOpen(false)} />
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
