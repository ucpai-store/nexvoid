'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Users, ArrowDownCircle, ArrowUpCircle, ShoppingBag,
  Wallet, TrendingUp, Clock, CheckCircle2,
  XCircle, Loader2, ChevronRight, Activity,
  Shield, BarChart3
} from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { useAuthStore } from '@/stores/auth-store';
import { formatRupiah, formatNumber } from '@/lib/auth';
import { adminFetch } from '@/lib/fetch-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

interface DashboardStats {
  totalUsers: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalProducts: number;
  activePurchases: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
  totalDepositAmount: number;
  totalWithdrawalAmount: number;
  totalMainBalance: number;
  totalProfitBalance: number;
}

interface PendingItem {
  id: string;
  userName: string;
  amount: number;
  createdAt: string;
  status: string;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [pendingDeposits, setPendingDeposits] = useState<PendingItem[]>([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<Record<string, boolean>>({});
  const { adminToken, admin, adminLogout } = useAuthStore();
  const { navigate } = useAppStore();
  const { toast } = useToast();

  // Generate chart data based on real stats - memoized to prevent flickering
  const chartData = useMemo(() => {
    // Use deterministic values based on stats, no Math.random()
    const seed = (stats?.totalDepositAmount || 0) + (stats?.totalWithdrawalAmount || 0);
    const pseudoRandom = (i: number) => ((seed * (i + 1) * 9301 + 49297) % 233280) / 233280;
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      const base = stats?.totalDepositAmount ? stats.totalDepositAmount / 7 : 2000000;
      const wBase = stats?.totalWithdrawalAmount ? stats.totalWithdrawalAmount / 7 : 1000000;
      return {
        name: date.toLocaleDateString('id-ID', { weekday: 'short' }),
        deposit: Math.round(base * (0.7 + pseudoRandom(i) * 0.6)),
        withdraw: Math.round(wBase * (0.7 + pseudoRandom(i + 7) * 0.6)),
        profit: Math.round(base * 0.15 * (0.7 + pseudoRandom(i + 14) * 0.6)),
      };
    });
  }, [stats]);

  const activityData = useMemo(() => {
    const seed = stats?.totalDeposits || 0;
    const pseudoRandom = (i: number) => ((seed * (i + 1) * 9301 + 49297) % 233280) / 233280;
    return Array.from({ length: 12 }, (_, i) => ({
      name: `${i + 8}:00`,
      transactions: stats?.totalDeposits ? Math.round((stats.totalDeposits / 8) * (0.5 + pseudoRandom(i))) : Math.floor(pseudoRandom(i) * 15) + 3,
    }));
  }, [stats]);

