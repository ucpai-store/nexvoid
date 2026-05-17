'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Eye, EyeOff, ChevronRight, ArrowLeft, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/lib/i18n';

function getPasswordStrength(password: string, t: (key: string) => string): { level: number; label: string; color: string } {
  if (!password) return { level: 0, label: '', color: '' };
  
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { level: 1, label: t('auth.strengthWeak'), color: 'bg-red-500' };
  if (score <= 2) return { level: 2, label: t('auth.strengthFair'), color: 'bg-orange-500' };
  if (score <= 3) return { level: 3, label: t('auth.strengthGood'), color: 'bg-yellow-500' };
  if (score <= 4) return { level: 4, label: t('auth.strengthStrong'), color: 'bg-emerald-500' };
  return { level: 5, label: t('auth.strengthVeryStrong'), color: 'bg-emerald-400' };
}

export default function ResetPasswordPage() {
  const { navigate, pageData } = useAppStore();
  const t = useT();

  const resetToken = (pageData?.resetToken as string) || '';
  const email = (pageData?.email as string) || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const strength = getPasswordStrength(newPassword, t);
  const passwordsMatch = newPassword && confirmPassword && newPassword === confirmPassword;
  const passwordsMismatch = confirmPassword && newPassword !== confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!resetToken) {
      toast({ title: t('common.error'), description: t('auth.invalidResetSession'), variant: 'destructive' });
      navigate('forgot-password');
      return;
    }

    if (newPassword.length < 6) {
      toast({ title: t('common.error'), description: t('auth.minChars'), variant: 'destructive' });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({ title: t('common.error'), description: t('auth.passwordMismatch'), variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetToken, newPassword }),
      });
      const data = await res.json();

      if (data.success) {
        toast({ title: t('common.success'), description: t('auth.passwordResetSuccess') });
        navigate('login');
      } else {
        toast({ title: t('common.error'), description: data.error || t('auth.failedToResetPassword'), variant: 'destructive' });
        // If token expired/invalid, redirect to forgot-password
        if (data.error?.toLowerCase().includes('expired') || data.error?.toLowerCase().includes('invalid')) {
          setTimeout(() => navigate('forgot-password'), 2000);
        }
      }
    } catch {
      toast({ title: t('common.error'), description: t('common.networkError'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // If no reset token, redirect immediately
  if (!resetToken) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-nexvo-gradient">
          <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-[#D4AF37]/5 blur-[120px]" />
          <div className="absolute bottom-20 right-10 w-96 h-96 rounded-full bg-[#1E3A5F]/10 blur-[150px]" />
        </div>
        <div className="relative z-10 text-center">
          <div className="glass-strong rounded-3xl p-8 glow-gold max-w-md">
            <h2 className="text-foreground text-xl font-bold mb-2">{t('auth.invalidResetLink')}</h2>
            <p className="text-muted-foreground text-sm mb-6">{t('auth.resetLinkExpired')}</p>
            <Button
              onClick={() => navigate('forgot-password')}
              className="h-12 bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 transition-all glow-gold text-sm"
            >
              {t('auth.requestNewCode')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-nexvo-gradient">
        <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-[#D4AF37]/5 blur-[120px]" />
        <div className="absolute bottom-20 right-10 w-96 h-96 rounded-full bg-[#1E3A5F]/10 blur-[150px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full border border-[#D4AF37]/5" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="w-full max-w-md relative z-10"
      >
        <div className="glass-strong rounded-3xl p-6 sm:p-8 glow-gold">
          {/* Back */}
          <button
            onClick={() => navigate('forgot-password')}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">{t('common.back')}</span>
          </button>

          {/* Logo & Heading */}
          <div className="text-center mb-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, type: 'spring', stiffness: 200 }}
              className="mb-5"
            >
              <div className="relative inline-block">
                <div className="absolute inset-0 blur-[25px] bg-[#D4AF37]/15 rounded-full scale-110" />
                <div className="relative w-16 h-16 rounded-2xl bg-[#D4AF37]/10 flex items-center justify-center mx-auto">
                  <ShieldCheck className="w-8 h-8 text-[#D4AF37]" />
                </div>
              </div>
            </motion.div>
            <h1 className="text-foreground text-xl font-bold mb-1">{t('auth.resetPassword')}</h1>
            <p className="text-muted-foreground text-sm">
              {t('auth.resetPasswordSubtitle')}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* New Password */}
            <div className="space-y-2">
              <Label className="text-foreground text-sm font-medium">{t('auth.newPassword')}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder={t('auth.enterPassword')}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pl-10 pr-10 h-12 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:border-[#D4AF37]/50 focus:ring-[#D4AF37]/20"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Password Strength Indicator */}
              {newPassword && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-2"
                >
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <div
                        key={level}
                        className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                          level <= strength.level ? strength.color : 'bg-white/10'
                        }`}
                      />
                    ))}
                  </div>
                  <p className={`text-xs font-medium ${
                    strength.level <= 1 ? 'text-red-400' :
                    strength.level <= 2 ? 'text-orange-400' :
                    strength.level <= 3 ? 'text-yellow-400' :
                    'text-emerald-400'
                  }`}>
                    {strength.label}
                  </p>
                </motion.div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label className="text-foreground text-sm font-medium">{t('auth.confirmPassword')}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder={t('auth.confirmNewPasswordPlaceholder')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`pl-10 pr-10 h-12 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:border-[#D4AF37]/50 focus:ring-[#D4AF37]/20 ${
                    passwordsMismatch ? 'border-red-500/50 focus:border-red-500/50 focus:ring-red-500/20' : ''
                  } ${passwordsMatch ? 'border-emerald-500/50 focus:border-emerald-500/50 focus:ring-emerald-500/20' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {/* Match indicator */}
              {confirmPassword && (
                <div className="flex items-center gap-1.5">
                  {passwordsMatch ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-xs text-emerald-400">{t('auth.passwordsMatch')}</span>
                    </>
                  ) : passwordsMismatch ? (
                    <span className="text-xs text-red-400">{t('auth.passwordMismatch')}</span>
                  ) : null}
                </div>
              )}
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={loading || !newPassword || !confirmPassword || passwordsMismatch || newPassword.length < 6}
              className="w-full h-12 bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 transition-all glow-gold text-sm"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-[#070B14]/30 border-t-[#070B14] rounded-full animate-spin" />
                  {t('auth.resetting')}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {t('auth.resetPassword')}
                  <ChevronRight className="w-4 h-4" />
                </div>
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-muted-foreground/40 text-xs mt-6">
          &copy; {new Date().getFullYear()} NEXVO. All rights reserved.
        </p>
      </motion.div>
    </div>
  );
}
