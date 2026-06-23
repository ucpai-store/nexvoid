'use client';

import { useState, useEffect, FormEvent } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, Eye, EyeOff, User, Lock, ChevronRight, ArrowLeft,
  Loader2, ShieldCheck, AlertTriangle,
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

  useEffect(() => {
    setMounted(true);
    // If already logged in as admin, redirect to dashboard
    const adminToken = localStorage.getItem('nexvo_admin_token');
    if (adminToken) {
      window.location.href = '/#admin-dashboard';
    }
  }, []);

  // Cooldown countdown
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

        // Brief security verification animation
        await new Promise((r) => setTimeout(r, 1200));

        // Store admin session (same keys as the main app auth-store)
        localStorage.setItem('nexvo_admin_token', data.data.token);
        localStorage.setItem('nexvo_admin', JSON.stringify(data.data.admin));

        toast({
          title: 'Akses Diotorisasi',
          description: `Selamat datang, ${data.data.admin.name}!`,
        });

        // Redirect to main app admin dashboard
        setTimeout(() => {
          window.location.href = '/#admin-dashboard';
        }, 400);
      } else {
        if (res.status === 423) {
          setLockMessage(data.error);
        }

        const match = data.error?.match(/Sisa percobaan:\s*(\d+)/);
        if (match) {
          // shown in lockMessage area
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
    <div className="min-h-screen flex items-center justify-center px-4 py-6 relative overflow-hidden bg-[#040711]">
      {/* Background accents */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full bg-[#D4AF37]/8 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-[#1E3A5F]/15 blur-[150px]" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(212,175,55,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,0.5) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="w-full max-w-md relative z-10"
      >
        <div className="glass-strong rounded-3xl p-6 sm:p-8 border border-[#D4AF37]/25 shadow-2xl shadow-[#D4AF37]/5">
          {/* Header */}
          <div className="text-center mb-6 sm:mb-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, type: 'spring', stiffness: 200 }}
              className="mb-4"
            >
              <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#D4AF37]/20 to-[#D4AF37]/5 border border-[#D4AF37]/30">
                <div className="absolute inset-0 blur-xl bg-[#D4AF37]/15 rounded-2xl" />
                <Shield className="w-8 h-8 text-[#D4AF37] relative z-10" />
              </div>
            </motion.div>
            <h1 className="text-2xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#F5D67A] via-[#D4AF37] to-[#B8941F]">
              Admin Panel
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm mt-1.5">
              NEXVO Control Center — Authorized Access Only
            </p>
          </div>

          {/* Security notice */}
          <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-[#D4AF37]/5 border border-[#D4AF37]/15 p-3">
            <ShieldCheck className="w-4 h-4 text-[#D4AF37] flex-shrink-0 mt-0.5" />
            <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
              Halaman ini khusus untuk administrator. Semua aktivitas login tercatat dan dipantau.
            </p>
          </div>

          {/* Lock message */}
          {lockMessage && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-red-500/10 border border-red-500/30 p-3">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-300 leading-relaxed">{lockMessage}</p>
            </div>
          )}

          {/* Verifying overlay */}
          {verifying ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-10 flex flex-col items-center"
            >
              <Loader2 className="w-10 h-10 text-[#D4AF37] animate-spin mb-4" />
              <p className="text-muted-foreground text-sm">Memverifikasi otorisasi...</p>
            </motion.div>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4 sm:space-y-5">
              {/* Username */}
              <div className="space-y-2">
                <Label className="text-foreground text-sm font-medium">Username / Email</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="text"
                    autoComplete="username"
                    placeholder="admin"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-10 h-12 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:border-[#D4AF37]/50 focus:ring-[#D4AF37]/20"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label className="text-foreground text-sm font-medium">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 h-12 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:border-[#D4AF37]/50 focus:ring-[#D4AF37]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                disabled={loading || cooldown > 0}
                className="w-full h-12 bg-gradient-to-r from-[#F5D67A] via-[#D4AF37] to-[#B8941F] text-[#040711] font-semibold rounded-xl hover:opacity-90 transition-all shadow-lg shadow-[#D4AF37]/20 text-sm disabled:opacity-50"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-[#040711]/30 border-t-[#040711] rounded-full animate-spin" />
                    Memproses...
                  </div>
                ) : cooldown > 0 ? (
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    Tunggu {cooldown}s
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    Masuk Admin
                    <ChevronRight className="w-4 h-4" />
                  </div>
                )}
              </Button>
            </form>
          )}

          {/* Back to site */}
          <div className="mt-6 text-center">
            <a
              href="/"
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-[#D4AF37] text-xs font-medium transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Kembali ke Beranda
            </a>
          </div>
        </div>

        <p className="text-center text-muted-foreground/40 text-[10px] sm:text-xs mt-5">
          &copy; {new Date().getFullYear()} NEXVO. Secure Admin Access.
        </p>
      </motion.div>
    </div>
  );
}
