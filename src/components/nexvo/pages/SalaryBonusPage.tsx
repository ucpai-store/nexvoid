'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Banknote, CheckCircle2, XCircle, TrendingUp,
  Calendar, AlertTriangle, RefreshCw, Clock, Award, Zap, Users, Infinity as InfinityIcon, Sparkles, Crown, Wallet
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { formatRupiah } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/lib/i18n';

interface EligibilityInfo {
  directRefs: number;
  activeRefDeposits: number;
  minDirectRefs: number;
  groupOmzet: number;
  salaryRate: number;
  maxWeeks: number;
  weeksReceived: number;
  weeksRemaining: number;
  estimatedSalary: number;
  isEligible: boolean;
  isActive: boolean;
  refProgress: number;
  isCompleted: boolean;
  requireActiveDeposit: boolean;
  userHasActiveDeposit: boolean;
  allRefsActive: boolean;
  meetsMinDirectRefs: boolean;
}

interface SalaryBonusEntry {
  id: string;
  weekNumber: number;
  year: number;
  weekOfTotal: number;
  amount: number;
  baseOmzet: number;
  salaryRate: number;
  activeRefDeposits: number;
  directRefs: number;
  groupOmzet: number;
  status: string;
  createdAt: string;
}

interface SalaryData {
  eligibility: EligibilityInfo;
  salaryBonuses: SalaryBonusEntry[];
  totalSalaryEarned: number;
  canClaim: boolean;
  alreadyClaimedThisWeek: boolean;
  currentWeek: number;
  currentYear: number;
}

