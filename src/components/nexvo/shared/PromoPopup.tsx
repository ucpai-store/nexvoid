'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Gift, TrendingUp, Shield, ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';

interface PromoItem {
  icon: React.ReactNode;
  title: string;
  desc: string;
  color: string;
}

const PROMO_ITEMS: PromoItem[] = [
  {
    icon: <TrendingUp className="w-5 h-5" />,
    title: 'Profit Harian hingga 10%',
    desc: 'Nikmati keuntungan harian dari investasi aset digital Anda',
    color: 'text-emerald-400',
  },
  {
    icon: <Gift className="w-5 h-5" />,
    title: 'Bonus Matching 5 Level',
    desc: 'Dapatkan bonus referral hingga 5 level kedalaman',
    color: 'text-[#D4AF37]',
  },
  {
    icon: <Shield className="w-5 h-5" />,
    title: 'Aman & Terpercaya',
    desc: 'Platform manajemen aset digital berbasis komoditas',
    color: 'text-sky-400',
  },
];

const PROMO_LOGIN_DISMISS_KEY = 'nexvo_promo_login_dismissed';
const PROMO_LOGIN_DISMISS_TIMESTAMP = 'nexvo_promo_login_dismissed_time';
const PROMO_SHOW_AGAIN_HOURS = 6;

export default function PromoPopup() {
  const [show, setShow] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const token = useAuthStore((s) => s.token);
  const prevTokenRef = useRef<string | null>(null);
  const hasShownThisSession = useRef(false);

  useEffect(() => {
    // Only show for logged-in users
    if (!token) {
      prevTokenRef.current = null;
      return;
    }

    // Detect fresh login: token changed from null/falsy to a value
    const isFreshLogin = !prevTokenRef.current && token;
    prevTokenRef.current = token;

    // If already shown this session, don't show again
    if (hasShownThisSession.current) return;

    // Check if dismissed recently (same session dismiss)
    const dismissed = localStorage.getItem(PROMO_LOGIN_DISMISS_KEY);
    const dismissedTime = localStorage.getItem(PROMO_LOGIN_DISMISS_TIMESTAMP);

    if (dismissed && dismissedTime) {
      const elapsed = Date.now() - parseInt(dismissedTime);
      const hoursElapsed = elapsed / (1000 * 60 * 60);
      if (hoursElapsed < PROMO_SHOW_AGAIN_HOURS) {
        return; // Don't show again yet
      }
    }

    // Show promo after login with a short delay
    const delay = isFreshLogin ? 1500 : 4000; // Faster for fresh login, slower for returning users
    const timer = setTimeout(() => {
      setShow(true);
      hasShownThisSession.current = true;
      // Small delay for animation
      setTimeout(() => setIsVisible(true), 50);
    }, delay);

    return () => clearTimeout(timer);
  }, [token]);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(() => {
      setShow(false);
      localStorage.setItem(PROMO_LOGIN_DISMISS_KEY, 'true');
      localStorage.setItem(PROMO_LOGIN_DISMISS_TIMESTAMP, Date.now().toString());
    }, 300);
  };

  const handleCTA = async () => {
    handleDismiss();
    // Navigate to paket page for logged-in users
    const { useAppStore } = await import('@/stores/app-store');
    useAppStore.getState().navigate('paket');
  };

  return (
    <AnimatePresence>
      {show && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: isVisible ? 1 : 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm"
            onClick={handleDismiss}
          />

          {/* Popup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 30 }}
            animate={{
              opacity: isVisible ? 1 : 0,
              scale: isVisible ? 1 : 0.85,
              y: isVisible ? 0 : 30,
            }}
            exit={{ opacity: 0, scale: 0.85, y: 30 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
              <div className="relative bg-gradient-to-b from-[#0F172A] to-[#070B14] border border-[#D4AF37]/30 rounded-2xl overflow-hidden shadow-[0_0_60px_rgba(212,175,55,0.15)]">
                {/* Decorative top glow */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 bg-[#D4AF37]/10 blur-3xl rounded-full" />

                {/* Close button */}
                <button
                  onClick={handleDismiss}
                  className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>

                {/* Content */}
                <div className="relative p-5 pt-6">
                  {/* Header */}
                  <div className="text-center mb-5">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#D4AF37]/20 to-[#D4AF37]/5 border border-[#D4AF37]/20 mb-3">
                      <Gift className="w-7 h-7 text-[#D4AF37]" />
                    </div>
                    <h2 className="text-lg font-bold text-white mb-1">
                      Penawaran Spesial!
                    </h2>
                    <p className="text-sm text-white/50">
                      Mulai investasi digital Anda hari ini
                    </p>
                  </div>

                  {/* Feature list */}
                  <div className="space-y-3 mb-5">
                    {PROMO_ITEMS.map((item, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 + i * 0.1 }}
                        className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]"
                      >
                        <div className={`${item.color} mt-0.5 shrink-0`}>
                          {item.icon}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white/90">{item.title}</p>
                          <p className="text-xs text-white/40 mt-0.5 leading-relaxed">{item.desc}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {/* CTA Button */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleCTA}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-[#D4AF37] to-[#F0D060] text-[#070B14] font-bold text-sm rounded-xl shadow-[0_4px_20px_rgba(212,175,55,0.3)] hover:shadow-[0_4px_30px_rgba(212,175,55,0.5)] transition-all"
                  >
                    Mulai Sekarang
                    <ChevronRight className="w-4 h-4" />
                  </motion.button>

                  {/* Subtle text */}
                  <p className="text-center text-[10px] text-white/20 mt-3">
                    Deposit mulai dari Rp100.000
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

