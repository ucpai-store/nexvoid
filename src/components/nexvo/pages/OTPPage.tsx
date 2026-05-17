'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Shield, Mail, ChevronRight, RefreshCw, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { useAuthStore } from '@/stores/auth-store';
import { useSiteStore } from '@/stores/site-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import LanguageSwitcher from '@/components/nexvo/shared/LanguageSwitcher';

function maskEmail(email: string): string {
  if (!email) return '(no email)';
  const [local, domain] = email.split('@');
  if (!domain) return `${local[0]}***`;
  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
}

function showFullEmail(email: string): string {
  return email || '(no email)';
}

type VerificationStatus = 'pending' | 'verifying' | 'verified';

export default function OTPPage() {
  const { navigate, pageData } = useAppStore();
  const { logout, user } = useAuthStore();

  const email = (pageData?.email as string) || user?.email || '';
  const fromRegister = (pageData?.fromRegister as boolean) || !user?.isVerified;
  const fromLogin = pageData?.fromLogin as boolean | undefined;

  const [emailOtp, setEmailOtp] = useState('');
  const [emailStatus, setEmailStatus] = useState<VerificationStatus>('pending');
  const [emailCountdown, setEmailCountdown] = useState(60);
  const [emailResending, setEmailResending] = useState(false);

  const emailIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Start countdown for email
  const startCountdown = useCallback(() => {
    setEmailCountdown(60);
    if (emailIntervalRef.current) clearInterval(emailIntervalRef.current);
    emailIntervalRef.current = setInterval(() => {
      setEmailCountdown((prev) => {
        if (prev <= 1) {
          if (emailIntervalRef.current) clearInterval(emailIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Initialize countdown timer on mount
  useEffect(() => {
    startCountdown();
    return () => {
      if (emailIntervalRef.current) clearInterval(emailIntervalRef.current);
    };
  }, [startCountdown]);

  // Auto-redirect when email verified
  useEffect(() => {
    if (emailStatus === 'verified') {
      if (fromRegister) {
        toast({ title: 'Verified!', description: 'Email verified successfully. Please log in.' });
        logout();
        const timer = setTimeout(() => navigate('login'), 1500);
        return () => clearTimeout(timer);
      } else if (fromLogin) {
        toast({ title: 'Verified!', description: 'Email verified successfully. Please log in.' });
        logout();
        const timer = setTimeout(() => navigate('login'), 1500);
        return () => clearTimeout(timer);
      } else {
        toast({ title: 'Success!', description: 'All verifications complete. Please log in.' });
        logout();
        const timer = setTimeout(() => navigate('login'), 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [emailStatus, fromRegister, fromLogin, navigate, logout]);

  const verifyEmailOtp = async (otp: string) => {
    if (otp.length !== 6) {
      toast({ title: 'Error', description: 'Please enter the 6-digit OTP code', variant: 'destructive' });
      return;
    }

    if (!email) {
      toast({ title: 'Error', description: 'Email address is missing. Please go back and try again.', variant: 'destructive' });
      return;
    }

    setEmailStatus('verifying');
    try {
      // Try dedicated email verify endpoint first
      const verifyRes = await fetch('/api/auth/verify-email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const data = await verifyRes.json();

      if (data.success) {
        setEmailStatus('verified');
        toast({
          title: 'Verified!',
          description: 'Email verified successfully!',
        });
      } else {
        setEmailStatus('pending');
        setEmailOtp('');
        console.log('[OTP-VERIFY] Failed:', data.error, 'email:', email);
        toast({ title: 'Verification Failed', description: data.error || 'Invalid OTP code. Please try again or click Resend Code.', variant: 'destructive' });
      }
    } catch (err) {
      setEmailStatus('pending');
      setEmailOtp('');
      console.error('[OTP-VERIFY] Network error:', err);
      toast({ title: 'Error', description: 'Network error. Please check your connection and try again.', variant: 'destructive' });
    }
  };

  const handleResendEmail = async () => {
    setEmailResending(true);
    try {
      const res = await fetch('/api/auth/send-email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (data.success) {
        startCountdown();
        setEmailOtp('');
        toast({
          title: 'Sent',
          description: 'A new OTP code has been sent to your email',
        });
      } else {
        toast({ title: 'Failed', description: data.error || 'Failed to resend OTP', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error. Please try again.', variant: 'destructive' });
    } finally {
      setEmailResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 relative overflow-hidden">
      {/* Language Switcher - Top Right */}
      <div className="absolute top-4 right-4 z-20">
        <LanguageSwitcher />
      </div>

      {/* Background */}
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
        className="w-full max-w-md relative z-10"
      >
        <div className="glass-strong rounded-3xl p-4 sm:p-6 lg:p-8 glow-gold">
          {/* Back */}
          <button
            onClick={() => navigate('login')}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back to Login</span>
          </button>

          {/* Logo & Heading */}
          <div className="text-center mb-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, type: 'spring', stiffness: 200 }}
              className="mb-4"
            >
              <div className="relative inline-block">
                <div className="absolute inset-0 blur-[25px] bg-[#D4AF37]/15 rounded-full scale-110" />
                <img
                  src={useSiteStore.getState().logoUrl}
                  alt="NEXVO"
                  className="relative h-20 w-auto object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).src = '/api/files/nexvo-logo.png'; }}
                />
              </div>
            </motion.div>
            <h2 className="text-foreground text-lg font-bold mb-1">Email Verification</h2>
            <p className="text-muted-foreground text-sm">
              {fromRegister
                ? 'A verification code has been sent to your email. Enter the 6-digit code below.'
                : fromLogin
                ? 'Your email is not yet verified. A new verification code has been sent to your email.'
                : 'Verify your email to activate your account'}
            </p>

          </div>

          {/* Verification Status */}
          <div className={`flex items-center gap-2 p-3 rounded-xl border mb-6 transition-all ${
            emailStatus === 'verified'
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : 'bg-white/5 border-white/10'
          }`}>
            <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${
              emailStatus === 'verified' ? 'text-emerald-400' : 'text-muted-foreground/30'
            }`} />
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground truncate">Email</p>
              <p className={`text-[10px] ${
                emailStatus === 'verified' ? 'text-emerald-400' : 'text-muted-foreground/50'
              }`}>
                {emailStatus === 'verified' ? 'Verified' : `Code sent to ${showFullEmail(email)}`}
              </p>
            </div>
          </div>

          {/* ── Email Verification ── */}
          {emailStatus !== 'verified' && (
            <div className="space-y-5">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Mail className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-foreground text-sm font-medium">Email</p>
                    <p className="text-muted-foreground text-xs">{showFullEmail(email)}</p>
                  </div>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    verifyEmailOtp(emailOtp);
                  }}
                  className="space-y-3"
                >
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      placeholder="6-digit OTP code"
                      value={emailOtp}
                      onChange={(e) => setEmailOtp(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                      maxLength={6}
                      className="flex-1 h-11 sm:h-12 bg-input/50 border-border/50 rounded-xl text-foreground text-center text-lg font-mono tracking-widest placeholder:text-muted-foreground/50 focus:border-[#D4AF37]/50 focus:ring-[#D4AF37]/20"
                    />
                    <Button
                      type="submit"
                      disabled={emailStatus === 'verifying' || emailOtp.length !== 6}
                      className="h-12 px-4 bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 transition-all text-sm disabled:opacity-50"
                    >
                      {emailStatus === 'verifying' ? (
                        <div className="w-4 h-4 border-2 border-[#070B14]/30 border-t-[#070B14] rounded-full animate-spin" />
                      ) : 'Verify'}
                    </Button>
                  </div>
                </form>

                <div className="text-center">
                  {emailCountdown > 0 ? (
                    <p className="text-muted-foreground text-sm">
                      Resend in <span className="text-[#D4AF37] font-medium">{emailCountdown}s</span>
                    </p>
                  ) : (
                    <Button
                      variant="ghost"
                      onClick={handleResendEmail}
                      disabled={emailResending}
                      className="text-[#D4AF37] hover:text-[#F0D060] hover:bg-[#D4AF37]/10 rounded-xl"
                    >
                      <RefreshCw className={`w-4 h-4 mr-2 ${emailResending ? 'animate-spin' : ''}`} />
                      Resend Code
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Verified - success state */}
          {emailStatus === 'verified' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-4"
            >
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              </div>
              <h2 className="text-lg font-bold text-foreground mb-1">Email Verified!</h2>
              <p className="text-muted-foreground text-sm mb-4">Your account is now active. Redirecting to login...</p>
              <Button
                onClick={() => navigate('login')}
                className="w-full h-12 bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 transition-all glow-gold text-sm"
              >
                <div className="flex items-center gap-2">
                  Go to Login
                  <ChevronRight className="w-4 h-4" />
                </div>
              </Button>
            </motion.div>
          )}
        </div>

        <p className="text-center text-muted-foreground/40 text-xs mt-6">
          &copy; 2024 NEXVO. All rights reserved.
        </p>
      </motion.div>
    </div>
  );
}
