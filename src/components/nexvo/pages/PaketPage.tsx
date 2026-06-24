'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Info,
  TrendingUp, ShieldCheck, Clock, Loader2,
  AlertTriangle, RefreshCw, Wallet, CheckCircle2,
  Coins, CalendarDays, Crown, Sparkles, AlertCircle
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { formatRupiah } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/lib/i18n';

/* ───────── Types ───────── */
type TierState = 'available' | 'active' | 'bought';

interface PackageItem {
  id: string;
  name: string;
  amount: number;
  profitRate: number;
  contractDays: number;
  isActive: boolean;
  order: number;
  totalInvestments: number;
  dailyProfit: number;
  totalProfit: number;
  /** no-duplicates purchase state for the current user */
  state?: TierState;
  reason?: string;
}

/* ───────── Tier styling based on package order ───────── */
const TIER_STYLES = [
  { // Bronze / Starter
    border: 'border-slate-400/20',
    glow: 'hover:shadow-[0_0_30px_rgba(148,163,184,0.15)]',
    badgeBg: 'bg-slate-400/10',
    badgeText: 'text-slate-300',
    badgeLabel: 'STARTER',
    icon: Coins,
  },
  { // Silver
    border: 'border-blue-400/30',
    glow: 'hover:shadow-[0_0_30px_rgba(96,165,250,0.2)]',
    badgeBg: 'bg-blue-400/10',
    badgeText: 'text-blue-300',
    badgeLabel: 'SILVER',
    icon: ShieldCheck,
  },
  { // Gold
    border: 'border-primary/40',
    glow: 'hover:shadow-[0_0_40px_rgba(212,175,55,0.25)]',
    badgeBg: 'bg-primary/15',
    badgeText: 'text-primary',
    badgeLabel: 'GOLD',
    icon: Crown,
    featured: true,
  },
  { // Platinum
    border: 'border-emerald-400/30',
    glow: 'hover:shadow-[0_0_30px_rgba(52,211,153,0.2)]',
    badgeBg: 'bg-emerald-400/10',
    badgeText: 'text-emerald-300',
    badgeLabel: 'PLATINUM',
    icon: Sparkles,
  },
  { // Diamond
    border: 'border-purple-400/30',
    glow: 'hover:shadow-[0_0_30px_rgba(168,85,247,0.2)]',
    badgeBg: 'bg-purple-400/10',
    badgeText: 'text-purple-300',
    badgeLabel: 'DIAMOND',
    icon: Sparkles,
  },
];

