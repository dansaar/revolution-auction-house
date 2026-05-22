"use client";

import "@/lib/amplifyclient";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCurrentUser, signOut } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";

export default function NavUser() {
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    async function loadUser() {
      try {
        const currentUser = await getCurrentUser();
        const email =
          currentUser.signInDetails?.loginId || currentUser.username || "";

        setUserEmail(email);
      } catch {
        setUserEmail("");
      }
    }

    loadUser();

    const unsubscribe = Hub.listen("auth", () => {
      loadUser();
    });

    window.addEventListener("focus", loadUser);

    return () => {
      unsubscribe();
      window.removeEventListener("focus", loadUser);
    };
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
          setUserEmail("");
          window.location.href = "/";
        }}
        className="text-xs text-gray-500 transition hover:text-white"
      >
        Sign Out
      </button>
    </div>
  );
}
