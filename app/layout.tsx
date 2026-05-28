import "./globals.css";
import Link from "next/link";
import Providers from "./providers";
import NavUser from "./components/NavUser";
import SellerOnly from "./components/SellerOnly";
import AmplifyProvider from "./amplify-provider";
import { Toaster } from "sonner";

export const metadata = {
  title: "Revolution Auction House",
  description: "Luxury Pokémon Auction Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AmplifyProvider />
        <Providers>
          <header className="w-full border-b border-white/10 bg-[#050607] px-6 py-4">
            <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <Link href="/" className="flex items-center gap-4">
                <img
                  src="/logo.png"
                  alt="Revolution Auction House"
                  className="h-14 w-auto object-contain"
                />

                <div className="leading-tight">
                  <div className="font-serif text-lg tracking-[0.4em] text-[#c0c0c0]">
                    REVOLUTION
                  </div>
                  <div className="text-[10px] tracking-[0.4em] text-[#c0c0c0]">
                    AUCTION HOUSE
                  </div>
                </div>
              </Link>

              <nav className="flex flex-wrap items-center justify-center gap-4 text-sm text-gray-400 lg:justify-end">
                <Link href="/" className="hover:text-white">
                  Home
                </Link>
                <Link href="/auctions" className="hover:text-white">
                  Auctions
                </Link>
                <Link href="/marketplace" className="hover:text-white">
                  Marketplace
                </Link>

                <Link href="/dashboard" className="hover:text-white">
                  Buyer Dashboard
                </Link>
                <Link href="/verify" className="hover:text-white">
                  Verify
                </Link>
                <NavUser />
                <SellerOnly />
              </nav>
            </div>
          </header>

          {children}

          <Toaster
            position="top-center"
            richColors
            toastOptions={{
              style: {
                background: "#0b0c0e",
                border: "1px solid rgba(214,170,85,0.25)",
                color: "#f5f5f5",
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
