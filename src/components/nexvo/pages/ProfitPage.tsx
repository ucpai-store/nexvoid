'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, Timer, Coins, Award, Users, Gift, Package,
  CheckCircle2, Sparkles, RefreshCw, AlertTriangle, Clock,
  Zap, ArrowDownCircle, ArrowUpCircle, ShoppingBag, ChevronRight,
  CalendarDays, Wallet, BarChart3
} from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { useAuthStore } from '@/stores/auth-store';
import { formatRupiah } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// ── Types ──

interface ProfitStatus {
  wibTime: string;
  nextProfitTime: string | null;
  timeUntilNextProfit: {
    hours: number;
    minutes: number;
    seconds: number;
    totalMs: number;
  };
  lastProfitDate: string | null;
  todayProfitCredited: boolean;
  isMonday: boolean;
  activeInvestments: number;
  totalDailyProfit: number;
  totalInvestmentAmount: number;
  todayEarnings: {
    profit: number;
    matching: number;
    salary: number;
    sponsor: number;
    total: number;
  };
  schedule: {
    dailyProfit: string;
    matchingProfit: string;
    salaryBonus: string;
    sponsorBonus: string;
  };
}

interface ActiveInvestment {
  id: string;
  amount: number;
  dailyProfit: number;
  totalProfitEarned: number;
  status: string;
  startDate: string;
  endDate?: string;
  package: {
    name: string;
    profitRate: number;
    contractDays: number;
  };
}

interface ProfitHistoryEntry {
  id: string;
  type: string;
  level?: number | null;
  amount: number;
  description: string;
  createdAt: string;
  fromUser?: {
    userId: string;
    name: string;
  } | null;
}

// ── WIB Countdown Hook ──

function useWIBCountdown() {
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const calculate = () => {
      const now = new Date();
      // Convert to WIB (UTC+7)
      const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
      const wibNow = new Date(utcMs + 7 * 3600000);

      // Next midnight WIB
      const nextMidnight = new Date(wibNow);
      nextMidnight.setDate(nextMidnight.getDate() + 1);
      nextMidnight.setHours(0, 0, 0, 0);

      const diff = nextMidnight.getTime() - wibNow.getTime();
      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      setTimeLeft({
        hours: Math.floor(diff / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000),
      });
    };

    calculate();
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, []);

  return timeLeft;
}

// ── WIB Time Display Hook ──

