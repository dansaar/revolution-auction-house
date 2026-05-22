"use client";

import { Suspense } from "react";
import ConfirmSignupContent from "./ConfirmSignupContent";

export default function ConfirmSignupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#050607] p-10 text-white">
          Loading...
        </div>
      }
    >
      <ConfirmSignupContent />
    </Suspense>
  );
}
