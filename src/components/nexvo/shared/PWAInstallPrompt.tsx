'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Share, Plus } from 'lucide-react';

// Type for beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Store deferred prompt globally so any component can trigger install
declare global {
  interface Window {
    __nexvoDeferredPrompt: BeforeInstallPromptEvent | null;
    __nexvoCanInstall: boolean;
  }
}

type Platform = 'android' | 'ios' | 'desktop' | 'unknown';

function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  // iPad on iOS 13+ reports as Mac, but has touch + no Mac in user-agent sometimes
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Windows|Macintosh|Linux/.test(ua) && !isIOS) return 'desktop';
  return 'unknown';
}

export default function PWAInstallPrompt() {
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [showFab, setShowFab] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [canNativeInstall, setCanNativeInstall] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const platformRef = useRef<Platform>('unknown');

  useEffect(() => {
    platformRef.current = detectPlatform();

    // Check if already installed (standalone mode)
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);
    if (standalone) return;

    // Check if we already captured the prompt before this component mounted
    if (window.__nexvoDeferredPrompt) {
      deferredPromptRef.current = window.__nexvoDeferredPrompt;
      setCanNativeInstall(true);
    }

    // Listen for beforeinstallprompt - CRITICAL for Android/Desktop Chrome
    const promptHandler = (e: Event) => {
      e.preventDefault();
      const prompt = e as BeforeInstallPromptEvent;
      deferredPromptRef.current = prompt;
      window.__nexvoDeferredPrompt = prompt;
      window.__nexvoCanInstall = true;
      setCanNativeInstall(true);
      console.log('[PWA] beforeinstallprompt captured - native install available');
    };
    window.addEventListener('beforeinstallprompt', promptHandler);

    // Listen for appinstalled to hide the FAB
    const installedHandler = () => {
      console.log('[PWA] App installed successfully!');
      deferredPromptRef.current = null;
      window.__nexvoDeferredPrompt = null;
      window.__nexvoCanInstall = false;
      setCanNativeInstall(false);
      setShowFab(false);
      setShowIOSGuide(false);
      setInstalling(false);
    };
    window.addEventListener('appinstalled', installedHandler);

    // Show FAB after 1.5 seconds
    const dismissed = localStorage.getItem('nexvo_install_dismissed');
    const dismissedTime = localStorage.getItem('nexvo_install_dismissed_time');
    let shouldShow = true;
    if (dismissed && dismissedTime) {
      const elapsed = Date.now() - parseInt(dismissedTime);
      if (elapsed < 2 * 60 * 60 * 1000) { // 2 hours cooldown
        shouldShow = false;
      }
    }
    if (shouldShow) {
      setTimeout(() => setShowFab(true), 1500);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', promptHandler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  // Main install handler - ONE CLICK
  const handleInstallClick = useCallback(async () => {
    const prompt = deferredPromptRef.current || window.__nexvoDeferredPrompt;

    if (prompt) {
      // NATIVE INSTALL: Android Chrome, Desktop Chrome/Edge
      // One click → browser shows install dialog → done!
      setInstalling(true);
      try {
        await prompt.prompt();
        const { outcome } = await prompt.userChoice;
        console.log('[PWA] Install outcome:', outcome);
        if (outcome === 'accepted') {
          setShowFab(false);
        }
        deferredPromptRef.current = null;
        window.__nexvoDeferredPrompt = null;
        setCanNativeInstall(false);
      } catch (err) {
        console.error('[PWA] Native install error:', err);
      }
      setInstalling(false);
    } else if (platformRef.current === 'ios') {
      // iOS Safari: Show the minimal share guide overlay
      setShowIOSGuide(true);
    } else {
      // Fallback for other browsers: try to navigate to download page
      // This handles Android Firefox, etc.
      const { useAppStore } = await import('@/stores/app-store');
      useAppStore.getState().navigate('download');
    }
  }, []);

  const handleDismiss = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowFab(false);
    localStorage.setItem('nexvo_install_dismissed', 'true');
    localStorage.setItem('nexvo_install_dismissed_time', Date.now().toString());
  }, []);

  const handleIOSGuideClose = useCallback(() => {
    setShowIOSGuide(false);
  }, []);

  // Don't show anything if already installed
  if (isStandalone) return null;

  return (
    <>
      {/* ─── Floating Install Button ─── */}
      <AnimatePresence>
        {showFab && !showIOSGuide && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 20 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="fixed bottom-6 right-4 z-[80] flex flex-col items-end gap-2"
          >
            {/* Small dismiss X */}
            <button
              onClick={handleDismiss}
              className="w-5 h-5 rounded-full bg-black/60 border border-white/10 flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-black/80 transition-all -mb-1"
            >
              <X className="w-3 h-3" />
            </button>

            {/* Install Button - ONE CLICK */}
            <motion.button
              onClick={handleInstallClick}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="group relative flex items-center gap-2 pl-4 pr-5 py-3 bg-gradient-to-r from-[#D4AF37] to-[#F0D060] text-[#070B14] rounded-full shadow-[0_4px_20px_rgba(212,175,55,0.4)] hover:shadow-[0_4px_30px_rgba(212,175,55,0.6)] transition-all"
            >
              {installing ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-5 h-5 border-2 border-[#070B14]/30 border-t-[#070B14] rounded-full"
                  />
                  <span className="text-sm font-bold whitespace-nowrap">Installing...</span>
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  <span className="text-sm font-bold whitespace-nowrap">Install</span>
                </>
              )}

              {/* Pulse indicator */}
              {!installing && (
                <span className="absolute -top-1 -right-1 w-3 h-3">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                </span>
              )}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── iOS Share Guide Overlay ─── */}
      {/* This is ONLY shown on iOS Safari where Apple doesn't allow programmatic install */}
      {/* It's the absolute minimal guidance - just point to the share button */}
      <AnimatePresence>
        {showIOSGuide && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm"
              onClick={handleIOSGuideClose}
            />

            {/* Guide overlay */}
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 z-[91] p-4 pb-8 pointer-events-none"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="pointer-events-auto max-w-sm mx-auto" onClick={(e) => e.stopPropagation()}>
                <div className="relative bg-gradient-to-b from-[#1a1f2e] to-[#0F172A] border border-[#D4AF37]/30 rounded-2xl p-6 shadow-[0_0_40px_rgba(212,175,55,0.15)]">
                  {/* Close button */}
                  <button
                    onClick={handleIOSGuideClose}
                    className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>

                  {/* Arrow pointing UP to Safari's bottom share button */}
                  <div className="flex flex-col items-center text-center mb-4">
                    <motion.div
                      animate={{ y: [0, -8, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                      className="mb-3"
                    >
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="text-white/60">
                        <path d="M12 19V5M12 5L5 12M12 5L19 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </motion.div>

                    {/* Safari share icon */}
                    <div className="w-16 h-16 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/20 flex items-center justify-center mb-3">
                      <Share className="w-8 h-8 text-[#D4AF37]" />
                    </div>

                    <h3 className="text-white font-bold text-lg mb-1">Install NEXVO</h3>
                    <p className="text-white/50 text-sm">Tap <Share className="w-4 h-4 inline text-[#D4AF37]" /> lalu <strong className="text-white/80">"Add to Home Screen"</strong></p>
                  </div>

                  {/* Visual step indicators - minimal */}
                  <div className="flex items-center justify-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
                      <Share className="w-4 h-4 text-[#D4AF37]" />
                      <span className="text-white/70 text-xs font-medium">Share</span>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-white/30 shrink-0">
                      <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
                      <Plus className="w-4 h-4 text-emerald-400" />
                      <span className="text-white/70 text-xs font-medium">Add to Home Screen</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