export default function SalaryBonusPage() {
  const { token } = useAuthStore();
  const t = useT();
  const [data, setData] = useState<SalaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/salary-bonus', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error || t('common.error'));
      }
    } catch {
      setError(t('common.networkError'));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleClaim = async () => {
    if (!token || claiming) return;
    setClaiming(true);
    try {
      const res = await fetch('/api/salary-bonus', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        toast({
          title: t('common.success'),
          description: json.message || t('salary.claimSuccess'),
        });
        fetchData();
      } else {
        toast({
          title: t('common.error'),
          description: json.message || json.error || t('common.operationFailed'),
          variant: 'destructive',
        });
      }
    } catch {
      toast({ title: t('common.error'), description: t('common.networkError'), variant: 'destructive' });
    } finally {
      setClaiming(false);
    }
  };

  const retry = () => {
    setError(null);
    setLoading(true);
    fetchData();
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6">
        <div className="animate-pulse space-y-4">
          <div className="glass rounded-3xl p-4 sm:p-6 h-64" />
          <div className="glass rounded-2xl p-4 sm:p-6 h-32" />
          <div className="glass rounded-2xl p-4 sm:p-6 h-32" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6">
        <div className="glass glow-gold rounded-2xl p-5 sm:p-8 lg:p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-red-400" />
          </div>
          <h3 className="text-foreground font-semibold mb-1">{t('salary.loadFailed')}</h3>
          <p className="text-muted-foreground text-sm mb-6">{error}</p>
          <Button
            onClick={retry}
            className="bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90 glow-gold"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('salary.tryAgain')}
          </Button>
        </div>
      </div>
    );
  }

  const eligibility = data?.eligibility;
  const isEligible = eligibility?.isEligible ?? false;
  const isCompleted = eligibility?.isCompleted ?? false;
  const salaryRate = eligibility?.salaryRate ?? 1;
  const maxWeeks = eligibility?.maxWeeks ?? 0;
  const weeksReceived = eligibility?.weeksReceived ?? 0;
  const weeksRemaining = eligibility?.weeksRemaining ?? -1;
  const estimatedSalary = eligibility?.estimatedSalary ?? 0;
  const activeRefDeposits = eligibility?.activeRefDeposits ?? 0;
  const directRefs = eligibility?.directRefs ?? 0;
  const minDirectRefs = eligibility?.minDirectRefs ?? 10;
  const meetsMinDirectRefs = eligibility?.meetsMinDirectRefs ?? false;
  const groupOmzet = eligibility?.groupOmzet ?? 0;
  const userHasActiveDeposit = eligibility?.userHasActiveDeposit ?? false;
  const allRefsActive = eligibility?.allRefsActive ?? false;
  // ★ maxWeeks <= 0 = UNLIMITED (selamanya) ★
  const unlimited = !maxWeeks || maxWeeks <= 0;
  const maxWeeksLabel = unlimited ? 'selamanya' : `${maxWeeks} minggu`;
  const weeksRemainingLabel = unlimited ? 'selamanya' : `${weeksRemaining} minggu`;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6 space-y-4 sm:space-y-6 pb-4 sm:pb-6">
      {/* ═══════════ HERO SECTION — Premium Salary Banner ═══════════ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-3xl border border-primary/20"
      >
        {/* Background gradient + glow effects */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0f1c] via-[#1a1f2e] to-[#0a0f1c]" />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-primary/10" />
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-primary/20 blur-[100px]" />
        <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full bg-[#D4AF37]/15 blur-[100px]" />
        {/* Decorative grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(212,175,55,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,0.5) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        <div className="relative z-10 p-5 sm:p-8 lg:p-10">
          <div className="flex flex-col lg:flex-row items-center gap-6 lg:gap-8">
            {/* Logo + Crown */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="relative shrink-0"
            >
              <div className="absolute inset-0 bg-gold-gradient rounded-full blur-2xl opacity-40 animate-pulse" />
              <div className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-gradient-to-br from-[#1a1f2e] to-[#0a0f1c] border-2 border-primary/40 flex items-center justify-center overflow-hidden">
                <img
                  src="/salary-logo.png"
                  alt="NEXVO Salary Bonus"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                  }}
                />
                <Banknote className="w-14 h-14 sm:w-16 sm:h-16 text-primary hidden" />
              </div>
              {/* Crown badge on top */}
              <div className="absolute -top-2 -right-2 w-9 h-9 rounded-full bg-gold-gradient flex items-center justify-center shadow-lg border-2 border-[#0a0f1c]">
                <Crown className="w-4 h-4 text-[#0a0f1c]" />
              </div>
            </motion.div>

            {/* Title + Description */}
            <div className="flex-1 text-center lg:text-left">
              <div className="inline-flex items-center gap-1.5 mb-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/30">
                <Sparkles className="w-3 h-3 text-primary" />
                <span className="text-primary text-[10px] font-bold tracking-wider uppercase">NEXVO Premium Salary</span>
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-[#F5E6A3] to-[#D4AF37] mb-2">
                Bonus Gaji Mingguan
              </h1>
              <p className="text-white/70 text-sm sm:text-base mb-4 max-w-xl">
                Dapatkan{' '}
                <span className="text-primary font-bold">{salaryRate}%</span> dari omzet grup setiap minggu —{' '}
                <span className="text-primary font-bold inline-flex items-center gap-1">
                  SELAMANYA
                  <InfinityIcon className="w-4 h-4" />
                </span>{' '}
                tanpa batas
              </p>

              {/* Feature badges */}
              <div className="flex flex-wrap gap-2 justify-center lg:justify-start">
                <Badge className="bg-primary/15 text-primary border-primary/30 border text-[10px] font-bold px-3 py-1.5 backdrop-blur-sm">
                  <Clock className="w-3 h-3 mr-1.5" />Senin 00:00 WIB
                </Badge>
                <Badge className="bg-blue-400/15 text-blue-300 border-blue-400/30 border text-[10px] font-bold px-3 py-1.5 backdrop-blur-sm">
                  <Users className="w-3 h-3 mr-1.5" />Wajib Invite {minDirectRefs}
                </Badge>
                <Badge className="bg-emerald-400/15 text-emerald-300 border-emerald-400/30 border text-[10px] font-bold px-3 py-1.5 backdrop-blur-sm">
                  <CheckCircle2 className="w-3 h-3 mr-1.5" />Aktif Investasi
                </Badge>
                <Badge className="bg-amber-400/15 text-amber-300 border-amber-400/30 border text-[10px] font-bold px-3 py-1.5 backdrop-blur-sm">
                  <InfinityIcon className="w-3 h-3 mr-1.5" />{salaryRate}% / Minggu
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Completed Banner */}
      {isCompleted && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-4 sm:p-6 lg:p-8 text-center border border-emerald-500/20"
        >
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          </div>
          <h2 className="text-foreground text-lg font-bold mb-1">Program Gaji Selesai! 🎉</h2>
          <p className="text-muted-foreground text-sm">
            Anda telah menerima gaji mingguan selama {maxWeeksLabel}. Total: {formatRupiah(data?.totalSalaryEarned || 0)}
          </p>
        </motion.div>
      )}

      {/* ═══════════ Eligibility Card ═══════════ */}
      {!isCompleted && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-gold glow-gold rounded-2xl p-4 sm:p-6 lg:p-8 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-40 h-40 rounded-full bg-[#1E3A5F]/10 blur-3xl" />

          <div className="relative z-10">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gold-gradient flex items-center justify-center glow-gold animate-float">
                  <Banknote className="w-6 h-6 text-primary-foreground" />
                </div>
                <div>
                  <h2 className="text-foreground font-semibold">Status Kelayakan</h2>
                  <p className="text-muted-foreground text-xs">
                    Gaji {salaryRate}% dari omzet grup / minggu
                  </p>
                </div>
              </div>
              <Badge className={`${isEligible ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'} border text-xs font-bold px-3 py-1`}>
                {isEligible ? (
                  <><CheckCircle2 className="w-3 h-3 mr-1" />Layak</>
                ) : (
                  <><XCircle className="w-3 h-3 mr-1" />Belum Layak</>
                )}
              </Badge>
            </div>

            {/* ★ Forever Progress — since unlimited, show weeks received with infinity ★ */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-foreground text-sm font-medium flex items-center gap-1.5">
                  <InfinityIcon className="w-3.5 h-3.5 text-primary" />
                  Progress Mingguan (Selamanya)
                </span>
                <span className="text-muted-foreground text-xs font-bold">
                  {weeksReceived} minggu diterima{' '}
                  <span className="text-primary">∞ selamanya</span>
                </span>
              </div>
              <div className="w-full h-3 rounded-full bg-foreground/5 overflow-hidden relative">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 1.5, ease: 'easeOut' }}
                  className="h-full rounded-full bg-gradient-to-r from-primary/60 via-primary to-[#D4AF37] relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                </motion.div>
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-muted-foreground text-[10px] flex items-center gap-1">
                  <InfinityIcon className="w-3 h-3" /> Sisa: <span className="text-primary font-semibold">{weeksRemainingLabel}</span>
                </span>
                <span className="text-muted-foreground text-[10px]">
                  {weeksReceived > 0 ? `Total ${weeksReceived} minggu ✓` : 'Mulai perjalanan Anda'}
                </span>
              </div>
            </div>

            {/* ★ SYARAT 1: Wajib invite minimal 10 orang (dicek DULU) */}
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-foreground text-sm font-medium flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-primary" />
                    Syarat 1: Min. {minDirectRefs} Undangan Langsung
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {directRefs} / {minDirectRefs} orang
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-foreground/5 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min((directRefs / minDirectRefs) * 100, 100)}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className={`h-full rounded-full ${meetsMinDirectRefs ? 'bg-emerald-400' : 'bg-primary'}`}
                  />
                </div>
                {!meetsMinDirectRefs ? (
                  <p className="text-yellow-400 text-[10px] mt-1">
                    ⚠️ Syarat 1 belum terpenuhi: undang minimal {minDirectRefs} orang ({directRefs}/{minDirectRefs})
                  </p>
                ) : (
                  <p className="text-emerald-400 text-[10px] mt-1">
                    ✅ Syarat 1 terpenuhi: {directRefs} undangan langsung
                  </p>
                )}
              </div>

              {/* ★ SYARAT 2: Wajib aktif investasi (hanya dicek kalau syarat 1 sudah terpenuhi) */}
              {meetsMinDirectRefs && (
                <div className={`flex items-center gap-2 p-3 rounded-xl border ${
                  userHasActiveDeposit
                    ? 'bg-emerald-500/10 border-emerald-500/20'
                    : 'bg-red-500/10 border-red-500/20'
                }`}>
                  {userHasActiveDeposit ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                  )}
                  <span className={`text-xs font-medium ${userHasActiveDeposit ? 'text-emerald-400' : 'text-red-400'}`}>
                    {userHasActiveDeposit
                      ? `✅ Syarat 2 terpenuhi: Anda punya investasi aktif`
                      : `Syarat 2 belum terpenuhi: Wajib memiliki investasi aktif untuk klaim gaji`
                    }
                  </span>
                </div>
              )}

              {/* Estimated Salary Info - HANYA muncul kalau KEDUA syarat terpenuhi */}
              {meetsMinDirectRefs && userHasActiveDeposit ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Estimasi Gaji */}
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
                      <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                        <Zap className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-muted-foreground text-[10px]">Estimasi Gaji/Minggu</p>
                        <p className="text-emerald-400 font-bold text-sm truncate">{formatRupiah(estimatedSalary)}</p>
                      </div>
                    </div>
                    {/* Omzet Grup */}
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                      <div className="w-9 h-9 rounded-lg bg-blue-400/10 flex items-center justify-center shrink-0">
                        <TrendingUp className="w-4 h-4 text-blue-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-muted-foreground text-[10px]">Omzet Grup</p>
                        <p className="text-foreground font-semibold text-sm truncate">{formatRupiah(groupOmzet)}</p>
                      </div>
                    </div>
                    {/* Rate Gaji */}
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                      <div className="w-9 h-9 rounded-lg bg-amber-400/10 flex items-center justify-center shrink-0">
                        <InfinityIcon className="w-4 h-4 text-amber-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-muted-foreground text-[10px]">Rate Gaji (Selamanya)</p>
                        <p className="text-primary font-bold text-sm">{salaryRate}% / minggu ∞</p>
                      </div>
                    </div>
                  </div>
                </>
              ) : !meetsMinDirectRefs ? (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/10">
                  <Users className="w-4 h-4 text-yellow-400 shrink-0" />
                  <span className="text-yellow-400 text-xs font-medium">
                    Gaji belum tersedia. Selesaikan Syarat 1: undang minimal {minDirectRefs} orang dulu.
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/5 border border-red-500/10">
                  <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span className="text-red-400 text-xs font-medium">
                    Gaji belum tersedia. Selesaikan Syarat 2: wajib memiliki investasi aktif.
                  </span>
                </div>
              )}
            </div>

            {/* Claim Button / Status */}
            <div className="mt-6">
              {data?.alreadyClaimedThisWeek ? (
                <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span className="text-emerald-400 text-sm font-medium">Gaji minggu ini sudah dikreditkan otomatis</span>
                </div>
              ) : isEligible ? (
                <Button
                  onClick={handleClaim}
                  disabled={claiming}
                  className="w-full bg-gold-gradient text-primary-foreground font-bold rounded-xl hover:opacity-90 glow-gold h-12 text-sm"
                >
                  {claiming ? (
                    <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Memproses...</>
                  ) : (
                    <><Banknote className="w-4 h-4 mr-2" />Klaim Gaji Mingguan</>
                  )}
                </Button>
              ) : (
                <div className="space-y-2">
                  {/* Syarat 1 belum terpenuhi */}
                  {!meetsMinDirectRefs && (
                    <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                      <XCircle className="w-5 h-5 text-yellow-400" />
                      <span className="text-yellow-400 text-sm font-medium">
                        Syarat 1: Undang minimal {minDirectRefs} orang ({directRefs}/{minDirectRefs})
                      </span>
                    </div>
                  )}
                  {/* Syarat 1 OK, tapi Syarat 2 belum */}
                  {meetsMinDirectRefs && !userHasActiveDeposit && (
                    <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                      <XCircle className="w-5 h-5 text-red-400" />
                      <span className="text-red-400 text-sm font-medium">
                        Syarat 2: Wajib memiliki investasi aktif
                      </span>
                    </div>
                  )}
                  {/* Kedua syarat OK, tapi ada referral yang belum aktif investasi */}
                  {meetsMinDirectRefs && userHasActiveDeposit && !allRefsActive && (
                    <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                      <XCircle className="w-5 h-5 text-yellow-400" />
                      <span className="text-yellow-400 text-sm font-medium">
                        Semua undangan langsung (Level 1) wajib aktif investasi ({activeRefDeposits}/{directRefs} aktif)
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* ═══════════ Summary Stats — Only show when eligible or already received salary ═══════════ */}
      {(meetsMinDirectRefs && userHasActiveDeposit) || (data?.totalSalaryEarned || 0) > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="glass glow-gold rounded-2xl p-4 text-center relative overflow-hidden"
          >
            <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-emerald-400/10 blur-2xl" />
            <div className="w-10 h-10 rounded-xl bg-emerald-400/10 flex items-center justify-center mx-auto mb-2 relative">
              <Wallet className="w-5 h-5 text-emerald-400" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-emerald-400 relative">{formatRupiah(data?.totalSalaryEarned || 0)}</p>
            <p className="text-muted-foreground text-[10px] sm:text-xs relative">Total Gaji Diterima</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass glow-gold rounded-2xl p-4 text-center relative overflow-hidden"
          >
            <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-primary/10 blur-2xl" />
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2 relative">
              <InfinityIcon className="w-5 h-5 text-primary" />
            </div>
            <p className="text-foreground text-lg font-bold relative">
              {weeksReceived} <span className="text-primary text-sm">∞</span>
            </p>
            <p className="text-muted-foreground text-[10px] sm:text-xs relative">Minggu Diterima (Selamanya)</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="glass glow-gold rounded-2xl p-4 text-center relative overflow-hidden"
          >
            <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-amber-400/10 blur-2xl" />
            <div className="w-10 h-10 rounded-xl bg-amber-400/10 flex items-center justify-center mx-auto mb-2 relative">
              <Zap className="w-5 h-5 text-amber-400" />
            </div>
            <p className="text-foreground text-lg font-bold relative">{salaryRate}%</p>
            <p className="text-muted-foreground text-[10px] sm:text-xs relative">Rate / Minggu</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass glow-gold rounded-2xl p-4 text-center relative overflow-hidden"
          >
            <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-blue-400/10 blur-2xl" />
            <div className="w-10 h-10 rounded-xl bg-blue-400/10 flex items-center justify-center mx-auto mb-2 relative">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <p className="text-foreground text-lg font-bold relative">{activeRefDeposits}</p>
            <p className="text-muted-foreground text-[10px] sm:text-xs relative">Direct Invites</p>
          </motion.div>
        </div>
      ) : null}

      {/* ═══════════ Salary History ═══════════ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="glass rounded-2xl p-3 sm:p-5 lg:p-6"
      >
        <h3 className="text-foreground font-semibold text-sm mb-3 sm:mb-4 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" />
          Riwayat Gaji Mingguan
        </h3>

        {data?.salaryBonuses && data.salaryBonuses.length > 0 ? (
          <div className="space-y-3 max-h-96 overflow-y-auto scrollbar-thin pr-1">
            {data.salaryBonuses.map((bonus, i) => (
              <motion.div
                key={bonus.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-white/[0.03] to-transparent hover:from-primary/5 hover:to-transparent transition-colors border border-white/5"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0 border border-primary/20">
                  <Award className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-foreground text-sm font-medium">
                      Minggu {bonus.weekOfTotal}{unlimited ? ' ∞' : `/${maxWeeks}`}
                    </p>
                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 border text-[10px] px-1.5 py-0">
                      Lunas
                    </Badge>
                    <Badge className="bg-primary/10 text-primary border-primary/20 border text-[10px] px-1.5 py-0">
                      {bonus.salaryRate}%
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Omzet: {formatRupiah(bonus.baseOmzet)} | Direct Invites: {bonus.activeRefDeposits}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-emerald-400 text-sm font-bold">{formatRupiah(bonus.amount)}</p>
                  <p className="text-muted-foreground text-[10px]">
                    {new Date(bonus.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="w-14 h-14 rounded-2xl bg-primary/5 flex items-center justify-center mx-auto mb-3">
              <Calendar className="w-7 h-7 text-primary/30" />
            </div>
            <p className="text-muted-foreground text-sm">Belum ada riwayat gaji</p>
            <p className="text-muted-foreground text-[10px] mt-1">Gaji akan otomatis dikreditkan setiap Senin 00:00 WIB</p>
          </div>
        )}
      </motion.div>

      {/* ═══════════ How It Works — Premium Info Box ═══════════ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="relative overflow-hidden rounded-2xl border border-primary/20"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.04] via-transparent to-primary/[0.02]" />
        <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative z-10 p-3 sm:p-5 lg:p-6">
          <h3 className="text-foreground font-semibold text-sm mb-4 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gold-gradient flex items-center justify-center">
              <Crown className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            Cara Kerja Bonus Gaji
            <Badge className="bg-primary/10 text-primary border-primary/20 border text-[9px] font-bold px-2 py-0.5 ml-auto">
              <InfinityIcon className="w-2.5 h-2.5 mr-1" />SELAMANYA
            </Badge>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {[
              { num: '1', icon: Users, title: 'Syarat 1', text: `Wajib mengundang minimal ${minDirectRefs} orang (Level 1)`, color: 'text-blue-400', bg: 'bg-blue-400/10' },
              { num: '2', icon: Banknote, title: 'Syarat 2', text: 'Wajib memiliki investasi aktif + semua undangan L1 juga aktif', color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
              { num: '3', icon: Clock, title: 'Pembayaran', text: `Setelah kedua syarat terpenuhi, gaji ${salaryRate}% omzet grup dikreditkan setiap Senin 00:00 WIB`, color: 'text-primary', bg: 'bg-primary/10' },
              { num: '4', icon: InfinityIcon, title: 'Durasi', text: 'Gaji berlangsung SELAMANYA (tanpa batas) sejak syarat terpenuhi', color: 'text-amber-400', bg: 'bg-amber-400/10' },
            ].map((step) => (
              <div key={step.num} className="flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                <div className={`w-8 h-8 rounded-lg ${step.bg} flex items-center justify-center shrink-0`}>
                  <step.icon className={`w-4 h-4 ${step.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-foreground text-xs font-semibold flex items-center gap-1.5">
                    <span className={`text-[10px] ${step.color} font-bold`}>{step.num}.</span>
                    {step.title}
                  </p>
                  <p className="text-muted-foreground text-[11px] leading-relaxed mt-0.5">{step.text}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-primary/10 to-transparent border border-primary/20 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary shrink-0" />
            <span className="text-foreground text-xs">
              Profit & bonus gaji masuk <strong className="text-primary">saldo utama</strong> (bisa ditarik kapan saja)
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
