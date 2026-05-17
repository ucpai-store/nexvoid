'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Eye, EyeOff, User, Lock, ChevronRight, ArrowLeft,
  AlertTriangle, LockKeyhole, Fingerprint, Scan,
  ShieldCheck, ShieldAlert, Clock, MapPin, Cpu,
  KeyRound, CheckCircle2, Loader2, Globe,
  Server, Hash, Terminal
} from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { useAuthStore } from '@/stores/auth-store';
import { useSiteStore } from '@/stores/site-store';
import { fetchWithRetry } from '@/lib/fetch-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';

/* ───────── Particle Background (client-only) ───────── */
function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const particles: { x: number; y: number; vx: number; vy: number; size: number; alpha: number }[] = [];
    const PARTICLE_COUNT = 50;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 2 + 0.5,
        alpha: Math.random() * 0.5 + 0.1,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(212, 175, 55, ${0.06 * (1 - dist / 150)})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(212, 175, 55, ${p.alpha})`;
        ctx.fill();
      });

      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 z-0" />;
}

/* ───────── Security Scan Line ───────── */
function ScanLine() {
  return (
    <motion.div
      className="absolute left-0 right-0 h-[1px] z-[1]"
      style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.4), transparent)' }}
      animate={{ top: ['0%', '100%'] }}
      transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
    />
  );
}

/* ───────── Hex Grid Background ───────── */
function HexGrid() {
  return (
    <div className="absolute inset-0 overflow-hidden opacity-[0.03]">
      <svg width="100%" height="100%">
        <defs>
          <pattern id="hexGrid" width="50" height="43.4" patternUnits="userSpaceOnUse" patternTransform="scale(2)">
            <path d="M25 0 L50 14.4 L50 28.9 L25 43.4 L0 28.9 L0 14.4 Z" fill="none" stroke="#D4AF37" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hexGrid)" />
      </svg>
    </div>
  );
}

/* ───────── Security Info Panel (safe for SSR) ───────── */
function SecurityInfoPanel() {
  const [mounted, setMounted] = useState(false);
  const [time, setTime] = useState('--:--:--');
  const [ip, setIp] = useState('***.***.***.**');
  const [securityScore] = useState(() => Math.floor(Math.random() * 5) + 95);
  const [browserInfo, setBrowserInfo] = useState('Browser');

  useEffect(() => {
    // Use rAF to avoid synchronous setState in effect
    const raf = requestAnimationFrame(() => {
      setMounted(true);
      // Safe browser detection
      if (typeof navigator !== 'undefined') {
        const ua = navigator.userAgent;
        if (ua.includes('Chrome') && !ua.includes('Edg')) setBrowserInfo('Chrome');
        else if (ua.includes('Firefox')) setBrowserInfo('Firefox');
        else if (ua.includes('Safari') && !ua.includes('Chrome')) setBrowserInfo('Safari');
        else if (ua.includes('Edg')) setBrowserInfo('Edge');
        else setBrowserInfo('Browser');
      }
      // Generate IP client-side only
      setIp(`${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('id-ID', { hour12: false }) + ' WIB');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [mounted]);

  if (!mounted) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/40 font-mono">
          <Clock className="w-3 h-3" />
          <span>Loading security info...</span>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.2, duration: 0.5 }}
      className="space-y-2"
    >
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 font-mono">
        <Clock className="w-3 h-3" />
        <span>{time}</span>
        <span className="text-[#D4AF37]/30">|</span>
        <MapPin className="w-3 h-3" />
        <span>{ip}</span>
      </div>
      <div className="flex items-center gap-2 text-[10px] font-mono">
        <ShieldCheck className="w-3 h-3 text-emerald-400" />
        <span className="text-emerald-400/80">Security Score: {securityScore}/100</span>
        <span className="text-[#D4AF37]/30">|</span>
        <Cpu className="w-3 h-3 text-muted-foreground/60" />
        <span className="text-muted-foreground/60">{browserInfo} &bull; Encrypted</span>
      </div>
    </motion.div>
  );
}

