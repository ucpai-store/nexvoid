'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Info,
  TrendingUp, ShieldCheck, Clock, Loader2,
  AlertTriangle, RefreshCw, Wallet, CheckCircle2,
  Coins, CalendarDays, ShoppingBag, AlertCircle, ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { formatRupiah } from '@/lib/auth';
import { getFileUrl } from '@/lib/file-url';
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
import { WeekendNoticeBanner } from '@/components/nexvo/shared/WeekendNoticeBanner';

/* ───────── Types ───────── */
type TierState = 'available' | 'active' | 'bought';

interface ProductItem {
  id: string;
  name: string;
  price: number;
  duration: number;
  estimatedProfit: number;
  quota: number;
  quotaUsed: number;
  description: string;
  profitRate: number;
  banner: string;
  isActive: boolean;
  isStopped: boolean;
  /** no-duplicates purchase state for the current user */
  state?: TierState;
  reason?: string;
}

/* ───────── Package Card Component ───────── */
function ProductCard({
  product,
  index,
  onBuy,
  t,
}: {
  product: ProductItem;
  index: number;
  onBuy: (p: ProductItem) => void;
  t: (key: string) => string;
}) {
  // No-duplicates state for the current user
  const state: TierState = product.state ?? 'available';
  const isActive = state === 'active';
  const isAvailable = state === 'available';
  const isBought = state === 'bought';

  // Re-activation: available AND has a "Kontrak sebelumnya sudah berakhir" reason
  const isReactivation = isAvailable && !!(product.reason || '').toLowerCase().includes('berakhir');

  const canBuy = isAvailable;

  const quotaPercent = product.quota > 0 ? Math.round((product.quotaUsed / product.quota) * 100) : 0;
  const remaining = Math.max(product.quota - product.quotaUsed, 0);
  // Compute daily profit directly from price × profitRate / 100 (source of truth).
  // Avoids drift if estimatedProfit in DB is stale — always matches what the cron credits.
  const dailyProfit = Math.floor(product.price * ((product.profitRate || 0) / 100));
  // Total profit = dailyProfit × duration (modal TIDAK dikembalikan, hanya profit)
  const totalProfit = dailyProfit * (product.duration || 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4, ease: 'easeOut' }}
      whileHover={canBuy ? { scale: 1.02, transition: { duration: 0.2 } } : undefined}
      className={`group glass-strong rounded-2xl overflow-hidden flex flex-col relative border border-primary/10 ${canBuy ? 'hover:glow-gold-strong' : ''} transition-all duration-300 ${!canBuy ? 'opacity-70' : ''}`}
    >
      {/* Banner */}
      <div className="relative h-32 sm:h-44 overflow-hidden">
        {product.banner ? (
          <img
            src={getFileUrl(product.banner)}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-card-gradient flex items-center justify-center">
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-primary/5 blur-3xl" />
            <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-[#1E3A5F]/20 blur-2xl" />
            <ShoppingBag className="w-12 h-12 text-primary/30" />
          </div>
        )}

        {/* Profit Rate Badge */}
        <div className="absolute top-2 right-2 sm:top-3 sm:right-3">
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[9px] sm:text-[10px] font-semibold backdrop-blur-sm">
            <TrendingUp className="w-2.5 h-2.5 mr-1" />
            +{product.profitRate}%/hari
          </Badge>
        </div>

        {/* State ribbon (AKTIF / SELESAI / RE-AKTIVASI) */}
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
        {isReactivation && (
          <div className="absolute top-0 left-0 bg-amber-500/90 text-white text-[9px] font-bold px-3 py-1 rounded-br-xl flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> RE-AKTIVASI
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 sm:p-5 flex-1 flex flex-col">
        {/* Product name */}
        <h3 className="text-foreground font-bold text-sm sm:text-lg mb-1 sm:mb-2 line-clamp-1">
          {product.name}
        </h3>

        {/* Price */}
        <div className="mb-2 sm:mb-3">
          <p className="text-muted-foreground text-[9px] uppercase tracking-wider mb-0.5">Harga Produk</p>
          <div className="text-lg sm:text-3xl font-bold text-gold-gradient">
            {formatRupiah(product.price)}
          </div>
        </div>

        {/* Modal tidak kembali warning */}
        <div className="flex items-start gap-1.5 mb-3 p-2 rounded-lg bg-amber-400/5 border border-amber-400/15">
          <AlertCircle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-400/80 text-[9px] sm:text-[10px] leading-tight">
            Profit {formatRupiah(dailyProfit)}/hari masuk setiap hari jam 00:00. Modal tidak dikembalikan.
          </p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="glass rounded-xl p-2 sm:p-2.5">
            <div className="flex items-center gap-1.5 mb-0.5">
              <CalendarDays className="w-3 h-3 text-blue-400" />
              <span className="text-muted-foreground text-[9px] uppercase tracking-wider">Kontrak</span>
            </div>
            <p className="text-foreground text-[11px] sm:text-sm font-bold">{product.duration} Hari</p>
          </div>
          <div className="glass rounded-xl p-2 sm:p-2.5">
            <div className="flex items-center gap-1.5 mb-0.5">
              <TrendingUp className="w-3 h-3 text-emerald-400" />
              <span className="text-muted-foreground text-[9px] uppercase tracking-wider">Profit/Hari</span>
            </div>
            <p className="text-emerald-400 text-[11px] sm:text-sm font-bold">{formatRupiah(dailyProfit)}</p>
          </div>
        </div>

        {/* Total Profit preview */}
        <div className="glass-gold rounded-xl p-2 sm:p-2.5 mb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Coins className="w-3 h-3 text-primary" />
              <span className="text-muted-foreground text-[9px] uppercase tracking-wider">Total Profit</span>
            </div>
            <span className="text-gold-gradient text-xs sm:text-sm font-bold">{formatRupiah(totalProfit)}</span>
          </div>
        </div>

        {/* Quota Bar */}
        <div className="mb-3 sm:mb-4">
          <div className="flex items-center justify-between text-[10px] sm:text-xs mb-1">
            <span className="text-muted-foreground">Kuota Terisi</span>
            <span className="text-foreground font-medium">{quotaPercent}%</span>
          </div>
          <div className="h-1.5 sm:h-2 rounded-full bg-foreground/5 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${quotaPercent}%` }}
              transition={{ duration: 1, delay: 0.3 + index * 0.08 }}
              className="h-full rounded-full bg-gold-gradient"
            />
          </div>
          <div className="flex items-center justify-between text-[9px] sm:text-[10px] mt-0.5 sm:mt-1">
            <span className="text-muted-foreground">Sisa: {remaining}</span>
            <span className="text-muted-foreground">{product.quotaUsed}/{product.quota}</span>
          </div>
        </div>

        {/* Bought/active/reactivation reason */}
        {(isActive || isBought || isReactivation) && product.reason && (
          <div className={`flex items-start gap-1.5 mb-3 p-2 rounded-lg border ${
            isReactivation
              ? 'bg-amber-400/5 border-amber-400/20'
              : 'bg-slate-400/5 border-slate-400/15'
          }`}>
            <Info className={`w-3 h-3 shrink-0 mt-0.5 ${isReactivation ? 'text-amber-400' : 'text-slate-400'}`} />
            <p className={`text-[10px] leading-tight ${isReactivation ? 'text-amber-400/90' : 'text-slate-400'}`}>{product.reason}</p>
          </div>
        )}

        {/* Buy button — any available product is purchasable (incl. re-activation after contract end) */}
        {isActive ? (
          <div className="w-full h-9 sm:h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 mt-auto">
            <CheckCircle2 className="w-4 h-4" /> Sedang Aktif
          </div>
        ) : isBought ? (
          <div className="w-full h-9 sm:h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400/80 font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 mt-auto">
            <CheckCircle2 className="w-4 h-4" /> Sudah Dimiliki
          </div>
        ) : (
          <Button
            onClick={() => onBuy(product)}
            className="w-full bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90 transition-all glow-gold mt-auto h-9 sm:h-11 text-xs sm:text-sm"
          >
            <div className="flex items-center gap-2">
              {isReactivation ? <RefreshCw className="w-4 h-4" /> : <Wallet className="w-4 h-4" />}
              {isReactivation ? 'Aktifkan Lagi' : 'Beli Sekarang'}
              <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </Button>
        )}
      </div>
    </motion.div>
  );
}

/* ───────── Main ProductsPage ───────── */
export default function ProductsPage() {
  const { token, user, hydrateUser } = useAuthStore();
  const { navigate } = useAppStore();
  const t = useT();
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [investing, setInvesting] = useState<string | null>(null);
  const [confirmPkg, setConfirmPkg] = useState<ProductItem | null>(null);
  const [successPkg, setSuccessPkg] = useState<ProductItem | null>(null);

  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      if (data.success) {
        let list: ProductItem[] = data.data || [];

        // If authenticated, merge in the user's no-duplicates purchase state.
        if (token) {
          try {
            const tierRes = await fetch('/api/products/tiers', {
              headers: { Authorization: `Bearer ${token}` },
            });
            const tierData = await tierRes.json();
            if (tierData.success && tierData.data) {
              const avail = tierData.data;
              const stateById = new Map<string, { state: TierState; reason?: string }>(
                (avail.tiers || []).map((it: { id: string; state: TierState; reason?: string }) => [
                  it.id,
                  { state: it.state, reason: it.reason },
                ])
              );
              list = list.map((p) => {
                const s = stateById.get(p.id);
                return s ? { ...p, state: s.state, reason: s.reason } : p;
              });
            }
          } catch {
            // Non-fatal: fall back to all-available view
          }
        }

        setProducts(list);
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
    fetchProducts();
  }, [fetchProducts]);

  const handleBuy = (p: ProductItem) => {
    if (!token) {
      navigate('login');
      return;
    }
    setConfirmPkg(p);
  };

  // Total balance available for investment = depositBalance + mainBalance
  const totalAvailableBalance = (user?.depositBalance || 0) + (user?.mainBalance || 0);

  const handleConfirmBuy = async () => {
    if (!token || !confirmPkg || investing) return;
    const p = confirmPkg;
    const hasEnoughBalance = totalAvailableBalance >= p.price;

    if (hasEnoughBalance) {
      setInvesting(p.id);
      try {
        const res = await fetch('/api/products', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action: 'buy', productId: p.id, quantity: 1 }),
        });
        const data = await res.json();

        if (data.success) {
          await hydrateUser();
          setConfirmPkg(null);
          setSuccessPkg(p);
          toast({ title: t('common.success'), description: data.message || t('paket.investSuccess') });
          // Refresh tier states so the newly active product shows "Aktif" and
          // remaining unbought products stay purchasable.
          fetchProducts();
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
        amount: p.price,
        purpose: 'investment',
        packageId: p.id,
        packageName: p.name,
        dailyProfit: Math.floor(p.price * ((p.profitRate || 0) / 100)),
        contractDays: p.duration,
      });
    }
  };

  const retry = () => {
    setError(null);
    setLoading(true);
    fetchProducts();
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
      <WeekendNoticeBanner activity="Pembelian produk" />
      {/* Hero Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full glass border border-primary/20 mb-3">
          <ShoppingBag className="w-3 h-3 text-primary" />
          <span className="text-primary text-[10px] font-semibold tracking-wider uppercase">Produk Investasi</span>
        </div>
        <h1 className="text-gold-gradient text-2xl sm:text-4xl font-bold mb-2">
          Pilih Produk Investasi
        </h1>
        <p className="text-muted-foreground text-xs sm:text-base max-w-md mx-auto">
          Investasi dengan profit harian tetap, konsisten, dan transparan
        </p>
      </motion.div>

      {/* Product Cards Grid */}
      {products.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {products.map((p, index) => (
            <ProductCard
              key={p.id}
              product={p}
              index={index}
              onBuy={handleBuy}
              t={t}
            />
          ))}
        </div>
      ) : (
        <div className="glass rounded-2xl p-5 sm:p-8 lg:p-12 text-center">
          <ShoppingBag className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">{t('paket.noPackages')}</p>
        </div>
      )}

      {/* Confirm Buy Dialog */}
      <Dialog open={!!confirmPkg} onOpenChange={(open) => { if (!open) setConfirmPkg(null); }}>
        <DialogContent className="glass-strong border-primary/20 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" />
              Konfirmasi Pembelian
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {confirmPkg && totalAvailableBalance >= confirmPkg.price
                ? 'Saldo akan dipotong untuk membayar harga produk'
                : 'Saldo tidak mencukupi, Anda akan diarahkan ke deposit'}
            </DialogDescription>
          </DialogHeader>

          {confirmPkg && (
            <div className="space-y-3 py-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Produk</span>
                <span className="text-foreground font-medium">{confirmPkg.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Harga</span>
                <span className="text-gold-gradient font-bold text-lg">{formatRupiah(confirmPkg.price)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Profit Harian</span>
                <span className="text-emerald-400 font-semibold">
                  {formatRupiah(Math.floor(confirmPkg.price * ((confirmPkg.profitRate || 0) / 100)))}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Kontrak</span>
                <span className="text-foreground font-medium">{confirmPkg.duration} Hari</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Profit</span>
                <span className="text-emerald-400 font-semibold">{formatRupiah(Math.floor(confirmPkg.price * ((confirmPkg.profitRate || 0) / 100)) * confirmPkg.duration)}</span>
              </div>

              {/* Modal tidak kembali warning */}
              <div className="p-2.5 rounded-xl bg-amber-400/5 border border-amber-400/15">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-amber-400/90 text-[10px] leading-tight">
                    <strong>Modal tidak dikembalikan.</strong> Anda hanya menerima profit harian{' '}
                    {formatRupiah(Math.floor(confirmPkg.price * ((confirmPkg.profitRate || 0) / 100)))}{' '}
                    selama {confirmPkg.duration} hari.
                  </p>
                </div>
              </div>

              <Separator className="bg-primary/10" />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Saldo Anda</span>
                <span className={`font-medium ${totalAvailableBalance >= confirmPkg.price ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatRupiah(totalAvailableBalance)}
                </span>
              </div>
              {totalAvailableBalance >= confirmPkg.price && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Sisa Saldo Setelah Beli</span>
                  <span className="text-foreground font-medium">
                    {formatRupiah(totalAvailableBalance - confirmPkg.price)}
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
              onClick={handleConfirmBuy}
              disabled={!!investing}
              className="bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90 glow-gold"
            >
              {investing ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('common.processing')}</div>
              ) : confirmPkg && totalAvailableBalance >= confirmPkg.price ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Konfirmasi Beli</div>
              ) : (
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4" />
                  Deposit & Beli</div>
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
            <DialogTitle className="text-foreground text-center">Pembelian Berhasil!</DialogTitle>
            <DialogDescription className="text-muted-foreground text-center">
              {successPkg && `Selamat! Produk ${successPkg?.name} Anda telah aktif`}
            </DialogDescription>
          </DialogHeader>
          {successPkg && (
            <div className="space-y-2 py-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Harga Produk</span>
                <span className="text-foreground font-semibold">{formatRupiah(successPkg.price)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Profit Harian</span>
                <span className="text-emerald-400 font-semibold">
                  {formatRupiah(Math.floor(successPkg.price * ((successPkg.profitRate || 0) / 100)))}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Kontrak</span>
                <span className="text-foreground font-semibold">{successPkg.duration} Hari</span>
              </div>
              <Separator className="bg-primary/10" />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Profit Diterima</span>
                <span className="text-emerald-400 font-bold">{formatRupiah(Math.floor(successPkg.price * ((successPkg.profitRate || 0) / 100)) * successPkg.duration)}</span>
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
