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
    <div className="min-h-screen bg-[#070B14] flex items-center justify-center">
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
    <div className="min-h-screen bg-[#070B14] flex items-center justify-center">
      <div className="text-center animate-fade-in">
        <img src={logoUrl} alt="NEXVO" className="h-20 w-auto object-contain mb-3 mx-auto" onError={(e) => { (e.target as HTMLImageElement).src = '/api/files/nexvo-logo.png'; }} />
        <Loader2 className="w-6 h-6 text-[#D4AF37] animate-spin mx-auto" />
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
      }
    };
    init();

    return cleanup;
  }, []);

  if (!mounted) {
    return <AppLoader />;
  }

  return (
    <ErrorBoundary>
      <AppShell />
      <PWAInstallPrompt />
      <PromoPopup />
    </ErrorBoundary>
  );
}
