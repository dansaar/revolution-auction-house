import "./globals.css";
import Providers from "./providers";
import Header from "./components/Header";
import AnnouncementTicker from "./components/AnnouncementTicker";
import SellerNotificationBanner from "./components/SellerNotificationBanner";
import AmplifyProvider from "./amplify-provider";
import ConfirmHost from "./components/ConfirmHost";
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
          <Header />
          <AnnouncementTicker />
          <SellerNotificationBanner />

          {children}

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
