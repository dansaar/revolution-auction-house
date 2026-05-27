"use client";

import "@/lib/amplifyclient";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCurrentUser } from "aws-amplify/auth";

const SELLERS = [
  "dansaar52@gmail.com",
  "dansaar@verizon.com",
  "nckhldy825@gmail.com",
].map((email) => email.toLowerCase());

export default function SellerOnly() {
  const [isSeller, setIsSeller] = useState(false);

  useEffect(() => {
    async function checkSeller() {
      try {
        const user = await getCurrentUser();

        const email = user.signInDetails?.loginId || user.username;

        setIsSeller(SELLERS.includes(String(email).toLowerCase()));
      } catch {
        setIsSeller(false);
      }
    }

    checkSeller();
  }, []);

  if (!isSeller) return null;

  return (
    <div className="flex items-center gap-3">
      <Link
        href="/seller"
        className="rounded border border-[#c8a96b]/30 bg-[#c8a96b]/10 px-4 py-2 text-sm font-medium text-[#e7c98a] transition hover:border-[#e7c98a]/60 hover:bg-[#c8a96b]/20 hover:text-white"
      >
        Seller Dashboard
      </Link>

      <Link
        href="/sell"
        className="rounded border border-[#c8a96b]/30 bg-[#c8a96b]/10 px-4 py-2 text-sm font-medium text-[#e7c98a] transition hover:border-[#e7c98a]/60 hover:bg-[#c8a96b]/20 hover:text-white"
      >
        Create Auction / Listing
      </Link>
    </div>
  );
}
