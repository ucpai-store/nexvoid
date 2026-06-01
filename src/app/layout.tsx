import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://nexvo.id"),
  title: "NEXVO - World's Best Investment Platform | Smart Investing for Singapore & Global Investors",
  description:
    "NEXVO is the world's leading smart investment platform. Earn daily profits up to 3.5% with AI-powered multi-asset investment strategies. Trusted by 50,000+ investors in Singapore, Southeast Asia & worldwide. Start from just $50 - Stocks, Gold, Commodities, Crypto.",
  keywords: [
    // Primary investment keywords
    "best investment platform",
    "investment platform Singapore",
    "smart investment",
    "digital investment platform",
    "online investment",
    "investment app",
    // NEXVO branded
    "NEXVO",
    "NEXVO investment",
    "NEXVO platform",
    "nexvo.id",
    // Asset-specific
    "stock investment",
    "gold investment",
    "crypto investment",
    "commodity trading",
    "daily profit investment",
    // Geographic
    "investment Singapore",
    "investment Southeast Asia",
    "investment platform Asia",
    "Singapore investment app",
    "Malaysia investment",
    "Indonesia investment",
    // Feature-specific
    "AI investment",
    "passive income",
    "daily returns",
    "referral program investment",
    "high yield investment",
    "low risk investment",
    "investment for beginners",
    // General finance
    "wealth management",
    "portfolio management",
    "financial growth",
    "make money online",
    "invest online",
  ],
  authors: [{ name: "NEXVO Investment Platform" }],
  creator: "NEXVO",
  publisher: "NEXVO Investment Platform",
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
  openGraph: {
    type: "website",
    locale: "en_SG",
    url: "https://nexvo.id",
    siteName: "NEXVO - Smart Investment Platform",
    title: "NEXVO - World's Best Investment Platform | Earn Up to 3.5% Daily",
    description:
      "Join 50,000+ investors worldwide on NEXVO. Earn daily profits up to 3.5% with AI-powered multi-asset investments. Stocks, Gold, Commodities, Crypto. Start from $50.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "NEXVO - World's Best Investment Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NEXVO - World's Best Investment Platform | Earn Up to 3.5% Daily",
    description:
      "Join 50,000+ investors worldwide on NEXVO. AI-powered multi-asset investments. Stocks, Gold, Commodities, Crypto. Start from $50.",
    images: ["/og-image.png"],
  },
  alternates: {
    canonical: "https://nexvo.id",
  },
  verification: {
    google: "6RorboIBMBLmY3U5i0CDru6nBtlCQcJ3v0oNnUz696o",
  },
  category: "finance",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://nexvo.id/#organization",
        name: "NEXVO",
        url: "https://nexvo.id",
        logo: {
          "@type": "ImageObject",
          url: "https://nexvo.id/logo.png",
        },
        description:
          "NEXVO is the world's leading smart investment platform offering AI-powered multi-asset investment strategies with daily profits up to 3.5%.",
        foundingDate: "2024",
        sameAs: [],
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer service",
          availableLanguage: ["English", "Chinese", "Malay", "Indonesian"],
          areaServed: {
            "@type": "Place",
            name: "Singapore, Southeast Asia, Global",
          },
        },
      },
      {
        "@type": "WebSite",
        "@id": "https://nexvo.id/#website",
        url: "https://nexvo.id",
        name: "NEXVO - Smart Investment Platform",
        publisher: {
          "@id": "https://nexvo.id/#organization",
        },
        potentialAction: {
          "@type": "SearchAction",
          target: "https://nexvo.id/?q={search_term_string}",
          "query-input": "required name=search_term_string",
        },
        inLanguage: "en",
      },
      {
        "@type": "FinancialProduct",
        name: "NEXVO Smart Investment",
        description:
          "AI-powered multi-asset investment platform offering daily profits up to 3.5% across stocks, gold, commodities, and cryptocurrency portfolios.",
        provider: {
          "@id": "https://nexvo.id/#organization",
        },
        areaServed: [
          { "@type": "Country", name: "Singapore" },
          { "@type": "Country", name: "Malaysia" },
          { "@type": "Country", name: "Indonesia" },
          { "@type": "Country", name: "Thailand" },
          { "@type": "Country", name: "Philippines" },
          { "@type": "Country", name: "Vietnam" },
          { "@type": "Country", name: "Australia" },
        ],
        currency: "USD",
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "Is NEXVO a legitimate investment platform?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Yes, NEXVO is a fully registered and legitimate digital investment platform operating under strict regulatory compliance. We use institutional-grade security measures and maintain transparent operations with real-time reporting.",
            },
          },
          {
            "@type": "Question",
            name: "How much can I earn with NEXVO?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Earnings depend on your investment amount and chosen product. Daily profits range from 2.2% to 3.5% depending on the investment category. Combined with our referral program and salary system, top investors earn over $10,000 monthly.",
            },
          },
          {
            "@type": "Question",
            name: "What is the minimum investment on NEXVO?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "The minimum investment on NEXVO starts from just $50, making it accessible for beginners and experienced investors alike.",
            },
          },
          {
            "@type": "Question",
            name: "How do I withdraw my profits from NEXVO?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Withdrawals are processed within 24 hours. You can withdraw via bank transfer, cryptocurrency, or digital wallet. NEXVO supports multiple withdrawal methods for your convenience.",
            },
          },
          {
            "@type": "Question",
            name: "Is my investment safe with NEXVO?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Absolutely. NEXVO uses 256-bit SSL encryption, two-factor authentication, and cold storage for all digital assets. Your funds are segregated and protected with institutional-grade security protocols.",
            },
          },
          {
            "@type": "Question",
            name: "What investment products does NEXVO offer?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "NEXVO offers four premium investment categories: Stock Investment with daily profits up to 2.8%, Gold Investment with stable returns up to 2.2%, Commodity Trading with yields up to 3.0%, and Crypto Investment with potential returns up to 3.5%.",
            },
          },
          {
            "@type": "Question",
            name: "Does NEXVO have a referral program?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Yes, NEXVO offers an industry-leading 3-tier referral program: Level 1 earns 8% direct referral bonus, Level 2 earns 3% indirect bonus, and Level 3 earns 1% network bonus. Active referrers can also qualify for our exclusive Salary Program with weekly payments up to $5,000.",
            },
          },
          {
            "@type": "Question",
            name: "Is NEXVO available in Singapore?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Yes, NEXVO is fully available in Singapore and across Southeast Asia. We support SGD deposits and withdrawals, and our platform is optimized for Singapore-based investors with local payment methods and dedicated customer support.",
            },
          },
        ],
      },
    ],
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="google-site-verification" content="6RorboIBMBLmY3U5i0CDru6nBtlCQcJ3v0oNnUz696o" />
        <link rel="canonical" href="https://nexvo.id" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
