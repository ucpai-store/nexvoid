'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Gift, TrendingUp, Users, Coins,
  AlertTriangle, RefreshCw, Award
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { formatRupiah } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useT } from '@/lib/i18n';

interface BonusItem {
  id: string;
  fromUserId: string;
  type: string;
  level: number;
  amount: number;
  description: string;
  createdAt: string;
}

interface BonusSummary {
  referral: number;
  matching: number;
  salary: number;
  total: number;
}

/* 3 bonus types only: referal, m.profit, gaji */
const bonusTypeConfig: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  referral: { icon: Users, color: 'text-[#D4AF37]', bg: 'bg-[#D4AF37]/10', label: 'Bonus Referal' },
  sponsor: { icon: Users, color: 'text-[#D4AF37]', bg: 'bg-[#D4AF37]/10', label: 'Bonus Referal' },
  matching: { icon: TrendingUp, color: 'text-purple-400', bg: 'bg-purple-400/10', label: 'M.Profit' },
  level: { icon: TrendingUp, color: 'text-purple-400', bg: 'bg-purple-400/10', label: 'M.Profit' },
  salary: { icon: Coins, color: 'text-orange-400', bg: 'bg-orange-400/10', label: 'Gaji' },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

export default function BonusPage() {
  const { token } = useAuthStore();
  const t = useT();
  const [bonuses, setBonuses] = useState<BonusItem[]>([]);
  const [summary, setSummary] = useState<BonusSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  const fetchBonuses = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/bonuses', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        const items: BonusItem[] = (data.data || []).filter((b: BonusItem) => b.type !== 'profit' && b.type !== 'reward');
        setBonuses(items);
        const s: BonusSummary = { referral: 0, matching: 0, salary: 0, total: 0 };
        for (const b of items) {
          s.total += b.amount;
          if (b.type === 'referral' || b.type === 'sponsor') s.referral += b.amount;
          else if (b.type === 'matching' || b.type === 'level') s.matching += b.amount;
          else if (b.type === 'salary') s.salary += b.amount;
        }
        setSummary(s);
      } else {
        setError(data.error || 'Gagal memuat data');
      }
    } catch {
      setError('Terjadi kesalahan jaringan');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchBonuses();
  }, [fetchBonuses]);

  const retry = () => {
    setError(null);
    setLoading(true);
    fetchBonuses();
  };

  const filtered = filter === 'all' ? bonuses : bonuses.filter(b => {
    if (filter === 'referral') return b.type === 'referral' || b.type === 'sponsor';
    if (filter === 'matching') return b.type === 'matching' || b.type === 'level';
    if (filter === 'salary') return b.type === 'salary';
    return true;
  });

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6">
        <div className="animate-pulse space-y-4">
          <div className="glass rounded-2xl p-6 h-32" />
          <div className="grid grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <div key={i} className="glass rounded-2xl p-4 h-24" />)}
          </div>
          <div className="glass rounded-2xl p-6 h-64" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6">
        <div className="glass glow-gold rounded-2xl p-6 sm:p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-red-400" />
          </div>
          <h3 className="text-foreground font-semibold mb-1">Gagal Memuat Data</h3>
          <p className="text-muted-foreground text-sm mb-6">{error}</p>
          <Button onClick={retry} className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold">
            <RefreshCw className="w-4 h-4 mr-2" />Coba Lagi
          </Button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6 space-y-4 sm:space-y-6 pb-4"
    >
      <motion.div variants={itemVariants}>
        <h1 className="text-foreground text-xl font-bold flex items-center gap-2">
          <Gift className="w-5 h-5 text-[#D4AF37]" />
          Bonus
        </h1>
        <p className="text-muted-foreground text-sm">Riwayat semua bonus yang Anda terima</p>
      </motion.div>

      {/* Total Bonus */}
      <motion.div variants={itemVariants} className="glass-gold glow-gold-strong rounded-2xl p-4 sm:p-6 text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-[#D4AF37]/5 blur-3xl" />
        <div className="relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-gold-gradient flex items-center justify-center mx-auto mb-3 glow-gold">
            <Coins className="w-7 h-7 text-[#070B14]" />
          </div>
          <p className="text-muted-foreground text-xs mb-1">Total Bonus Diterima</p>
          <p className="text-3xl sm:text-4xl font-bold text-gold-gradient">{formatRupiah(summary?.total || 0)}</p>
          <p className="text-muted-foreground text-[10px] mt-2">Akumulasi bonus referal, m.profit & gaji</p>
        </div>
      </motion.div>

      {/* 3 Bonus Types: Referal, M.Profit, Gaji */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: Users, label: 'Referal', value: summary?.referral || 0, color: 'text-[#D4AF37]', bg: 'bg-[#D4AF37]/10' },
          { icon: TrendingUp, label: 'M.Profit', value: summary?.matching || 0, color: 'text-purple-400', bg: 'bg-purple-400/10' },
          { icon: Coins, label: 'Gaji', value: summary?.salary || 0, color: 'text-orange-400', bg: 'bg-orange-400/10' },
        ].map((item) => (
          <motion.div key={item.label} variants={itemVariants} className="glass rounded-2xl p-3 sm:p-4 text-center hover:glow-gold transition-all">
            <div className={`inline-flex items-center justify-center w-9 h-9 rounded-xl ${item.bg} mb-2`}>
              <item.icon className={`w-4 h-4 ${item.color}`} />
            </div>
            <p className={`font-bold text-sm ${item.color}`}>{formatRupiah(item.value)}</p>
            <p className="text-muted-foreground text-[10px] mt-0.5">{item.label}</p>
          </motion.div>
        ))}
      </div>

      {/* History */}
      <motion.div variants={itemVariants} className="glass rounded-2xl p-3 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-foreground font-semibold text-sm flex items-center gap-2">
            <Award className="w-4 h-4 text-[#D4AF37]" />
            Riwayat Bonus
          </h3>
          <span className="text-muted-foreground text-[10px]">{filtered.length} transaksi</span>
        </div>

        {/* Filter: only 3 types */}
        <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar pb-1">
          {[
            { key: 'all', label: 'Semua' },
            { key: 'referral', label: 'Referal' },
            { key: 'matching', label: 'M.Profit' },
            { key: 'salary', label: 'Gaji' },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                filter === f.key
                  ? 'bg-gold-gradient text-[#070B14]'
                  : 'glass text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {filtered.length > 0 ? (
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {filtered.map((bonus) => {
              const config = bonusTypeConfig[bonus.type] || bonusTypeConfig.referral;
              const Icon = config.icon;
              return (
                <div key={bonus.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition-colors">
                  <div className={`w-9 h-9 rounded-xl ${config.bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-4 h-4 ${config.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground text-sm font-medium">{config.label}</p>
                    <p className="text-muted-foreground text-xs truncate">{bonus.description || `Bonus ${config.label}`}</p>
                    <p className="text-muted-foreground/50 text-[10px]">{formatDate(bonus.createdAt)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-emerald-400 text-sm font-semibold">+{formatRupiah(bonus.amount)}</p>
                    {bonus.level > 0 && (
                      <Badge className="bg-[#D4AF37]/10 text-[#D4AF37] border-0 text-[9px] px-1.5 py-0">
                        Level {bonus.level}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <Gift className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">Belum ada bonus</p>
            <p className="text-muted-foreground text-xs mt-1">Mulai investasi dan ajak teman untuk mendapatkan bonus</p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
