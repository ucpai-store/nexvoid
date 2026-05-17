'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  GitCompare, TrendingUp, Users,
  AlertTriangle, RefreshCw, Award, Layers, DollarSign,
  Info, Zap
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { formatRupiah } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/lib/i18n';

interface LevelInfo {
  level: number;
  rate: number;
  profitOmzet: number;
  memberCount: number;
  amount: number;
  isDisconnected?: boolean;
}

interface MatchingInfo {
  totalDownlineProfit: number;
  totalDownlineMembers: number;
  potentialBonus: number;
  totalMatchingEarned: number;
  maxMatchingLevel: number;
  levels: LevelInfo[];
  levelMembers: Array<{ level: number; count: number }>;
}

interface MatchingConfig {
  level1: number;
  level2: number;
  level3: number;
  level4: number;
  level5: number;
  isActive: boolean;
}

interface MatchingHistoryEntry {
  id: string;
  profitOmzet: number;
  level: number;
  rate: number;
  amount: number;
  status: string;
  createdAt: string;
}

interface MatchingData {
  matchingInfo: MatchingInfo;
  config: MatchingConfig;
  history: MatchingHistoryEntry[];
  totals: {
    totalAmount: number;
    totalProfitOmzet: number;
    totalRecords: number;
  };
}

