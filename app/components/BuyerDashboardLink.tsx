"use client";

import "@/lib/amplifyclient";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCurrentUser } from "aws-amplify/auth";
import { isApprovedSeller } from "@/lib/sellers";

export default function BuyerDashboardLink({ onNavigate }: { onNavigate?: () => void } = {}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    async function check() {
      try {
        const user = await getCurrentUser();
        const email = user.signInDetails?.loginId || user.username;
        const seller = await isApprovedSeller(String(email));
        setShow(!seller);
      } catch {
        setShow(true);
      }
    }
    check();
  }, []);

  if (!show) return null;

  return (
    <Link href="/dashboard" onClick={onNavigate} className="hover:text-white">
      Buyer Dashboard
    </Link>
  );
}
