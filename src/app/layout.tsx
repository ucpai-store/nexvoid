import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#070B14",
};

export const metadata: Metadata = {
  title: "NEXVO - Modern Digital Asset Management Platform",
  description: "Build Value, Grow Future. A trusted global digital asset management platform based on commodities.",
  keywords: ["NEXVO", "digital assets", "commodities", "gold", "investment", "asset management"],
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
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
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
        {children}
        <Toaster />
      </body>
    </html>
  );
}
