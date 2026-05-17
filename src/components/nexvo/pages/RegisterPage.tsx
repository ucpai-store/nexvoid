'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, Eye, EyeOff, Phone, Lock, ChevronRight, Users, Mail,
} from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { useAuthStore } from '@/stores/auth-store';
import { useSiteStore } from '@/stores/site-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/lib/i18n';
import LanguageSwitcher from '@/components/nexvo/shared/LanguageSwitcher';
import CountryCodeSelector from '@/components/nexvo/shared/CountryCodeSelector';

function getPasswordStrength(password: string, t: (key: string) => string): { level: number; label: string; color: string } {
  if (!password) return { level: 0, label: '', color: '' };
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 2) return { level: 1, label: t('auth.strengthWeak'), color: 'bg-red-500' };
  if (score <= 3) return { level: 2, label: t('auth.strengthMedium'), color: 'bg-yellow-500' };
  return { level: 3, label: t('auth.strengthStrong'), color: 'bg-emerald-500' };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function RegisterPage() {
  const { navigate, pageData } = useAppStore();
  const { setToken, setUser } = useAuthStore();
  const { logoUrl } = useSiteStore();
  const t = useT();

  // Form fields
  const [countryCode, setCountryCode] = useState('62'); // Default Indonesia +62
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showReferral, setShowReferral] = useState(false);
  const [loading, setLoading] = useState(false);

  // Auto-detect referral code from URL param or pageData
  useEffect(() => {
    // First check pageData (from App navigation with ?ref= param)
    const pageDataRef = pageData?.referralCode as string;
    if (pageDataRef) {
      setReferralCode(pageDataRef.toUpperCase());
      setShowReferral(true);
      return;
    }
    // Fallback: check URL query param
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      setReferralCode(ref.toUpperCase());
      setShowReferral(true);
    }
  }, [pageData]);

  const strength = getPasswordStrength(password, t);
  const cleanWhatsapp = whatsapp.replace(/[^0-9]/g, '');
  const fullWhatsapp = countryCode + cleanWhatsapp; // Country code + local number
  const canRegister = name.trim().length >= 2 && cleanWhatsapp.length >= 8 && isValidEmail(email) && password.length >= 6 && password === confirmPassword;

  // ── Registration ──
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast({ title: 'Error', description: 'Nama pengguna wajib diisi', variant: 'destructive' });
      return;
    }

    if (name.trim().length < 2) {
      toast({ title: 'Error', description: 'Nama pengguna minimal 2 karakter', variant: 'destructive' });
      return;
    }

    if (!whatsapp || !email || !password || !confirmPassword) {
      toast({ title: 'Error', description: t('common.allFieldsRequired'), variant: 'destructive' });
      return;
    }

    if (cleanWhatsapp.length < 8) {
      toast({ title: 'Error', description: 'Nomor WhatsApp tidak valid (min. 8 digit)', variant: 'destructive' });
      return;
    }

    if (!isValidEmail(email)) {
      toast({ title: 'Error', description: t('auth.validEmail'), variant: 'destructive' });
      return;
    }

    if (password.length < 6) {
      toast({ title: 'Error', description: t('auth.minChars'), variant: 'destructive' });
      return;
    }

    if (password !== confirmPassword) {
      toast({ title: 'Error', description: t('auth.passwordMismatch'), variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      // Send full whatsapp number with country code
      const body: Record<string, string> = { name: name.trim(), whatsapp: fullWhatsapp, email, password };
      if (referralCode) body.referralCode = referralCode;

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.success) {
        if (data.data.requiresVerification) {
          // Navigate to OTP page for email verification
          setToken(data.data.token);
          setUser(data.data.user);
          toast({ title: 'Success!', description: data.data.message || 'A verification code has been sent to your email.' });
          navigate('otp', { email: data.data.user.email, whatsapp: data.data.user.whatsapp, fromRegister: true });
        } else {
          // No verification required (legacy)
          setToken(data.data.token);
          setUser(data.data.user);
          toast({ title: 'Success!', description: t('auth.registerSuccess') });
          navigate('dashboard');
        }
      } else {
        toast({ title: 'Failed', description: data.error || 'Registration failed', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: t('common.networkError'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Language Switcher - Top Right */}
      <div className="absolute top-4 right-4 z-20">
        <LanguageSwitcher />
      </div>

      {/* Background Image */}
      <div className="absolute inset-0">
        <img
          src="/login-register-bg.jpeg"
          alt="Background"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-[#070B14]/75" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#070B14]/90 via-transparent to-[#070B14]/40" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#070B14]/60 via-transparent to-[#070B14]/60" />
        <div className="absolute top-1/4 right-1/4 w-72 h-72 rounded-full bg-[#D4AF37]/5 blur-[120px]" />
        <div className="absolute bottom-1/4 left-1/4 w-96 h-96 rounded-full bg-[#1E3A5F]/10 blur-[150px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="w-full max-w-md relative z-10 px-4 sm:px-0"
      >
        <div className="glass-strong rounded-3xl p-5 sm:p-8 glow-gold">
          {/* Logo & Heading */}
          <div className="text-center mb-5 sm:mb-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, type: 'spring', stiffness: 200 }}
              className="mb-5"
            >
              <div className="relative inline-block">
                <div className="absolute inset-0 blur-[25px] bg-[#D4AF37]/15 rounded-full scale-110" />
                <img
                  src={logoUrl}
                  alt="NEXVO"
                  className="relative h-14 sm:h-20 w-auto object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).src = '/api/files/nexvo-logo.png'; }}
                />
              </div>
            </motion.div>
            <p className="text-muted-foreground text-xs sm:text-sm">Create a new NEXVO account</p>
          </div>

          <form onSubmit={handleRegister} className="space-y-3 sm:space-y-4">
            {/* ── Username / Name ── */}
            <div className="space-y-2">
              <Label className="text-foreground text-sm font-medium">{t('auth.username') || 'Nama Pengguna'} *</Label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Masukkan nama pengguna"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-10 h-12 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:border-[#D4AF37]/50 focus:ring-[#D4AF37]/20"
                />
              </div>
            </div>

            {/* ── WhatsApp Number with Country Code ── */}
            <div className="space-y-2">
              <Label className="text-foreground text-sm font-medium">{t('auth.whatsappNumber')}</Label>
              <div className="flex gap-2">
                <CountryCodeSelector
                  value={countryCode}
                  onChange={setCountryCode}
                />
                <div className="relative flex-1">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="tel"
                    placeholder="8123456789"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value.replace(/[^0-9]/g, ''))}
                    className="pl-10 h-12 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:border-[#D4AF37]/50 focus:ring-[#D4AF37]/20"
                  />
                </div>
              </div>
              <p className="text-muted-foreground/50 text-[9px] sm:text-[10px]">Format: +{countryCode} {whatsapp || '8123456789'}</p>
            </div>

            {/* ── Email ── */}
            <div className="space-y-2">
              <Label className="text-foreground text-sm font-medium">{t('auth.emailAddress')}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-12 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:border-[#D4AF37]/50 focus:ring-[#D4AF37]/20"
                />
              </div>
            </div>

            {/* ── Password ── */}
            <div className="space-y-2">
              <Label className="text-foreground text-sm font-medium">{t('auth.password')}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('auth.minChars')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 h-12 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:border-[#D4AF37]/50 focus:ring-[#D4AF37]/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {password && (
                <div className="space-y-1.5">
                  <div className="flex gap-1.5">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={`h-1.5 flex-1 rounded-full transition-all ${
                          i <= strength.level ? strength.color : 'bg-white/10'
                        }`}
                      />
                    ))}
                  </div>
                  <p className={`text-xs ${
                    strength.level === 1 ? 'text-red-400' : strength.level === 2 ? 'text-yellow-400' : 'text-emerald-400'
                  }`}>
                    Strength: {strength.label}
                  </p>
                </div>
              )}
            </div>

            {/* ── Confirm Password ── */}
            <div className="space-y-2">
              <Label className="text-foreground text-sm font-medium">{t('auth.confirmPassword')}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder={t('auth.minChars')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10 pr-10 h-12 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:border-[#D4AF37]/50 focus:ring-[#D4AF37]/20"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="text-red-400 text-xs">Passwords do not match</p>
              )}
            </div>

            {/* ── Referral Code ── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-foreground text-sm font-medium">{t('auth.referralCode')}</Label>
                <button
                  type="button"
                  onClick={() => setShowReferral(!showReferral)}
                  className="text-[#D4AF37] text-xs font-medium hover:underline"
                >
                  {showReferral ? t('auth.hide') : t('auth.haveCode')}
                </button>
              </div>
              {showReferral && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                >
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder={t('auth.referralCodeOptional')}
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                      className="pl-10 h-12 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:border-[#D4AF37]/50 focus:ring-[#D4AF37]/20"
                    />
                  </div>
                </motion.div>
              )}
            </div>

            {/* ── Submit ── */}
            <Button
              type="submit"
              disabled={loading || !canRegister}
              className="w-full h-12 bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 transition-all glow-gold text-sm disabled:opacity-50"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-[#070B14]/30 border-t-[#070B14] rounded-full animate-spin" />
                  {t('common.processing')}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {t('auth.registerNow')}
                  <ChevronRight className="w-4 h-4" />
                </div>
              )}
            </Button>
          </form>

          {/* Links */}
          <div className="mt-4 sm:mt-6 text-center">
            <p className="text-muted-foreground text-sm">
              {t('auth.hasAccount')}{' '}
              <button
                onClick={() => navigate('login')}
                className="text-[#D4AF37] font-medium hover:underline"
              >
                {t('auth.signIn')}
              </button>
            </p>
          </div>
        </div>

        <p className="text-center text-muted-foreground/40 text-[10px] sm:text-xs mt-4 sm:mt-6">
          &copy; 2024 NEXVO. All rights reserved.
        </p>
      </motion.div>
    </div>
  );
}
