'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  History, ArrowDownCircle, ArrowUpCircle, ShoppingBag,
  TrendingUp, Clock, Filter, AlertTriangle, RefreshCw,
  Gift, Wallet, Package, Award, Coins
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { formatRupiah } from '@/lib/auth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useT } from '@/lib/i18n';

/* ───────── Types ───────── */
interface Transaction {
  id: string;
  type: string; // deposit, withdraw, purchase, investment, bonus, profit
  amount: number;
  status: string;
  description: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

interface TransactionSummary {
  totalDeposit: number;
  totalWithdraw: number;
  totalPurchase: number;
  totalInvestment: number;
  totalBonus: number;
  totalProfit: number;
}

/* ───────── Helpers ───────── */
function getStatusConfig(status: string, t: (key: string) => string) {
  switch (status) {
    case 'success':
    case 'approved':
    case 'active':
      return { label: t('history.success'), color: 'text-emerald-400', bg: 'bg-emerald-400/10' };
    case 'pending':
      return { label: t('history.pending'), color: 'text-yellow-400', bg: 'bg-yellow-400/10' };
    case 'failed':
    case 'rejected':
      return { label: t('history.failed'), color: 'text-red-400', bg: 'bg-red-400/10' };
    case 'completed':
      return { label: t('history.completed'), color: 'text-blue-400', bg: 'bg-blue-400/10' };
    case 'cancelled':
      return { label: t('history.cancelled'), color: 'text-red-400', bg: 'bg-red-400/10' };
    case 'stopped':
      return { label: t('history.stopped'), color: 'text-orange-400', bg: 'bg-orange-400/10' };
    default:
      return { label: status, color: 'text-muted-foreground', bg: 'bg-white/5' };
  }
}

function getTypeConfig(type: string, t: (key: string) => string) {
  switch (type) {
    case 'deposit':
      return { label: t('history.deposit'), icon: ArrowDownCircle, color: 'text-emerald-400', bgColor: 'bg-emerald-400/10', prefix: '+' };
    case 'withdraw':
      return { label: t('history.withdrawal'), icon: ArrowUpCircle, color: 'text-blue-400', bgColor: 'bg-blue-400/10', prefix: '-' };
    case 'purchase':
      return { label: t('history.buyProduct'), icon: ShoppingBag, color: 'text-[#D4AF37]', bgColor: 'bg-[#D4AF37]/10', prefix: '-' };
    case 'investment':
      return { label: t('history.investment'), icon: Package, color: 'text-purple-400', bgColor: 'bg-purple-400/10', prefix: '-' };
    case 'bonus':
      return { label: t('history.bonus'), icon: Gift, color: 'text-[#D4AF37]', bgColor: 'bg-[#D4AF37]/10', prefix: '+' };
    case 'profit':
      return { label: t('history.profit'), icon: Coins, color: 'text-emerald-400', bgColor: 'bg-emerald-400/10', prefix: '+' };
    default:
      return { label: type, icon: History, color: 'text-muted-foreground', bgColor: 'bg-white/5', prefix: '' };
  }
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* ───────── Transaction Item ───────── */
function TransactionItem({ tx, t }: { tx: Transaction; t: (key: string) => string }) {
  const typeCfg = getTypeConfig(tx.type, t);
  const statusCfg = getStatusConfig(tx.status, t);
  const Icon = typeCfg.icon;

  // Get additional details from meta
  const getDetail = () => {
    switch (tx.type) {
      case 'deposit':
        return (tx.meta as { paymentName?: string })?.paymentName || '';
      case 'withdraw':
        return (tx.meta as { bankName?: string })?.bankName || '';
      case 'purchase':
        return (tx.meta as { productName?: string })?.productName || '';
      case 'investment':
        return (tx.meta as { packageName?: string })?.packageName || '';
      case 'bonus': {
        const meta = tx.meta as { bonusType?: string; level?: number; fromUserName?: string };
        return meta.bonusType ? `${meta.bonusType} L${meta.level || 1} dari ${meta.fromUserName || 'User'}` : '';
      }
      case 'profit': {
        const meta = tx.meta as { productName?: string };
        return meta.productName ? `dari ${meta.productName}` : '';
      }
      default:
        return '';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition-colors"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${typeCfg.bgColor}`}>
        <Icon className={`w-5 h-5 ${typeCfg.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-foreground text-sm font-medium">{typeCfg.label}</p>
          <span className={`text-[10px] font-medium ${statusCfg.color} ${statusCfg.bg} px-1.5 py-0.5 rounded-full`}>
            {statusCfg.label}
          </span>
        </div>
        <p className="text-muted-foreground text-xs truncate">{tx.description}</p>
        {getDetail() && (
          <p className="text-muted-foreground/70 text-[10px] mt-0.5 truncate">{getDetail()}</p>
        )}
        <p className="text-muted-foreground/50 text-[10px]">{formatDate(tx.createdAt)}</p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-semibold ${tx.type === 'deposit' || tx.type === 'bonus' || tx.type === 'profit' ? 'text-emerald-400' : tx.type === 'withdraw' ? 'text-blue-400' : typeCfg.color}`}>
          {typeCfg.prefix}{formatRupiah(tx.amount)}
        </p>
        {tx.type === 'withdraw' && (tx.meta as { fee?: number })?.fee && (tx.meta as { fee: number }).fee > 0 && (
          <p className="text-muted-foreground text-[10px]">
            Fee: {formatRupiah((tx.meta as { fee: number }).fee)}
          </p>
        )}
      </div>
    </motion.div>
  );
}

/* ───────── Summary Card ───────── */
function SummaryCard({ icon: Icon, label, value, color, bgColor }: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="glass glow-gold rounded-2xl p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`w-7 h-7 rounded-lg ${bgColor} flex items-center justify-center`}>
          <Icon className={`w-3.5 h-3.5 ${color}`} />
        </div>
        <span className="text-muted-foreground text-[10px] sm:text-xs">{label}</span>
      </div>
      <p className={`${color} font-bold text-sm sm:text-lg`}>{formatRupiah(value)}</p>
    </div>
  );
}

/* ───────── Main HistoryPage ───────── */
export default function HistoryPage() {
  const { token } = useAuthStore();
  const t = useT();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('all');

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/transactions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (data.success) {
        setTransactions(data.data || []);
        setSummary(data.summary || null);
      } else {
        setError(t('common.error'));
      }
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredTransactions = activeTab === 'all'
    ? transactions
    : transactions.filter((tx) => tx.type === activeTab);

  const retry = () => {
    setError(null);
    setLoading(true);
    fetchData();
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6">
        <div className="animate-pulse space-y-4">
          <div className="glass rounded-2xl p-4 sm:p-6 h-20" />
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass rounded-2xl p-4 h-20" />
            ))}
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass rounded-2xl p-4 h-16" />
            ))}
          </div>
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
          <h3 className="text-foreground font-semibold mb-1">{t('dashboard.loadFailed')}</h3>
          <p className="text-muted-foreground text-sm mb-6">{error}</p>
          <Button
            onClick={retry}
            className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('dashboard.tryAgain')}</Button>
        </div>
      </div>
    );
  }

  const tabs = [
    { value: 'all', label: t('history.all') },
    { value: 'deposit', label: t('history.deposit') },
    { value: 'withdraw', label: t('history.wd') },
    { value: 'purchase', label: t('history.purchase') },
    { value: 'investment', label: t('history.investment') },
    { value: 'bonus', label: t('history.bonus') },
    { value: 'profit', label: t('history.profit') },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6 space-y-4 sm:space-y-6 pb-4 sm:pb-6">
      {/* Header */}
      <div>
        <h1 className="text-foreground text-xl font-bold">{t('history.transactionHistory')}</h1>
        <p className="text-muted-foreground text-sm">{t('history.allActivity')}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard icon={ArrowDownCircle} label={t('history.deposit')} value={summary?.totalDeposit || 0} color="text-emerald-400" bgColor="bg-emerald-400/10" />
        <SummaryCard icon={ArrowUpCircle} label={t('history.withdrawal')} value={summary?.totalWithdraw || 0} color="text-blue-400" bgColor="bg-blue-400/10" />
        <SummaryCard icon={ShoppingBag} label={t('history.purchase')} value={summary?.totalPurchase || 0} color="text-[#D4AF37]" bgColor="bg-[#D4AF37]/10" />
        <SummaryCard icon={Package} label={t('history.investment')} value={summary?.totalInvestment || 0} color="text-purple-400" bgColor="bg-purple-400/10" />
        <SummaryCard icon={Gift} label={t('history.bonus')} value={summary?.totalBonus || 0} color="text-[#D4AF37]" bgColor="bg-[#D4AF37]/10" />
        <SummaryCard icon={Coins} label={t('history.profit')} value={summary?.totalProfit || 0} color="text-emerald-400" bgColor="bg-emerald-400/10" />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="glass rounded-xl p-1 h-auto flex-wrap">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="rounded-lg text-xs px-2.5 py-2 data-[state=active]:bg-gold-gradient data-[state=active]:text-[#070B14] data-[state=active]:font-semibold"
            >
              {tab.label}
              {tab.value !== 'all' && (
                <span className="ml-1 text-[10px] opacity-60">
                  ({transactions.filter((tx) => tx.type === tab.value).length})
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {filteredTransactions.length > 0 ? (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {filteredTransactions.map((tx) => (
                <TransactionItem key={`${tx.type}-${tx.id}`} tx={tx} t={t} />
              ))}
            </div>
          ) : (
            <div className="glass rounded-2xl p-5 sm:p-8 text-center">
              <History className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">{t('history.noTransactions')}</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
