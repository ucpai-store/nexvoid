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
  metadataBase: new URL("https://nexvo.id"),
  title: "NEXVO",
  description: "NEXVO",
  keywords: ["NEXVO"],
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
    "google-site-verification": "6RorboIBMBLmY3U5i0CDru6nBtlCQcJ3v0oNnUz696o",
  },
  openGraph: {
    title: "NEXVO",
    description: "NEXVO",
    url: "https://nexvo.id",
    siteName: "NEXVO",
    type: "website",
    locale: "id_ID",
    images: [
      {
        url: "https://nexvo.id/api/files/nexvo-logo.png",
        width: 1200,
        height: 630,
        alt: "NEXVO",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NEXVO",
    description: "NEXVO",
    images: ["https://nexvo.id/api/files/nexvo-logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    // ★ Hide description snippet from Google search results — only show "NEXVO" title
    nosnippet: true,
    googleBot: {
      index: true,
      follow: true,
      nosnippet: true,
      "max-image-preview": "large",
    },
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
        <meta name="google-site-verification" content="6RorboIBMBLmY3U5i0CDru6nBtlCQcJ3v0oNnUz696o" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" href="/favicon.ico" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="NEXVO" />
        <meta name="mobile-web-app-capable" content="yes" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // ───────────────────────────────────────────────────────────────
              // NEXVO chunk-load error auto-recovery (runs BEFORE the app boots)
              // ───────────────────────────────────────────────────────────────
              // When a new deploy changes Next.js chunk hashes, stale clients
              // try to fetch old chunk URLs that no longer exist -> 404 ->
              // "Loading chunk XXXX failed". This catcher auto-reloads with a
              // cache-buster so the browser fetches fresh HTML referencing the
              // CURRENT chunks. Attempt-limited via sessionStorage to prevent
              // infinite reload loops.
              (function () {
                var RELOAD_KEY = '__nexvo_chunk_reload_count';
                var MAX_AUTO_RELOADS = 3;
                function getReloadCount() {
                  try {
                    var n = parseInt(sessionStorage.getItem(RELOAD_KEY) || '0', 10);
                    return Number.isFinite(n) ? n : 0;
                  } catch (e) { return 0; }
                }
                function bumpReloadCount() {
                  var n = getReloadCount() + 1;
                  try { sessionStorage.setItem(RELOAD_KEY, String(n)); } catch (e) {}
                  return n;
                }
                function resetReloadCount() {
                  try { sessionStorage.removeItem(RELOAD_KEY); } catch (e) {}
                }
                function forceHardReload() {
                  var url = new URL(window.location.href);
                  url.searchParams.set('_cb', String(Date.now()));
                  window.location.replace(url.toString());
                }
                function isChunkLoadMessage(msg) {
                  if (!msg) return false;
                  var s = String(msg).toLowerCase();
                  return (
                    s.indexOf('loading chunk') !== -1 ||
                    s.indexOf('loading css chunk') !== -1 ||
                    s.indexOf('chunkloaderror') !== -1 ||
                    s.indexOf('failed to fetch dynamically imported module') !== -1 ||
                    s.indexOf('importing a module script failed') !== -1 ||
                    s.indexOf('/_next/static/chunks/') !== -1 ||
                    s.indexOf('.chunk.js') !== -1
                  );
                }
                function maybeAutoReload(detail) {
                  if (!isChunkLoadMessage(detail)) return false;
                  if (getReloadCount() >= MAX_AUTO_RELOADS) return false;
                  console.warn('[NEXVO] Chunk load error detected — auto-reloading with cache-buster.', detail);
                  bumpReloadCount();
                  // Small delay so logs flush and so back-to-back failures don't hammer.
                  setTimeout(forceHardReload, 800);
                  return true;
                }
                // Catch synchronous script errors (e.g. failed dynamic imports)
                window.addEventListener('error', function (e) {
                  // e.error may be a ChunkLoadError; e.message is a string
                  var detail = (e && e.error && (e.error.message || e.error.name)) || (e && e.message) || '';
                  if (isChunkLoadMessage(detail) || (e && e.filename && String(e.filename).indexOf('/_next/static/') !== -1)) {
                    if (maybeAutoReload(detail)) { e.preventDefault(); }
                  }
                }, true);
                // Catch promise rejections (Webpack dynamic import() returns a rejected promise)
                window.addEventListener('unhandledrejection', function (e) {
                  var reason = e && e.reason;
                  var detail = (reason && (reason.message || reason.name)) || (typeof reason === 'string' ? reason : '') || '';
                  if (isChunkLoadMessage(detail)) {
                    if (maybeAutoReload(detail)) { e.preventDefault(); }
                  }
                });
                // Reset the counter once the page has loaded successfully AND
                // stayed alive for a few seconds — proves the chunks resolved.
                window.addEventListener('load', function () {
                  setTimeout(resetReloadCount, 4000);
                });
              })();

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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              "name": "NEXVO",
              "url": "https://nexvo.id",
              "logo": "https://nexvo.id/api/files/nexvo-logo.png",
              "description": "The world's #1 digital investment platform. Stocks, gold, commodities, crypto. Trusted by 50K+ investors across 12+ countries. Build Value, Grow Future!"
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              "name": "NEXVO",
              "url": "https://nexvo.id",
              "description": "The world's leading investment platform. Daily profits up to 10%. Stocks, gold, commodities, crypto.",
              "potentialAction": {
                "@type": "SearchAction",
                "target": "https://nexvo.id/?q={search_term_string}",
                "query-input": "required name=search_term_string"
              }
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              "mainEntity": [
                {"@type": "Question", "name": "What is NEXVO?", "acceptedAnswer": {"@type": "Answer", "text": "NEXVO is the world's leading digital investment platform offering stocks, gold, commodities, and crypto in one place. Trusted by 50,000+ investors across 12+ countries."}},
                {"@type": "Question", "name": "How do I get started with NEXVO?", "acceptedAnswer": {"@type": "Answer", "text": "Visit nexvo.id, click Start Investing, enter your email and phone number, verify with OTP, and your account is instantly active."}},
                {"@type": "Question", "name": "Is NEXVO safe?", "acceptedAnswer": {"@type": "Answer", "text": "Absolutely. NEXVO uses SSL 256-bit encryption, two-factor authentication (2FA), and 24/7 fraud monitoring with bank-grade security standards."}},
                {"@type": "Question", "name": "How does the daily profit system work?", "acceptedAnswer": {"@type": "Answer", "text": "Every active investment package generates automatic daily profits. The rate depends on the package type and amount. Monitor your profits in real-time from your dashboard."}}
              ]
            }),
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