export default function MatchingBonusPage() {
  const { token } = useAuthStore();
  const t = useT();
  const [data, setData] = useState<MatchingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/matching-bonus', {
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
      const res = await fetch('/api/matching-bonus', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        toast({ title: t('common.success'), description: json.message || t('matching.claimSuccess') });
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
          <h3 className="text-foreground font-semibold mb-1">{t('matching.loadFailed')}</h3>
          <p className="text-muted-foreground text-sm mb-6">{error}</p>
          <Button
            onClick={retry}
            className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('matching.tryAgain')}
          </Button>
        </div>
      </div>
    );
  }

  const info = data?.matchingInfo;
  const hasPotential = (info?.potentialBonus ?? 0) > 0;
  const maxLevel = info?.maxMatchingLevel ?? 5;

  const levelColors = [
    'text-[#D4AF37]',
    'text-blue-400',
    'text-emerald-400',
    'text-purple-400',
    'text-rose-400',
  ];
  const levelBgs = [
    'bg-[#D4AF37]/10',
    'bg-blue-400/10',
    'bg-emerald-400/10',
    'bg-purple-400/10',
    'bg-rose-400/10',
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6 space-y-4 sm:space-y-6 pb-4 sm:pb-6">
      {/* Header */}
      <div>
        <h1 className="text-foreground text-xl font-bold flex items-center gap-2">
          <GitCompare className="w-6 h-6 text-[#D4AF37]" />
          Bonus Matching Profit
        </h1>
        <p className="text-muted-foreground text-sm">Dapatkan bonus dari profit downline Anda hingga 5 level</p>
      </div>

      {/* Matching Profit Overview */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-gold glow-gold rounded-2xl p-4 sm:p-6 lg:p-8 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-[#D4AF37]/5 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-40 h-40 rounded-full bg-[#1E3A5F]/10 blur-3xl" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gold-gradient flex items-center justify-center glow-gold animate-float">
              <DollarSign className="w-6 h-6 text-[#070B14]" />
            </div>
            <div>
              <h2 className="text-foreground font-semibold">Profit Matching Overview</h2>
              <p className="text-muted-foreground text-xs">Bonus otomatis dikreditkan saat downline mendapat profit</p>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Total Downline Profit */}
            <div className="rounded-xl p-4 border border-[#D4AF37]/20 bg-[#D4AF37]/5">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-[#D4AF37]" />
                <span className="text-sm font-medium text-[#D4AF37]">
                  Profit Downline
                </span>
              </div>
              <p className="text-foreground text-lg font-bold">{formatRupiah(info?.totalDownlineProfit ?? 0)}</p>
            </div>

            {/* Total Downline Members */}
            <div className="rounded-xl p-4 border border-border bg-white/[0.02]">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-foreground/50" />
                <span className="text-sm font-medium text-foreground/70">
                  Total Downline
                </span>
              </div>
              <p className="text-foreground text-lg font-bold">{info?.totalDownlineMembers ?? 0} <span className="text-sm text-muted-foreground font-normal">member</span></p>
            </div>
          </div>

          {/* Potential Bonus */}
          <div className="mt-4 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 flex items-center justify-between">
            <span className="text-muted-foreground text-sm">Potensi Bonus Matching</span>
            <span className="text-emerald-400 text-lg font-bold">{formatRupiah(info?.potentialBonus ?? 0)}</span>
          </div>

          {/* Auto-credit notice */}
          <div className="mt-3 p-3 rounded-xl bg-blue-500/5 border border-blue-500/10">
            <div className="flex items-start gap-2">
              <Zap className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-blue-400 text-xs font-semibold">Otomatis Dikreditkan</p>
                <p className="text-muted-foreground text-[11px]">Matching bonus otomatis masuk saat downline Anda mendapat profit harian. Tidak perlu klaim manual.</p>
              </div>
            </div>
          </div>

          {/* Claim Button (for any unmatched profit) */}
          <div className="mt-4">
            {hasPotential ? (
              <Button
                onClick={handleClaim}
                disabled={claiming}
                className="w-full bg-gold-gradient text-[#070B14] font-bold rounded-xl hover:opacity-90 glow-gold h-12 text-sm"
              >
                {claiming ? (
                  <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Memproses...</>
                ) : (
                  <><DollarSign className="w-4 h-4 mr-2" />Klaim Matching Profit</>
                )}
              </Button>
            ) : (
              <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                <span className="text-yellow-400 text-sm font-medium">Belum ada matching profit baru</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Level Rates with Level 6 Disconnect */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="glass rounded-2xl p-3 sm:p-5 lg:p-6"
      >
        <h3 className="text-foreground font-semibold text-sm mb-3 sm:mb-4 flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#D4AF37]" />
          Level Matching Profit
        </h3>

        <div className="space-y-3">
          {info?.levels?.map((lvl, i) => {
            return (
              <div key={lvl.level} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02]">
                <div className={`w-9 h-9 rounded-xl ${levelBgs[i]} flex items-center justify-center shrink-0`}>
                  <Award className={`w-4 h-4 ${levelColors[i]}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-foreground text-sm font-medium">
                      Level {lvl.level}
                    </p>
                    <Badge className={`${levelBgs[i]} ${levelColors[i]} border-0 text-xs font-bold`}>
                      {lvl.rate}%
                    </Badge>
                    <span className="text-muted-foreground text-[10px]">
                      {lvl.memberCount} member
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Profit Downline: {formatRupiah(lvl.profitOmzet)} × {lvl.rate}% = <span className={levelColors[i]}>{formatRupiah(lvl.amount)}</span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold ${lvl.amount > 0 ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                    {formatRupiah(lvl.amount)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass glow-gold rounded-2xl p-4 flex items-center gap-4"
        >
          <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5 text-[#D4AF37]" />
          </div>
          <div>
            <p className="text-2xl font-bold text-emerald-400">{formatRupiah(data?.totals?.totalAmount ?? info?.totalMatchingEarned ?? 0)}</p>
            <p className="text-muted-foreground text-xs">Total Matching Diterima</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="glass rounded-2xl p-4 flex items-center gap-4"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
            <DollarSign className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{formatRupiah(data?.totals?.totalProfitOmzet ?? 0)}</p>
            <p className="text-muted-foreground text-xs">Total Profit Downline</p>
          </div>
        </motion.div>
      </div>

      {/* Matching History */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="glass rounded-2xl p-3 sm:p-5 lg:p-6"
      >
        <h3 className="text-foreground font-semibold text-sm mb-3 sm:mb-4 flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-[#D4AF37]" />
          Riwayat Matching Profit
        </h3>

        {data?.history && data.history.length > 0 ? (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {data.history.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition-colors">
                <div className={`w-10 h-10 rounded-xl ${levelBgs[entry.level - 1] || 'bg-[#D4AF37]/10'} flex items-center justify-center shrink-0`}>
                  <Award className={`w-5 h-5 ${levelColors[entry.level - 1] || 'text-[#D4AF37]'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-foreground text-sm font-medium">
                      Level {entry.level}
                    </p>
                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 border text-[10px] px-1.5 py-0">
                      {entry.rate}%
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Profit: {formatRupiah(entry.profitOmzet)} × {entry.rate}%
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-emerald-400 text-sm font-bold">{formatRupiah(entry.amount)}</p>
                  <p className="text-muted-foreground text-[10px]">
                    {new Date(entry.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <GitCompare className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">Belum ada riwayat matching profit</p>
          </div>
        )}
      </motion.div>

      {/* Info Box - How Matching Works */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass rounded-2xl p-3 sm:p-5 lg:p-6"
      >
        <h3 className="text-foreground font-semibold text-sm mb-3 flex items-center gap-2">
          <Info className="w-4 h-4 text-[#D4AF37]" />
          Cara Kerja Matching Profit
        </h3>
        <div className="space-y-2 text-muted-foreground text-xs">
          <div className="flex items-start gap-2">
            <span className="text-[#D4AF37] font-bold">1.</span>
            <span>Ketika downline Anda mendapat <strong className="text-foreground">profit harian</strong>, Anda otomatis mendapat matching bonus</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[#D4AF37] font-bold">2.</span>
            <span>Persentase matching berdasarkan level: <strong className="text-foreground">L1: 5%, L2: 4%, L3: 3%, L4: 2%, L5: 1%</strong></span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[#D4AF37] font-bold">3.</span>
            <span>Bonus matching <strong className="text-foreground">otomatis dikreditkan</strong> setiap kali profit harian didistribusikan (00:00 WIB)</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[#D4AF37] font-bold">4.</span>
            <span>Sistem ini <strong className="text-foreground">bukan binary</strong> — tidak ada kaki kiri/kanan, matching berdasarkan total profit downline</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
