import type { Metadata } from "next";
import { Archivo_Black, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { OfflineBanner } from "@/components/ui/offline-banner";
import { NetworkStatusBanner } from "@/components/NetworkStatusBanner";
import { NetworkStatusComponent } from "@/components/network-status";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";


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

// Pre-paint theme bootstrap (#871): applies the stored/system theme class
// before first render so a dark-mode reload never flashes the light palette.
// Must stay in sync with STORAGE_KEY/getStoredTheme in theme-provider.tsx.
const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var t=localStorage.getItem("mergepay-theme");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.remove("light","dark");r.classList.add(d?"dark":"light");}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body
        className={`${display.variable} ${body.variable} ${mono.variable} font-body`}
      >
        <OfflineBanner />
        <NetworkStatusBanner />
        <NetworkStatusComponent />
        <Providers>
          {/* Route-level boundaries live inside the `(app)` group, which leaves
              the sign-in and landing pages uncovered. This catches a crash in
              any of them before it reaches `global-error.tsx` and takes the
              whole document with it. */}
          <ErrorBoundary dashboardHref="/">{children}</ErrorBoundary>
        </Providers>
      </body>

    </html>
  );
}
