'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useSiteStore } from '@/stores/site-store';
import { useAppStore } from '@/stores/app-store';
import ErrorBoundary from '@/components/nexvo/ErrorBoundary';

const PWAInstallPrompt = dynamic(
  () => import('@/components/nexvo/shared/PWAInstallPrompt'),
  { ssr: false }
);

const PromoPopup = dynamic(
  () => import('@/components/nexvo/shared/PromoPopup'),
  { ssr: false }
);

/* ───────── Single dynamic import for entire app shell ───────── */
function AppShellFallback() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <p className="text-white mb-4">Failed to load application</p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-[#D4AF37] text-black rounded-lg">Retry</button>
      </div>
    </div>
  );
}

const AppShell = dynamic(
  () => import('@/components/nexvo/AppShell').catch(() => ({
    default: AppShellFallback,
  })),
  {
    ssr: false,
    loading: () => <AppLoader />,
  },
);

function AppLoader() {
  const { logoUrl } = useSiteStore();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center animate-fade-in">
        <img src={logoUrl} alt="NEXVO" className="h-20 w-auto object-contain mb-3 mx-auto invert dark:invert-0" onError={(e) => { (e.target as HTMLImageElement).src = '/api/files/nexvo-logo.png'; }} />
        <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto" />
      </div>
    </div>
  );
}

export default function App() {
  const { loadFromStorage, hydrateAdmin, hydrateUser } = useAuthStore();
  const { fetchSettings } = useSiteStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    loadFromStorage();
    fetchSettings();

    // Initialize hash-based URL listener for back/forward navigation
    const cleanup = useAppStore.getState().initHashListener();

    const init = async () => {
      await Promise.all([hydrateAdmin(), hydrateUser()]);
      setMounted(true);

      const { token, adminToken } = useAuthStore.getState();
      const params = new URLSearchParams(window.location.search);
      const refCode = params.get('ref');

      // Check if user has a specific page in the URL hash already
      const hashPage = window.location.hash.replace('#', '');
      const hasValidHashPage = hashPage && hashPage !== 'login' && hashPage !== 'register' && hashPage !== 'otp';

      if (refCode && !token && !adminToken) {
        useAppStore.getState().navigate('register', { referralCode: refCode.toUpperCase() });
        window.history.replaceState({}, '', window.location.pathname);
      } else if (adminToken) {
        // If admin already has a hash page, respect it; otherwise go to dashboard
        if (hasValidHashPage && hashPage.startsWith('admin')) {
          useAppStore.getState().navigate(hashPage as any);
        } else {
          useAppStore.getState().navigate('admin-dashboard');
        }
      } else if (token) {
        // If user already has a hash page, respect it; otherwise go to home
        if (hasValidHashPage && !hashPage.startsWith('admin')) {
          useAppStore.getState().navigate(hashPage as any);
        } else {
          useAppStore.getState().navigate('home');
        }
      } else {
        // Not authenticated - go to login page directly
        useAppStore.getState().navigate('login');
      }
    };
    init();

    return cleanup;
  }, []);

  // Always show AppShell (with login page if not authenticated)
  return (
    <ErrorBoundary>
      {/* Hidden SEO content for Google crawlers */}
      <div className="sr-only">
        <h1>NEXVO - World&apos;s Best Investment Platform | Smart Digital Investing for Singapore &amp; Global Investors</h1>
        <p>NEXVO is the world&apos;s leading smart investment platform trusted by investors across Singapore, Southeast Asia, and globally. Earn daily profits up to 10% with AI-powered multi-asset investment strategies covering stocks, gold, commodities, and cryptocurrency. Start investing from just $50 with guaranteed returns and institutional-grade security.</p>
        <h2>Why NEXVO is the Best Investment Platform in Singapore &amp; Worldwide</h2>
        <p>NEXVO combines cutting-edge AI technology with proven investment strategies to deliver consistent daily profits. Our platform offers multi-asset investment portfolios including blue-chip stocks, gold trading, commodity futures, and cryptocurrency - all managed by advanced algorithms that maximize returns while minimizing risk. Join over 50,000+ investors from Singapore, Malaysia, Indonesia, and across the globe who trust NEXVO for their financial growth.</p>
        <h2>Investment Products Available on NEXVO Platform</h2>
        <p>NEXVO offers four premium investment categories: Stock Investment with daily profits, Gold Investment with stable returns, Commodity Trading with competitive yields, and Crypto Investment with high potential returns. Each product is backed by AI-driven market analysis and professional risk management. Minimum investment starts from just $50, making it accessible for all investor levels.</p>
        <h2>How to Start Investing with NEXVO</h2>
        <p>Getting started with NEXVO is simple: 1) Create your free account, 2) Fund your wallet via bank transfer or cryptocurrency, 3) Choose your preferred investment product, 4) Earn daily profits automatically deposited to your balance. No trading experience required - our AI handles everything for you.</p>
        <h2>NEXVO Referral Program - Earn While You Invite</h2>
        <p>NEXVO&apos;s referral program offers multi-tier commission structure. Additionally, qualify for our exclusive Salary Program where active referrers can earn weekly salary payments.</p>
        <h2>NEXVO Security &amp; Trust - Your Investment is Safe</h2>
        <p>NEXVO employs bank-grade 256-bit SSL encryption, two-factor authentication (2FA), and cold storage for digital assets. All user funds are segregated and protected. NEXVO maintains 99.99% uptime with servers distributed across Singapore, Tokyo, and London for maximum reliability.</p>
        <h2>Countries Where NEXVO is Available</h2>
        <p>NEXVO is available to investors in Singapore, Malaysia, Indonesia, Thailand, Philippines, Vietnam, Brunei, India, China, Japan, South Korea, Australia, New Zealand, United Arab Emirates, United Kingdom, and over 100+ countries worldwide.</p>
      </div>
      <AppShell />
      <PWAInstallPrompt />
      <PromoPopup />
    </ErrorBoundary>
  );
}
