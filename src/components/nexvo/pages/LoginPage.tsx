'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Eye, EyeOff, Phone, Mail, Lock, ChevronRight,
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

type LoginMethod = 'phone' | 'email';

export default function LoginPage() {
  const { navigate } = useAppStore();
  const { setToken, setUser } = useAuthStore();
  const { logoUrl } = useSiteStore();
  const t = useT();

  // Login method toggle
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('phone');

  // Phone login fields
  const [countryCode, setCountryCode] = useState('62');
  const [phoneNumber, setPhoneNumber] = useState('');

  // Email login field
  const [emailAddress, setEmailAddress] = useState('');

  // Password
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const identifier = loginMethod === 'email' ? emailAddress : phoneNumber;
    if (!identifier || !password) {
      toast({ title: 'Error', description: t('common.allFieldsRequired'), variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const payload: Record<string, string> = { password };
      if (loginMethod === 'email') {
        payload.email = emailAddress.trim();
      } else {
        // Prepend country code to whatsapp number
        const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
        if (cleanNumber.length < 8) {
          toast({ title: 'Error', description: 'Nomor WhatsApp tidak valid (min. 8 digit)', variant: 'destructive' });
          setLoading(false);
          return;
        }
        payload.whatsapp = countryCode + cleanNumber;
      }

      const res = await fetch('/api/auth/login?t=' + Date.now(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        setToken(data.data.token);
        setUser(data.data.user);

        // Fetch full profile
        try {
          const profileRes = await fetch('/api/user/profile', {
            headers: { Authorization: `Bearer ${data.data.token}` },
          });
          const profileData = await profileRes.json();
          if (profileData.success) {
            setUser(profileData.data);
          }
        } catch {
          // Profile fetch failed, continue with login data
        }

        toast({ title: 'Success', description: t('auth.loginSuccess') });
        navigate('home');
      } else {
        // Check if email not verified - auto-redirect to OTP page
        if (data.code === 'EMAIL_NOT_VERIFIED') {
          toast({ title: 'Email Not Verified', description: 'A verification code has been sent to your email. Please verify to activate your account.' });
          navigate('otp', { email: data.email || '', fromLogin: true });
          return;
        }
        toast({ title: 'Failed', description: data.error || 'Login failed', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error. Please try again.', variant: 'destructive' });
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
        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-[#070B14]/75" />
        {/* Gradient overlay from bottom */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#070B14]/90 via-transparent to-[#070B14]/40" />
        {/* Side gradient */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#070B14]/60 via-transparent to-[#070B14]/60" />
        {/* Subtle gold glow accents */}
        <div className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full bg-[#D4AF37]/5 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-[#1E3A5F]/10 blur-[150px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="w-full max-w-md relative z-10 px-4 sm:px-0"
      >
        <div className="glass-strong rounded-3xl p-5 sm:p-8 glow-gold">
          {/* Logo & Heading */}
          <div className="text-center mb-6 sm:mb-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, type: 'spring', stiffness: 200 }}
              className="mb-5"
            >
              <div className="relative inline-block">
                {/* Gold glow behind logo */}
                <div className="absolute inset-0 blur-[25px] bg-[#D4AF37]/15 rounded-full scale-110" />
                <img
                  src={logoUrl}
                  alt="NEXVO"
                  className="relative h-14 sm:h-20 w-auto object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).src = '/api/files/nexvo-logo.png'; }}
                />
              </div>
            </motion.div>
            <p className="text-muted-foreground text-xs sm:text-sm">Sign in to access your NEXVO account</p>
          </div>

          {/* Login Method Toggle */}
          <div className="flex gap-2 mb-5 sm:mb-6">
            <button
              type="button"
              onClick={() => setLoginMethod('phone')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                loginMethod === 'phone'
                  ? 'bg-gold-gradient text-[#070B14] glow-gold shadow-lg shadow-[#D4AF37]/20'
                  : 'glass text-muted-foreground hover:text-foreground hover:bg-white/5'
              }`}
            >
              <Phone className="w-4 h-4" />
              Nomor HP
            </button>
            <button
              type="button"
              onClick={() => setLoginMethod('email')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                loginMethod === 'email'
                  ? 'bg-gold-gradient text-[#070B14] glow-gold shadow-lg shadow-[#D4AF37]/20'
                  : 'glass text-muted-foreground hover:text-foreground hover:bg-white/5'
              }`}
            >
              <Mail className="w-4 h-4" />
              Email
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4 sm:space-y-5">
            {/* Phone Number / Email Input */}
            <div className="space-y-2">
              <Label className="text-foreground text-sm font-medium">
                {loginMethod === 'phone' ? 'Nomor WhatsApp' : 'Alamat Email'}
              </Label>
              <AnimatePresence mode="wait">
                {loginMethod === 'email' ? (
                  <motion.div
                    key="email-input"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder="your@email.com"
                        value={emailAddress}
                        onChange={(e) => setEmailAddress(e.target.value)}
                        className="pl-10 h-12 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:border-[#D4AF37]/50 focus:ring-[#D4AF37]/20"
                      />
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="phone-input"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2 }}
                  >
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
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value.replace(/[^0-9]/g, ''))}
                          className="pl-10 h-12 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:border-[#D4AF37]/50 focus:ring-[#D4AF37]/20"
                        />
                      </div>
                    </div>
                    <p className="text-muted-foreground/60 text-[10px] sm:text-xs mt-1">
                      Format: +{countryCode} {phoneNumber || '8123456789'}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label className="text-foreground text-sm font-medium">{t('auth.password')}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('auth.enterPassword')}
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
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 transition-all glow-gold text-sm"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-[#070B14]/30 border-t-[#070B14] rounded-full animate-spin" />
                  {t('common.processing')}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {t('auth.login')}
                  <ChevronRight className="w-4 h-4" />
                </div>
              )}
            </Button>
          </form>

          {/* Links */}
          <div className="mt-5 sm:mt-6 text-center space-y-2 sm:space-y-3">
            <button
              onClick={() => navigate('forgot-password')}
              className="text-[#D4AF37]/70 hover:text-[#D4AF37] text-sm font-medium hover:underline transition-colors"
            >
              Forgot Password?
            </button>
            <p className="text-muted-foreground text-sm">
              {t('auth.noAccount')}{' '}
              <button
                onClick={() => navigate('register')}
                className="text-[#D4AF37] font-medium hover:underline"
              >
                {t('auth.registerNow')}
              </button>
            </p>
            <button
              onClick={() => navigate('admin-login')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[#D4AF37]/50 hover:text-[#D4AF37] hover:bg-[#D4AF37]/5 transition-all text-xs font-medium"
            >
              <Shield className="w-3.5 h-3.5" />
              {t('auth.adminPanel')}
            </button>
          </div>
        </div>

        {/* Decorative bottom text */}
        <p className="text-center text-muted-foreground/40 text-[10px] sm:text-xs mt-4 sm:mt-6">
          &copy; 2024 NEXVO. All rights reserved.
        </p>
      </motion.div>
    </div>
  );
}
