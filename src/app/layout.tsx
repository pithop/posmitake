import type { Metadata, Viewport } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import { PowerSyncProvider } from "@/components/PowerSyncProvider";
import { ClientLayout } from "@/components/ClientLayout";
import { OrderAlertManager } from "@/components/OrderAlertManager";
import { StockAlertManager } from "@/components/StockAlertManager";
import { logger } from "@/lib/logger";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const metadata: Metadata = {
  title: "Mitake Ramen POS",
  description: "Point of Sale System",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${outfit.variable} font-sans antialiased`} suppressHydrationWarning>
        <OrderAlertManager />
        <StockAlertManager />
        <PowerSyncProvider>
          <ClientLayout>
            {children}
          </ClientLayout>
        </PowerSyncProvider>
      </body>
    </html>
  );
}
