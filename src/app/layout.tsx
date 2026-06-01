import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import CSChatBubbleWrapper from "@/components/nexvo/shared/CSChatBubbleWrapper";
import PushNotificationManager from "@/components/nexvo/shared/PushNotificationManager";
import { ThemeProvider } from "@/components/nexvo/shared/ThemeProvider";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8FAFC" },
    { media: "(prefers-color-scheme: dark)", color: "#070B14" },
  ],
};

export const metadata: Metadata = {
  title: "NEXVO - Platform Manajemen Aset Digital & Investasi Komoditas Terpercaya",
  description: "NEXVO adalah platform manajemen aset digital berbasis komoditas terpercaya. Raih profit harian hingga 10% dari paket investasi emas & komoditas. Deposito mudah via QRIS & USDT, penarikan cepat, keamanan SSL 256-bit. Build Value, Grow Future!",
  keywords: [
    "NEXVO", "investasi digital", "aset digital", "komoditas", "emas", "gold investment",
    "profit harian", "daily profit", "manajemen aset", "asset management",
    "investasi online", "QRIS", "USDT", "crypto", "referral bonus",
    "platform investasi terpercaya", "digital asset platform", "passive income",
    "investasi komoditas", "commodity investment", "passive income online",
    "cuan online", "investasi aman", "profit konsisten"
  ],
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "NEXVO",
  },
  applicationName: "NEXVO",
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "google-site-verification": "jPK5iBvVAIMNym93khRRmlMBL0pEKkl3DkY35Bv6eX8",
  },
  openGraph: {
    title: "NEXVO - Platform Manajemen Aset Digital Terpercaya",
    description: "Raih profit harian hingga 10% dari investasi komoditas. Deposito mudah via QRIS & USDT, keamanan SSL 256-bit, penarikan cepat. Build Value, Grow Future!",
    url: "https://nexvo.id",
    siteName: "NEXVO",
    type: "website",
    locale: "id_ID",
    images: [
      {
        url: "https://nexvo.id/og-image.png",
        width: 1200,
        height: 630,
        alt: "NEXVO - Build Value, Grow Future",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NEXVO - Platform Investasi Aset Digital & Komoditas",
    description: "Profit harian hingga 10% dari paket investasi komoditas terpercaya. Build Value, Grow Future!",
    images: ["https://nexvo.id/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <meta name="google-site-verification" content="jPK5iBvVAIMNym93khRRmlMBL0pEKkl3DkY35Bv6eX8" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" href="/favicon.ico" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="NEXVO" />
        <meta name="mobile-web-app-capable" content="yes" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Register service worker + capture beforeinstallprompt ASAP (in head for earliest capture)
              window.__nexvoDeferredPrompt = null;
              window.__nexvoCanInstall = false;
              window.addEventListener('beforeinstallprompt', function(e) {
                e.preventDefault();
                window.__nexvoDeferredPrompt = e;
                window.__nexvoCanInstall = true;
                console.log('NEXVO: Install prompt captured!');
              });
              window.addEventListener('appinstalled', function() {
                window.__nexvoDeferredPrompt = null;
                window.__nexvoCanInstall = false;
                console.log('NEXVO: App installed!');
              });
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('/sw.js', {scope:'/'}).then(function(reg) {
                  console.log('NEXVO SW registered:', reg.scope);
                  reg.update();
                }).catch(function(err) {
                  console.log('NEXVO SW registration failed:', err);
                });
              }
            `,
          }}
        />
      </head>
      <body className="antialiased bg-background text-foreground font-[Poppins,sans-serif]">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange={false}
        >
          {children}
          <CSChatBubbleWrapper />
          <PushNotificationManager />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
