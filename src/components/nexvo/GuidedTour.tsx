'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ChevronRight,
  ChevronLeft,
  HelpCircle,
  Play,
  Sparkles,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  ArrowLeft,
} from 'lucide-react';
import { useTourStore, TOUR_STEPS } from '@/stores/tour-store';
import { useAppStore } from '@/stores/app-store';

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

export default function GuidedTour() {
  const { isActive, currentStep, start, next, prev, skip } = useTourStore();
  const { currentPage, navigate } = useAppStore();
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [actualPlacement, setActualPlacement] = useState<'bottom' | 'top' | 'left' | 'right' | 'center'>('center');
  const [showWelcome, setShowWelcome] = useState(false);
  const [hasCompletedBefore, setHasCompletedBefore] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const step = TOUR_STEPS[currentStep];

  // ─── Show floating button if tour not active and user hasn't dismissed ───
  useEffect(() => {
    try {
      setHasCompletedBefore(localStorage.getItem('nexvo-tour-completed') === '1');
    } catch {}
  }, []);

  // ─── Welcome modal ───
  const handleStartTour = () => {
    setShowWelcome(false);
    start();
  };

  // Auto-show welcome on first visit (only on login page, once)
  useEffect(() => {
    if (currentPage === 'login' && !hasCompletedBefore) {
      const dismissed = sessionStorage.getItem('nexvo-tour-welcomed');
      if (!dismissed) {
        const timer = setTimeout(() => {
          setShowWelcome(true);
          sessionStorage.setItem('nexvo-tour-welcomed', '1');
        }, 1200);
        return () => clearTimeout(timer);
      }
    }
  }, [currentPage, hasCompletedBefore]);

  // ─── When tour is active, navigate to the step's page ───
  useEffect(() => {
    if (!isActive || !step) return;
    if (step.page && step.page !== currentPage) {
      navigate(step.page as never);
    }
  }, [isActive, currentStep, step, currentPage, navigate]);

  // ─── Find target element + position tooltip ───
  const findAndPosition = useCallback(() => {
    if (!isActive || !step) return;
    if (step.placement === 'center' || !step.selector) {
      setTargetRect(null);
      setActualPlacement('center');
      return;
    }
    const el = document.querySelector(`[data-tour="${step.selector}"]`) as HTMLElement | null;
    if (!el) {
      // Target not found — show centered
      setTargetRect(null);
      setActualPlacement('center');
      return;
    }
    const rect = el.getBoundingClientRect();
    setTargetRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height, bottom: rect.bottom, right: rect.right });

    // Decide placement based on available space
    const tooltipWidth = 360;
    const tooltipHeight = 240;
    const margin = 16;
    let placement = step.placement || 'bottom';

    // Auto-flip if not enough space
    if (placement === 'bottom' && rect.bottom + tooltipHeight + margin > window.innerHeight) {
      placement = rect.top - tooltipHeight - margin > 0 ? 'top' : 'right';
    }
    if (placement === 'top' && rect.top - tooltipHeight - margin < 0) {
      placement = rect.bottom + tooltipHeight + margin < window.innerHeight ? 'bottom' : 'right';
    }
    if (placement === 'right' && rect.right + tooltipWidth + margin > window.innerWidth) {
      placement = rect.left - tooltipWidth - margin > 0 ? 'left' : 'bottom';
    }
    if (placement === 'left' && rect.left - tooltipWidth - margin < 0) {
      placement = rect.right + tooltipWidth + margin < window.innerWidth ? 'right' : 'bottom';
    }
    setActualPlacement(placement);

    // Compute tooltip position
    let top = 0;
    let left = 0;
    if (placement === 'bottom') {
      top = rect.bottom + margin;
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
    } else if (placement === 'top') {
      top = rect.top - tooltipHeight - margin;
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
    } else if (placement === 'right') {
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.right + margin;
    } else if (placement === 'left') {
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.left - tooltipWidth - margin;
    }
    // Clamp to viewport
    left = Math.max(margin, Math.min(left, window.innerWidth - tooltipWidth - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - tooltipHeight - margin));
    setTooltipPos({ top, left });

    // Scroll target into view if needed
    if (rect.top < 80 || rect.bottom > window.innerHeight - 80) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isActive, step]);

  // Poll for target element after navigation (page might still be rendering)
  useEffect(() => {
    if (!isActive) return;
    findAndPosition();
    // Re-position after a delay (page render) + on resize
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = setTimeout(findAndPosition, 300);
    pollRef.current = setTimeout(findAndPosition, 800);
    const onResize = () => findAndPosition();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [isActive, currentStep, currentPage, findAndPosition]);

  const isCentered = actualPlacement === 'center';
  const progress = ((currentStep + 1) / TOUR_STEPS.length) * 100;

  return (
    <>
      {/* ─── Floating "Panduan" Button ─── */}
      <AnimatePresence>
        {!isActive && !showWelcome && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setShowWelcome(true)}
            className="fixed bottom-[96px] sm:bottom-6 right-4 sm:right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-2xl bg-gold-gradient text-primary-foreground font-bold shadow-lg glow-gold hover:scale-105 transition-transform"
            aria-label="Mulai Panduan"
          >
            <HelpCircle className="w-5 h-5" />
            <span className="text-sm hidden sm:inline">Panduan</span>
            {/* Pulse ring */}
            <span className="absolute inset-0 rounded-2xl bg-yellow-400/30 animate-ping -z-10" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ─── Welcome Modal ─── */}
      <AnimatePresence>
        {showWelcome && !isActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowWelcome(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-strong rounded-3xl p-6 sm:p-8 max-w-md w-full border border-primary/30 glow-gold-strong relative overflow-hidden"
            >
              <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-yellow-400/20 blur-3xl" />
              <div className="absolute -bottom-20 -left-20 w-40 h-40 rounded-full bg-emerald-400/10 blur-3xl" />

              <div className="relative z-10 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring' }}
                  className="w-20 h-20 rounded-full bg-gold-gradient flex items-center justify-center mx-auto mb-4 glow-gold"
                >
                  <Sparkles className="w-10 h-10 text-primary-foreground" />
                </motion.div>

                <h2 className="text-foreground text-2xl font-bold mb-2">Selamat Datang di NEXVO! 👋</h2>
                <p className="text-muted-foreground text-sm mb-5">
                  Baru di NEXVO? Ikuti panduan interaktif untuk tahu cara:
                </p>

                <div className="grid grid-cols-1 gap-2 mb-6 text-left">
                  {[
                    { n: '1', t: 'Registrasi Akun', c: 'bg-yellow-400/15 text-yellow-400' },
                    { n: '2', t: 'Deposit Saldo', c: 'bg-emerald-400/15 text-emerald-400' },
                    { n: '3', t: 'Beli Paket Investasi', c: 'bg-blue-400/15 text-blue-400' },
                    { n: '4', t: 'Withdraw Profit', c: 'bg-purple-400/15 text-purple-400' },
                  ].map((s) => (
                    <div key={s.n} className="flex items-center gap-3 glass rounded-xl p-3 border border-white/5">
                      <div className={`w-8 h-8 rounded-full ${s.c} flex items-center justify-center font-bold text-sm shrink-0`}>
                        {s.n}
                      </div>
                      <span className="text-foreground text-sm font-medium">{s.t}</span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleStartTour}
                    className="flex-1 h-12 bg-gold-gradient text-primary-foreground font-bold rounded-2xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2 glow-gold"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Mulai Panduan
                  </button>
                  <button
                    onClick={() => setShowWelcome(false)}
                    className="px-5 h-12 glass border border-border rounded-2xl text-muted-foreground hover:text-foreground text-sm font-medium"
                  >
                    Nanti Saja
                  </button>
                </div>
                <p className="text-muted-foreground/60 text-[10px] mt-3">
                  Klik tombol "Panduan" di pojok kanan bawah kapan saja untuk mulai ulang
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Tour Overlay (active) ─── */}
      <AnimatePresence>
        {isActive && step && (
          <>
            {/* Dark backdrop with cutout around target */}
            {targetRect && !isCentered && (
              <div
                className="fixed inset-0 z-[90] pointer-events-none"
                style={{
                  backgroundColor: 'rgba(0,0,0,0.75)',
                  // Create cutout using box-shadow trick (4 large shadows around the rect)
                  boxShadow: [
                    `0 0 0 9999px rgba(0,0,0,0.75)`,
                  ].join(', '),
                  // Use clip-path alternative — but simpler: 4 divs
                }}
              >
                {/* 4 dark panels around target */}
                <div className="absolute inset-0 bg-black/75" style={{ clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${targetRect.left}px ${targetRect.top}px, ${targetRect.left + targetRect.width}px ${targetRect.top}px, ${targetRect.left + targetRect.width}px ${targetRect.top + targetRect.height}px, ${targetRect.left}px ${targetRect.top + targetRect.height}px, ${targetRect.left}px ${targetRect.top}px)` }} />
              </div>
            )}
            {isCentered && <div className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm" />}

            {/* Highlight ring around target */}
            {targetRect && !isCentered && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="fixed z-[91] pointer-events-none rounded-xl"
                style={{
                  top: targetRect.top - 4,
                  left: targetRect.left - 4,
                  width: targetRect.width + 8,
                  height: targetRect.height + 8,
                  boxShadow: '0 0 0 4px rgba(234,179,8,0.9), 0 0 30px rgba(234,179,8,0.6)',
                  background: 'transparent',
                }}
              >
                {/* Pulsing corner accent */}
                <span className="absolute -top-1 -left-1 w-3 h-3 rounded-full bg-yellow-400 animate-ping" />
              </motion.div>
            )}

            {/* Arrow pointing to target */}
            {targetRect && !isCentered && (
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                className="fixed z-[92] pointer-events-none text-yellow-400"
                style={{
                  top:
                    actualPlacement === 'top'
                      ? targetRect.top - 24
                      : actualPlacement === 'bottom'
                      ? targetRect.bottom + 8
                      : targetRect.top + targetRect.height / 2 - 12,
                  left:
                    actualPlacement === 'left'
                      ? targetRect.left - 24
                      : actualPlacement === 'right'
                      ? targetRect.right + 8
                      : targetRect.left + targetRect.width / 2 - 12,
                }}
              >
                {actualPlacement === 'top' && <ArrowUp className="w-6 h-6 drop-shadow-[0_0_8px_rgba(234,179,8,0.8)]" />}
                {actualPlacement === 'bottom' && <ArrowDown className="w-6 h-6 drop-shadow-[0_0_8px_rgba(234,179,8,0.8)]" />}
                {actualPlacement === 'left' && <ArrowLeft className="w-6 h-6 drop-shadow-[0_0_8px_rgba(234,179,8,0.8)]" />}
                {actualPlacement === 'right' && <ArrowRight className="w-6 h-6 drop-shadow-[0_0_8px_rgba(234,179,8,0.8)]" />}
              </motion.div>
            )}

            {/* Tooltip */}
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="fixed z-[93] w-[88vw] max-w-[360px] glass-strong rounded-2xl border border-primary/30 glow-gold overflow-hidden"
              style={
                isCentered
                  ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
                  : { top: tooltipPos.top, left: tooltipPos.left }
              }
            >
              {/* Progress bar */}
              <div className="h-1 bg-yellow-400/20 relative">
                <motion.div
                  className="h-full bg-gold-gradient"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>

              <div className="p-5">
                {/* Header */}
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-9 h-9 rounded-full bg-gold-gradient flex items-center justify-center font-bold text-primary-foreground text-sm shrink-0 glow-gold">
                    {currentStep + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-foreground font-bold text-base leading-tight">{step.title}</h3>
                    <p className="text-yellow-400/80 text-[10px] mt-0.5">
                      Langkah {currentStep + 1} dari {TOUR_STEPS.length}
                    </p>
                  </div>
                  <button
                    onClick={skip}
                    className="text-muted-foreground hover:text-foreground p-1 -mt-1 -mr-1 shrink-0"
                    aria-label="Tutup panduan"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Description */}
                <p className="text-muted-foreground text-sm leading-relaxed mb-4">{step.description}</p>

                {/* Controls */}
                <div className="flex items-center gap-2">
                  {currentStep > 0 && (
                    <button
                      onClick={prev}
                      className="px-3 h-10 glass border border-border rounded-xl text-muted-foreground hover:text-foreground text-sm font-medium flex items-center gap-1"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Kembali
                    </button>
                  )}
                  <button
                    onClick={next}
                    className="flex-1 h-10 bg-gold-gradient text-primary-foreground font-bold rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-1 text-sm"
                  >
                    {currentStep === TOUR_STEPS.length - 1 ? 'Selesai' : 'Lanjut'}
                    {currentStep < TOUR_STEPS.length - 1 && <ChevronRight className="w-4 h-4" />}
                  </button>
                </div>

                {/* Skip link */}
                <button
                  onClick={skip}
                  className="w-full text-center text-muted-foreground/60 hover:text-muted-foreground text-[11px] mt-2"
                >
                  Lewati panduan
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
