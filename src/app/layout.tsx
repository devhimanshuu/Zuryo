import "@fontsource-variable/hanken-grotesk";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/toaster";
import { clientEnv } from "@/lib/config/env.client";

export const metadata: Metadata = {
  metadataBase: new URL(clientEnv.NEXT_PUBLIC_APP_URL),
  title: { default: "Zuryo — Personal training in your community", template: "%s · Zuryo" },
  description:
    "Book a personal trainer for a 60-minute session in your residential community, right now or for later.",
};

export const viewport: Viewport = { themeColor: "#f6f4ef", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
