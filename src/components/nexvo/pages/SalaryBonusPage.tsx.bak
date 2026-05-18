'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Banknote, CheckCircle2, XCircle, TrendingUp,
  Calendar, AlertTriangle, RefreshCw, Clock, Award, Zap, Users
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
          <div className="glass rounded-2xl p-4 sm:p-6 h-48" />
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
            className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold"
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
  const salaryRate = eligibility?.salaryRate ?? 2.5;
  const maxWeeks = eligibility?.maxWeeks ?? 12;
  const weeksReceived = eligibility?.weeksReceived ?? 0;
  const weeksRemaining = eligibility?.weeksRemaining ?? 12;
  const estimatedSalary = eligibility?.estimatedSalary ?? 0;
  const activeRefDeposits = eligibility?.activeRefDeposits ?? 0;
  const directRefs = eligibility?.directRefs ?? 0;
  const minDirectRefs = eligibility?.minDirectRefs ?? 10;
  const meetsMinDirectRefs = eligibility?.meetsMinDirectRefs ?? false;
  const groupOmzet = eligibility?.groupOmzet ?? 0;
  const userHasActiveDeposit = eligibility?.userHasActiveDeposit ?? false;
  const allRefsActive = eligibility?.allRefsActive ?? false;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6 space-y-4 sm:space-y-6 pb-4 sm:pb-6">
      {/* Header */}
      <div>
        <h1 className="text-foreground text-xl font-bold flex items-center gap-2">
          <Banknote className="w-6 h-6 text-[#D4AF37]" />
          Bonus Gaji Mingguan
        </h1>
        <p className="text-muted-foreground text-sm">Dapatkan {salaryRate}% dari omzet grup setiap minggu selama {maxWeeks} minggu</p>
      </div>

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
            Anda telah menerima gaji mingguan selama {maxWeeks} minggu. Total: {formatRupiah(data?.totalSalaryEarned || 0)}
          </p>
        </motion.div>
      )}

      {/* Eligibility Card */}
      {!isCompleted && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-gold glow-gold rounded-2xl p-4 sm:p-6 lg:p-8 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-[#D4AF37]/5 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-40 h-40 rounded-full bg-[#1E3A5F]/10 blur-3xl" />

          <div className="relative z-10">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gold-gradient flex items-center justify-center glow-gold animate-float">
                  <Banknote className="w-6 h-6 text-[#070B14]" />
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

            {/* 12-Week Progress */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-foreground text-sm font-medium">Progress Mingguan</span>
                <span className="text-muted-foreground text-xs font-bold">
                  {weeksReceived} / {maxWeeks} Minggu
                </span>
              </div>
              <div className="w-full h-3 rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(weeksReceived / maxWeeks) * 100}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className="h-full rounded-full bg-gold-gradient"
                />
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-muted-foreground text-[10px]">Sisa: {weeksRemaining} minggu</span>
                <span className="text-muted-foreground text-[10px]">{Math.round((weeksReceived / maxWeeks) * 100)}%</span>
              </div>
            </div>

            {/* User Own Active Deposit Status */}
            {!userHasActiveDeposit && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <XCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-400 text-xs font-medium">
                  Anda harus memiliki deposit aktif (investasi) untuk mendapatkan bonus gaji
                </span>
              </div>
            )}

            {/* Direct Referrals Progress - ALL must have active deposits */}
            <div className="space-y-4">
              {/* Min Direct Refs Requirement */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-foreground text-sm font-medium flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-[#D4AF37]" />
                    Min. {minDirectRefs} Undangan Langsung
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {activeRefDeposits} / {minDirectRefs} (Wajib {minDirectRefs} orang)
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min((activeRefDeposits / minDirectRefs) * 100, 100)}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className={`h-full rounded-full ${meetsMinDirectRefs ? 'bg-emerald-400' : 'bg-[#D4AF37]'}`}
                  />
                </div>
                {!meetsMinDirectRefs && (
                  <p className="text-yellow-400 text-[10px] mt-1">
                    ⚠️ Minimal {minDirectRefs} referral dengan deposit aktif diperlukan ({activeRefDeposits}/{minDirectRefs})
                  </p>
                )}
                {meetsMinDirectRefs && (
                  <p className="text-emerald-400 text-[10px] mt-1">
                    ✅ Syarat {minDirectRefs} undangan langsung (Level 1) terpenuhi
                  </p>
                )}
              </div>

              {/* Estimated Salary Info */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03]">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#D4AF37]" />
                  <span className="text-muted-foreground text-xs">Estimasi Gaji/Minggu</span>
                </div>
                <span className="text-emerald-400 font-bold text-sm">
                  {formatRupiah(estimatedSalary)}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03]">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#D4AF37]" />
                  <span className="text-muted-foreground text-xs">Omzet Grup</span>
                </div>
                <span className="text-foreground font-semibold text-sm">
                  {formatRupiah(groupOmzet)}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03]">
                <div className="flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-[#D4AF37]" />
                  <span className="text-muted-foreground text-xs">Rate Gaji</span>
                </div>
                <span className="text-[#D4AF37] font-bold text-sm">
                  {salaryRate}% / minggu
                </span>
              </div>
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
                  className="w-full bg-gold-gradient text-[#070B14] font-bold rounded-xl hover:opacity-90 glow-gold h-12 text-sm"
                >
                  {claiming ? (
                    <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Memproses...</>
                  ) : (
                    <><Banknote className="w-4 h-4 mr-2" />Klaim Gaji Mingguan</>
                  )}
                </Button>
              ) : (
                <div className="space-y-2">
                  {!userHasActiveDeposit && (
                    <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                      <XCircle className="w-5 h-5 text-red-400" />
                      <span className="text-red-400 text-sm font-medium">
                        Anda harus memiliki deposit aktif
                      </span>
                    </div>
                  )}
                  {!meetsMinDirectRefs && userHasActiveDeposit && (
                    <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                      <XCircle className="w-5 h-5 text-yellow-400" />
                      <span className="text-yellow-400 text-sm font-medium">
                        Minimal {minDirectRefs} undangan langsung diperlukan ({activeRefDeposits}/{minDirectRefs} terpenuhi)
                      </span>
                    </div>
                  )}
                  {meetsMinDirectRefs && !allRefsActive && userHasActiveDeposit && (
                    <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                      <XCircle className="w-5 h-5 text-yellow-400" />
                      <span className="text-yellow-400 text-sm font-medium">
                        Semua undangan langsung (Level 1) harus memiliki investasi aktif ({activeRefDeposits}/{directRefs} aktif)
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass glow-gold rounded-2xl p-4 text-center"
        >
          <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center mx-auto mb-2">
            <TrendingUp className="w-5 h-5 text-[#D4AF37]" />
          </div>
          <p className="text-2xl font-bold text-emerald-400">{formatRupiah(data?.totalSalaryEarned || 0)}</p>
          <p className="text-muted-foreground text-xs">Total Gaji Diterima</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass glow-gold rounded-2xl p-4 text-center"
        >
          <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center mx-auto mb-2">
            <Clock className="w-5 h-5 text-[#D4AF37]" />
          </div>
          <p className="text-foreground text-lg font-bold">{weeksReceived} <span className="text-muted-foreground text-sm font-normal">/ {maxWeeks}</span></p>
          <p className="text-muted-foreground text-xs">Minggu Diterima</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass glow-gold rounded-2xl p-4 text-center"
        >
          <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center mx-auto mb-2">
            <Zap className="w-5 h-5 text-[#D4AF37]" />
          </div>
          <p className="text-foreground text-lg font-bold">{salaryRate}%</p>
          <p className="text-muted-foreground text-xs">Rate / Minggu</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass glow-gold rounded-2xl p-4 text-center"
        >
          <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center mx-auto mb-2">
            <Users className="w-5 h-5 text-[#D4AF37]" />
          </div>
          <p className="text-foreground text-lg font-bold">{activeRefDeposits}</p>
          <p className="text-muted-foreground text-xs">Undangan Langsung</p>
        </motion.div>
      </div>

      {/* Salary History */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="glass rounded-2xl p-3 sm:p-5 lg:p-6"
      >
        <h3 className="text-foreground font-semibold text-sm mb-3 sm:mb-4 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#D4AF37]" />
          Riwayat Gaji Mingguan
        </h3>

        {data?.salaryBonuses && data.salaryBonuses.length > 0 ? (
          <div className="space-y-3 max-h-96 overflow-y-auto scrollbar-thin">
            {data.salaryBonuses.map((bonus, i) => (
              <div key={bonus.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition-colors">
                <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center shrink-0">
                  <Award className="w-5 h-5 text-[#D4AF37]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-foreground text-sm font-medium">
                      Minggu {bonus.weekOfTotal}/{maxWeeks}
                    </p>
                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 border text-[10px] px-1.5 py-0">
                      Lunas
                    </Badge>
                    <Badge className="bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/20 border text-[10px] px-1.5 py-0">
                      {bonus.salaryRate}%
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Omzet: {formatRupiah(bonus.baseOmzet)} | Undangan Langsung: {bonus.activeRefDeposits}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-emerald-400 text-sm font-bold">{formatRupiah(bonus.amount)}</p>
                  <p className="text-muted-foreground text-[10px]">
                    {new Date(bonus.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Calendar className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">Belum ada riwayat gaji</p>
          </div>
        )}
      </motion.div>

      {/* Info Box */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass rounded-2xl p-3 sm:p-5 lg:p-6"
      >
        <h3 className="text-foreground font-semibold text-sm mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-[#D4AF37]" />
          Cara Kerja Bonus Gaji
        </h3>
        <div className="space-y-2 text-muted-foreground text-xs">
          <div className="flex items-start gap-2">
            <span className="text-[#D4AF37] font-bold">1.</span>
            <span>Wajib memiliki <strong className="text-foreground">deposit aktif (investasi)</strong> sendiri</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[#D4AF37] font-bold">2.</span>
            <span>Semua <strong className="text-foreground">referral langsung (Level 1)</strong> wajib memiliki deposit aktif</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[#D4AF37] font-bold">3.</span>
            <span>Sistem otomatis mendeteksi <strong className="text-foreground">{salaryRate}%</strong> dari omzet grup setiap <strong className="text-foreground\">Senin pukul 00:00 WIB</strong></span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[#D4AF37] font-bold">4.</span>
            <span>Gaji <strong className="text-foreground">{salaryRate}%</strong> dari total omzet grup (investasi Anda + seluruh downline) dikreditkan otomatis</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[#D4AF37] font-bold">5.</span>
            <span>Bonus gaji berlangsung selama <strong className="text-foreground">{maxWeeks} minggu</strong> (total {salaryRate * maxWeeks}% dari omzet)</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