function useWIBTime() {
  const [wibTime, setWibTime] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
      const wib = new Date(utcMs + 7 * 3600000);
      setWibTime(wib.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return wibTime;
}

// ── Helpers ──

const pad = (n: number) => String(n).padStart(2, '0');

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function getProfitTypeConfig(type: string) {
  switch (type) {
    case 'profit':
    case 'reward':
      return { label: 'Profit Harian', color: 'text-emerald-400', bg: 'bg-emerald-400/10', icon: TrendingUp };
    case 'matching':
      return { label: 'Matching Profit', color: 'text-purple-400', bg: 'bg-purple-400/10', icon: Users };
    case 'salary':
      return { label: 'Gaji Mingguan', color: 'text-blue-400', bg: 'bg-blue-400/10', icon: Award };
    case 'sponsor':
      return { label: 'Bonus Sponsor', color: 'text-[#D4AF37]', bg: 'bg-[#D4AF37]/10', icon: Gift };
    case 'level':
      return { label: 'Bonus Level', color: 'text-orange-400', bg: 'bg-orange-400/10', icon: Zap };
    case 'referral':
      return { label: 'Bonus Referral', color: 'text-pink-400', bg: 'bg-pink-400/10', icon: ShoppingBag };
    default:
      return { label: type, color: 'text-muted-foreground', bg: 'bg-white/5', icon: Coins };
  }
}

// ── Main Component ──

export default function ProfitPage() {
  const { navigate } = useAppStore();
  const { user, token, hydrateUser } = useAuthStore();
  const t = useT();

  const [profitStatus, setProfitStatus] = useState<ProfitStatus | null>(null);
  const [activeInvestments, setActiveInvestments] = useState<ActiveInvestment[]>([]);
  const [profitHistory, setProfitHistory] = useState<ProfitHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const countdown = useWIBCountdown();
  const wibTime = useWIBTime();

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const [profitRes, investRes, bonusRes] = await Promise.all([
        fetch('/api/user/profit-status', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/investments?status=active&limit=50', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/bonuses?limit=15', { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const profitData = await profitRes.json();
      const investData = await investRes.json();
      const bonusData = await bonusRes.json();

      if (profitData.success && profitData.data) {
        setProfitStatus(profitData.data);
      }

      if (investData.success && investData.data) {
        setActiveInvestments(investData.data);
      }

      if (bonusData.success && bonusData.data) {
        // Only include profit/reward types (daily investment profit), exclude referral/matching/salary
        const profitEntries = bonusData.data.filter((b: { type: string }) => b.type === 'profit' || b.type === 'reward');
        setProfitHistory(profitEntries);
      }
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, t]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    await hydrateUser();
  };

  const retry = () => {
    setError(null);
    setLoading(true);
    fetchData();
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  // ── Loading State ──
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6">
        <div className="animate-pulse space-y-4 sm:space-y-6">
          <div className="glass rounded-2xl p-6 h-40" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="glass rounded-2xl p-4 h-28" />
            ))}
          </div>
          <div className="glass rounded-2xl p-6 h-48" />
          <div className="glass rounded-2xl p-6 h-64" />
        </div>
      </div>
    );
  }

  // ── Error State ──
  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6">
        <div className="glass glow-gold rounded-2xl p-6 sm:p-8 lg:p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-red-400" />
          </div>
          <h3 className="text-foreground font-semibold mb-1">{t('dashboard.loadFailed')}</h3>
          <p className="text-muted-foreground text-sm mb-6">{error}</p>
          <Button
            onClick={retry}
            className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('dashboard.tryAgain')}
          </Button>
        </div>
      </div>
    );
  }

  const hasActiveInvestments = profitStatus && profitStatus.activeInvestments > 0;
  const todayEarnings = profitStatus?.todayEarnings;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6 space-y-4 sm:space-y-6"
    >
      {/* ── Page Header ── */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gold-gradient flex items-center justify-center">
            <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-[#070B14]" />
          </div>
          <div>
            <h1 className="text-foreground font-bold text-lg sm:text-xl">Profit Center</h1>
            <p className="text-muted-foreground text-xs sm:text-sm">Pantau profit & bonus harian Anda</p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          className="p-2.5 rounded-xl hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </motion.div>

      {/* ── Profit Schedule Card ── Countdown to 00:00 WIB */}
      <motion.div variants={itemVariants} className="glass glow-gold rounded-2xl p-3 sm:p-5 lg:p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-[#D4AF37]/3 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-emerald-500/3 blur-3xl" />

        <div className="relative z-10">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Timer className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-foreground font-semibold text-sm">Jadwal Profit</h3>
                <p className="text-muted-foreground text-[10px]">Profit harian otomatis jam 00:00 WIB</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="glass rounded-lg px-2 py-1 flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${profitStatus?.todayProfitCredited ? 'bg-emerald-400' : 'bg-yellow-400'} animate-pulse`} />
                <span className="text-[10px] text-muted-foreground">
                  WIB: {wibTime}
                </span>
              </div>
              {profitStatus?.todayProfitCredited && (
                <Badge className="bg-emerald-400/10 text-emerald-400 border-0 text-[9px] px-1.5 py-0">
                  <CheckCircle2 className="w-3 h-3 mr-0.5" />
                  Hari ini sudah
                </Badge>
              )}
            </div>
          </div>

          {/* Countdown */}
          <div className="flex items-center justify-center gap-2 sm:gap-3 mb-4">
            <div className="glass-strong rounded-xl p-2 sm:p-4 text-center flex-1 min-w-[64px] sm:max-w-[90px]">
              <p className="text-xl sm:text-3xl font-bold text-foreground font-mono">{pad(countdown.hours)}</p>
              <p className="text-muted-foreground text-[8px] sm:text-[9px] mt-0.5">JAM</p>
            </div>
            <span className="text-lg sm:text-xl font-bold text-[#D4AF37] animate-pulse">:</span>
            <div className="glass-strong rounded-xl p-2 sm:p-4 text-center flex-1 min-w-[64px] sm:max-w-[90px]">
              <p className="text-xl sm:text-3xl font-bold text-foreground font-mono">{pad(countdown.minutes)}</p>
              <p className="text-muted-foreground text-[8px] sm:text-[9px] mt-0.5">MENIT</p>
            </div>
            <span className="text-lg sm:text-xl font-bold text-[#D4AF37] animate-pulse">:</span>
            <div className="glass-strong rounded-xl p-2 sm:p-4 text-center flex-1 min-w-[64px] sm:max-w-[90px]">
              <p className="text-xl sm:text-3xl font-bold text-foreground font-mono">{pad(countdown.seconds)}</p>
              <p className="text-muted-foreground text-[8px] sm:text-[9px] mt-0.5">DETIK</p>
            </div>
          </div>

          {/* Estimasi profit */}
          {hasActiveInvestments && (
            <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-3 mb-3">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 text-xs font-medium">Estimasi Profit Berikutnya</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="text-muted-foreground text-[10px]">Profit Harian</p>
                  <p className="text-emerald-400 font-bold text-sm">+{formatRupiah(profitStatus?.totalDailyProfit || 0)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[10px]">Investasi Aktif</p>
                  <p className="text-foreground font-bold text-sm">{profitStatus?.activeInvestments || 0} paket</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[10px]">Total Modal</p>
                  <p className="text-foreground font-bold text-sm">{formatRupiah(profitStatus?.totalInvestmentAmount || 0)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Schedule info */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/[0.02] rounded-lg p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <Zap className="w-3 h-3 text-[#D4AF37]" />
                <span className="text-[10px] text-muted-foreground">Profit Harian</span>
              </div>
              <p className="text-foreground text-[10px] font-medium">00:00 WIB setiap hari</p>
            </div>
            <div className="bg-white/[0.02] rounded-lg p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <Users className="w-3 h-3 text-purple-400" />
                <span className="text-[10px] text-muted-foreground">Matching Profit</span>
              </div>
              <p className="text-foreground text-[10px] font-medium">Otomatis + profit harian</p>
            </div>
            <div className="bg-white/[0.02] rounded-lg p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <Award className="w-3 h-3 text-blue-400" />
                <span className="text-[10px] text-muted-foreground">Gaji Mingguan</span>
              </div>
              <p className="text-foreground text-[10px] font-medium">Senin 00:00 WIB</p>
            </div>
            <div className="bg-white/[0.02] rounded-lg p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <Gift className="w-3 h-3 text-[#D4AF37]" />
                <span className="text-[10px] text-muted-foreground">Bonus Sponsor</span>
              </div>
              <p className="text-foreground text-[10px] font-medium">Saat downline daftar</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Today's Earnings Breakdown ── */}
      <motion.div variants={itemVariants} className="glass rounded-2xl p-3 sm:p-5 lg:p-6">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center">
              <Coins className="w-4 h-4 text-[#D4AF37]" />
            </div>
            <div>
              <h3 className="text-foreground font-semibold text-sm">Pendapatan Hari Ini</h3>
              <p className="text-muted-foreground text-[10px]">Total bonus yang dikreditkan hari ini</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg sm:text-xl font-bold text-emerald-400">+{formatRupiah(todayEarnings?.total || 0)}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {[
            { label: 'Profit Harian', value: todayEarnings?.profit || 0, color: 'text-emerald-400', bg: 'bg-emerald-400/10', icon: TrendingUp },
            { label: 'Matching', value: todayEarnings?.matching || 0, color: 'text-purple-400', bg: 'bg-purple-400/10', icon: Users },
            { label: 'Gaji', value: todayEarnings?.salary || 0, color: 'text-blue-400', bg: 'bg-blue-400/10', icon: Award },
            { label: 'Sponsor', value: todayEarnings?.sponsor || 0, color: 'text-[#D4AF37]', bg: 'bg-[#D4AF37]/10', icon: Gift },
          ].map((item) => (
            <div key={item.label} className="bg-white/[0.02] rounded-xl p-3 text-center">
              <div className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${item.bg} mb-1.5`}>
                <item.icon className={`w-3.5 h-3.5 ${item.color}`} />
              </div>
              <p className={`font-bold text-xs ${item.color}`}>+{formatRupiah(item.value)}</p>
              <p className="text-muted-foreground text-[9px] mt-0.5">{item.label}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── Earnings Summary Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {[
          { icon: Wallet, label: 'Saldo Utama', value: user?.mainBalance || 0, color: 'text-[#D4AF37]', bg: 'bg-[#D4AF37]/10' },
          { icon: TrendingUp, label: t('dashboard.totalProfit'), value: user?.totalProfit || 0, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
          { icon: ArrowDownCircle, label: t('dashboard.totalDeposit'), value: user?.totalDeposit || 0, color: 'text-blue-400', bg: 'bg-blue-400/10' },
          { icon: ArrowUpCircle, label: t('dashboard.totalWithdraw'), value: user?.totalWithdraw || 0, color: 'text-orange-400', bg: 'bg-orange-400/10' },
        ].map((item) => (
          <motion.div
            key={item.label}
            variants={itemVariants}
            className="glass rounded-2xl p-3 sm:p-4 text-center hover:glow-gold transition-all"
          >
            <div className={`inline-flex items-center justify-center w-9 h-9 rounded-xl ${item.bg} mb-2`}>
              <item.icon className={`w-4 h-4 ${item.color}`} />
            </div>
            <p className={`font-bold text-sm ${item.color}`}>
              {formatRupiah(item.value)}
            </p>
            <p className="text-muted-foreground text-[10px] sm:text-xs mt-0.5">{item.label}</p>
          </motion.div>
        ))}
      </div>

      {/* ── Active Investments with Daily Profit ── */}
      <motion.div variants={itemVariants} className="glass rounded-2xl p-3 sm:p-5 lg:p-6">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center">
              <Package className="w-4 h-4 text-[#D4AF37]" />
            </div>
            <div>
              <h3 className="text-foreground font-semibold text-sm sm:text-base">Investasi Aktif</h3>
              <p className="text-muted-foreground text-[10px]">{activeInvestments.length} paket sedang berjalan</p>
            </div>
          </div>
          <button
            onClick={() => navigate('assets')}
            className="text-[#D4AF37] text-xs font-medium hover:underline flex items-center gap-1"
          >
            Lihat Semua
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        {activeInvestments.length > 0 ? (
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1 scrollbar-thin">
            {activeInvestments.map((inv, idx) => {
              const progressPct = inv.package?.contractDays
                ? Math.min(
                    100,
                    Math.round(
                      ((new Date().getTime() - new Date(inv.startDate).getTime()) /
                        (inv.package.contractDays * 24 * 60 * 60 * 1000)) *
                        100
                    )
                  )
                : 0;

              return (
                <motion.div
                  key={inv.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="p-3 sm:p-4 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition-colors border border-white/[0.03]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-400/10 flex items-center justify-center shrink-0">
                      <Package className="w-5 h-5 text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-foreground text-sm font-medium truncate">
                          {inv.package?.name || 'Paket Investasi'}
                        </p>
                        <Badge className="bg-emerald-400/10 text-emerald-400 border-0 text-[9px] px-1.5 py-0">
                          {t('dashboard.active')}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-emerald-400 text-xs font-bold flex items-center gap-0.5">
                          <TrendingUp className="w-3 h-3" />
                          +{formatRupiah(inv.dailyProfit)}{t('dashboard.perDay')}
                        </span>
                        <span className="text-muted-foreground/50 text-[10px]">•</span>
                        <span className="text-muted-foreground text-[10px]">
                          Profit: {formatRupiah(inv.totalProfitEarned || 0)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-foreground text-sm font-semibold">{formatRupiah(inv.amount)}</p>
                      <p className="text-muted-foreground text-[10px]">
                        {inv.package?.profitRate}% • {inv.package?.contractDays} hari
                      </p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {inv.package?.contractDays && (
                    <div className="mt-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] text-muted-foreground">Progress Kontrak</span>
                        <span className="text-[9px] text-muted-foreground">{progressPct}%</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${progressPct}%` }}
                          transition={{ duration: 1, ease: 'easeOut', delay: idx * 0.1 }}
                          className="h-full rounded-full bg-gold-gradient"
                        />
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <Package className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm mb-1">Belum ada investasi aktif</p>
            <p className="text-muted-foreground/60 text-xs mb-4">Mulai investasi untuk mendapatkan profit harian</p>
            <Button
              onClick={() => navigate('paket')}
              className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold text-xs"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Mulai Investasi
            </Button>
          </div>
        )}
      </motion.div>

      {/* ── Profit History ── */}
      <motion.div variants={itemVariants} className="glass rounded-2xl p-3 sm:p-5 lg:p-6">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-foreground font-semibold text-sm sm:text-base">Riwayat Profit & Bonus</h3>
              <p className="text-muted-foreground text-[10px]">Semua profit dan bonus yang diterima</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('history')}
            className="text-[#D4AF37] text-xs hover:text-[#F0D060] hover:bg-[#D4AF37]/10 rounded-xl"
          >
            {t('dashboard.viewAll')}
            <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        </div>

        {profitHistory.length > 0 ? (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1 scrollbar-thin">
            {profitHistory.map((entry, idx) => {
              const typeCfg = getProfitTypeConfig(entry.type);
              const Icon = typeCfg.icon;
              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition-colors"
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${typeCfg.bg}`}>
                    <Icon className={`w-4 h-4 ${typeCfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-foreground text-sm font-medium">{typeCfg.label}</p>
                      {entry.level && (
                        <Badge className="bg-white/5 text-muted-foreground border-0 text-[8px] px-1 py-0">
                          L{entry.level}
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground text-xs truncate">
                      {entry.description || (entry.fromUser ? `Dari ${entry.fromUser.name}` : '-')}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <CalendarDays className="w-2.5 h-2.5 text-muted-foreground/40" />
                      <p className="text-muted-foreground/50 text-[10px]">
                        {formatDate(entry.createdAt)} • {formatTime(entry.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${typeCfg.color}`}>
                      +{formatRupiah(entry.amount)}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <Clock className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm mb-1">Belum ada riwayat profit</p>
            <p className="text-muted-foreground/60 text-xs">Profit & bonus akan muncul setelah investasi aktif</p>
          </div>
        )}
      </motion.div>

      {/* ── Quick Actions ── */}
      <div className="grid grid-cols-2 gap-4">
        <Button
          onClick={() => navigate('paket')}
          className="h-14 bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 transition-all glow-gold-strong text-sm"
        >
          <Sparkles className="w-5 h-5 mr-2" />
          Investasi Baru
        </Button>
        <Button
          onClick={() => navigate('withdraw')}
          className="h-14 bg-card-gradient border border-[#D4AF37]/20 text-foreground font-semibold rounded-xl hover:bg-white/5 hover:border-[#D4AF37]/40 transition-all text-sm"
        >
          <ArrowUpCircle className="w-5 h-5 mr-2 text-[#D4AF37]" />
          {t('dashboard.withdrawBtn')}
        </Button>
      </div>

      {/* ── Footer Note ── */}
      <motion.div variants={itemVariants} className="text-center pb-4">
        <p className="text-muted-foreground/50 text-xs">
          Profit dikreditkan otomatis setiap hari jam 00:00 WIB
        </p>
      </motion.div>
    </motion.div>
  );
}
