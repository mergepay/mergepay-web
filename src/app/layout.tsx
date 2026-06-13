import type { Metadata } from "next";
import { Archivo_Black, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const display = Archivo_Black({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
});

const body = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-body",
});

const mono = IBM_Plex_Mono({
  weight: ["400", "600"],
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Mergepay — Split expenses on Stellar",
  description:
    "Split expenses on Stellar, settle instantly, track everything transparently. Group settlement for friends, roommates, trips, and small teams.",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "Mergepay — Split expenses on Stellar",
    description:
      "Turn shared spending into transparent, auditable, low-fee on-chain payments.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${display.variable} ${body.variable} ${mono.variable} font-body`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
