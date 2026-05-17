'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Wallet, TrendingUp, ArrowDownCircle, ArrowUpCircle,
  Crown, Shield, Clock, ChevronRight, RefreshCw,
  ShoppingBag, Award, Zap, AlertTriangle, Gift, Package, Coins,
  Timer, CheckCircle2, Sparkles, Users
} from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { useAuthStore } from '@/stores/auth-store';
import { formatRupiah, maskWhatsApp } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Transaction {
  id: string;
  type: string;
  amount: number;
  status: string;
  description: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

interface ActiveAsset {
  id: string;
  type: 'product' | 'investment';
  name: string;
  amount: number;
  dailyProfit?: number;
  totalProfitEarned?: number;
  profitRate?: number;
  duration?: number;
  contractDays?: number;
  status: string;
  startDate: string;
  endDate?: string;
}

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

const levelConfig: Record<string, { color: string; bg: string; border: string }> = {
  Bronze: { color: 'text-amber-600', bg: 'bg-amber-600/10', border: 'border-amber-600/20' },
  Silver: { color: 'text-gray-300', bg: 'bg-gray-300/10', border: 'border-gray-300/20' },
  Gold: { color: 'text-[#D4AF37]', bg: 'bg-[#D4AF37]/10', border: 'border-[#D4AF37]/20' },
  Platinum: { color: 'text-cyan-400', bg: 'bg-cyan-400/10', border: 'border-cyan-400/20' },
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getStatusConfig(status: string, t: (key: string) => string) {
  switch (status) {
    case 'success':
    case 'approved':
    case 'active':
      return { label: t('dashboard.success'), color: 'text-emerald-400', bg: 'bg-emerald-400/10' };
    case 'completed':
      return { label: t('dashboard.completed'), color: 'text-blue-400', bg: 'bg-blue-400/10' };
    case 'pending':
      return { label: t('dashboard.pending'), color: 'text-yellow-400', bg: 'bg-yellow-400/10' };
    case 'failed':
    case 'rejected':
      return { label: t('dashboard.failed'), color: 'text-red-400', bg: 'bg-red-400/10' };
    default:
      return { label: status, color: 'text-muted-foreground', bg: 'bg-white/5' };
  }
}

// WIB-based countdown hook
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

// WIB time display hook
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

export default function UserDashboard() {
  const { navigate } = useAppStore();
  const { user, token, hydrateUser } = useAuthStore();
  const t = useT();
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [activeAssets, setActiveAssets] = useState<ActiveAsset[]>([]);
  const [profitStatus, setProfitStatus] = useState<ProfitStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showProfitFlash, setShowProfitFlash] = useState(false);
  const prevProfitBalance = useRef<number | null>(null);

  const countdown = useWIBCountdown();
  const wibTime = useWIBTime();

  const fetchUserData = useCallback(async () => {
    if (!token) return;
    try {
      const [txRes, investRes, profitRes] = await Promise.all([
        fetch('/api/transactions?limit=5', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/investments?status=active&limit=10', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/user/profit-status', { headers: { Authorization: `Bearer ${token}` } }),
        hydrateUser(),
      ]);

      const txData = await txRes.json();
      const investData = await investRes.json();
      const profitData = await profitRes.json();

      if (txData.success) setRecentTransactions(txData.data || []);

      if (profitData.success && profitData.data) {
        setProfitStatus(profitData.data);
      }

      // Check for balance change (flash effect)
      if (prevProfitBalance.current !== null && user) {
        if ((user.mainBalance || 0) > prevProfitBalance.current) {
          setShowProfitFlash(true);
          setTimeout(() => setShowProfitFlash(false), 3000);
        }
      }
      if (user) {
        prevProfitBalance.current = user.mainBalance || 0;
      }

      const assets: ActiveAsset[] = [];
      if (investData.success && investData.data) {
        for (const inv of investData.data) {
          assets.push({
            id: inv.id,
            type: 'investment',
            name: inv.package?.name || t('paket.investmentPackages'),
            amount: inv.amount,
            dailyProfit: inv.dailyProfit,
            totalProfitEarned: inv.totalProfitEarned,
            profitRate: inv.package?.profitRate,
            contractDays: inv.package?.contractDays,
            status: inv.status,
            startDate: inv.startDate,
            endDate: inv.endDate,
          });
        }
      }
      setActiveAssets(assets);
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [token, hydrateUser, t]);

  useEffect(() => {
    fetchUserData();
    const interval = setInterval(fetchUserData, 30000);
    return () => clearInterval(interval);
  }, [fetchUserData]);

  const level = levelConfig[user?.level || 'Bronze'] || levelConfig.Bronze;

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

  const retry = () => {
    setError(null);
    setLoading(true);
    fetchUserData();
  };

  // Pad number with leading zero
  const pad = (n: number) => String(n).padStart(2, '0');

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6">
        <div className="animate-pulse space-y-4 sm:space-y-6">
          <div className="glass rounded-2xl p-6 h-32" />
          <div className="grid grid-cols-2 gap-4">
            <div className="glass rounded-2xl p-6 h-28" />
            <div className="glass rounded-2xl p-6 h-28" />
          </div>
          <div className="glass rounded-2xl p-6 h-40" />
        </div>
      </div>
    );
  }

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
      {/* Profile Card */}
      <motion.div variants={itemVariants} className="glass glow-gold rounded-2xl p-3 sm:p-5 lg:p-6">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gold-gradient flex items-center justify-center text-xl sm:text-2xl font-bold text-[#070B14] shrink-0">
            {user?.name?.charAt(0) || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h2 className="text-foreground font-semibold text-base sm:text-lg truncate">
                {user?.name || 'User'}
              </h2>
              <Badge className={`${level.bg} ${level.color} ${level.border} border text-[10px] font-semibold`}>
                <Crown className="w-3 h-3 mr-0.5" />
                {user?.level || 'Bronze'}
              </Badge>
            </div>
            <p className="text-muted-foreground text-xs sm:text-sm">
              ID: {user?.userId || '-'}
            </p>
            <p className="text-muted-foreground text-xs sm:text-sm">
              {user?.whatsapp ? maskWhatsApp(user.whatsapp) : '-'}
            </p>
          </div>
          <button
            onClick={() => fetchUserData()}
            className="p-2 rounded-xl hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </motion.div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div variants={itemVariants} className="glass-gold glow-gold rounded-2xl p-3 sm:p-5 lg:p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-[#D4AF37]/5 blur-2xl" />
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-[#D4AF37]" />
            </div>
            <span className="text-muted-foreground text-sm">Saldo Utama</span>
            {showProfitFlash && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-medium"
              >
                +Profit!
              </motion.span>
            )}
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-gold-gradient">
            {formatRupiah(user?.mainBalance || 0)}
          </p>
          <p className="text-muted-foreground text-[10px] mt-1">Bisa ditarik & untuk beli paket</p>
        </motion.div>

        <motion.div variants={itemVariants} className="glass rounded-2xl p-3 sm:p-5 lg:p-6 relative overflow-hidden border border-blue-500/10">
          <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-blue-500/5 blur-2xl" />
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Package className="w-5 h-5 text-blue-400" />
            </div>
            <span className="text-muted-foreground text-sm">Saldo Deposit</span>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-blue-400">
            {formatRupiah(user?.depositBalance || 0)}
          </p>
          <p className="text-muted-foreground text-[10px] mt-1">Khusus beli paket (tidak bisa ditarik)</p>
        </motion.div>

        <motion.div
          variants={itemVariants}
          className="glass glow-gold rounded-2xl p-3 sm:p-5 lg:p-6 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-emerald-500/5 blur-2xl" />
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            <span className="text-muted-foreground text-sm">Total Profit</span>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-emerald-400">
            {formatRupiah(user?.totalProfit || 0)}
          </p>
          <p className="text-muted-foreground text-[10px] mt-1">Akumulasi semua profit & bonus</p>
        </motion.div>
      </div>

      {/* ── Profit Schedule Card ── Real-time countdown to next profit at 00:00 WIB */}
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
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-muted-foreground text-[10px]">Profit Harian</p>
                  <p className="text-emerald-400 font-bold text-sm">+{formatRupiah(profitStatus?.totalDailyProfit || 0)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[10px]">Investasi Aktif</p>
                  <p className="text-foreground font-bold text-sm">{profitStatus?.activeInvestments || 0} paket</p>
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

      {/* Today's Earnings */}
      {todayEarnings && todayEarnings.total > 0 && (
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
            <p className="text-lg font-bold text-emerald-400">+{formatRupiah(todayEarnings.total)}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            {[
              { label: 'Profit Harian', value: todayEarnings.profit, color: 'text-emerald-400', bg: 'bg-emerald-400/10', icon: TrendingUp },
              { label: 'Matching', value: todayEarnings.matching, color: 'text-purple-400', bg: 'bg-purple-400/10', icon: Users },
              { label: 'Gaji', value: todayEarnings.salary, color: 'text-blue-400', bg: 'bg-blue-400/10', icon: Award },
              { label: 'Sponsor', value: todayEarnings.sponsor, color: 'text-[#D4AF37]', bg: 'bg-[#D4AF37]/10', icon: Gift },
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
      )}

      {/* Quick Actions */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 gap-4">
        <Button
          onClick={() => navigate('deposit')}
          className="h-14 bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 transition-all glow-gold-strong text-sm"
        >
          <ArrowDownCircle className="w-5 h-5 mr-2" />
          {t('dashboard.depositBtn')}
        </Button>
        <Button
          onClick={() => navigate('withdraw')}
          className="h-14 bg-card-gradient border border-[#D4AF37]/20 text-foreground font-semibold rounded-xl hover:bg-white/5 hover:border-[#D4AF37]/40 transition-all text-sm"
        >
          <ArrowUpCircle className="w-5 h-5 mr-2 text-[#D4AF37]" />
          {t('dashboard.withdrawBtn')}
        </Button>
      </motion.div>

      {/* Earnings Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {[
          { icon: ArrowDownCircle, label: t('dashboard.totalDeposit'), value: user?.totalDeposit || 0, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
          { icon: ArrowUpCircle, label: t('dashboard.totalWithdraw'), value: user?.totalWithdraw || 0, color: 'text-blue-400', bg: 'bg-blue-400/10' },
          { icon: TrendingUp, label: t('dashboard.totalProfit'), value: user?.totalProfit || 0, color: 'text-[#D4AF37]', bg: 'bg-[#D4AF37]/10' },
          { icon: Award, label: t('dashboard.level'), value: user?.level || 'Bronze', color: level.color, bg: level.bg, isText: true },
        ].map((item) => (
          <motion.div
            key={item.label}
            variants={itemVariants}
            className="glass rounded-2xl p-3 sm:p-4 text-center hover:glow-gold transition-all"
          >
            <div className={`inline-flex items-center justify-center w-9 h-9 rounded-xl ${item.bg} mb-2`}>
              {typeof item.icon === 'function' && !item.isText ? (
                <item.icon className={`w-4 h-4 ${item.color}`} />
              ) : (
                <Crown className={`w-4 h-4 ${item.color}`} />
              )}
            </div>
            <p className={`font-bold text-sm ${item.color}`}>
              {item.isText ? item.value : formatRupiah(item.value as number)}
            </p>
            <p className="text-muted-foreground text-[10px] sm:text-xs mt-0.5">{item.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Quick Nav */}
      <motion.div variants={itemVariants} className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3">
        {[
          { icon: ShoppingBag, label: t('nav.products'), page: 'products' as const, color: 'text-[#D4AF37]' },
          { icon: Package, label: t('nav.assets'), page: 'assets' as const, color: 'text-purple-400' },
          { icon: TrendingUp, label: t('nav.paket'), page: 'paket' as const, color: 'text-[#D4AF37]' },
          { icon: Shield, label: t('nav.bank'), page: 'bank' as const, color: 'text-blue-400' },
          { icon: Clock, label: t('nav.history'), page: 'history' as const, color: 'text-orange-400' },
        ].map((item) => (
          <button
            key={item.page}
            onClick={() => navigate(item.page)}
            className="glass rounded-2xl p-3 sm:p-4 flex flex-col items-center gap-1.5 sm:gap-2 hover:glow-gold transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
              <item.icon className={`w-5 h-5 ${item.color}`} />
            </div>
            <span className="text-foreground text-[10px] sm:text-xs font-medium">{item.label}</span>
          </button>
        ))}
      </motion.div>

      {/* Active Assets */}
      {activeAssets.length > 0 && (
        <motion.div variants={itemVariants} className="glass rounded-2xl p-3 sm:p-5 lg:p-6">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="text-foreground font-semibold text-sm sm:text-base flex items-center gap-2">
              <Package className="w-4 h-4 text-[#D4AF37]" />
              {t('dashboard.activeAssets')}
            </h3>
            <button
              onClick={() => navigate('assets')}
              className="text-[#D4AF37] text-xs font-medium hover:underline flex items-center gap-1"
            >
              {t('dashboard.viewAll')}
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {activeAssets.map((asset) => (
              <div key={asset.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition-colors">
                <div className="w-9 h-9 rounded-xl bg-purple-400/10 flex items-center justify-center shrink-0">
                  <Package className="w-4 h-4 text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-foreground text-sm font-medium truncate">{asset.name}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-emerald-400 text-xs font-medium">+{formatRupiah(asset.dailyProfit || 0)}{t('dashboard.perDay')}</p>
                    <span className="text-muted-foreground/50 text-[10px]">•</span>
                    <p className="text-muted-foreground text-[10px]">Profit: {formatRupiah(asset.totalProfitEarned || 0)}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-foreground text-sm font-semibold">{formatRupiah(asset.amount)}</p>
                  <Badge className="bg-emerald-400/10 text-emerald-400 border-0 text-[9px] px-1.5 py-0">{t('dashboard.active')}</Badge>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Recent Activity */}
      <motion.div variants={itemVariants} className="glass rounded-2xl p-3 sm:p-5 lg:p-6">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h3 className="text-foreground font-semibold text-sm sm:text-base">{t('dashboard.recentActivity')}</h3>
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

        {recentTransactions.length > 0 ? (
          <div className="space-y-3">
            {recentTransactions.map((tx) => {
              const statusCfg = getStatusConfig(tx.status, t);
              const typeIcon = {
                deposit: { icon: ArrowDownCircle, color: 'text-emerald-400', bg: 'bg-emerald-400/10', prefix: '+' },
                withdraw: { icon: ArrowUpCircle, color: 'text-blue-400', bg: 'bg-blue-400/10', prefix: '-' },
                purchase: { icon: ShoppingBag, color: 'text-[#D4AF37]', bg: 'bg-[#D4AF37]/10', prefix: '-' },
                investment: { icon: Package, color: 'text-purple-400', bg: 'bg-purple-400/10', prefix: '-' },
                bonus: { icon: Gift, color: 'text-[#D4AF37]', bg: 'bg-[#D4AF37]/10', prefix: '+' },
                profit: { icon: Coins, color: 'text-emerald-400', bg: 'bg-emerald-400/10', prefix: '+' },
              }[tx.type] || { icon: Clock, color: 'text-muted-foreground', bg: 'bg-white/5', prefix: '' };
              const Icon = typeIcon.icon;
              const typeLabel = {
                deposit: t('dashboard.depositBtn'),
                withdraw: t('dashboard.withdrawBtn'),
                purchase: t('dashboard.buyProduct'),
                investment: t('dashboard.investment'),
                bonus: t('dashboard.bonus'),
                profit: t('dashboard.profit'),
              }[tx.type] || tx.type;
              return (
                <div key={`${tx.type}-${tx.id}`} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition-colors">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${typeIcon.bg}`}>
                    <Icon className={`w-4 h-4 ${typeIcon.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground text-sm font-medium">{typeLabel}</p>
                    <p className="text-muted-foreground text-xs truncate">{tx.description}</p>
                    <p className="text-muted-foreground/50 text-[10px]">{formatDate(tx.createdAt)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-semibold ${typeIcon.color}`}>
                      {typeIcon.prefix}{formatRupiah(tx.amount)}
                    </p>
                    <span className={`text-[10px] font-medium ${statusCfg.color} ${statusCfg.bg} px-1.5 py-0.5 rounded-full`}>
                      {statusCfg.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <Clock className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">{t('dashboard.noActivity')}</p>
          </div>
        )}
      </motion.div>

      {/* Member Since */}
      <motion.div variants={itemVariants} className="text-center pb-4">
        <p className="text-muted-foreground/50 text-xs">
          {t('dashboard.memberSince')} {user?.createdAt ? formatDate(user.createdAt) : '-'}
        </p>
      </motion.div>
    </motion.div>
  );
}
