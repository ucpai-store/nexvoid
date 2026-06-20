'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ShoppingBag, ChevronRight, Clock, TrendingUp, Coins,
  CalendarDays, AlertCircle, Info, Sparkles, Wallet
} from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { useAuthStore } from '@/stores/auth-store';
import { formatRupiah } from '@/lib/auth';
import { getFileUrl } from '@/lib/file-url';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n';

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

/* ───────── Product Card ───────── */
function ProductCard({ product, onBuy, index, t }: { product: Product; onBuy: () => void; index: number; t: (key: string) => string }) {
  const quotaPercent = product.quota > 0 ? Math.round((product.quotaUsed / product.quota) * 100) : 0;
  const remaining = Math.max(product.quota - product.quotaUsed, 0);
  // Daily profit = estimated profit / duration
  const dailyProfit = product.duration > 0 ? product.estimatedProfit / product.duration : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.5 }}
      whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
      className="glass glow-gold rounded-2xl overflow-hidden group hover:glow-gold-strong transition-all duration-300 h-full flex flex-col border border-primary/10"
    >
      {/* Banner */}
      <div className="relative h-32 sm:h-44 overflow-hidden">
        {product.banner ? (
          <img src={getFileUrl(product.banner)} alt={product.name} className="w-full h-full object-cover" />
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
      </div>

      {/* Content */}
      <div className="p-3 sm:p-5 flex-1 flex flex-col">
        <h3 className="text-foreground font-semibold text-sm sm:text-lg mb-1 sm:mb-2 line-clamp-1">
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
            Modal tidak kembali, hanya profit harian
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

        {/* Total Profit */}
        <div className="glass-gold rounded-xl p-2 sm:p-2.5 mb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Coins className="w-3 h-3 text-primary" />
              <span className="text-muted-foreground text-[9px] uppercase tracking-wider">Total Profit</span>
            </div>
            <span className="text-gold-gradient text-xs sm:text-sm font-bold">{formatRupiah(product.estimatedProfit)}</span>
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

        {/* Buy Button */}
        <Button
          onClick={onBuy}
          className="w-full bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90 transition-all mt-auto h-9 sm:h-11 text-xs sm:text-sm"
        >
          Beli Sekarang
          <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 ml-1" />
        </Button>
      </div>
    </motion.div>
  );
}

/* ───────── Skeleton Card ───────── */
function SkeletonCard() {
  return (
    <div className="glass rounded-2xl overflow-hidden">
      <Skeleton className="h-40 sm:h-44 w-full" />
      <div className="p-4 sm:p-5 space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-8 w-1/2" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
        </div>
        <Skeleton className="h-2 w-full rounded-full" />
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   PRODUCTS PAGE (Main Component)
   ═══════════════════════════════════════════ */
export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const { navigate } = useAppStore();
  const { token } = useAuthStore();
  const t = useT();

  useEffect(() => {
    fetch('/api/products')
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setProducts(res.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleBuy = (product: Product) => {
    if (!token) {
      navigate('login');
    } else {
      navigate('product-detail', { productId: product.id });
    }
  };

  return (
    <div className="min-h-screen pb-2 sm:pb-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-4 sm:px-6 lg:px-8 pt-2 sm:pt-6 pb-3 sm:pb-4"
      >
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full glass border border-primary/20 mb-3">
          <Sparkles className="w-3 h-3 text-primary" />
          <span className="text-primary text-[10px] font-semibold tracking-wider uppercase">Produk Investasi</span>
        </div>
        <h1 className="text-xl sm:text-3xl font-bold text-foreground mb-0.5 sm:mb-1">
          <span className="text-gold-gradient">Produk Investasi</span>
        </h1>
        <p className="text-muted-foreground text-xs sm:text-sm">
          Pilih produk investasi dengan profit harian tetap
        </p>
      </motion.div>

      {/* Important Info Banner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="px-4 sm:px-6 lg:px-8 mb-4"
      >
        <div className="glass rounded-2xl p-3 sm:p-4 border border-amber-400/15">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-400/10 flex items-center justify-center shrink-0">
              <Info className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="text-foreground text-xs sm:text-sm font-semibold mb-0.5">Informasi Penting</p>
              <p className="text-muted-foreground text-[10px] sm:text-xs leading-relaxed">
                Harga produk <span className="text-amber-400 font-medium">tidak dikembalikan</span>. Anda hanya akan menerima <span className="text-emerald-400 font-medium">profit harian</span> selama periode kontrak berlangsung.
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Products Grid */}
      <div className="px-4 sm:px-6 lg:px-8 pb-4">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : products.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
            {products.map((product, i) => (
              <ProductCard
                key={product.id}
                product={product}
                onBuy={() => handleBuy(product)}
                index={i}
                t={t}
              />
            ))}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass rounded-2xl p-8 sm:p-12 text-center"
          >
            <ShoppingBag className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-foreground font-semibold text-lg mb-2">{t("products.noProducts")}</h3>
            <p className="text-muted-foreground text-sm">{t('products.noProducts')}</p>
          </motion.div>
        )}
      </div>

      {/* How it works section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="px-4 sm:px-6 lg:px-8 mt-4"
      >
        <div className="glass rounded-2xl p-4 sm:p-6">
          <h3 className="text-foreground font-semibold text-sm sm:text-base mb-4 flex items-center gap-2">
            <Info className="w-4 h-4 text-primary" />
            Cara Kerja Produk Investasi
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-primary text-xs font-bold">1</span>
              </div>
              <div>
                <p className="text-foreground text-xs font-medium mb-0.5">Pilih Produk</p>
                <p className="text-muted-foreground text-[10px] leading-tight">Pilih produk sesuai harga & target profit</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-primary text-xs font-bold">2</span>
              </div>
              <div>
                <p className="text-foreground text-xs font-medium mb-0.5">Bayar Harga</p>
                <p className="text-muted-foreground text-[10px] leading-tight">Harga dipotong dari saldo deposit/utama</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-primary text-xs font-bold">3</span>
              </div>
              <div>
                <p className="text-foreground text-xs font-medium mb-0.5">Terima Profit Harian</p>
                <p className="text-muted-foreground text-[10px] leading-tight">Profit masuk otomatis setiap hari selama kontrak</p>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-primary/10">
            <p className="text-amber-400/80 text-[10px] sm:text-xs flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3 shrink-0" />
              <span><strong>Catatan:</strong> Harga produk tidak dikembalikan. Hanya profit harian yang Anda terima selama periode kontrak.</span>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
