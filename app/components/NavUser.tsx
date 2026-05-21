"use client";

import "@/lib/amplifyclient";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCurrentUser } from "aws-amplify/auth";
import { signOut } from "aws-amplify/auth";

export default function NavUser() {
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    async function loadUser() {
      try {
        const currentUser = await getCurrentUser();

        setUserEmail(
          currentUser.signInDetails?.loginId || currentUser.username,
        );
      } catch {
        setUserEmail("");
      }
    }

    loadUser();
  }, []);

  if (!userEmail) {
    return (
      <Link
        href="/signin"
        className="rounded border border-white/10 px-3 py-1 text-xs text-gray-400 transition hover:border-[#c0c0c0]/50 hover:text-white"
      >
        Sign In
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-[#c0c0c0]">
        {userEmail.split("@")[0]}
      </div>

      <button
        onClick={async () => {
          await signOut();
          window.location.href = "/";
        }}
        className="text-xs text-gray-500 transition hover:text-white"
      >
        Sign Out
      </button>
    </div>
  );
}
