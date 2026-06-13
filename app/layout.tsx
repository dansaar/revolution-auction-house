import "./globals.css";
import Providers from "./providers";
import Header from "./components/Header";
import SellerNotificationBanner from "./components/SellerNotificationBanner";
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
          <Header />
          <SellerNotificationBanner />

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