/* ───────── Package Card Component ───────── */
function PackageCard({
  pkg,
  index,
  onInvest,
  t,
}: {
  pkg: PackageItem;
  index: number;
  onInvest: (pkg: PackageItem) => void;
  t: (key: string) => string;
}) {
  const tier = TIER_STYLES[index % TIER_STYLES.length];
  const TierIcon = tier.icon;
  const isFeatured = tier.featured;

  // No-duplicates state for the current user
  const state: TierState = pkg.state ?? 'available';
  const isActive = state === 'active';
  const isAvailable = state === 'available';
  const isBought = state === 'bought';

  const canBuy = isAvailable;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4, ease: 'easeOut' }}
      whileHover={canBuy ? { scale: 1.02, transition: { duration: 0.2 } } : undefined}
      className={`group glass-strong rounded-2xl p-4 sm:p-5 lg:p-6 flex flex-col relative overflow-hidden border-2 ${tier.border} ${canBuy ? tier.glow : ''} transition-all duration-300 ${isFeatured ? 'ring-2 ring-primary/20' : ''} ${!canBuy ? 'opacity-70' : ''}`}
    >
      {/* Featured ribbon */}
      {isFeatured && (
        <div className="absolute top-0 right-0 bg-gold-gradient text-primary-foreground text-[9px] font-bold px-3 py-1 rounded-bl-xl">
          ⭐ POPULER
        </div>
      )}

      {/* State ribbon (Aktif / Selesai) */}
      {isActive && (
        <div className="absolute top-0 left-0 bg-emerald-500/90 text-white text-[9px] font-bold px-3 py-1 rounded-br-xl flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> AKTIF
        </div>
      )}
      {isBought && (
        <div className="absolute top-0 left-0 bg-blue-500/80 text-white text-[9px] font-bold px-3 py-1 rounded-br-xl flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> SELESAI
        </div>
      )}

      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-primary/5 blur-3xl group-hover:bg-primary/10 transition-colors pointer-events-none" />

      {/* Tier badge & name */}
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${tier.badgeBg} ${tier.badgeText} text-[10px] font-bold tracking-wider`}>
            <TierIcon className="w-3 h-3" />
            {tier.badgeLabel}
          </div>
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-400/10 text-emerald-400 text-[10px] font-semibold">
            <TrendingUp className="w-3 h-3" />
            +{pkg.profitRate}%/hari
          </div>
        </div>

        {/* Package name */}
        <h3 className="text-foreground font-bold text-base sm:text-lg mb-2">{pkg.name}</h3>

        {/* Price / Modal */}
        <div className="mb-1">
          <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-0.5">Modal Investasi</p>
          <span className="text-gold-gradient text-2xl sm:text-3xl font-bold tracking-tight">
            {formatRupiah(pkg.amount)}
          </span>
        </div>

        {/* Modal tidak kembali warning */}
        <div className="flex items-start gap-1.5 mb-4 mt-2 p-2 rounded-lg bg-amber-400/5 border border-amber-400/15">
          <AlertCircle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-400/80 text-[10px] leading-tight">
            Profit {formatRupiah(pkg.dailyProfit)}/hari masuk setiap hari jam 00:00. Modal tidak dikembalikan.
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {/* Daily Profit */}
          <div className="glass rounded-xl p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-6 h-6 rounded-lg bg-emerald-400/10 flex items-center justify-center">
                <TrendingUp className="w-3 h-3 text-emerald-400" />
              </div>
              <span className="text-muted-foreground text-[9px] uppercase tracking-wider">Profit/Hari</span>
            </div>
            <p className="text-emerald-400 text-sm sm:text-base font-bold">{formatRupiah(pkg.dailyProfit)}</p>
          </div>

          {/* Contract Days */}
          <div className="glass rounded-xl p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-6 h-6 rounded-lg bg-blue-400/10 flex items-center justify-center">
                <CalendarDays className="w-3 h-3 text-blue-400" />
              </div>
              <span className="text-muted-foreground text-[9px] uppercase tracking-wider">Kontrak</span>
            </div>
            <p className="text-foreground text-sm sm:text-base font-bold">{pkg.contractDays} Hari</p>
          </div>
        </div>

        {/* Total Profit preview */}
        <div className="glass-gold rounded-xl p-3 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-primary" />
              <span className="text-muted-foreground text-[10px] uppercase tracking-wider">Total Profit {pkg.contractDays} Hari</span>
            </div>
          </div>
          <p className="text-gold-gradient text-lg sm:text-xl font-bold mt-0.5">{formatRupiah(pkg.totalProfit)}</p>
        </div>

        {/* Bought/active reason */}
        {(isActive || isBought) && pkg.reason && (
          <div className="flex items-start gap-1.5 mb-3 p-2 rounded-lg bg-slate-400/5 border border-slate-400/15">
            <Info className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
            <p className="text-slate-400 text-[10px] leading-tight">{pkg.reason}</p>
          </div>
        )}

        {/* Invest button — any unbought tier is purchasable */}
        {isActive ? (
          <div className="w-full h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold text-sm flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Sedang Aktif
          </div>
        ) : isBought ? (
          <div className="w-full h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400/80 font-semibold text-sm flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Sudah Dimiliki
          </div>
        ) : (
          <Button
            onClick={() => onInvest(pkg)}
            className="w-full h-11 bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90 transition-all glow-gold text-sm"
          >
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4" />
              Beli Sekarang
            </div>
          </Button>
        )}
      </div>
    </motion.div>
  );
}

/* ───────── Main PaketPage ───────── */
export default function PaketPage() {
  const { token, user, hydrateUser } = useAuthStore();
  const { navigate } = useAppStore();
  const t = useT();
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [investing, setInvesting] = useState<string | null>(null);
  const [confirmPkg, setConfirmPkg] = useState<PackageItem | null>(null);
  const [successPkg, setSuccessPkg] = useState<PackageItem | null>(null);
  // No-duplicates tier availability for the logged-in user
  const [tierInfo, setTierInfo] = useState<{
    currentTierName: string | null;
    remainingCount: number;
    boughtCount: number;
    maxedOut: boolean;
  } | null>(null);

  const fetchPackages = useCallback(async () => {
    try {
      const res = await fetch('/api/packages');
      const data = await res.json();
      if (data.success) {
        let list: PackageItem[] = data.data || [];

        // If authenticated, merge in the user's sequential-tier purchase state.
        if (token) {
          try {
            const tierRes = await fetch('/api/investments/tiers', {
              headers: { Authorization: `Bearer ${token}` },
            });
            const tierData = await tierRes.json();
            if (tierData.success && tierData.data) {
              const avail = tierData.data;
              const stateById = new Map<string, { state: TierState; reason?: string }>(
                (avail.tiers || []).map((t: { id: string; state: TierState; reason?: string }) => [
                  t.id,
                  { state: t.state, reason: t.reason },
                ])
              );
              list = list.map((p) => {
                const s = stateById.get(p.id);
                return s ? { ...p, state: s.state, reason: s.reason } : p;
              });
              setTierInfo({
                currentTierName: avail.currentTierName,
                remainingCount: avail.remainingCount ?? 0,
                boughtCount: avail.boughtCount ?? 0,
                maxedOut: !!avail.maxedOut,
              });
            }
          } catch {
            // Non-fatal: fall back to all-available view
          }
        }

        setPackages(list);
      } else {
        setError(t('common.error'));
      }
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  const handleInvest = (pkg: PackageItem) => {
    if (!token) {
      navigate('login');
      return;
    }
    setConfirmPkg(pkg);
  };

  // Total balance available for investment = depositBalance + mainBalance
  const totalAvailableBalance = (user?.depositBalance || 0) + (user?.mainBalance || 0);

  const handleConfirmInvest = async () => {
    if (!token || !confirmPkg || investing) return;
    const pkg = confirmPkg;
    const hasEnoughBalance = totalAvailableBalance >= pkg.amount;

    if (hasEnoughBalance) {
      setInvesting(pkg.id);
      try {
        const res = await fetch('/api/investments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ packageId: pkg.id }),
        });
        const data = await res.json();

        if (data.success) {
          await hydrateUser();
          setConfirmPkg(null);
          setSuccessPkg(pkg);
          toast({ title: t('common.success'), description: data.message || t('paket.investSuccess') });
          // Refresh tier states so the newly active tier shows "Aktif" and
          // remaining unbought tiers stay purchasable.
          fetchPackages();
        } else {
          toast({ title: 'Gagal', description: data.error || t('common.operationFailed'), variant: 'destructive' });
          setConfirmPkg(null);
        }
      } catch {
        toast({ title: 'Error', description: t('common.networkError'), variant: 'destructive' });
        setConfirmPkg(null);
      } finally {
        setInvesting(null);
      }
    } else {
      setConfirmPkg(null);
      navigate('deposit', {
        amount: pkg.amount,
        purpose: 'investment',
        packageId: pkg.id,
        packageName: pkg.name,
        dailyProfit: pkg.dailyProfit,
        contractDays: pkg.contractDays,
      });
    }
  };

  const retry = () => {
    setError(null);
    setLoading(true);
    fetchPackages();
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6">
        <div className="animate-pulse space-y-6">
          <div className="glass rounded-2xl p-5 sm:p-8 h-32" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="glass rounded-2xl p-4 sm:p-6 h-64" />
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
            className="bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90 glow-gold"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('dashboard.tryAgain')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6 space-y-4 sm:space-y-6 pb-4 sm:pb-6">
      {/* Hero Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full glass border border-primary/20 mb-3">
          <Sparkles className="w-3 h-3 text-primary" />
          <span className="text-primary text-[10px] font-semibold tracking-wider uppercase">Paket Investasi</span>
        </div>
        <h1 className="text-gold-gradient text-2xl sm:text-4xl font-bold mb-2">
          Pilih Paket Investasi
        </h1>
        <p className="text-muted-foreground text-xs sm:text-base max-w-md mx-auto">
          Investasi dengan profit harian tetap, konsisten, dan transparan
        </p>
      </motion.div>

      {/* No-duplicates rule banner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-3 sm:p-4 border border-primary/15 flex items-start gap-3"
      >
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Info className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-foreground text-xs sm:text-sm font-semibold mb-0.5">
            1 Paket Aktif Saja · Tidak Boleh Beli Yg Sudah Dimiliki
          </p>
          <p className="text-muted-foreground text-[10px] sm:text-xs leading-relaxed">
            Paket &amp; Produk sama. Beli 1 macam per transaksi — boleh pilih paket
            mana saja yang <strong>belum dimiliki</strong>, tidak harus berurutan.
            Setiap paket hanya bisa dibeli sekali. Profit masuk otomatis setiap hari
            jam 00:00 sesuai paket aktif hari ini.
          </p>
          {tierInfo && (
            <p className="text-emerald-400 text-[10px] sm:text-xs font-medium mt-1.5">
              {tierInfo.currentTierName
                ? <>Paket aktif Anda sekarang: <strong>{tierInfo.currentTierName}</strong></>
                : 'Anda belum punya paket aktif.'}
              {tierInfo.maxedOut
                ? ' · Anda sudah memiliki semua paket.'
                : ` · ${tierInfo.remainingCount} paket lagi bisa dibeli.`}
            </p>
          )}
        </div>
      </motion.div>

      {/* Package Cards Grid */}
      {packages.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {packages.map((pkg, index) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              index={index}
              onInvest={handleInvest}
              t={t}
            />
          ))}
        </div>
      ) : (
        <div className="glass rounded-2xl p-5 sm:p-8 lg:p-12 text-center">
          <Wallet className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">{t('paket.noPackages')}</p>
        </div>
      )}

      {/* Confirm Investment Dialog */}
      <Dialog open={!!confirmPkg} onOpenChange={(open) => { if (!open) setConfirmPkg(null); }}>
        <DialogContent className="glass-strong border-primary/20 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" />
              {t('paket.confirmInvestTitle')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {confirmPkg && totalAvailableBalance >= confirmPkg.amount
                ? 'Saldo akan dipotong untuk membayar modal investasi'
                : 'Saldo tidak mencukupi, Anda akan diarahkan ke deposit'}
            </DialogDescription>
          </DialogHeader>

          {confirmPkg && (
            <div className="space-y-3 py-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Paket</span>
                <span className="text-foreground font-medium">{confirmPkg.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Modal Investasi</span>
                <span className="text-gold-gradient font-bold text-lg">{formatRupiah(confirmPkg.amount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Profit Harian</span>
                <span className="text-emerald-400 font-semibold">{formatRupiah(confirmPkg.dailyProfit)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Kontrak</span>
                <span className="text-foreground font-medium">{confirmPkg.contractDays} Hari</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Profit</span>
                <span className="text-emerald-400 font-semibold">{formatRupiah(confirmPkg.totalProfit)}</span>
              </div>

              {/* Modal tidak kembali warning */}
              <div className="p-2.5 rounded-xl bg-amber-400/5 border border-amber-400/15">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-amber-400/90 text-[10px] leading-tight">
                    <strong>Modal tidak dikembalikan.</strong> Anda hanya menerima profit harian {formatRupiah(confirmPkg.dailyProfit)} selama {confirmPkg.contractDays} hari.
                  </p>
                </div>
              </div>

              <Separator className="bg-primary/10" />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Saldo Anda</span>
                <span className={`font-medium ${totalAvailableBalance >= confirmPkg.amount ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatRupiah(totalAvailableBalance)}
                </span>
              </div>
              {totalAvailableBalance >= confirmPkg.amount && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Sisa Saldo Setelah Invest</span>
                  <span className="text-foreground font-medium">
                    {formatRupiah(totalAvailableBalance - confirmPkg.amount)}
                  </span>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmPkg(null)}
              className="border-border/50 text-muted-foreground rounded-xl"
            >
              Batal
            </Button>
            <Button
              onClick={handleConfirmInvest}
              disabled={!!investing}
              className="bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90 glow-gold"
            >
              {investing ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('common.processing')}</div>
              ) : confirmPkg && totalAvailableBalance >= confirmPkg.amount ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Konfirmasi Invest</div>
              ) : (
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4" />
                  Deposit & Invest</div>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={!!successPkg} onOpenChange={(open) => { if (!open) { setSuccessPkg(null); navigate('assets'); } }}>
        <DialogContent className="glass-strong border-primary/20 max-w-sm">
          <DialogHeader>
            <div className="w-16 h-16 rounded-2xl bg-emerald-400/10 flex items-center justify-center mx-auto mb-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <DialogTitle className="text-foreground text-center">Investasi Berhasil!</DialogTitle>
            <DialogDescription className="text-muted-foreground text-center">
              {successPkg && `Selamat! Paket ${successPkg?.name} Anda telah aktif`}
            </DialogDescription>
          </DialogHeader>
          {successPkg && (
            <div className="space-y-2 py-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Modal Investasi</span>
                <span className="text-foreground font-semibold">{formatRupiah(successPkg.amount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Profit Harian</span>
                <span className="text-emerald-400 font-semibold">{formatRupiah(successPkg.dailyProfit)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Kontrak</span>
                <span className="text-foreground font-semibold">{successPkg.contractDays} Hari</span>
              </div>
              <Separator className="bg-primary/10" />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Profit Diterima</span>
                <span className="text-emerald-400 font-bold">{formatRupiah(successPkg.totalProfit)}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-400/5 border border-amber-400/15 mt-2">
                <p className="text-amber-400/80 text-[10px] leading-tight flex items-center gap-1.5">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  Modal tidak dikembalikan, hanya profit harian yang diterima
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => { setSuccessPkg(null); navigate('assets'); }}
              className="w-full bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90 glow-gold"
            >
              Lihat Aset Saya
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
