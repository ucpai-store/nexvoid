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
  Pause,
  Radio,
  Type,
  Shield,
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

/* ───────── Typewriter helper ─────────
   Fills a controlled React input by using the native value setter
   (bypasses React's internal control) then dispatches an 'input' event
   so React's onChange fires and state updates. */
async function typeIntoInput(
  selector: string,
  value: string,
  charDelay = 55
): Promise<void> {
  const input = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | null;
  if (!input) return;

  // Find the native value setter on the prototype (works for input + textarea)
  const proto = input instanceof HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) return;

  input.focus();
  for (let i = 0; i < value.length; i++) {
    setter.call(input, value.substring(0, i + 1));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    // Slight randomization for realistic feel
    await new Promise((r) => setTimeout(r, charDelay + Math.random() * 25));
  }
  // Trigger blur so any validation/formatting runs
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.blur();
}

export default function GuidedTour() {
  const {
    isActive,
    currentStep,
    isAutoPlay,
    isPaused,
    start,
    startAutoPlay,
    next,
    prev,
    skip,
    togglePause,
    stopAutoPlay,
  } = useTourStore();
  const { currentPage, navigate } = useAppStore();
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [actualPlacement, setActualPlacement] = useState<'bottom' | 'top' | 'left' | 'right' | 'center'>('center');
  const [showWelcome, setShowWelcome] = useState(false);
  const [hasCompletedBefore, setHasCompletedBefore] = useState(false);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [typingLabel, setTypingLabel] = useState<string | null>(null);
  const [autoCountdown, setAutoCountdown] = useState<number>(0);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typeCancelRef = useRef<boolean>(false);

  const step = TOUR_STEPS[currentStep];

  // ─── Track viewport size for responsive tooltip positioning ───
  useEffect(() => {
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const isMobile = viewport.w > 0 && viewport.w < 640;
  const isSmallMobile = viewport.w > 0 && viewport.w < 380;

  // ─── When tour is active on MOBILE, push page content UP so the bottom
  //     sheet never covers centered forms (login/register/OTP pages use
  //     min-h-screen flex items-center → no scroll room → sheet would overlap).
  //     We add bottom padding to <body> so flex-centered content shifts up. ───
  useEffect(() => {
    if (!isActive || !isMobile) return;
    const prev = document.body.style.paddingBottom;
    document.body.style.paddingBottom = 'calc(230px + env(safe-area-inset-bottom, 0px))';
    document.body.style.transition = 'padding-bottom 0.3s ease';
    return () => {
      document.body.style.paddingBottom = prev;
      document.body.style.transition = '';
    };
  }, [isActive, isMobile]);

  // ─── Show floating button if tour not active and user hasn't dismissed ───
  useEffect(() => {
    try {
      setHasCompletedBefore(localStorage.getItem('nexvo-tour-completed') === '1');
    } catch {}
  }, []);

  // ─── Welcome modal handlers ───
  const handleStartManual = () => {
    setShowWelcome(false);
    start();
  };
  const handleStartAutoPlay = () => {
    setShowWelcome(false);
    startAutoPlay();
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
      // Pass pageData if the step defines it (e.g. OTP page needs email)
      if (step.pageData && Object.keys(step.pageData).length > 0) {
        navigate(step.page as never, step.pageData);
      } else {
        navigate(step.page as never);
      }
    }
  }, [isActive, currentStep, step, currentPage, navigate]);

  // ─── Find target element + position tooltip (mobile-aware) ───
  // MOBILE strategy: tooltip = FIXED bottom sheet (never covers form/button).
  //   Target is scrolled into upper 55% of viewport so it's always visible above sheet.
  //   Arrow points from target down toward the bottom sheet.
  // DESKTOP strategy: tooltip floats near target with smart auto-flip,
  //   never overlapping the target rect.
  const findAndPosition = useCallback(() => {
    if (!isActive || !step) return;
    if (step.placement === 'center' || !step.selector) {
      setTargetRect(null);
      setActualPlacement('center');
      return;
    }
    const el = document.querySelector(`[data-tour="${step.selector}"]`) as HTMLElement | null;
    if (!el) {
      setTargetRect(null);
      setActualPlacement('center');
      return;
    }
    const rect = el.getBoundingClientRect();
    setTargetRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height, bottom: rect.bottom, right: rect.right });

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const mobile = vw < 640;

    // ─── MOBILE: bottom sheet — no floating tooltip positioning needed ───
    if (mobile) {
      setActualPlacement('bottom'); // arrow points down from target
      setTooltipPos({ top: 0, left: 0 }); // not used on mobile (fixed bottom sheet)

      // Body padding (230px) already pushes centered content up so the sheet
      // sits in empty space below. This scroll is a fallback for long pages.
      const sheetHeight = 230;
      const visibleArea = vh - sheetHeight - 80; // 80 = bottom nav
      if (rect.top < 70 || rect.bottom > visibleArea) {
        const targetCenter = rect.top + rect.height / 2 + window.scrollY;
        const desiredScroll = targetCenter - (70 + visibleArea) / 2;
        window.scrollTo({ top: Math.max(0, desiredScroll), behavior: 'smooth' });
      }
      return;
    }

    // ─── DESKTOP: floating tooltip with smart positioning ───
    const tooltipWidth = 360;
    const tooltipHeight = 260;
    const margin = 16;
    const buffer = 12; // extra gap so tooltip never touches target

    let placement = step.placement || 'bottom';

    // Auto-flip if not enough space (ensure tooltip NEVER overlaps target)
    if (placement === 'bottom' && rect.bottom + tooltipHeight + margin > vh - 20) {
      placement = rect.top - tooltipHeight - margin > 20 ? 'top' : 'right';
    }
    if (placement === 'top' && rect.top - tooltipHeight - margin < 20) {
      placement = rect.bottom + tooltipHeight + margin < vh - 20 ? 'bottom' : 'right';
    }
    if (placement === 'right' && rect.right + tooltipWidth + margin > vw - 20) {
      placement = rect.left - tooltipWidth - margin > 20 ? 'left' : 'bottom';
    }
    if (placement === 'left' && rect.left - tooltipWidth - margin < 20) {
      placement = rect.right + tooltipWidth + margin < vw - 20 ? 'right' : 'bottom';
    }
    setActualPlacement(placement);

    let top = 0;
    let left = 0;
    if (placement === 'bottom') {
      top = rect.bottom + margin + buffer;
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
    } else if (placement === 'top') {
      top = rect.top - tooltipHeight - margin - buffer;
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
    } else if (placement === 'right') {
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.right + margin + buffer;
    } else if (placement === 'left') {
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.left - tooltipWidth - margin - buffer;
    }
    // Clamp to viewport (leave room for margins)
    left = Math.max(margin, Math.min(left, vw - tooltipWidth - margin));
    top = Math.max(margin + 20, Math.min(top, vh - tooltipHeight - margin - 20));
    setTooltipPos({ top, left });

    // Scroll target into view if needed (desktop)
    if (rect.top < 90 || rect.bottom > vh - 100) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isActive, step]);

  // Poll for target element after navigation
  useEffect(() => {
    if (!isActive) return;
    findAndPosition();
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

  // ─── AUTO-PLAY ENGINE ───
  // When auto-play is on AND not paused: type demo fields then auto-advance
  useEffect(() => {
    if (!isActive || !isAutoPlay || isPaused || !step) return;
    typeCancelRef.current = false;

    let cancelled = false;
    const runStep = async () => {
      // Wait for page to settle
      await new Promise((r) => setTimeout(r, 700));
      if (cancelled || typeCancelRef.current) return;

      // Type demo fields one by one (with visible label)
      if (step.demoFields && step.demoFields.length > 0) {
        for (const field of step.demoFields) {
          if (cancelled || typeCancelRef.current) return;
          setTypingLabel(field.label || 'Mengisi...');
          await typeIntoInput(field.selector, field.value);
          await new Promise((r) => setTimeout(r, 350));
        }
        setTypingLabel(null);
        if (cancelled || typeCancelRef.current) return;
      }

      // Countdown then advance
      const delay = step.autoAdvanceDelay ?? 3500;
      const tickMs = 500;
      let remaining = delay;
      setAutoCountdown(Math.ceil(remaining / 1000));
      const countdownTimer = setInterval(() => {
        if (cancelled || typeCancelRef.current) {
          clearInterval(countdownTimer);
          return;
        }
        remaining -= tickMs;
        setAutoCountdown(Math.max(0, Math.ceil(remaining / 1000)));
        if (remaining <= 0) {
          clearInterval(countdownTimer);
          if (!cancelled && !typeCancelRef.current) {
            next();
          }
        }
      }, tickMs);
      // Store for cleanup
      autoAdvanceRef.current = countdownTimer as unknown as ReturnType<typeof setTimeout>;
    };

    runStep();

    return () => {
      cancelled = true;
      if (autoAdvanceRef.current) {
        clearTimeout(autoAdvanceRef.current);
        clearInterval(autoAdvanceRef.current as unknown as ReturnType<typeof setInterval>);
      }
      setTypingLabel(null);
      setAutoCountdown(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, isAutoPlay, isPaused, currentStep]);

  // Cancel auto-play typing if user manually navigates
  const handleManualNext = () => {
    typeCancelRef.current = true;
    if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    next();
  };
  const handleManualPrev = () => {
    typeCancelRef.current = true;
    if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    prev();
  };

  const isCentered = actualPlacement === 'center';
  const progress = ((currentStep + 1) / TOUR_STEPS.length) * 100;

  const tooltipWidthClass = isSmallMobile
    ? 'w-[calc(100vw-24px)] max-w-[340px]'
    : 'w-[88vw] max-w-[360px]';

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
            className="fixed right-3 sm:right-6 z-40 flex items-center gap-2 px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-gold-gradient text-primary-foreground font-bold shadow-lg glow-gold hover:scale-105 active:scale-95 transition-transform"
            style={{
              bottom: isMobile ? 'calc(88px + env(safe-area-inset-bottom, 0px))' : '24px',
            }}
            aria-label="Mulai Panduan"
          >
            <HelpCircle className="w-5 h-5 shrink-0" />
            <span className="text-xs sm:text-sm">Panduan</span>
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
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-[2px]"
            onClick={() => setShowWelcome(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 40 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 40 }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              onClick={(e) => e.stopPropagation()}
              className="rounded-t-3xl sm:rounded-3xl p-5 sm:p-8 w-full sm:max-w-md border-2 border-yellow-400/70 relative overflow-hidden max-h-[92vh] overflow-y-auto"
              style={{
                background: 'rgba(8, 12, 24, 0.98)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                boxShadow: '0 0 0 1px rgba(234,179,8,0.3), 0 12px 48px rgba(0,0,0,0.7), 0 0 60px rgba(234,179,8,0.2)',
              }}
            >
              <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-yellow-400/20 blur-3xl pointer-events-none" />
              <div className="absolute -bottom-20 -left-20 w-40 h-40 rounded-full bg-emerald-400/10 blur-3xl pointer-events-none" />

              <div className="relative z-10 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring' }}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gold-gradient flex items-center justify-center mx-auto mb-3 sm:mb-4 glow-gold"
                >
                  <Sparkles className="w-8 h-8 sm:w-10 sm:h-10 text-primary-foreground" />
                </motion.div>

                <h2 className="text-foreground text-xl sm:text-2xl font-bold mb-1.5 sm:mb-2 leading-tight">
                  Selamat Datang di NEXVO! 👋
                </h2>
                <p className="text-muted-foreground text-xs sm:text-sm mb-4 sm:mb-5 px-2">
                  Baru di NEXVO? Ikuti panduan interaktif untuk tahu cara:
                </p>

                <div className="grid grid-cols-1 gap-2 mb-5 sm:mb-6 text-left">
                  {[
                    { n: '1', t: 'Registrasi Akun', c: 'bg-yellow-400/15 text-yellow-400' },
                    { n: '2', t: 'Deposit Saldo', c: 'bg-emerald-400/15 text-emerald-400' },
                    { n: '3', t: 'Beli Paket Investasi', c: 'bg-cyan-400/15 text-cyan-400' },
                    { n: '4', t: 'Withdraw Profit', c: 'bg-purple-400/15 text-purple-400' },
                  ].map((s) => (
                    <div key={s.n} className="flex items-center gap-3 glass rounded-xl p-2.5 sm:p-3 border border-white/5">
                      <div className={`w-8 h-8 rounded-full ${s.c} flex items-center justify-center font-bold text-sm shrink-0`}>
                        {s.n}
                      </div>
                      <span className="text-foreground text-sm font-medium flex-1">{s.t}</span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </div>
                  ))}
                </div>

                {/* Two start buttons — Auto-play (recommended for video) and Manual */}
                <div className="flex flex-col gap-2 mb-3">
                  <button
                    onClick={handleStartAutoPlay}
                    className="w-full h-12 bg-gold-gradient text-primary-foreground font-bold rounded-2xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2 glow-gold text-sm"
                  >
                    <Radio className="w-4 h-4 fill-current animate-pulse" />
                    Mode Demo Otomatis (untuk rekam video)
                  </button>
                  <button
                    onClick={handleStartManual}
                    className="w-full h-12 glass border border-primary/40 text-primary hover:bg-primary/10 rounded-2xl text-sm font-medium flex items-center justify-center gap-2"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Mode Manual (klik sendiri)
                  </button>
                </div>

                <button
                  onClick={() => setShowWelcome(false)}
                  className="text-muted-foreground/70 hover:text-muted-foreground text-xs underline"
                >
                  Nanti saja
                </button>
                <p className="text-muted-foreground/60 text-[10px] mt-3 leading-relaxed">
                  Mode Demo Otomatis: form terisi sendiri + langkah jalan otomatis. Tinggal rekam! 🎥
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
            {/* NO dark backdrop — page stays fully visible for video recording.
                Only a subtle vignette around the target so the eye knows where to look. */}
            {targetRect && !isCentered && (
              <div className="fixed inset-0 z-[90] pointer-events-none" />
            )}
            {isCentered && (
              <div className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-[2px]" />
            )}

            {/* Soft spotlight glow behind target (no darkening) */}
            {targetRect && !isCentered && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="fixed z-[90] pointer-events-none rounded-2xl"
                style={{
                  top: targetRect.top - 24,
                  left: targetRect.left - 24,
                  width: targetRect.width + 48,
                  height: targetRect.height + 48,
                  background:
                    'radial-gradient(circle, rgba(234,179,8,0.18) 0%, rgba(234,179,8,0.06) 50%, transparent 75%)',
                }}
              />
            )}

            {/* Highlight ring around target — THICK + bright + animated pulse */}
            {targetRect && !isCentered && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="fixed z-[91] pointer-events-none rounded-xl"
                style={{
                  top: targetRect.top - 5,
                  left: targetRect.left - 5,
                  width: targetRect.width + 10,
                  height: targetRect.height + 10,
                  boxShadow:
                    '0 0 0 5px rgba(234,179,8,1), 0 0 0 7px rgba(0,0,0,0.5), 0 0 35px rgba(234,179,8,0.8), 0 0 60px rgba(234,179,8,0.4)',
                  background: 'transparent',
                }}
              >
                {/* Corner accents (animated) */}
                <span className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 rounded-full bg-yellow-400 animate-ping" />
                <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-yellow-400 animate-ping" style={{ animationDelay: '200ms' }} />
                <span className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 rounded-full bg-yellow-400 animate-ping" style={{ animationDelay: '400ms' }} />
                <span className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-yellow-400 animate-ping" style={{ animationDelay: '600ms' }} />
              </motion.div>
            )}

            {/* Arrow pointing to target — BIG + bright + bobbing animation */}
            {targetRect && !isCentered && (
              <motion.div
                initial={{ opacity: 0, scale: 0.3 }}
                animate={{ opacity: 1, scale: 1 }}
                className="fixed z-[92] pointer-events-none text-yellow-400"
                style={{
                  top:
                    actualPlacement === 'top'
                      ? targetRect.top - 36
                      : actualPlacement === 'bottom'
                      ? targetRect.bottom + 10
                      : targetRect.top + targetRect.height / 2 - 18,
                  left:
                    actualPlacement === 'left'
                      ? targetRect.left - 36
                      : actualPlacement === 'right'
                      ? targetRect.right + 10
                      : targetRect.left + targetRect.width / 2 - 18,
                  filter: 'drop-shadow(0 0 10px rgba(234,179,8,1)) drop-shadow(0 2px 4px rgba(0,0,0,0.6))',
                }}
              >
                {actualPlacement === 'top' && (
                  <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 0.9, repeat: Infinity }}>
                    <ArrowUp className="w-9 h-9" strokeWidth={3} />
                  </motion.div>
                )}
                {actualPlacement === 'bottom' && (
                  <motion.div animate={{ y: [0, 6, 0] }} transition={{ duration: 0.9, repeat: Infinity }}>
                    <ArrowDown className="w-9 h-9" strokeWidth={3} />
                  </motion.div>
                )}
                {actualPlacement === 'left' && (
                  <motion.div animate={{ x: [0, -6, 0] }} transition={{ duration: 0.9, repeat: Infinity }}>
                    <ArrowLeft className="w-9 h-9" strokeWidth={3} />
                  </motion.div>
                )}
                {actualPlacement === 'right' && (
                  <motion.div animate={{ x: [0, 6, 0] }} transition={{ duration: 0.9, repeat: Infinity }}>
                    <ArrowRight className="w-9 h-9" strokeWidth={3} />
                  </motion.div>
                )}
              </motion.div>
            )}

            {/* Auto-play typing indicator — DESKTOP ONLY (floating top).
                On mobile it's integrated into the bottom sheet header. */}
            <AnimatePresence>
              {isAutoPlay && typingLabel && !isMobile && (
                <motion.div
                  initial={{ opacity: 0, y: -20, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.9 }}
                  className="fixed top-6 left-1/2 -translate-x-1/2 z-[95] rounded-full px-4 py-2 flex items-center gap-2"
                  style={{
                    background: 'rgba(8, 12, 24, 0.97)',
                    border: '1.5px solid rgba(234,179,8,0.6)',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.5), 0 0 30px rgba(234,179,8,0.2)',
                  }}
                >
                  <Type className="w-4 h-4 text-yellow-400 animate-pulse" />
                  <span className="text-yellow-400 text-xs font-bold">Mengetik: {typingLabel}…</span>
                  <span className="flex gap-0.5">
                    <span className="w-1 h-1 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ─── Tooltip content (shared between mobile bottom-sheet & desktop floating) ─── */}
            {(() => {
              const tooltipInner = (
                <>
                  {/* Progress bar */}
                  <div className="h-1 bg-yellow-400/20 relative">
                    <motion.div
                      className="h-full bg-gold-gradient"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>

                  <div className="p-3.5 sm:p-5">
                    {/* Header */}
                    <div className="flex items-start gap-2.5 sm:gap-3 mb-2 sm:mb-3">
                      <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gold-gradient flex items-center justify-center font-bold text-primary-foreground text-xs sm:text-sm shrink-0 glow-gold">
                        {currentStep + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="text-foreground font-bold text-sm sm:text-base leading-tight">{step.title}</h3>
                          {isAutoPlay && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[9px] font-bold uppercase tracking-wide">
                              <Radio className="w-2.5 h-2.5 fill-current animate-pulse" />
                              AUTO
                            </span>
                          )}
                        </div>
                        {/* Typing indicator — MOBILE: inline in header (not floating) */}
                        {isAutoPlay && typingLabel && isMobile ? (
                          <div className="flex items-center gap-1.5 mt-1">
                            <Type className="w-3 h-3 text-yellow-400 animate-pulse" />
                            <span className="text-yellow-400 text-[10px] font-bold">Mengetik: {typingLabel}…</span>
                            <span className="flex gap-0.5">
                              <span className="w-1 h-1 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                              <span className="w-1 h-1 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                              <span className="w-1 h-1 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                            </span>
                          </div>
                        ) : (
                          <p className="text-yellow-400/80 text-[10px] mt-0.5">
                            Langkah {currentStep + 1} dari {TOUR_STEPS.length}
                            {isAutoPlay && !isPaused && autoCountdown > 0 && (
                              <span className="ml-1.5 text-emerald-400">• lanjut dalam {autoCountdown}s</span>
                            )}
                          </p>
                        )}
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
                    <p className="text-muted-foreground text-[12.5px] sm:text-sm leading-relaxed mb-2 sm:mb-3">{step.description}</p>

                    {/* Demo OTP hint badge (only for OTP step) */}
                    {step.demoOtpHint && (
                      <div className="flex items-center gap-2 mb-3 sm:mb-4 px-3 py-2 rounded-xl bg-yellow-400/10 border border-yellow-400/30">
                        <Shield className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                        <span className="text-yellow-400 text-[11px] sm:text-xs font-bold tracking-wide">{step.demoOtpHint}</span>
                      </div>
                    )}

                    {!step.demoOtpHint && <div className="mb-3 sm:mb-4" />}

                    {/* Controls */}
                    <div className="flex items-center gap-2">
                      {currentStep > 0 && (
                        <button
                          onClick={handleManualPrev}
                          className="px-3 h-9 sm:h-10 rounded-xl text-muted-foreground hover:text-foreground text-xs sm:text-sm font-medium flex items-center gap-1 shrink-0"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                        >
                          <ChevronLeft className="w-4 h-4" />
                          <span className="hidden sm:inline">Kembali</span>
                        </button>
                      )}

                      {/* Pause/Resume button — only in auto-play */}
                      {isAutoPlay && (
                        <button
                          onClick={togglePause}
                          className="px-3 h-9 sm:h-10 rounded-xl text-yellow-400 text-xs sm:text-sm font-medium flex items-center gap-1 shrink-0 hover:bg-yellow-400/10"
                          style={{ border: '1px solid rgba(234,179,8,0.4)' }}
                          aria-label={isPaused ? 'Lanjutkan' : 'Jeda'}
                        >
                          {isPaused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4 fill-current" />}
                          <span className="hidden sm:inline">{isPaused ? 'Lanjut' : 'Jeda'}</span>
                        </button>
                      )}

                      <button
                        onClick={handleManualNext}
                        className="flex-1 h-9 sm:h-10 bg-gold-gradient text-primary-foreground font-bold rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-1 text-xs sm:text-sm"
                      >
                        {currentStep === TOUR_STEPS.length - 1 ? 'Selesai' : 'Lanjut'}
                        {currentStep < TOUR_STEPS.length - 1 && <ChevronRight className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Bottom row: skip + auto-play toggle */}
                    <div className="flex items-center justify-between mt-2.5 gap-2 px-0.5">
                      <button
                        onClick={skip}
                        className="text-muted-foreground/60 hover:text-muted-foreground text-[11px] py-1.5 px-1"
                      >
                        Lewati panduan
                      </button>
                      {isAutoPlay ? (
                        <button
                          onClick={() => {
                            typeCancelRef.current = true;
                            if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
                            stopAutoPlay();
                          }}
                          className="text-yellow-400/80 hover:text-yellow-400 text-[11px] underline py-1.5 px-1"
                        >
                          Matikan Auto
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            useTourStore.getState().setAutoPlay(true);
                          }}
                          className="text-yellow-400/80 hover:text-yellow-400 text-[11px] underline flex items-center gap-1 py-1.5 px-1"
                        >
                          <Radio className="w-3 h-3" />
                          Nyalakan Auto
                        </button>
                      )}
                    </div>
                  </div>
                </>
              );

              const tooltipStyle = {
                background: 'rgba(8, 12, 24, 0.97)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                boxShadow:
                  '0 0 0 1px rgba(234,179,8,0.4), 0 8px 32px rgba(0,0,0,0.6), 0 0 40px rgba(234,179,8,0.25)',
              };

              // ─── MOBILE: fixed bottom sheet (NEVER covers form/button) ───
              if (isMobile && !isCentered) {
                return (
                  <motion.div
                    key={currentStep}
                    initial={{ opacity: 0, y: 60 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 60 }}
                    transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                    className="fixed left-0 right-0 z-[93] rounded-t-2xl overflow-y-auto overflow-x-hidden border-2 border-yellow-400/80 border-b-0"
                    style={{
                      ...tooltipStyle,
                      bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))',
                      maxHeight: '34vh',
                      WebkitOverflowScrolling: 'touch',
                    }}
                  >
                    {tooltipInner}
                  </motion.div>
                );
              }

              // ─── CENTERED (welcome/done) or DESKTOP floating ───
              return (
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className={`fixed z-[93] ${tooltipWidthClass} rounded-2xl overflow-hidden border-2 border-yellow-400/80`}
                  style={
                    {
                      ...tooltipStyle,
                      ...(isCentered
                        ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
                        : { top: tooltipPos.top, left: tooltipPos.left }),
                    }
                  }
                >
                  {tooltipInner}
                </motion.div>
              );
            })()}
          </>
        )}
      </AnimatePresence>
    </>
  );
}
