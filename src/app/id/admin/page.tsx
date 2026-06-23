'use client';

import { useState, useEffect, FormEvent, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Eye, EyeOff, User, Lock, ChevronRight, ArrowLeft,
  Loader2, ShieldCheck, AlertTriangle, Fingerprint,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';

export default function StandaloneAdminLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockMessage, setLockMessage] = useState('');
  const [mounted, setMounted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setMounted(true);
    const adminToken = localStorage.getItem('nexvo_admin_token');
    if (adminToken) {
      window.location.href = '/#admin-dashboard';
    }
  }, []);

  // Particle background
  useEffect(() => {
    if (!mounted) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    const particles: { x: number; y: number; vx: number; vy: number; size: number; alpha: number }[] = [];
    const COUNT = 28;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        size: Math.random() * 1.8 + 0.4,
        alpha: Math.random() * 0.35 + 0.08,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
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
  }, [mounted]);

  useEffect(() => {
    if (cooldown > 0) {
      const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [cooldown]);

  const handleLogin = async (e: FormEvent) => {
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

    try {
      const res = await fetch('/api/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (data.success) {
        setVerifying(true);
        await new Promise((r) => setTimeout(r, 1400));

        localStorage.setItem('nexvo_admin_token', data.data.token);
        localStorage.setItem('nexvo_admin', JSON.stringify(data.data.admin));

        toast({
          title: 'Akses Diotorisasi',
          description: `Selamat datang, ${data.data.admin.name}!`,
        });

        setTimeout(() => {
          window.location.href = '/#admin-dashboard';
        }, 500);
      } else {
        if (res.status === 423) {
          setLockMessage(data.error);
        }
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
      toast({ title: 'Error', description: 'Terjadi kesalahan jaringan', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#040711] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#D4AF37] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 sm:py-12 relative overflow-hidden bg-[#040711]">
      {/* Particle field */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" />

      {/* Gradient glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-[#D4AF37]/8 blur-[140px]" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full bg-[#1E3A5F]/20 blur-[130px]" />
      </div>

      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(212,175,55,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,0.6) 1px, transparent 1px)',
          backgroundSize: '52px 52px',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="w-full max-w-[420px] relative z-10"
      >
        {/* Card */}
        <div className="relative">
          {/* Border glow */}
          <div className="absolute -inset-px bg-gradient-to-br from-[#D4AF37]/30 via-transparent to-[#D4AF37]/20 rounded-[1.75rem] blur-[1px]" />

          <div className="relative bg-[#070B14]/95 backdrop-blur-2xl rounded-[1.75rem] border border-[#D4AF37]/20 shadow-2xl shadow-black/50 overflow-hidden">
            {/* Top accent line */}
            <div className="h-[2px] bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent" />

            <div className="px-6 sm:px-8 pt-8 pb-6">
              {/* Header — centered, balanced */}
              <div className="text-center mb-7">
                <motion.div
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, type: 'spring', stiffness: 180, delay: 0.15 }}
                  className="inline-block mb-3.5"
                >
                  <div className="relative w-14 h-14 mx-auto">
                    <div className="absolute inset-0 rounded-2xl bg-[#D4AF37]/20 blur-lg" />
                    <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-[#D4AF37]/20 to-[#D4AF37]/5 border border-[#D4AF37]/40 flex items-center justify-center">
                      <Shield className="w-7 h-7 text-[#D4AF37]" strokeWidth={1.5} />
                    </div>
                  </div>
                </motion.div>

                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#F5D67A] via-[#D4AF37] to-[#B8941F]">
                  Admin Control
                </h1>
                <p className="text-slate-400 text-xs sm:text-[13px] mt-1.5 font-medium">
                  NEXVO Control Center
                </p>
              </div>

              {/* Lock message */}
              <AnimatePresence>
                {lockMessage && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-start gap-2.5 rounded-xl bg-red-500/10 border border-red-500/30 p-3">
                      <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-red-300 leading-relaxed">{lockMessage}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Verifying or form */}
              <AnimatePresence mode="wait">
                {verifying ? (
                  <motion.div
                    key="verifying"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="py-10 flex flex-col items-center"
                  >
                    <div className="relative mb-4">
                      <div className="w-12 h-12 rounded-full border-2 border-[#D4AF37]/20 border-t-[#D4AF37] animate-spin" />
                      <Fingerprint className="absolute inset-0 m-auto w-5 h-5 text-[#D4AF37]" />
                    </div>
                    <p className="text-slate-200 text-sm font-medium">Memverifikasi identitas...</p>
                    <p className="text-slate-500 text-[11px] mt-1">Mengaktifkan sesi admin</p>
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
                    {/* Username */}
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-username" className="text-slate-300 text-[13px] font-medium">
                        Username / Email
                      </Label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <Input
                          id="admin-username"
                          type="text"
                          autoComplete="username"
                          placeholder="Masukkan username"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="h-11 sm:h-12 pl-10 bg-white/[0.03] border-[#D4AF37]/15 rounded-xl text-white placeholder:text-slate-600 focus:border-[#D4AF37]/50 focus:bg-white/[0.05] focus-visible:ring-[#D4AF37]/10 transition-all"
                        />
                      </div>
                    </div>

                    {/* Password */}
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-password" className="text-slate-300 text-[13px] font-medium">
                        Password
                      </Label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <Input
                          id="admin-password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          placeholder="Masukkan password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="h-11 sm:h-12 pl-10 pr-11 bg-white/[0.03] border-[#D4AF37]/15 rounded-xl text-white placeholder:text-slate-600 focus:border-[#D4AF37]/50 focus:bg-white/[0.05] focus-visible:ring-[#D4AF37]/10 transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#D4AF37] transition-colors p-1"
                          aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                        >
                          {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                        </button>
                      </div>
                    </div>

                    {/* Submit */}
                    <Button
                      type="submit"
                      disabled={loading || cooldown > 0}
                      className="relative w-full h-11 sm:h-12 mt-1 bg-gradient-to-r from-[#F5D67A] via-[#D4AF37] to-[#B8941F] text-[#040711] font-semibold rounded-xl hover:shadow-lg hover:shadow-[#D4AF37]/25 hover:brightness-105 active:scale-[0.98] transition-all text-sm disabled:opacity-50 disabled:hover:scale-100 overflow-hidden group"
                    >
                      <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                      <span className="relative flex items-center justify-center gap-1.5">
                        {loading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Memproses...
                          </>
                        ) : cooldown > 0 ? (
                          <>
                            <Lock className="w-4 h-4" />
                            Tunggu {cooldown}s
                          </>
                        ) : (
                          <>
                            Masuk Admin
                            <ChevronRight className="w-4 h-4" />
                          </>
                        )}
                      </span>
                    </Button>
                  </motion.form>
                )}
              </AnimatePresence>

              {/* Security badge — integrated, subtle */}
              <div className="mt-5 flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#D4AF37]/70" />
                <span className="text-[11px] text-slate-500 font-medium tracking-wide">
                  Koneksi aman &middot; 256-bit SSL
                </span>
              </div>
            </div>

            {/* Bottom accent line */}
            <div className="h-px bg-gradient-to-r from-transparent via-[#D4AF37]/25 to-transparent" />
          </div>
        </div>

        {/* Footer links */}
        <div className="mt-5 flex items-center justify-center gap-2">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-slate-400 hover:text-[#D4AF37] text-[13px] font-medium transition-colors group"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
            Kembali ke Beranda
          </a>
        </div>

        <p className="text-center text-slate-600 text-[10px] mt-3">
          &copy; {new Date().getFullYear()} NEXVO &middot; Secure Admin Access
        </p>
      </motion.div>
    </div>
  );
}
