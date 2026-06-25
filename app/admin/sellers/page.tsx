"use client";

import "@/lib/amplifyclient";
import { toast } from "sonner";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCurrentUser } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { isAdminUser } from "@/lib/sellers";
import { confirmDialog } from "@/lib/confirm";

const client = generateClient<Schema>();

export default function AdminSellersPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");

  const [sellers, setSellers] = useState<any[]>([]);
  const [newSellerEmail, setNewSellerEmail] = useState("");
  const [newSellerName, setNewSellerName] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadSellers() {
    const result = await client.models.SellerProfile.list({
      authMode: "userPool",
      limit: 1000,
    } as any);

    const sorted = [...(result.data || [])].sort((a: any, b: any) =>
      String(a.email || "").localeCompare(String(b.email || "")),
    );

    setSellers(sorted);
  }

  useEffect(() => {
    async function load() {
      try {
        const user = await getCurrentUser();
        const email = user.signInDetails?.loginId || user.username || "";
        setAdminEmail(email);

        const admin = await isAdminUser();
        setIsAdmin(admin);

        if (admin) {
          await loadSellers();
        }
      } finally {
        setChecking(false);
      }
    }

    load();
  }, []);

  async function addSeller() {
    if (saving) return;

    const email = newSellerEmail.trim().toLowerCase();

    if (!email) {
      toast.error("Enter seller email.");
      return;
    }

    try {
      setSaving(true);

      const existing = await client.models.SellerProfile.get({ email }, {
        authMode: "userPool",
      } as any);

      if (existing.data) {
        await client.models.SellerProfile.update(
          {
            email,
            displayName:
              newSellerName.trim() || existing.data.displayName || email,
            status: "APPROVED",
            approvedBy: adminEmail,
            approvedAt: new Date().toISOString(),
            revokedBy: "",
            revokedAt: null,
          },
          { authMode: "userPool" } as any,
        );
      } else {
        await client.models.SellerProfile.create(
          {
            email,
            displayName: newSellerName.trim() || email,
            status: "APPROVED",
            approvedBy: adminEmail,
            approvedAt: new Date().toISOString(),
          },
          { authMode: "userPool" } as any,
        );
      }

      const groupResult = await client.mutations.manageSellerGroup(
        { email, action: "add" },
        { authMode: "userPool" } as any,
      );

      if (!groupResult.data?.success) {
        toast.error(
          `Seller profile saved, but Cognito group update failed: ${groupResult.data?.message ?? "unknown error"}\nThe seller must have an account before they can list items.`,
        );
      }

      setNewSellerEmail("");
      setNewSellerName("");

      await loadSellers();
    } catch (err) {
      console.error(err);
      toast.error("Failed to add seller.");
    } finally {
      setSaving(false);
    }
  }

  async function revokeSeller(seller: any) {
    const confirmed = await confirmDialog({ title: "Revoke seller", message: `Revoke seller access for ${seller.email}?`, confirmText: "Revoke", danger: true });
    if (!confirmed) return;

    try {
      await client.models.SellerProfile.update(
        {
          email: seller.email,
          status: "REVOKED",
          revokedBy: adminEmail,
          revokedAt: new Date().toISOString(),
        },
        { authMode: "userPool" } as any,
      );

      await client.mutations.manageSellerGroup(
        { email: seller.email, action: "remove" },
        { authMode: "userPool" } as any,
      );

      await loadSellers();
    } catch (err) {
      console.error(err);
      toast.error("Failed to revoke seller.");
    }
  }

  async function approveSeller(seller: any) {
    try {
      await client.models.SellerProfile.update(
        {
          email: seller.email,
          status: "APPROVED",
          approvedBy: adminEmail,
          approvedAt: new Date().toISOString(),
          revokedBy: "",
          revokedAt: null,
        },
        { authMode: "userPool" } as any,
      );

      const groupResult = await client.mutations.manageSellerGroup(
        { email: seller.email, action: "add" },
        { authMode: "userPool" } as any,
      );

      if (!groupResult.data?.success) {
        toast.error(
          `Seller re-approved, but Cognito group update failed: ${groupResult.data?.message ?? "unknown error"}`,
        );
      }

      await loadSellers();
    } catch (err) {
      console.error(err);
      toast.error("Failed to approve seller.");
    }
  }

  if (checking) {
    return (
      <main className="min-h-screen bg-[#050607] p-10 text-white">
        Checking admin access...
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-[#050607] p-10 text-white">
        Admin access required.
      </main>
    );
  }

  const approvedSellers = sellers.filter(
    (seller: any) => seller.status === "APPROVED",
  );

  const revokedSellers = sellers.filter(
    (seller: any) => seller.status === "REVOKED",
  );

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin" className="text-sm text-[#c0c0c0]">
          ← Back to Admin
        </Link>

        <h1 className="mt-6 font-serif text-5xl text-[#c0c0c0]">
          Seller Controls
        </h1>

        <p className="mt-4 text-gray-400">
          Add, approve, and revoke sellers without changing code.
        </p>

        <section className="mt-8 rounded-2xl border border-[#d6aa55]/30 bg-[#1a1408]/50 p-6">
          <h2 className="font-serif text-2xl text-[#e7c77f]">Add Seller</h2>

          <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_auto]">
            <input
              value={newSellerEmail}
              onChange={(e) => setNewSellerEmail(e.target.value)}
              placeholder="seller@email.com"
              className="rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none placeholder:text-gray-600 focus:border-[#d6aa55]/50"
            />

            <input
              value={newSellerName}
              onChange={(e) => setNewSellerName(e.target.value)}
              placeholder="Display name optional"
              className="rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none placeholder:text-gray-600 focus:border-[#d6aa55]/50"
            />

            <button
              type="button"
              disabled={saving}
              onClick={addSeller}
              className="rounded-xl bg-[#c0c0c0] px-6 py-3 font-semibold text-black hover:bg-white disabled:opacity-50"
            >
              {saving ? "Saving..." : "Add Seller"}
            </button>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-4 font-serif text-3xl text-[#c0c0c0]">
            Approved Sellers
          </h2>

          {approvedSellers.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-gray-500">
              No approved sellers yet.
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03]">
              {approvedSellers.map((seller: any) => (
                <div
                  key={seller.email}
                  className="flex flex-col gap-4 border-b border-white/10 p-5 last:border-b-0 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="text-white">{seller.email}</div>

                    {seller.displayName && (
                      <div className="mt-1 text-sm text-gray-400">
                        {seller.displayName}
                      </div>
                    )}

                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-emerald-400">
                      Approved Seller
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => revokeSeller(seller)}
                    className="rounded border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/20"
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {revokedSellers.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-4 font-serif text-3xl text-[#c0c0c0]">
              Revoked Sellers
            </h2>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03]">
              {revokedSellers.map((seller: any) => (
                <div
                  key={seller.email}
                  className="flex flex-col gap-4 border-b border-white/10 p-5 last:border-b-0 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="text-white">{seller.email}</div>

                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-red-300">
                      Revoked
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => approveSeller(seller)}
                    className="rounded border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20"
                  >
                    Re-Approve
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
