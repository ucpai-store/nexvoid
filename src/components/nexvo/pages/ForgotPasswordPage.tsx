'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, Mail, Lock, ChevronRight, RefreshCw, CheckCircle2,
  ArrowLeft, Eye, EyeOff, Send,
} from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { useSiteStore } from '@/stores/site-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import LanguageSwitcher from '@/components/nexvo/shared/LanguageSwitcher';

type Step = 'email' | 'otp' | 'reset' | 'success';

export default function ForgotPasswordPage() {
  const { navigate } = useAppStore();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [resending, setResending] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Countdown timer
  const startCountdown = useCallback(() => {
    setCountdown(60);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    if (step === 'otp') {
      startCountdown();
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [step, startCountdown]);

  // Step 1: Send OTP to email
  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({ title: 'Error', description: 'Please enter your email address', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (data.success) {
        setStep('otp');
        toast({ title: 'Sent', description: 'OTP code has been sent to your email' });
      } else {
        toast({ title: 'Failed', description: data.error || 'Failed to send OTP', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error. Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      toast({ title: 'Error', description: 'Please enter the 6-digit OTP code', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp, purpose: 'forgot-password' }),
      });
      const data = await res.json();

      if (data.success) {
        setStep('reset');
        toast({ title: 'Verified!', description: 'Email verified successfully' });
      } else {
        setOtp('');
        toast({ title: 'Failed', description: data.error || 'Invalid OTP code', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error. Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Reset password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      toast({ title: 'Error', description: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Error', description: 'Passwords do not match', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp, newPassword }),
      });
      const data = await res.json();

      if (data.success) {
        setStep('success');
        toast({ title: 'Success!', description: 'Password changed successfully' });
      } else {
        toast({ title: 'Failed', description: data.error || 'Failed to change password', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error. Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const handleResendOTP = async () => {
    setResending(true);
    try {
      const res = await fetch('/api/auth/send-email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (data.success) {
        startCountdown();
        toast({ title: 'Sent', description: 'A new OTP code has been sent to your email' });
      } else {
        toast({ title: 'Failed', description: data.error || 'Failed to resend OTP', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error. Please try again.', variant: 'destructive' });
    } finally {
      setResending(false);
    }
  };

  const stepLabels: Record<Step, string> = {
    email: 'Enter Email',
    otp: 'Verify OTP',
    reset: 'New Password',
    success: 'Success',
  };

  const stepIndex: Record<Step, number> = {
    email: 0,
    otp: 1,
    reset: 2,
    success: 3,
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
            <h2 className="text-foreground text-lg font-bold mb-1">Forgot Password</h2>
            <p className="text-muted-foreground text-sm">
              Reset your password via email verification
            </p>
          </div>

          {/* Step Progress */}
          <div className="flex items-center gap-2 mb-6">
            {['email', 'otp', 'reset'].map((s, i) => (
              <div key={s} className="flex items-center flex-1">
                <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all ${
                  stepIndex[step] >= i
                    ? 'bg-gold-gradient text-[#070B14]'
                    : 'bg-white/5 text-muted-foreground'
                }`}>
                  {stepIndex[step] > i ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                </div>
                {i < 2 && (
                  <div className={`flex-1 h-0.5 mx-1 rounded-full transition-all ${
                    stepIndex[step] > i ? 'bg-[#D4AF37]' : 'bg-white/10'
                  }`} />
                )}
              </div>
            ))}
          </div>

          {/* ── Step 1: Enter Email ── */}
          {step === 'email' && (
            <form onSubmit={handleSendOTP} className="space-y-5">
              <div className="space-y-2">
                <Label className="text-foreground text-sm font-medium">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-11 sm:h-12 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:border-[#D4AF37]/50 focus:ring-[#D4AF37]/20"
                  />
                </div>
                <p className="text-muted-foreground/60 text-xs">
                  A verification code will be sent to your email
                </p>
              </div>

              <Button
                type="submit"
                disabled={loading || !email}
                className="w-full h-12 bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 transition-all glow-gold text-sm disabled:opacity-50"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-[#070B14]/30 border-t-[#070B14] rounded-full animate-spin" />
                    Sending...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Send className="w-4 h-4" />
                    Send OTP Code
                  </div>
                )}
              </Button>
            </form>
          )}

          {/* ── Step 2: Verify OTP ── */}
          {step === 'otp' && (
            <form onSubmit={handleVerifyOTP} className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Mail className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-foreground text-sm font-medium">Email</p>
                    <p className="text-muted-foreground text-xs">{email}</p>
                  </div>
                </div>

                <Label className="text-foreground text-sm font-medium">OTP Code</Label>
                <Input
                  type="text"
                  placeholder="6-digit OTP code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                  maxLength={6}
                  className="h-11 sm:h-12 bg-input/50 border-border/50 rounded-xl text-foreground text-center text-lg font-mono tracking-widest placeholder:text-muted-foreground/50 focus:border-[#D4AF37]/50 focus:ring-[#D4AF37]/20"
                />
              </div>

              <div className="text-center">
                {countdown > 0 ? (
                  <p className="text-muted-foreground text-sm">
                    Resend in <span className="text-[#D4AF37] font-medium">{countdown}s</span>
                  </p>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={handleResendOTP}
                    disabled={resending}
                    className="text-[#D4AF37] hover:text-[#F0D060] hover:bg-[#D4AF37]/10 rounded-xl"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${resending ? 'animate-spin' : ''}`} />
                    Resend Code
                  </Button>
                )}
              </div>

              <Button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full h-12 bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 transition-all glow-gold text-sm disabled:opacity-50"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-[#070B14]/30 border-t-[#070B14] rounded-full animate-spin" />
                    Verifying...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Verify
                  </div>
                )}
              </Button>
            </form>
          )}

          {/* ── Step 3: Reset Password ── */}
          {step === 'reset' && (
            <form onSubmit={handleResetPassword} className="space-y-5">
              <div className="space-y-2">
                <Label className="text-foreground text-sm font-medium">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Minimum 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="pl-10 pr-10 h-11 sm:h-12 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:border-[#D4AF37]/50 focus:ring-[#D4AF37]/20"
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

              <div className="space-y-2">
                <Label className="text-foreground text-sm font-medium">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Repeat new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10 pr-10 h-11 sm:h-12 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:border-[#D4AF37]/50 focus:ring-[#D4AF37]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-red-400 text-xs">Passwords do not match</p>
                )}
              </div>

              <Button
                type="submit"
                disabled={loading || !newPassword || newPassword !== confirmPassword || newPassword.length < 6}
                className="w-full h-12 bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 transition-all glow-gold text-sm disabled:opacity-50"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-[#070B14]/30 border-t-[#070B14] rounded-full animate-spin" />
                    Saving...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    Change Password
                  </div>
                )}
              </Button>
            </form>
          )}

          {/* ── Step 4: Success ── */}
          {step === 'success' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-4"
            >
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              </div>
              <h2 className="text-lg font-bold text-foreground mb-1">Password Changed Successfully!</h2>
              <p className="text-muted-foreground text-sm mb-4">
                Please log in with your new password
              </p>
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
