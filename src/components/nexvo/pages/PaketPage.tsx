'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, ShieldCheck, Clock, Loader2,
  AlertTriangle, RefreshCw, Wallet, CheckCircle2
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
}

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
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4, ease: 'easeOut' }}
      whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
      className="group glass-strong rounded-2xl p-3 sm:p-5 lg:p-6 flex flex-col relative overflow-hidden hover:glow-gold hover:border-[#D4AF37]/30 transition-all duration-300"
    >
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-[#D4AF37]/3 blur-3xl group-hover:bg-[#D4AF37]/8 transition-colors" />

      {/* Package name */}
      <div className="relative z-10">
        <h3 className="text-foreground font-semibold text-sm mb-1">{pkg.name}</h3>

        {/* Amount */}
        <div className="mb-3">
          <span className="text-gold-gradient text-2xl sm:text-3xl font-bold tracking-tight">
            {formatRupiah(pkg.amount)}
          </span>
        </div>

        {/* Details */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-400/10 flex items-center justify-center shrink-0">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div>
              <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Profit Harian</p>
              <p className="text-emerald-400 text-sm font-semibold">{formatRupiah(pkg.dailyProfit)}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-400/10 flex items-center justify-center shrink-0">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div>
              <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Kontrak</p>
              <p className="text-foreground text-sm font-medium">{pkg.contractDays} {t('paket.contractDays')}</p>
            </div>
          </div>
        </div>

        {/* Capital Return badge */}
        <Badge className="bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 text-[10px] font-medium mb-4">
          <ShieldCheck className="w-3 h-3 mr-1" />
          {t('paket.capitalReturn')}
        </Badge>

        {/* Total profit preview */}
        <p className="text-muted-foreground text-[10px] mb-4">
          {t('paket.totalProfitDays').replace('{days}', String(pkg.contractDays))}: <span className="text-emerald-400 font-semibold">{formatRupiah(pkg.totalProfit)}</span>
        </p>

        {/* Invest button */}
        <Button
          onClick={() => onInvest(pkg)}
          className="w-full h-11 bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 transition-all glow-gold text-sm"
        >
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4" />
            {t('paket.investNow')}
          </div>
        </Button>
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

  const fetchPackages = useCallback(async () => {
    try {
      const res = await fetch('/api/packages');
      const data = await res.json();
      if (data.success) {
        setPackages(data.data || []);
      } else {
        setError(t('common.error'));
      }
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, []);

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
    if (!token || !confirmPkg) return;
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
            className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('dashboard.tryAgain')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6 space-y-6 sm:space-y-8 pb-4 sm:pb-6">
      {/* Hero Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h1 className="text-gold-gradient text-3xl sm:text-4xl font-bold mb-2">
          {t('paket.investmentPackages')}
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto">
          {t('paket.selectPackage')}
        </p>
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
        <DialogContent className="glass-strong border-[#D4AF37]/20 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Wallet className="w-5 h-5 text-[#D4AF37]" />
              {t('paket.confirmInvestTitle')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {confirmPkg && totalAvailableBalance >= confirmPkg.amount
                ? t('paket.balanceDeduct')
                : t('paket.insufficientBalance')}
            </DialogDescription>
          </DialogHeader>

          {confirmPkg && (
            <div className="space-y-3 py-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('paket.packageLabel')}</span>
                <span className="text-foreground font-medium">{confirmPkg.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('paket.modal')}</span>
                <span className="text-gold-gradient font-bold text-lg">{formatRupiah(confirmPkg.amount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('paket.dailyProfit')}</span>
                <span className="text-emerald-400 font-semibold">{formatRupiah(confirmPkg.dailyProfit)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('paket.contractLabel')}</span>
                <span className="text-foreground font-medium">{confirmPkg.contractDays} Hari</span>
              </div>
              <Separator className="bg-[#D4AF37]/10" />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('paket.yourBalance')}</span>
                <span className={`font-medium ${totalAvailableBalance >= confirmPkg.amount ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatRupiah(totalAvailableBalance)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground/60">Saldo Deposit</span>
                <span className="text-blue-400">{formatRupiah(user?.depositBalance || 0)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground/60">Saldo Utama</span>
                <span className="text-[#D4AF37]">{formatRupiah(user?.mainBalance || 0)}</span>
              </div>
              {totalAvailableBalance >= confirmPkg.amount && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('paket.remainingBalance')}</span>
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
              className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold"
            >
              {investing ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('common.processing')}</div>
              ) : confirmPkg && totalAvailableBalance >= confirmPkg.amount ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  {t('paket.confirmInvest')}</div>
              ) : (
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4" />
                  {t('paket.depositInvest')}</div>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={!!successPkg} onOpenChange={(open) => { if (!open) { setSuccessPkg(null); navigate('assets'); } }}>
        <DialogContent className="glass-strong border-[#D4AF37]/20 max-w-sm">
          <DialogHeader>
            <div className="w-16 h-16 rounded-2xl bg-emerald-400/10 flex items-center justify-center mx-auto mb-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <DialogTitle className="text-foreground text-center">{t('paket.investSuccessTitle')}</DialogTitle>
            <DialogDescription className="text-muted-foreground text-center">
              {successPkg && t('paket.investSuccessDesc').replace('{name}', successPkg?.name || '')}
            </DialogDescription>
          </DialogHeader>
          {successPkg && (
            <div className="space-y-2 py-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('paket.modal')}</span>
                <span className="text-foreground font-semibold">{formatRupiah(successPkg.amount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('paket.dailyProfit')}</span>
                <span className="text-emerald-400 font-semibold">{formatRupiah(successPkg.dailyProfit)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('paket.totalProfitDays').replace('{days}', String(successPkg?.contractDays || 0))}</span>
                <span className="text-emerald-400 font-semibold">{formatRupiah(successPkg.totalProfit)}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => { setSuccessPkg(null); navigate('assets'); }}
              className="w-full bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold"
            >
              {t('paket.viewMyAssets')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
