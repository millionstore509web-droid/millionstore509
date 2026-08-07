// app/layout.tsx — Remplace ton layout existant
import type { Metadata, Viewport } from "next";
import { InstallBanner } from "@/components/InstallBanner";

export const metadata: Metadata = {
  title: "MillionStore — Ordinateurs, Laptops & Accessoires",
  description:
    "Boutique en ligne MillionStore à Port-au-Prince. Laptops, Ordinateurs, Tablettes, Accessoires au meilleur prix.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MillionStore",
    startupImage: [
      {
        url: "/icons/icon-512x512.png",
        media: "(device-width: 390px) and (device-height: 844px)",
      },
    ],
  },
  icons: {
    icon: [
      { url: "/icons/icon-32x32.png",  sizes: "32x32",  type: "image/png" },
      { url: "/icons/icon-96x96.png",  sizes: "96x96",  type: "image/png" },
      { url: "/icons/icon-192x192.png",sizes: "192x192",type: "image/png" },
    ],
    apple: [
      { url: "/icons/icon-152x152.png", sizes: "152x152" },
      { url: "/icons/icon-192x192.png", sizes: "192x192" },
    ],
    other: [
      { rel: "mask-icon", url: "/icons/icon-192x192.png", color: "#1a1a2e" },
    ],
  },
  openGraph: {
    title: "MillionStore",
    description: "Boutique en ligne — Laptops, Ordinateurs, Tablettes & Accessoires",
    type: "website",
    locale: "fr_HT",
    images: [{ url: "/icons/icon-512x512.png", width: 512, height: 512 }],
  },
};

export const viewport: Viewport = {
  themeColor: "#1a1a2e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <head>
        {/* iOS PWA extras */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />

        {/* Splash screen iOS */}
        <link
          rel="apple-touch-startup-image"
          href="/icons/icon-512x512.png"
          media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)"
        />
      </head>
      <body>
        {children}
        {/* Bannière d'installation PWA + indicateur offline */}
        <InstallBanner />
      </body>
    </html>
  );
}