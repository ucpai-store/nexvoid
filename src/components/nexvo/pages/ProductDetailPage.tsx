'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Clock, TrendingUp, Package, ShoppingBag,
  Minus, Plus, AlertTriangle, CheckCircle2, Loader2,
  Wallet
} from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { useAuthStore } from '@/stores/auth-store';
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
import { Skeleton } from '@/components/ui/skeleton';

/* ───────── Types ───────── */
interface Product {
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
}

/* ═══════════════════════════════════════════
   PRODUCT DETAIL PAGE
   ═══════════════════════════════════════════ */
export default function ProductDetailPage() {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [buying, setBuying] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const { pageData, navigate } = useAppStore();
  const { token, user, hydrateUser } = useAuthStore();

  useEffect(() => {
    const productId = pageData?.productId as string;
    if (productId) {
      fetch(`/api/products?id=${productId}`)
        .then((r) => r.json())
        .then((res) => {
          if (res.success && res.data) {
            setProduct(res.data);
          } else {
            toast({ title: 'Produk tidak ditemukan', variant: 'destructive' });
            navigate('products');
          }
        })
        .catch(() => {
          toast({ title: 'Gagal memuat produk', variant: 'destructive' });
        })
        .finally(() => setLoading(false));
    } else {
      navigate('products');
    }
  }, [pageData, navigate]);

  const totalPrice = product ? product.price * quantity : 0;
  const totalEstimatedProfit = product ? product.estimatedProfit * quantity : 0;
  const quotaPercent = product && product.quota > 0 ? Math.round((product.quotaUsed / product.quota) * 100) : 0;
  const remaining = product ? Math.max(product.quota - product.quotaUsed, 0) : 0;
  const hasEnoughBalance = ((user?.depositBalance || 0) + (user?.mainBalance || 0)) >= totalPrice;

  const handleBuyClick = () => {
    if (!token) {
      navigate('login');
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirmBuy = async () => {
    if (!token || !product) return;
    setBuying(true);

    try {
      if (hasEnoughBalance) {
        // Direct buy with balance
        const res = await fetch('/api/products', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: 'buy',
            productId: product.id,
            quantity,
          }),
        });
        const data = await res.json();

        if (data.success) {
          await hydrateUser();
          setConfirmOpen(false);
          setSuccessOpen(true);
        } else {
          toast({ title: 'Gagal', description: data.error || 'Pembelian gagal', variant: 'destructive' });
          setConfirmOpen(false);
        }
      } else {
        // Not enough balance → redirect to deposit page with product context
        setConfirmOpen(false);
        navigate('deposit', {
          amount: totalPrice,
          purpose: 'product',
          productId: product.id,
          productName: product.name,
          quantity,
        });
      }
    } catch {
      toast({ title: 'Error', description: 'Terjadi kesalahan jaringan', variant: 'destructive' });
    } finally {
      setBuying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pb-4 sm:pb-6">
        <div className="px-4 sm:px-6 lg:px-8 pt-4">
          <Skeleton className="h-8 w-32 mb-4" />
          <Skeleton className="h-56 w-full rounded-2xl mb-6" />
          <Skeleton className="h-8 w-3/4 mb-2" />
          <Skeleton className="h-10 w-1/2 mb-6" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass rounded-3xl p-8 sm:p-12 text-center max-w-md mx-auto glow-gold animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-red-400/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-foreground text-xl font-semibold mb-2">Produk Tidak Ditemukan</h2>
          <p className="text-muted-foreground text-sm mb-4">Produk yang Anda cari tidak tersedia atau telah dihapus.</p>
          <Button onClick={() => navigate('products')} className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl">
            Kembali ke Produk
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-4 sm:pb-6">
      {/* Back Button */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="px-4 sm:px-6 lg:px-8 pt-3 sm:pt-4 pb-2"
      >
        <button
          onClick={() => navigate('products')}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Kembali</span>
        </button>
      </motion.div>

      {/* Banner */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="px-4 sm:px-6 lg:px-8 mb-4 sm:mb-6"
      >
        <div className="relative h-48 sm:h-64 lg:h-72 rounded-2xl overflow-hidden glow-gold">
          {product.banner ? (
            <img src={getFileUrl(product.banner)} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-card-gradient flex items-center justify-center">
              <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-[#D4AF37]/5 blur-3xl" />
              <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full bg-[#1E3A5F]/20 blur-3xl" />
              <Package className="w-16 h-16 text-[#D4AF37]/20" />
            </div>
          )}
        </div>
      </motion.div>

      {/* Product Info */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="px-4 sm:px-6 lg:px-8"
      >
        {/* Name & Price */}
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gold-gradient mb-2">
          {product.name}
        </h1>
        <div className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
          {formatRupiah(product.price)}
        </div>

        {/* Key Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 sm:mb-6">
          <div className="glass glow-gold rounded-2xl p-4 text-center">
            <Clock className="w-5 h-5 text-[#D4AF37] mx-auto mb-2" />
            <p className="text-foreground font-semibold text-lg">{product.duration}</p>
            <p className="text-muted-foreground text-xs">Hari Durasi</p>
          </div>
          <div className="glass glow-gold rounded-2xl p-4 text-center">
            <TrendingUp className="w-5 h-5 text-emerald-400 mx-auto mb-2" />
            <p className="text-emerald-400 font-semibold text-lg">{formatRupiah(product.estimatedProfit)}</p>
            <p className="text-muted-foreground text-xs">Est. Profit</p>
          </div>
          <div className="glass glow-gold rounded-2xl p-4 text-center">
            <TrendingUp className="w-5 h-5 text-[#D4AF37] mx-auto mb-2" />
            <p className="text-foreground font-semibold text-lg">{product.profitRate}%</p>
            <p className="text-muted-foreground text-xs">Profit Rate</p>
          </div>
          <div className="glass glow-gold rounded-2xl p-4 text-center">
            <Package className="w-5 h-5 text-blue-400 mx-auto mb-2" />
            <p className="text-foreground font-semibold text-lg">{remaining}</p>
            <p className="text-muted-foreground text-xs">Kuota Tersisa</p>
          </div>
        </div>

        {/* Quota Progress */}
        <div className="glass rounded-2xl p-3 sm:p-4 mb-4 sm:mb-6">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-muted-foreground">Kuota Terisi</span>
            <span className="text-foreground font-medium">{quotaPercent}%</span>
          </div>
          <div className="h-3 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${quotaPercent}%` }}
              transition={{ duration: 1, delay: 0.5 }}
              className="h-full rounded-full bg-gold-gradient"
            />
          </div>
          <div className="flex items-center justify-between text-xs mt-2">
            <span className="text-muted-foreground">Terisi: {product.quotaUsed}</span>
            <span className="text-muted-foreground">Total: {product.quota}</span>
          </div>
        </div>

        {/* Description */}
        <div className="glass rounded-2xl p-3 sm:p-5 mb-4 sm:mb-6">
          <h3 className="text-foreground font-semibold text-sm sm:text-base mb-3">Deskripsi Produk</h3>
          <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">
            {product.description || 'Tidak ada deskripsi tersedia untuk produk ini.'}
          </p>
        </div>

        <Separator className="bg-[#D4AF37]/10 mb-4 sm:mb-6" />

        {/* Quantity Selector */}
        <div className="glass rounded-2xl p-3 sm:p-5 mb-4 sm:mb-6">
          <h3 className="text-foreground font-semibold text-sm sm:text-base mb-3 sm:mb-4">Jumlah Pembelian</h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-10 h-10 rounded-xl glass flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                <Minus className="w-4 h-4 text-foreground" />
              </button>
              <span className="text-foreground text-2xl font-bold w-12 text-center">{quantity}</span>
              <button
                onClick={() => setQuantity(Math.min(remaining > 0 ? remaining : 10, quantity + 1))}
                className="w-10 h-10 rounded-xl glass flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                <Plus className="w-4 h-4 text-foreground" />
              </button>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground text-xs">Total Harga</p>
              <p className="text-gold-gradient text-xl font-bold">{formatRupiah(totalPrice)}</p>
            </div>
          </div>
          {quantity > 1 && (
            <div className="mt-3 pt-3 border-t border-[#D4AF37]/10">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total Est. Profit</span>
                <span className="text-emerald-400 font-medium">{formatRupiah(totalEstimatedProfit)}</span>
              </div>
            </div>
          )}
          {/* Balance info */}
          <div className="mt-3 pt-3 border-t border-[#D4AF37]/10">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total Saldo</span>
              <span className={`font-medium ${hasEnoughBalance ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatRupiah((user?.depositBalance || 0) + (user?.mainBalance || 0))}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-muted-foreground/60">Saldo Deposit</span>
              <span className="text-blue-400">{formatRupiah(user?.depositBalance || 0)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground/60">Saldo Utama</span>
              <span className="text-[#D4AF37]">{formatRupiah(user?.mainBalance || 0)}</span>
            </div>
            {!hasEnoughBalance && (
              <p className="text-red-400 text-xs mt-1">
                Saldo kurang {formatRupiah(totalPrice - (user?.depositBalance || 0) - (user?.mainBalance || 0))}. Anda akan diarahkan ke deposit.
              </p>
            )}
          </div>
        </div>

        {/* Buy Button */}
        <Button
          onClick={handleBuyClick}
          disabled={remaining <= 0}
          className="w-full bg-gold-gradient text-[#070B14] font-semibold rounded-2xl hover:opacity-90 transition-all h-14 text-base glow-gold-strong"
        >
          {remaining <= 0 ? (
            <>
              <AlertTriangle className="w-5 h-5 mr-2" />
              Kuota Habis
            </>
          ) : hasEnoughBalance ? (
            <>
              <ShoppingBag className="w-5 h-5 mr-2" />
              Beli Sekarang - {formatRupiah(totalPrice)}
            </>
          ) : (
            <>
              <Wallet className="w-5 h-5 mr-2" />
              Deposit & Beli - {formatRupiah(totalPrice)}
            </>
          )}
        </Button>

        <p className="text-muted-foreground text-xs text-center mt-3">
          {hasEnoughBalance
            ? 'Saldo akan dipotong dari saldo deposit & utama Anda'
            : 'Anda akan diarahkan ke halaman deposit terlebih dahulu'}
        </p>
      </motion.div>

      {/* Confirm Purchase Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="glass-strong border-[#D4AF37]/20 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-[#D4AF37]" />
              Konfirmasi Pembelian
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {hasEnoughBalance
                ? 'Saldo akan dipotong dari saldo deposit & utama Anda'
                : 'Saldo tidak mencukupi, Anda akan diarahkan ke deposit'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Produk</span>
              <span className="text-foreground font-medium">{product.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Jumlah</span>
              <span className="text-foreground font-medium">{quantity}x</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Harga Satuan</span>
              <span className="text-foreground font-medium">{formatRupiah(product.price)}</span>
            </div>
            <Separator className="bg-[#D4AF37]/10" />
            <div className="flex justify-between text-base">
              <span className="text-foreground font-semibold">Total</span>
              <span className="text-gold-gradient font-bold text-lg">{formatRupiah(totalPrice)}</span>
            </div>
            {hasEnoughBalance && (
              <>
                <Separator className="bg-[#D4AF37]/10" />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Sisa Saldo</span>
                  <span className="text-foreground font-medium">
                    {formatRupiah(((user?.depositBalance || 0) + (user?.mainBalance || 0)) - totalPrice)}
                  </span>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              className="border-border/50 text-muted-foreground rounded-xl"
            >
              Batal
            </Button>
            <Button
              onClick={handleConfirmBuy}
              disabled={buying}
              className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold"
            >
              {buying ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Memproses...
                </div>
              ) : hasEnoughBalance ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Konfirmasi Beli
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4" />
                  Deposit Sekarang
                </div>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={successOpen} onOpenChange={(open) => { if (!open) navigate('history'); }}>
        <DialogContent className="glass-strong border-[#D4AF37]/20 max-w-sm">
          <DialogHeader>
            <div className="w-16 h-16 rounded-2xl bg-emerald-400/10 flex items-center justify-center mx-auto mb-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <DialogTitle className="text-foreground text-center">Pembelian Berhasil!</DialogTitle>
            <DialogDescription className="text-muted-foreground text-center">
              {product.name} x{quantity} telah berhasil dibeli
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Pembayaran</span>
              <span className="text-foreground font-semibold">{formatRupiah(totalPrice)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Est. Profit</span>
              <span className="text-emerald-400 font-semibold">{formatRupiah(totalEstimatedProfit)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => navigate('history')}
              className="w-full bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold"
            >
              Lihat Riwayat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
