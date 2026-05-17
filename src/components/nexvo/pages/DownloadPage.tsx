'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Download, Smartphone, Shield, Zap, TrendingUp,
  CheckCircle2, Star, Share, Plus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSiteStore } from '@/stores/site-store';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Platform = 'android' | 'ios' | 'desktop' | 'unknown';

function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Windows|Macintosh|Linux/.test(ua) && !isIOS) return 'desktop';
  return 'unknown';
}

export default function DownloadPage() {
  const [isStandalone, setIsStandalone] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const platformRef = useRef<Platform>('unknown');

  useEffect(() => {
    platformRef.current = detectPlatform();

    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    // Check global deferred prompt
    if (window.__nexvoDeferredPrompt) {
      deferredPromptRef.current = window.__nexvoDeferredPrompt;
      setCanInstall(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      window.__nexvoDeferredPrompt = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    const installedHandler = () => {
      setCanInstall(false);
      setIsStandalone(true);
      setInstalling(false);
    };
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const handleInstall = async () => {
    const prompt = deferredPromptRef.current || window.__nexvoDeferredPrompt;

    if (prompt) {
      // Native install - one click!
      setInstalling(true);
      try {
        await prompt.prompt();
        const { outcome } = await prompt.userChoice;
        if (outcome === 'accepted') {
          setCanInstall(false);
        }
        deferredPromptRef.current = null;
        window.__nexvoDeferredPrompt = null;
      } catch (err) {
        console.error('Install error:', err);
      }
      setInstalling(false);
    } else if (platformRef.current === 'ios') {
      // iOS - show share guide
      setShowIOSGuide(true);
    }
    // For other platforms without native install, the button stays as visual cue
  };

  const features = [
    { icon: Shield, title: 'Aman', desc: 'Enkripsi data end-to-end' },
    { icon: Zap, title: 'Cepat', desc: 'Performa tinggi & responsif' },
    { icon: TrendingUp, title: 'Real-time', desc: 'Monitoring profit langsung' },
    { icon: Smartphone, title: 'Mobile First', desc: 'Dioptimalkan untuk mobile' },
  ];

  if (isStandalone) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6 space-y-4 sm:space-y-6">
        <div className="glass-gold glow-gold-strong rounded-2xl p-6 sm:p-10 text-center">
          <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
          <h2 className="text-foreground text-xl font-bold mb-2">Aplikasi Sudah Terinstall!</h2>
          <p className="text-muted-foreground text-sm">NEXVO sudah berjalan di perangkat Anda.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6 space-y-4 sm:space-y-6 pb-4 sm:pb-6">
      <div>
        <h1 className="text-foreground text-xl font-bold">Download Aplikasi</h1>
        <p className="text-muted-foreground text-sm">Install NEXVO di perangkat Anda</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-gold glow-gold-strong rounded-2xl p-4 sm:p-6 lg:p-10 text-center relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-[#D4AF37]/5 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full bg-[#1E3A5F]/10 blur-3xl" />

        <div className="relative z-10">
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="mx-auto mb-6"
          >
            <div className="relative inline-block">
              <div className="absolute inset-0 blur-[20px] bg-[#D4AF37]/10 rounded-full scale-110" />
              <img
                src={useSiteStore.getState().logoUrl}
                alt="NEXVO"
                className="relative h-20 sm:h-24 w-auto object-contain"
                onError={(e) => { (e.target as HTMLImageElement).src = '/api/files/nexvo-logo.png'; }}
              />
            </div>
          </motion.div>

          <p className="text-muted-foreground text-sm mb-4">Digital Asset Management</p>

          <div className="flex items-center justify-center gap-3 mb-6">
            <Badge className="bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 text-xs">
              v1.0.0
            </Badge>
          </div>

          <div className="max-w-xs mx-auto space-y-3">
            {/* ONE CLICK INSTALL BUTTON */}
            <Button
              onClick={handleInstall}
              disabled={installing}
              className="bg-gold-gradient text-[#070B14] font-bold rounded-xl hover:opacity-90 glow-gold-strong h-14 px-8 text-base w-full"
            >
              {installing ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-5 h-5 border-2 border-[#070B14]/30 border-t-[#070B14] rounded-full mr-2"
                />
              ) : (
                <Download className="w-5 h-5 mr-2" />
              )}
              {installing ? 'Installing...' : 'Install Sekarang'}
            </Button>

            <p className="text-muted-foreground/40 text-xs">
              Gratis • Tanpa iklan • Semua perangkat
            </p>
          </div>
        </div>
      </motion.div>

      {/* iOS Guide overlay - shown only on iOS when user clicks install */}
      {showIOSGuide && (
        <>
          <div
            className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm"
            onClick={() => setShowIOSGuide(false)}
          />
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed inset-x-0 bottom-0 z-[91] p-4 pb-8"
          >
            <div className="max-w-sm mx-auto">
              <div className="relative bg-gradient-to-b from-[#1a1f2e] to-[#0F172A] border border-[#D4AF37]/30 rounded-2xl p-6 shadow-[0_0_40px_rgba(212,175,55,0.15)]">
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
                  <div className="w-16 h-16 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/20 flex items-center justify-center mb-3">
                    <Share className="w-8 h-8 text-[#D4AF37]" />
                  </div>
                  <h3 className="text-white font-bold text-lg mb-1">Install NEXVO</h3>
                  <p className="text-white/50 text-sm">Tap <Share className="w-4 h-4 inline text-[#D4AF37]" /> lalu <strong className="text-white/80">"Add to Home Screen"</strong></p>
                </div>
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

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-2xl p-3 sm:p-5 lg:p-6"
      >
        <h3 className="text-foreground font-semibold text-sm mb-4 flex items-center gap-2">
          <Star className="w-4 h-4 text-[#D4AF37]" />
          Fitur Unggulan
        </h3>
        <div className="grid grid-cols-2 gap-4">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.05 }}
              className="glass rounded-xl p-4 text-center hover:glow-gold transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                <feature.icon className="w-5 h-5 text-[#D4AF37]" />
              </div>
              <p className="text-foreground text-sm font-medium">{feature.title}</p>
              <p className="text-muted-foreground text-xs mt-0.5">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass rounded-2xl p-3 sm:p-5 lg:p-6"
      >
        <h3 className="text-foreground font-semibold text-sm mb-4 flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-[#D4AF37]" />
          Kompatibilitas
        </h3>
        <div className="space-y-2">
          {[
            'Android Chrome - Install langsung',
            'iPhone Safari - Add to Home Screen',
            'Desktop Chrome/Edge - Install sebagai app',
            'Semua perangkat - Buka di browser',
          ].map((req) => (
            <div key={req} className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <p className="text-muted-foreground text-sm">{req}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