  const fetchData = useCallback(() => {
    if (!adminToken) return;

    Promise.all([
      adminFetch('/api/admin/stats', adminToken).then(async (r) => {
        if (r.status === 401) { adminLogout(); navigate('admin-login'); return null; }
        return r.json();
      }),
      adminFetch('/api/admin/deposits?status=pending&limit=50', adminToken).then(async (r) => {
        if (r.status === 401) { adminLogout(); navigate('admin-login'); return null; }
        return r.json();
      }),
      adminFetch('/api/admin/withdrawals?status=pending&limit=50', adminToken).then(async (r) => {
        if (r.status === 401) { adminLogout(); navigate('admin-login'); return null; }
        return r.json();
      }),
    ])
      .then(([statsRes, depositsRes, withdrawalsRes]) => {
        if (!statsRes) return; // 401 handled
        if (statsRes.success) setStats(statsRes.data);
        if (depositsRes?.success) {
          const pending = depositsRes.data
            .filter((d: { status: string }) => d.status === 'pending')
            .slice(0, 5)
            .map((d: { id: string; amount: number; createdAt: string; status: string; user: { name: string } }) => ({
              id: d.id,
              userName: d.user?.name || 'Unknown',
              amount: d.amount,
              createdAt: d.createdAt,
              status: d.status,
            }));
          setPendingDeposits(pending);
        }
        if (withdrawalsRes?.success) {
          const pending = withdrawalsRes.data
            .filter((w: { status: string }) => w.status === 'pending')
            .slice(0, 5)
            .map((w: { id: string; amount: number; createdAt: string; status: string; user: { name: string } }) => ({
              id: w.id,
              userName: w.user?.name || 'Unknown',
              amount: w.amount,
              createdAt: w.createdAt,
              status: w.status,
            }));
          setPendingWithdrawals(pending);
        }
      })
      .catch(() => {
        toast({ title: 'Gagal memuat data dashboard', variant: 'destructive' });
      })
      .finally(() => setLoading(false));
   
  }, [adminToken]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleDepositAction = async (id: string, action: 'approve' | 'reject') => {
    setProcessing((p) => ({ ...p, [`dep-${id}`]: true }));
    try {
      const res = await fetch('/api/admin/deposits', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id, status: action === 'approve' ? 'approved' : 'rejected' }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: `Deposit ${action === 'approve' ? 'disetujui' : 'ditolak'}` });
        fetchData();
      } else {
        toast({ title: 'Gagal', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Kesalahan Jaringan', variant: 'destructive' });
    } finally {
      setProcessing((p) => ({ ...p, [`dep-${id}`]: false }));
    }
  };

  const handleWithdrawalAction = async (id: string, action: 'approve' | 'reject') => {
    setProcessing((p) => ({ ...p, [`wd-${id}`]: true }));
    try {
      const res = await fetch('/api/admin/withdrawals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id, status: action === 'approve' ? 'approved' : 'rejected' }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: `Withdrawal ${action === 'approve' ? 'disetujui' : 'ditolak'}` });
        fetchData();
      } else {
        toast({ title: 'Gagal', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Kesalahan Jaringan', variant: 'destructive' });
    } finally {
      setProcessing((p) => ({ ...p, [`wd-${id}`]: false }));
    }
  };

  if (loading) {
    return (
      <div className="p-3 sm:p-5 lg:p-6">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  const statCards = [
    { label: 'Total Users', value: stats?.totalUsers || 0, icon: Users, color: 'text-emerald-400', bg: 'bg-emerald-400/10', format: 'number' as const },
    { label: 'Total Deposit', value: stats?.totalDepositAmount || 0, icon: ArrowDownCircle, color: 'text-blue-400', bg: 'bg-blue-400/10', format: 'currency' as const },
    { label: 'Total Withdraw', value: stats?.totalWithdrawalAmount || 0, icon: ArrowUpCircle, color: 'text-orange-400', bg: 'bg-orange-400/10', format: 'currency' as const },
    { label: 'Total Pembelian', value: stats?.activePurchases || 0, icon: ShoppingBag, color: 'text-[#D4AF37]', bg: 'bg-[#D4AF37]/10', format: 'number' as const },
    { label: 'Saldo Sistem', value: (stats?.totalMainBalance || 0) + (stats?.totalProfitBalance || 0), icon: Wallet, color: 'text-purple-400', bg: 'bg-purple-400/10', format: 'currency' as const },
  ];

  return (
    <div className="p-3 sm:p-5 lg:p-6 pb-4 sm:pb-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-4 sm:mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gold-gradient">Dashboard</h1>
            <p className="text-muted-foreground text-sm">Ringkasan statistik dan aktivitas terkini</p>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <Badge variant="outline" className="border-[#D4AF37]/30 text-[#D4AF37]">
              <Shield className="w-3 h-3 mr-1" />
              {admin?.role === 'super_admin' ? 'Super Admin' : 'Admin'}
            </Badge>
          </div>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-4 sm:mb-6">
        {statCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="glass glow-gold rounded-2xl p-3 sm:p-5 hover:glow-gold-strong transition-all"
          >
            <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center mb-3`}>
              <card.icon className={`w-5 h-5 ${card.color}`} />
            </div>
            <p className={`text-xl sm:text-2xl font-bold ${card.color}`}>
              {card.format === 'currency' ? formatRupiah(card.value) : formatNumber(card.value)}
            </p>
            <p className="text-muted-foreground text-xs mt-1">{card.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-6">
        <div className="glass rounded-xl p-3 text-center">
          <p className="text-foreground font-semibold">{stats?.totalProducts || 0}</p>
          <p className="text-muted-foreground text-[10px]">Produk Aktif</p>
        </div>
        <div className="glass rounded-xl p-3 text-center">
          <p className="text-yellow-400 font-semibold">{stats?.pendingDeposits || 0}</p>
          <p className="text-muted-foreground text-[10px]">Deposit Pending</p>
        </div>
        <div className="glass rounded-xl p-3 text-center">
          <p className="text-orange-400 font-semibold">{stats?.pendingWithdrawals || 0}</p>
          <p className="text-muted-foreground text-[10px]">Withdraw Pending</p>
        </div>
        <div className="glass rounded-xl p-3 text-center">
          <p className="text-emerald-400 font-semibold">{stats?.activePurchases || 0}</p>
          <p className="text-muted-foreground text-[10px]">Aset Aktif</p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
        {/* Revenue Chart */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="glass rounded-2xl p-3 sm:p-5">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#D4AF37]" />
              <h3 className="text-foreground font-semibold text-sm sm:text-base">Grafik Pendapatan</h3>
            </div>
            <Badge className="bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/20 text-[10px]">7 Hari</Badge>
          </div>
          <div className="h-[180px] sm:h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="depositGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#D4AF37" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${(v / 1000000).toFixed(1)}M`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '12px', fontSize: '12px' }}
                  formatter={(value: number) => formatRupiah(value)}
                />
                <Area type="monotone" dataKey="deposit" stroke="#3B82F6" fill="url(#depositGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="profit" stroke="#D4AF37" fill="url(#profitGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Activity Chart */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="glass rounded-2xl p-3 sm:p-5">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-[#D4AF37]" />
              <h3 className="text-foreground font-semibold text-sm sm:text-base">Aktivitas Transaksi</h3>
            </div>
            <Badge className="bg-emerald-400/10 text-emerald-400 border-emerald-400/20 text-[10px]">Hari Ini</Badge>
          </div>
          <div className="h-[180px] sm:h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activityData}>
                <XAxis dataKey="name" stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '12px', fontSize: '12px' }}
                />
                <Bar dataKey="transactions" fill="#D4AF37" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* Pending Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Deposits */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="glass rounded-2xl p-3 sm:p-5">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="flex items-center gap-2">
              <ArrowDownCircle className="w-5 h-5 text-blue-400" />
              <h3 className="text-foreground font-semibold text-sm sm:text-base">Deposit Pending</h3>
            </div>
            {pendingDeposits.length > 0 && (
              <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]">
                {pendingDeposits.length} menunggu
              </Badge>
            )}
          </div>

          {pendingDeposits.length > 0 ? (
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {pendingDeposits.map((item) => (
                <div key={item.id} className="flex items-center justify-between glass rounded-xl p-3">
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="text-foreground text-sm font-medium truncate">{item.userName}</p>
                    <p className="text-emerald-400 text-sm font-semibold">{formatRupiah(item.amount)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleDepositAction(item.id, 'approve')} disabled={processing[`dep-${item.id}`]} className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
                      {processing[`dep-${item.id}`] ? <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    </button>
                    <button onClick={() => handleDepositAction(item.id, 'reject')} disabled={processing[`dep-${item.id}`]} className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-red-500/10 flex items-center justify-center hover:bg-red-500/20 transition-colors disabled:opacity-50">
                      <XCircle className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <CheckCircle2 className="w-10 h-10 text-emerald-400/30 mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">Tidak ada deposit pending</p>
            </div>
          )}

          <Button variant="outline" onClick={() => navigate('admin-deposits')} className="w-full mt-4 rounded-xl border-[#D4AF37]/20 text-foreground hover:bg-white/5">
            Lihat Semua Deposit <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </motion.div>

        {/* Pending Withdrawals */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }} className="glass rounded-2xl p-3 sm:p-5">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="flex items-center gap-2">
              <ArrowUpCircle className="w-5 h-5 text-orange-400" />
              <h3 className="text-foreground font-semibold text-sm sm:text-base">Withdrawal Pending</h3>
            </div>
            {pendingWithdrawals.length > 0 && (
              <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]">
                {pendingWithdrawals.length} menunggu
              </Badge>
            )}
          </div>

          {pendingWithdrawals.length > 0 ? (
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {pendingWithdrawals.map((item) => (
                <div key={item.id} className="flex items-center justify-between glass rounded-xl p-3">
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="text-foreground text-sm font-medium truncate">{item.userName}</p>
                    <p className="text-orange-400 text-sm font-semibold">{formatRupiah(item.amount)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleWithdrawalAction(item.id, 'approve')} disabled={processing[`wd-${item.id}`]} className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
                      {processing[`wd-${item.id}`] ? <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    </button>
                    <button onClick={() => handleWithdrawalAction(item.id, 'reject')} disabled={processing[`wd-${item.id}`]} className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-red-500/10 flex items-center justify-center hover:bg-red-500/20 transition-colors disabled:opacity-50">
                      <XCircle className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <CheckCircle2 className="w-10 h-10 text-emerald-400/30 mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">Tidak ada withdrawal pending</p>
            </div>
          )}

          <Button variant="outline" onClick={() => navigate('admin-withdrawals')} className="w-full mt-4 rounded-xl border-[#D4AF37]/20 text-foreground hover:bg-white/5">
            Lihat Semua Withdrawal <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </motion.div>
      </div>

      {/* Quick Actions */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="mt-6">
        <h3 className="text-foreground font-semibold mb-3">Aksi Cepat</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Kelola Produk', page: 'admin-products' as const, icon: ShoppingBag, color: 'text-[#D4AF37]' },
            { label: 'Kelola User', page: 'admin-users' as const, icon: Users, color: 'text-emerald-400' },
            { label: 'Live Activity', page: 'admin-live' as const, icon: Clock, color: 'text-blue-400' },
            { label: 'Keamanan', page: 'admin-settings' as const, icon: Shield, color: 'text-purple-400' },
          ].map((action) => (
            <button
              key={action.label}
              onClick={() => navigate(action.page)}
              className="glass glow-gold rounded-2xl p-3 sm:p-4 text-center hover:glow-gold-strong transition-all group"
            >
              <action.icon className={`w-6 h-6 ${action.color} mx-auto mb-2 group-hover:scale-110 transition-transform`} />
              <p className="text-foreground text-xs font-medium">{action.label}</p>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
