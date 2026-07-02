import "./globals.css";
import Providers from "./providers";
import Header from "./components/Header";
import Footer from "./components/Footer";
import AnnouncementTicker from "./components/AnnouncementTicker";
import SellerNotificationBanner from "./components/SellerNotificationBanner";
import AmplifyProvider from "./amplify-provider";
import ConfirmHost from "./components/ConfirmHost";
import { Toaster } from "sonner";
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Revolution Auction House — Premium Pokémon Card Auctions",
    template: "%s | Revolution Auction House",
  },
  description:
    "High-end Pokémon card auctions and marketplace. Verified buyers, authenticated cards, insured shipping. For collectors, by collectors.",
  openGraph: {
    type: "website",
    siteName: "Revolution Auction House",
    title: "Revolution Auction House — Premium Pokémon Card Auctions",
    description:
      "High-end Pokémon card auctions and marketplace. Verified buyers, authenticated cards, insured shipping.",
    images: ["/logo.png"],
  },
  twitter: {
    card: "summary_large_image",
  },
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
          <Header />
          <AnnouncementTicker />
          <SellerNotificationBanner />

          {children}

          <Footer />

          <ConfirmHost />

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
