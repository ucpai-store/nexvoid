'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Package, Clock, TrendingUp, AlertTriangle, RefreshCw,
  Coins, Calendar, CheckCircle2, XCircle, Loader2, ShieldCheck, Zap
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { formatRupiah } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useT } from '@/lib/i18n';

/* ───────── Types ───────── */
interface AssetItem {
  id: string;
  type: 'investment' | 'product';
  name: string;
  amount: number;
  dailyProfit: number;
  totalProfitEarned: number;
  profitRate: number;
  contractDays: number;
  status: string;
  startDate: string;
  endDate: string | null;
  lastProfitDate: string | null;
  quantity?: number;
}

/* ───────── Helpers ───────── */
function formatDate(dateStr: string) {
  // Convert UTC to WIB (UTC+7) for display
  const d = new Date(dateStr);
  const wibMs = d.getTime() + d.getTimezoneOffset() * 60000 + 7 * 3600000;
  const wibDate = new Date(wibMs);
  return wibDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr: string) {
  // Convert UTC to WIB (UTC+7) for display
  const d = new Date(dateStr);
  const wibMs = d.getTime() + d.getTimezoneOffset() * 60000 + 7 * 3600000;
  const wibDate = new Date(wibMs);
  return wibDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIB';
}

function getDaysRemaining(endDate: string | null): number {
  if (!endDate) return 0;
  // Count calendar days in WIB timezone
  const endUTC = new Date(endDate);
  const nowUTC = new Date();
  const WIB_OFFSET = 7 * 3600000;
  const endWIB = new Date(endUTC.getTime() + endUTC.getTimezoneOffset() * 60000 + WIB_OFFSET);
  const nowWIB = new Date(nowUTC.getTime() + nowUTC.getTimezoneOffset() * 60000 + WIB_OFFSET);
  const endDay = new Date(endWIB.getFullYear(), endWIB.getMonth(), endWIB.getDate());
  const todayDay = new Date(nowWIB.getFullYear(), nowWIB.getMonth(), nowWIB.getDate());
  const diffDays = Math.ceil((endDay.getTime() - todayDay.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

function getDaysElapsed(startDate: string): number {
  // Count calendar days in WIB timezone
  const startUTC = new Date(startDate);
  const nowUTC = new Date();
  const WIB_OFFSET = 7 * 3600000;
  // Convert both to WIB date-only
  const startWIB = new Date(startUTC.getTime() + startUTC.getTimezoneOffset() * 60000 + WIB_OFFSET);
  const nowWIB = new Date(nowUTC.getTime() + nowUTC.getTimezoneOffset() * 60000 + WIB_OFFSET);
  // Zero out time parts for calendar day comparison
  const startDay = new Date(startWIB.getFullYear(), startWIB.getMonth(), startWIB.getDate());
  const todayDay = new Date(nowWIB.getFullYear(), nowWIB.getMonth(), nowWIB.getDate());
  const diffDays = Math.floor((todayDay.getTime() - startDay.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

function getProgress(startDate: string, contractDays: number): number {
  const elapsed = getDaysElapsed(startDate);
  return Math.min(100, Math.round((elapsed / contractDays) * 100));
}

function getStatusConfig(status: string, t: (key: string) => string) {
  switch (status) {
    case 'active':
      return { label: t('assets.statusActive'), color: 'text-emerald-400', bg: 'bg-emerald-400/10', icon: CheckCircle2 };
    case 'completed':
      return { label: t('assets.statusCompleted'), color: 'text-blue-400', bg: 'bg-blue-400/10', icon: CheckCircle2 };
    case 'stopped':
      return { label: t('assets.statusStopped'), color: 'text-orange-400', bg: 'bg-orange-400/10', icon: XCircle };
    case 'cancelled':
      return { label: t('assets.statusCancelled'), color: 'text-red-400', bg: 'bg-red-400/10', icon: XCircle };
    default:
      return { label: status, color: 'text-muted-foreground', bg: 'bg-white/5', icon: Clock };
  }
}

/* ───────── Asset Card ───────── */
function AssetCard({ asset, t }: { asset: AssetItem; t: (key: string) => string }) {
  const statusCfg = getStatusConfig(asset.status, t);
  const StatusIcon = statusCfg.icon;
  const progress = getProgress(asset.startDate, asset.contractDays);
  const daysRemaining = getDaysRemaining(asset.endDate);
  const daysElapsed = getDaysElapsed(asset.startDate);
  const isInvestment = asset.type === 'investment';

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-strong rounded-2xl p-4 sm:p-5 relative overflow-hidden hover:glow-gold transition-all"
    >
      {/* Status indicator bar */}
      <div className={`absolute top-0 left-0 right-0 h-1 ${asset.status === 'active' ? 'bg-emerald-400' : asset.status === 'completed' ? 'bg-blue-400' : 'bg-orange-400'}`} />

      {/* Header */}
      <div className="flex items-start justify-between mb-3 pt-1">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isInvestment ? 'bg-purple-400/10' : 'bg-[#D4AF37]/10'}`}>
            <Package className={`w-5 h-5 ${isInvestment ? 'text-purple-400' : 'text-[#D4AF37]'}`} />
          </div>
          <div>
            <h3 className="text-foreground font-semibold text-sm">{asset.name}</h3>
            <p className="text-muted-foreground text-xs">
              {isInvestment ? t('assets.investmentPackage') : t('assets.product')} • {asset.quantity && asset.quantity > 1 ? `${asset.quantity}x ` : ''}{formatDate(asset.startDate)}
            </p>
          </div>
        </div>
        <Badge className={`${statusCfg.bg} ${statusCfg.color} border-0 text-[10px] font-semibold flex items-center gap-1`}>
          <StatusIcon className="w-3 h-3" />
          {statusCfg.label}
        </Badge>
      </div>

      {/* Amount & Profit */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-white/[0.02] rounded-xl p-3">
          <p className="text-muted-foreground text-[10px] mb-1">{t('assets.modal')}</p>
          <p className="text-foreground font-bold text-sm">{formatRupiah(asset.amount)}</p>
        </div>
        <div className="bg-white/[0.02] rounded-xl p-3">
          <p className="text-muted-foreground text-[10px] mb-1">{t('assets.profitPerDay')}</p>
          <p className="text-emerald-400 font-bold text-sm">+{formatRupiah(asset.dailyProfit)}</p>
        </div>
      </div>

      {/* Contract Details */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{t('assets.contract')}</span>
          </div>
          <span className="text-foreground font-medium">{asset.contractDays} Hari</span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>{t('assets.profitRate')}</span>
          </div>
          <span className="text-emerald-400 font-medium">{asset.profitRate}%/hari</span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Coins className="w-3.5 h-3.5" />
            <span>{t('assets.totalProfit')}</span>
          </div>
          <span className="text-[#D4AF37] font-bold">{formatRupiah(asset.totalProfitEarned)}</span>
        </div>

        {asset.endDate && (
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="w-3.5 h-3.5" />
              <span>{t('assets.endDate')}</span>
            </div>
            <span className="text-foreground font-medium">{formatDate(asset.endDate)}</span>
          </div>
        )}
      </div>

      {/* Progress Bar (only for active investments) */}
      {asset.status === 'active' && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-[10px] mb-1.5">
            <span className="text-muted-foreground">{t('assets.contractProgress')}</span>
            <span className="text-foreground font-medium">
              {daysElapsed}/{asset.contractDays} hari • <span className="text-emerald-400">{daysRemaining} hari tersisa</span>
            </span>
          </div>
          <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"
            />
          </div>
        </div>
      )}

      {/* Total Return Preview */}
      {asset.status === 'active' && (
        <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
          <span className="text-muted-foreground text-[10px]">{t('assets.estimatedReturn')}</span>
          <span className="text-emerald-400 text-xs font-bold">
            {formatRupiah(asset.amount + (asset.dailyProfit * asset.contractDays))}
          </span>
        </div>
      )}

      {/* Last profit date */}
      {asset.lastProfitDate && (
        <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground/50">
          <Zap className="w-3 h-3" />
          {t('assets.lastProfit')}: {formatDateTime(asset.lastProfitDate)}
        </div>
      )}
    </motion.div>
  );
}

/* ───────── Summary Card ───────── */
function SummaryCard({ icon: Icon, label, value, color, bgColor }: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="glass glow-gold rounded-2xl p-3 sm:p-4 text-center">
      <div className="flex items-center justify-center gap-1.5 mb-1.5">
        <div className={`w-6 h-6 rounded-lg ${bgColor} flex items-center justify-center`}>
          <Icon className={`w-3 h-3 ${color}`} />
        </div>
        <span className="text-muted-foreground text-[10px] sm:text-xs">{label}</span>
      </div>
      <p className={`${color} font-bold text-sm sm:text-base`}>{value}</p>
    </div>
  );
}

/* ───────── Main AssetPage ───────── */
export default function AssetPage() {
  const { token } = useAuthStore();
  const { navigate } = useAppStore();
  const t = useT();
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('all');

  const fetchAssets = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/assets', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (data.success) {
        setAssets(data.data || []);
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
    fetchAssets();
  }, [fetchAssets]);

  const retry = () => {
    setError(null);
    setLoading(true);
    fetchAssets();
  };

  const filteredAssets = activeTab === 'all'
    ? assets
    : assets.filter((a) => a.type === activeTab);

  const activeCount = assets.filter((a) => a.status === 'active').length;
  const totalActiveAmount = assets.filter((a) => a.status === 'active').reduce((sum, a) => sum + a.amount, 0);
  const totalDailyProfit = assets.filter((a) => a.status === 'active').reduce((sum, a) => sum + a.dailyProfit, 0);
  const totalProfitEarned = assets.reduce((sum, a) => sum + a.totalProfitEarned, 0);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6">
        <div className="animate-pulse space-y-4">
          <div className="glass rounded-2xl p-4 sm:p-6 h-20" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="glass rounded-2xl p-4 h-20" />
            ))}
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass rounded-2xl p-4 sm:p-5 h-48" />
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6 space-y-4 sm:space-y-6 pb-4 sm:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground text-xl font-bold flex items-center gap-2">
            <Package className="w-5 h-5 text-[#D4AF37]" />
            {t('assets.myAssets')}</h1>
          <p className="text-muted-foreground text-sm">{t('assets.myAssets')}</p>
        </div>
        <Button
          onClick={() => navigate('paket')}
          className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold text-xs sm:text-sm"
        >
          <TrendingUp className="w-4 h-4 mr-1.5" />
          {t('assets.investNew')}</Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard icon={Package} label="Aset Aktif" value={`${activeCount}`} color="text-emerald-400" bgColor="bg-emerald-400/10" />
        <SummaryCard icon={Coins} label="Total Modal" value={formatRupiah(totalActiveAmount)} color="text-[#D4AF37]" bgColor="bg-[#D4AF37]/10" />
        <SummaryCard icon={TrendingUp} label="Profit/Hari" value={formatRupiah(totalDailyProfit)} color="text-emerald-400" bgColor="bg-emerald-400/10" />
        <SummaryCard icon={Coins} label="Total Profit" value={formatRupiah(totalProfitEarned)} color="text-[#D4AF37]" bgColor="bg-[#D4AF37]/10" />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="glass rounded-xl p-1 h-auto flex-wrap">
          <TabsTrigger
            value="all"
            className="rounded-lg text-xs px-3 py-2 data-[state=active]:bg-gold-gradient data-[state=active]:text-[#070B14] data-[state=active]:font-semibold"
          >
            Semua ({assets.length})
          </TabsTrigger>
          <TabsTrigger
            value="investment"
            className="rounded-lg text-xs px-3 py-2 data-[state=active]:bg-gold-gradient data-[state=active]:text-[#070B14] data-[state=active]:font-semibold"
          >
            Investasi ({assets.filter((a) => a.type === 'investment').length})
          </TabsTrigger>
          <TabsTrigger
            value="product"
            className="rounded-lg text-xs px-3 py-2 data-[state=active]:bg-gold-gradient data-[state=active]:text-[#070B14] data-[state=active]:font-semibold"
          >
            Produk ({assets.filter((a) => a.type === 'product').length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {filteredAssets.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAssets.map((asset) => (
                <AssetCard key={`${asset.type}-${asset.id}`} asset={asset} t={t} />
              ))}
            </div>
          ) : (
            <div className="glass rounded-2xl p-5 sm:p-8 lg:p-12 text-center">
              <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <h3 className="text-foreground font-semibold mb-1">{t('assets.noAssets')}</h3>
              <p className="text-muted-foreground text-sm mb-4">{t('assets.startInvesting')}</p>
              <Button
                onClick={() => navigate('paket')}
                className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold"
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                Lihat Paket Investasi
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