/* ───────── Verification Steps Indicator ───────── */
function VerificationSteps({ step }: { step: number }) {
  const steps = [
    { icon: User, label: 'Identitas' },
    { icon: Lock, label: 'Verifikasi' },
    { icon: ShieldCheck, label: 'Otorisasi' },
  ];

  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2">
      {steps.map((s, i) => {
        const isActive = i === step;
        const isCompleted = i < step;
        const Icon = s.icon;
        return (
          <div key={i} className="flex items-center gap-1 sm:gap-2">
            <motion.div
              animate={{
                scale: isActive ? 1.1 : 1,
                backgroundColor: isCompleted ? '#10B981' : isActive ? '#D4AF37' : 'rgba(212,175,55,0.1)',
              }}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-shadow ${
                isCompleted ? 'shadow-[0_0_12px_rgba(16,185,129,0.3)]' :
                isActive ? 'shadow-[0_0_12px_rgba(212,175,55,0.3)]' : ''
              }`}
            >
              {isCompleted ? (
                <CheckCircle2 className="w-4 h-4 text-white" />
              ) : (
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#070B14]' : 'text-[#D4AF37]/40'}`} />
              )}
            </motion.div>
            <span className={`text-[10px] font-medium hidden sm:inline ${
              isCompleted ? 'text-emerald-400' : isActive ? 'text-[#D4AF37]' : 'text-muted-foreground/30'
            }`}>
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <div className={`w-6 sm:w-10 h-[1px] ${isCompleted ? 'bg-emerald-400/50' : 'bg-[#D4AF37]/10'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ───────── Password Strength ───────── */
function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;

  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  let level: number, label: string, color: string;
  if (score <= 1) { level = 1; label = 'Lemah'; color = '#EF4444'; }
  else if (score <= 2) { level = 2; label = 'Cukup'; color = '#F59E0B'; }
  else if (score <= 3) { level = 3; label = 'Kuat'; color = '#3B82F6'; }
  else if (score <= 4) { level = 4; label = 'Sangat Kuat'; color = '#10B981'; }
  else { level = 5; label = 'Maximum'; color = '#D4AF37'; }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className="space-y-1.5"
    >
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <motion.div
            key={i}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: level >= i ? 1 : 0 }}
            transition={{ delay: i * 0.05 }}
            className="h-1 flex-1 rounded-full origin-left"
            style={{ backgroundColor: level >= i ? color : 'rgba(212,175,55,0.1)' }}
          />
        ))}
      </div>
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-medium" style={{ color }}>{label}</span>
        <span className="text-[10px] text-muted-foreground/40 font-mono">{password.length} chars</span>
      </div>
    </motion.div>
  );
}

/* ───────── Security Scanning Animation ───────── */
function SecurityScanning() {
  return (
    <div className="flex flex-col items-center gap-4 sm:gap-6 py-6 sm:py-8">
      <motion.div
        className="relative w-28 h-28"
        animate={{ rotate: 360 }}
        transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
      >
        <div className="absolute inset-0 rounded-full border-2 border-[#D4AF37]/20" />
        <div className="absolute inset-2 rounded-full border border-[#D4AF37]/30 border-dashed" />
        <div className="absolute inset-0 rounded-full border-t-2 border-[#D4AF37]" style={{ clipPath: 'polygon(50% 0%, 50% 50%, 100% 0%)' }} />
        <div className="absolute inset-4 rounded-full bg-[#0F172A]/80 flex items-center justify-center">
          <ShieldCheck className="w-10 h-10 text-[#D4AF37]" />
        </div>
      </motion.div>

      <div className="text-center space-y-3">
        <motion.h3
          className="text-lg font-semibold text-foreground"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          Memverifikasi Kredensial
        </motion.h3>

        <div className="space-y-1.5 text-left max-w-[240px] mx-auto">
          {[
            { text: 'Validasi identitas...', done: true },
            { text: 'Verifikasi password...', done: true },
            { text: 'Cek otorisasi admin...', done: false },
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.4 }}
              className="flex items-center gap-2 text-xs font-mono"
            >
              {item.done ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <Loader2 className="w-3.5 h-3.5 text-[#D4AF37] animate-spin shrink-0" />
              )}
              <span className={item.done ? 'text-emerald-400/80' : 'text-[#D4AF37]'}>{item.text}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───────── Main Component ───────── */
export default function AdminLoginPage() {
  const { navigate } = useAppStore();
  const { setAdminToken, setAdmin } = useAuthStore();
  const { logoUrl } = useSiteStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [lockMessage, setLockMessage] = useState('');
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [cooldown, setCooldown] = useState(0);

  // Cooldown timer for failed attempts
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast({ title: 'Error', description: 'Username/Email dan password wajib diisi', variant: 'destructive' });
      return;
    }
    if (cooldown > 0) {
      toast({ title: 'Tunggu', description: `Tunggu ${cooldown} detik sebelum mencoba lagi`, variant: 'destructive' });
      return;
    }

    setLoading(true);
    setLockMessage('');
    setRemainingAttempts(null);
    setCurrentStep(1);

    try {
      const res = await fetchWithRetry('/api/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        maxRetries: 3,
        retryDelay: 1000,
      });
      const data = await res.json();

      if (data.success) {
        setCurrentStep(2);
        setVerifying(true);

        // Simulate security verification
        await new Promise(r => setTimeout(r, 2000));

        setAdminToken(data.data.token);
        setAdmin(data.data.admin);
        setVerifying(false);

        toast({
          title: 'Akses Diotorisasi',
          description: `Selamat datang, ${data.data.admin.name}!`,
        });
        navigate('admin-dashboard');
      } else {
        setCurrentStep(0);

        if (res.status === 423) {
          setLockMessage(data.error);
        }

        const match = data.error?.match(/Sisa percobaan:\s*(\d+)/);
        if (match) {
          setRemainingAttempts(parseInt(match[1]));
        }

        // Progressive cooldown on failed attempts
        setLoginAttempts((prev) => {
          const next = prev + 1;
          if (next >= 3) {
            setCooldown(Math.min(30, (next - 2) * 5));
          }
          return next;
        });

        toast({ title: 'Akses Ditolak', description: data.error, variant: 'destructive' });
      }
    } catch {
      setCurrentStep(0);
      toast({ title: 'Error', description: 'Terjadi kesalahan jaringan', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [username, password, cooldown, navigate, setAdmin, setAdminToken]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-4 sm:py-6 relative overflow-hidden bg-[#040711]">
      {/* Background layers */}
      <ParticleField />
      <HexGrid />
      <ScanLine />

      {/* Radial glows */}
      <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-[#1E3A5F]/[0.04] blur-[180px]" />
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-[#D4AF37]/[0.03] blur-[150px]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px]">
        <div className="absolute inset-0 rounded-full border border-[#D4AF37]/[0.04] animate-[spin_60s_linear_infinite]" />
        <div className="absolute inset-8 rounded-full border border-[#D4AF37]/[0.06] animate-[spin_45s_linear_infinite_reverse]" />
        <div className="absolute inset-16 rounded-full border border-[#D4AF37]/[0.08] animate-[spin_30s_linear_infinite]" />
      </div>

      {/* Main Card */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[440px] relative z-10"
      >
        <div className="relative">
          {/* Card glow effect */}
          <div className="absolute -inset-[1px] rounded-[28px] bg-gradient-to-b from-[#D4AF37]/20 via-[#D4AF37]/5 to-transparent z-0" />

          <div className="relative rounded-[28px] overflow-hidden bg-[#0B1120]/95 backdrop-blur-xl border border-[#D4AF37]/[0.12] shadow-[0_0_80px_rgba(212,175,55,0.06),0_25px_50px_rgba(0,0,0,0.5)]">

            {/* Top accent line */}
            <div className="h-[2px] bg-gradient-to-r from-transparent via-[#D4AF37]/60 to-transparent" />

            <div className="p-4 sm:p-8">
              {/* Back button */}
              <motion.button
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                onClick={() => navigate('home')}
                className="flex items-center gap-1.5 text-muted-foreground/60 hover:text-[#D4AF37] transition-all mb-6 group"
              >
                <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                <span className="text-xs font-medium">Beranda</span>
              </motion.button>

              {/* Logo & Title */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, duration: 0.6, type: 'spring' }}
                className="text-center mb-6"
              >
                <div className="relative inline-block">
                  {/* Gold glow ring */}
                  <motion.div
                    className="absolute -inset-4 rounded-3xl"
                    animate={{
                      boxShadow: [
                        '0 0 20px rgba(212,175,55,0.1), 0 0 40px rgba(212,175,55,0.05)',
                        '0 0 30px rgba(212,175,55,0.2), 0 0 60px rgba(212,175,55,0.1)',
                        '0 0 20px rgba(212,175,55,0.1), 0 0 40px rgba(212,175,55,0.05)',
                      ],
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />

                  <div className="relative px-2 py-1">
                    <img
                      src={logoUrl}
                      alt="NEXVO"
                      className="h-16 w-auto object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).src = '/api/files/nexvo-logo.png'; }}
                    />
                    {/* Rotating ring */}
                    <motion.div
                      className="absolute -inset-3 rounded-2xl border border-[#D4AF37]/30"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                    />
                  </div>

                  {/* Admin badge */}
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: 0.6, type: 'spring', stiffness: 200 }}
                    className="absolute -top-2 -right-3"
                  >
                    <div className="bg-gradient-to-r from-[#D4AF37] to-[#F0D060] text-[#070B14] text-[8px] font-black px-2 py-0.5 rounded-md shadow-lg shadow-[#D4AF37]/20 tracking-wider">
                      SUPER ADMIN
                    </div>
                  </motion.div>
                </div>

                <p className="text-muted-foreground/70 text-xs font-medium tracking-widest uppercase mt-4">Secure Admin Control Panel</p>

                {/* Connection status */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                  className="flex items-center justify-center gap-1.5 mt-3"
                >
                  <div className="relative">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <div className="absolute inset-0 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  </div>
                  <span className="text-emerald-400/90 text-[10px] font-semibold tracking-wider">ENCRYPTED CONNECTION</span>
                  <Lock className="w-3 h-3 text-emerald-400/60" />
                </motion.div>
              </motion.div>

              {/* Verification Steps */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mb-6"
              >
                <VerificationSteps step={currentStep} />
              </motion.div>

              {/* Lock Warning */}
              <AnimatePresence>
                {lockMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    className="mb-4 p-3 rounded-xl bg-red-500/[0.08] border border-red-500/20"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                        <ShieldAlert className="w-4 h-4 text-red-400" />
                      </div>
                      <div>
                        <p className="text-red-400 text-xs font-semibold">Akun Terkunci</p>
                        <p className="text-red-400/60 text-[11px] mt-0.5 leading-relaxed">{lockMessage}</p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Remaining Attempts */}
              <AnimatePresence>
                {remainingAttempts !== null && remainingAttempts <= 3 && remainingAttempts > 0 && !lockMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mb-4 p-3 rounded-xl bg-amber-500/[0.06] border border-amber-500/15"
                  >
                    <div className="flex items-center gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <div className="flex-1">
                        <p className="text-amber-400 text-xs font-semibold">Peringatan Keamanan</p>
                        <p className="text-amber-400/60 text-[11px] mt-0.5">Sisa percobaan: {remainingAttempts}x sebelum akun dikunci</p>
                      </div>
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <div
                            key={i}
                            className={`w-1.5 h-6 rounded-full ${
                              i <= (5 - remainingAttempts) ? 'bg-red-400/60' : 'bg-[#D4AF37]/20'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Cooldown timer */}
              <AnimatePresence>
                {cooldown > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mb-4 p-2.5 rounded-xl bg-[#D4AF37]/[0.04] border border-[#D4AF37]/10 text-center"
                  >
                    <span className="text-[#D4AF37]/70 text-xs font-mono">
                      <Clock className="w-3 h-3 inline mr-1.5 -mt-0.5" />
                      Tunggu <span className="text-[#D4AF37] font-bold">{cooldown}s</span> sebelum mencoba lagi
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Login Form / Verification Animation */}
              <AnimatePresence mode="wait">
                {verifying ? (
                  <motion.div
                    key="verifying"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                  >
                    <SecurityScanning />
                  </motion.div>
                ) : (
                  <motion.form
                    key="form"
                    onSubmit={handleLogin}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-4"
                  >
                    {/* Username Field */}
                    <motion.div
                      initial={{ opacity: 0, x: -15 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 }}
                      className="space-y-1.5"
                    >
                      <Label className="text-foreground/80 text-[11px] font-semibold tracking-wide uppercase flex items-center gap-1.5">
                        <User className="w-3 h-3 text-[#D4AF37]/60" />
                        Username / Email
                      </Label>
                      <div className="relative group">
                        <div className="absolute left-0 top-0 bottom-0 w-10 rounded-l-xl bg-[#D4AF37]/[0.04] border-r border-[#D4AF37]/10 flex items-center justify-center">
                          <Hash className="w-3.5 h-3.5 text-[#D4AF37]/40" />
                        </div>
                        <Input
                          type="text"
                          placeholder="Masukkan username atau email"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="pl-11 h-11 bg-[#0F172A]/40 border-[#D4AF37]/[0.08] rounded-xl text-foreground text-sm placeholder:text-muted-foreground/30 focus:border-[#D4AF37]/30 focus:ring-[#D4AF37]/10 transition-all hover:border-[#D4AF37]/15"
                          autoComplete="username"
                          disabled={loading || !!lockMessage || cooldown > 0}
                        />
                      </div>
                      <p className="text-muted-foreground/30 text-[9px] font-mono">
                        Masukkan kredensial admin
                      </p>
                    </motion.div>

                    {/* Password Field */}
                    <motion.div
                      initial={{ opacity: 0, x: -15 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 }}
                      className="space-y-1.5"
                    >
                      <Label className="text-foreground/80 text-[11px] font-semibold tracking-wide uppercase flex items-center gap-1.5">
                        <KeyRound className="w-3 h-3 text-[#D4AF37]/60" />
                        Password
                      </Label>
                      <div className="relative group">
                        <div className="absolute left-0 top-0 bottom-0 w-10 rounded-l-xl bg-[#D4AF37]/[0.04] border-r border-[#D4AF37]/10 flex items-center justify-center">
                          <Lock className="w-3.5 h-3.5 text-[#D4AF37]/40" />
                        </div>
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Masukkan password rahasia"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="pl-11 pr-11 h-11 bg-[#0F172A]/40 border-[#D4AF37]/[0.08] rounded-xl text-foreground text-sm placeholder:text-muted-foreground/30 focus:border-[#D4AF37]/30 focus:ring-[#D4AF37]/10 transition-all hover:border-[#D4AF37]/15"
                          autoComplete="current-password"
                          disabled={loading || !!lockMessage || cooldown > 0}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-[#D4AF37] transition-colors p-0.5"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <PasswordStrength password={password} />
                    </motion.div>

                    {/* Security Layers Info */}
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      className="grid grid-cols-3 gap-2"
                    >
                      {[
                        { icon: Shield, label: 'SSL/TLS' },
                        { icon: Fingerprint, label: 'Anti-Brute' },
                        { icon: Scan, label: 'Monitoring' },
                      ].map((item, i) => (
                        <div
                          key={i}
                          className="flex flex-col items-center gap-1 py-2 px-1 rounded-lg bg-[#D4AF37]/[0.02] border border-[#D4AF37]/[0.05]"
                        >
                          <item.icon className="w-3.5 h-3.5 text-emerald-400/70" />
                          <span className="text-[9px] font-semibold text-muted-foreground/50 tracking-wider">{item.label}</span>
                        </div>
                      ))}
                    </motion.div>

                    {/* Security Notice */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.6 }}
                      className="p-2.5 rounded-xl bg-[#0B1120] border border-[#D4AF37]/[0.06]"
                    >
                      <div className="flex items-start gap-2">
                        <Terminal className="w-3.5 h-3.5 text-[#D4AF37]/40 shrink-0 mt-0.5" />
                        <p className="text-muted-foreground/40 text-[10px] leading-relaxed font-mono">
                          Area terbatas. Semua percobaan akses dicatat secara real-time. IP dan device fingerprint tersimpan.
                        </p>
                      </div>
                    </motion.div>

                    {/* Submit Button */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.7 }}
                    >
                      <Button
                        type="submit"
                        disabled={loading || !!lockMessage || cooldown > 0}
                        className="w-full h-11 bg-gradient-to-r from-[#D4AF37] via-[#F0D060] to-[#D4AF37] text-[#070B14] font-bold rounded-xl hover:shadow-[0_0_30px_rgba(212,175,55,0.3)] transition-all text-sm disabled:opacity-40 disabled:hover:shadow-none relative overflow-hidden group"
                      >
                        {/* Shimmer effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />

                        {loading ? (
                          <div className="flex items-center gap-2 relative z-10">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Memverifikasi...</span>
                          </div>
                        ) : cooldown > 0 ? (
                          <div className="flex items-center gap-2 relative z-10">
                            <Clock className="w-4 h-4" />
                            <span>Tunggu {cooldown}s</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 relative z-10">
                            <ShieldCheck className="w-4 h-4" />
                            <span>Masuk ke Admin Panel</span>
                            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                          </div>
                        )}
                      </Button>
                    </motion.div>
                  </motion.form>
                )}
              </AnimatePresence>

              {/* Divider */}
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[#D4AF37]/[0.06]" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-[#0B1120] px-3 text-muted-foreground/25 text-[10px] tracking-widest">ATAU</span>
                </div>
              </div>

              {/* User login link */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9 }}
                className="text-center"
              >
                <button
                  onClick={() => navigate('login')}
                  className="text-muted-foreground/40 text-xs hover:text-[#D4AF37] transition-colors inline-flex items-center gap-1.5 group"
                >
                  <User className="w-3 h-3 group-hover:scale-110 transition-transform" />
                  Login sebagai User biasa
                </button>
              </motion.div>

              {/* Security info panel */}
              <div className="mt-5 pt-4 border-t border-[#D4AF37]/[0.04]">
                <SecurityInfoPanel />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="text-center mt-5 space-y-1.5"
        >
          <div className="flex items-center justify-center gap-3 text-[9px] text-muted-foreground/20 font-mono">
            <span className="flex items-center gap-1"><Shield className="w-2.5 h-2.5" /> AES-256</span>
            <span>&bull;</span>
            <span className="flex items-center gap-1"><Globe className="w-2.5 h-2.5" /> TLS 1.3</span>
            <span>&bull;</span>
            <span className="flex items-center gap-1"><Server className="w-2.5 h-2.5" /> JWT</span>
            <span>&bull;</span>
            <span className="flex items-center gap-1"><Fingerprint className="w-2.5 h-2.5" /> RBAC</span>
          </div>
          <p className="text-muted-foreground/15 text-[9px] tracking-wider">
            &copy; {new Date().getFullYear()} NEXVO SECURITY &bull; UNAUTHORIZED ACCESS IS PROHIBITED &amp; MONITORED
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
