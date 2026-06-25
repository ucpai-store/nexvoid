'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUpCircle, AlertTriangle, Clock, CheckCircle2,
  XCircle, Landmark, Loader2, Info, RefreshCw,
  Building2, Wallet, Smartphone, Coins, Sparkles, Shield, Zap, Check,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { formatRupiah } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/lib/i18n';
import { WeekendNoticeBanner } from '@/components/nexvo/shared/WeekendNoticeBanner';

// ─── Withdrawal Payment Method Definitions ───
const WITHDRAW_PAYMENT_CATEGORIES = [
  { key: 'bank', label: 'Bank', icon: Building2, color: '#3B82F6' },
  { key: 'ewallet', label: 'E-Wallet', icon: Smartphone, color: '#8B5CF6' },
  { key: 'usdt', label: 'USDT', icon: Coins, color: '#26A17B' },
] as const;

type PaymentCategory = 'bank' | 'ewallet' | 'usdt';

interface PaymentOption {
  value: string;
  label: string;
  shortLabel: string;
  color: string;
  logo: string;
}

const BANK_OPTIONS: PaymentOption[] = [
  { value: 'BCA',       label: 'Bank BCA',          shortLabel: 'BCA',       color: '#003D79', logo: '/images/payment/bca.png' },
  { value: 'BNI',       label: 'Bank BNI',          shortLabel: 'BNI',       color: '#F15A22', logo: '/images/payment/bni.png' },
  { value: 'BRI',       label: 'Bank BRI',          shortLabel: 'BRI',       color: '#00529C', logo: '/images/payment/bri.png' },
  { value: 'Mandiri',   label: 'Bank Mandiri',      shortLabel: 'Mandiri',   color: '#003066', logo: '/images/payment/mandiri.png' },
  { value: 'BSI',       label: 'Bank BSI',          shortLabel: 'BSI',       color: '#00A650', logo: '/images/payment/bsi.png' },
  { value: 'CIMB',      label: 'CIMB Niaga',        shortLabel: 'CIMB',      color: '#7B0E24', logo: '/images/payment/cimb.png' },
  { value: 'Danamon',   label: 'Bank Danamon',      shortLabel: 'Danamon',   color: '#FDDA24', logo: '/images/payment/danamon.png' },
  { value: 'Permata',   label: 'Bank Permata',      shortLabel: 'Permata',   color: '#005BAA', logo: '/images/payment/permata.png' },
  { value: 'Bukopin',   label: 'Bank KB Bukopin',   shortLabel: 'Bukopin',   color: '#006B3F', logo: '/images/payment/bukopin.png' },
  { value: 'OCBC',      label: 'OCBC NISP',         shortLabel: 'OCBC',      color: '#E31937', logo: '/images/payment/ocbc.png' },
  { value: 'Panin',     label: 'Panin Bank',        shortLabel: 'Panin',     color: '#003366', logo: '/images/payment/panin.png' },
  { value: 'Sinarmas',  label: 'Bank Sinarmas',     shortLabel: 'Sinarmas',  color: '#FF6600', logo: '/images/payment/sinarmas.png' },
  { value: 'Maybank',   label: 'Maybank',           shortLabel: 'Maybank',   color: '#003366', logo: '/images/payment/maybank.png' },
  { value: 'UOB',       label: 'UOB Indonesia',     shortLabel: 'UOB',       color: '#E31937', logo: '/images/payment/uob.png' },
  { value: 'BTN',       label: 'Bank BTN',          shortLabel: 'BTN',       color: '#F7941D', logo: '/images/payment/btn.png' },
];

const EWALLET_OPTIONS: PaymentOption[] = [
  { value: 'DANA',       label: 'DANA',       shortLabel: 'DANA',       color: '#118EEA', logo: '/images/payment/dana.png' },
  { value: 'OVO',        label: 'OVO',        shortLabel: 'OVO',        color: '#4C2A86', logo: '/images/payment/ovo.png' },
  { value: 'GoPay',      label: 'GoPay',      shortLabel: 'GoPay',      color: '#00AED6', logo: '/images/payment/gopay.png' },
  { value: 'ShopeePay',  label: 'ShopeePay',  shortLabel: 'ShopeePay',  color: '#EE4D2D', logo: '/images/payment/shopeepay.png' },
  { value: 'LinkAja',    label: 'LinkAja',    shortLabel: 'LinkAja',    color: '#E82529', logo: '/images/payment/linkaja.png' },
  { value: 'Doku',       label: 'Doku',       shortLabel: 'Doku',       color: '#FF6C00', logo: '/images/payment/doku.png' },
  { value: 'Sakuku',     label: 'Sakuku',     shortLabel: 'Sakuku',     color: '#003D79', logo: '/images/payment/sakuku.png' },
  { value: 'Jenius',     label: 'Jenius',     shortLabel: 'Jenius',     color: '#F7941D', logo: '/images/payment/jenius.png' },
  { value: 'Flip',       label: 'Flip',       shortLabel: 'Flip',       color: '#FF5722', logo: '/images/payment/flip.png' },
];

interface Withdrawal {
  id: string;
  withdrawalId: string;
  amount: number;
  fee: number;
  netAmount: number;
  bankName: string;
  accountNo: string;
  holderName: string;
  paymentType: string;
  status: string;
  note: string;
  createdAt: string;
}

interface SystemSettings {
  [key: string]: string;
}

function getStatusBadge(status: string, t: (key: string) => string) {
  switch (status) {
    case 'success':
    case 'approved':
      return <Badge className="bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 text-[10px]"><CheckCircle2 className="w-3 h-3 mr-0.5" />{t('dashboard.success')}</Badge>;
    case 'pending':
      return <Badge className="bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 text-[10px]"><Clock className="w-3 h-3 mr-0.5" />{t('dashboard.pending')}</Badge>;
    case 'failed':
    case 'rejected':
      return <Badge className="bg-red-400/10 text-red-400 border border-red-400/20 text-[10px]"><XCircle className="w-3 h-3 mr-0.5" />{t('dashboard.failed')}</Badge>;
    default:
      return <Badge className="bg-foreground/5 text-muted-foreground text-[10px]">{status}</Badge>;
  }
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function isWorkingHours(): { isWorking: boolean; message: string } {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const wibNow = new Date(utcMs + 7 * 3600000);
  const day = wibNow.getDay();
  const hours = wibNow.getHours();
  const minutes = wibNow.getMinutes();
  const currentTime = hours * 60 + minutes;

  if (day === 0 || day === 6) {
    return { isWorking: false, message: 'Withdrawal can only be done on weekdays (Monday-Friday), 09:00-16:00 WIB' };
  }
  if (currentTime < 9 * 60 || currentTime > 16 * 60) {
    return { isWorking: false, message: 'Withdrawal can only be done 09:00-16:00 WIB (weekdays)' };
  }
  return { isWorking: true, message: '' };
}

function getPaymentTypeIcon(type: string) {
  switch (type) {
    case 'bank': return Building2;
    case 'ewallet': return Smartphone;
    case 'usdt': return Coins;
    default: return Landmark;
  }
}

// ─── Scrollable Payment Method Carousel ───
function PaymentMethodScroll({
  options,
  selected,
  onSelect,
}: {
  options: PaymentOption[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [failedLogos, setFailedLogos] = useState<Set<string>>(new Set());

  const scrollBy = (dir: -1 | 1) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir * 260, behavior: 'smooth' });
  };

  const markFailed = (value: string) => {
    setFailedLogos((prev) => {
      const next = new Set(prev);
      next.add(value);
      return next;
    });
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <Label className="text-foreground text-sm font-medium">
          Pilih Metode
          <span className="text-muted-foreground text-[11px] ml-2 font-normal">
            {options.length} tersedia
          </span>
        </Label>
        {/* Desktop scroll arrows */}
        <div className="hidden sm:flex items-center gap-1">
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            className="w-7 h-7 rounded-lg glass flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            className="w-7 h-7 rounded-lg glass flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-2.5 overflow-x-auto pb-2 -mx-1 px-1 scroll-smooth snap-x snap-mandatory nexvo-scroll"
        style={{ scrollbarWidth: 'thin' }}
      >
        {options.map((opt) => {
          const isSelected = selected === opt.value;
          const logoFailed = failedLogos.has(opt.value);
          return (
            <motion.button
              key={opt.value}
              type="button"
              onClick={() => onSelect(opt.value)}
              whileTap={{ scale: 0.96 }}
              className={`relative shrink-0 snap-start w-[88px] sm:w-[96px] flex flex-col items-center gap-2 p-3 rounded-2xl transition-all border-2 ${
                isSelected
                  ? 'glass-gold glow-gold border-primary'
                  : 'glass border-transparent hover:border-primary/30'
              }`}
            >
              {isSelected && (
                <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center ring-2 ring-background z-10">
                  <Check className="w-3 h-3 text-primary-foreground" />
                </div>
              )}
              {/* Logo container — white bg so logos always visible */}
              <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center overflow-hidden p-1.5 shadow-sm">
                {logoFailed ? (
                  <span
                    className="text-lg font-bold"
                    style={{ color: opt.color }}
                  >
                    {opt.shortLabel.charAt(0)}
                  </span>
                ) : (
                  <img
                    src={opt.logo}
                    alt={opt.label}
                    className="w-full h-full object-contain"
                    onError={() => markFailed(opt.value)}
                  />
                )}
              </div>
              <span className="text-foreground text-[11px] font-medium leading-tight text-center line-clamp-2 min-h-[28px]">
                {opt.shortLabel}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Selected method summary chip */}
      {selected && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass-gold border border-primary/20"
        >
          <Check className="w-3.5 h-3.5 text-primary" />
          <span className="text-foreground text-xs font-medium">
            Terpilih: <span className="text-primary font-semibold">{options.find((o) => o.value === selected)?.label}</span>
          </span>
        </motion.div>
      )}
    </div>
  );
}

export default function WithdrawPage() {
  const { token, user, hydrateUser } = useAuthStore();
  const t = useT();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [settings, setSettings] = useState<SystemSettings>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastWithdrawAmount, setLastWithdrawAmount] = useState(0);
  const [lastWithdrawNet, setLastWithdrawNet] = useState(0);
  const [lastWithdrawMethod, setLastWithdrawMethod] = useState('');
  const [lastWithdrawId, setLastWithdrawId] = useState('');
  // Meta from API: min/max withdrawal + pending withdrawal check
  const [meta, setMeta] = useState<{
    lastPackageAmount?: number;
    hasPendingWithdrawal?: boolean;
    pendingWithdrawalId?: string | null;
    minWithdraw?: number;
    maxWithdraw?: number;
    feePercent?: number;
  }>({});

  // Form state
  const [selectedCategory, setSelectedCategory] = useState<PaymentCategory>('bank');
  const [selectedBank, setSelectedBank] = useState('');
  const [selectedEwallet, setSelectedEwallet] = useState('');
  const [usdtAddress, setUsdtAddress] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [holderName, setHolderName] = useState('');
  const [amount, setAmount] = useState('');

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const [withdrawRes, settingsRes] = await Promise.all([
        fetch('/api/withdraw', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/system'),
      ]);
      const withdrawData = await withdrawRes.json();
      const settingsData = await settingsRes.json();

      if (withdrawData.success) {
        setWithdrawals(withdrawData.data || []);
        if (withdrawData.meta) setMeta(withdrawData.meta);
      }
      if (settingsData.success) setSettings(settingsData.data || {});
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setSelectedBank('');
    setSelectedEwallet('');
    setUsdtAddress('');
    setAccountNo('');
    setHolderName('');
  }, [selectedCategory]);

  const numAmount = parseInt(amount.replace(/[^0-9]/g, '')) || 0;
  // Withdrawal rules (from API meta):
  //   - Min: 100,000 (forced)
  //   - Max: last purchased package/product amount
  //   - Fee: 10% (forced, ignores setting)
  //   - Blocked if user has pending withdrawal (must wait for admin approval)
  const minWithdraw = meta.minWithdraw || 100000;
  const maxWithdraw = meta.maxWithdraw || 0;
  const feeRate = (meta.feePercent || 10) / 100;
  const hasPendingWithdrawal = meta.hasPendingWithdrawal || false;
  const fee = Math.round(numAmount * feeRate);
  const netAmount = numAmount - fee;
  const mainBalance = user?.mainBalance || 0;

  const workingHours = isWorkingHours();

  const getPaymentMethodName = (): string => {
    switch (selectedCategory) {
      case 'bank': return selectedBank;
      case 'ewallet': return selectedEwallet;
      case 'usdt': return 'USDT (BEP20)';
      default: return '';
    }
  };

  const getAccountLabel = (): string => {
    switch (selectedCategory) {
      case 'bank': return 'Nomor Rekening';
      case 'ewallet': return 'Nomor HP / E-Wallet ID';
      case 'usdt': return 'Wallet Address (BEP20)';
      default: return 'Nomor Rekening';
    }
  };

  const getAccountPlaceholder = (): string => {
    switch (selectedCategory) {
      case 'bank': return 'Contoh: 1234567890';
      case 'ewallet': return 'Contoh: 081234567890';
      case 'usdt': return '0x...';
      default: return '';
    }
  };

  const isFormValid = (): boolean => {
    // Block if user has pending withdrawal (must wait for admin approval)
    if (hasPendingWithdrawal) return false;
    // Block if no package purchased (maxWithdraw = 0)
    if (maxWithdraw <= 0) return false;
    if (!numAmount || numAmount < minWithdraw) return false;
    if (numAmount > maxWithdraw) return false;
    if (numAmount > mainBalance) return false;
    switch (selectedCategory) {
      case 'bank': return !!selectedBank && !!accountNo && !!holderName;
      case 'ewallet': return !!selectedEwallet && !!accountNo && !!holderName;
      case 'usdt': return !!usdtAddress;
      default: return false;
    }
  };

  const setPercentAmount = (percent: number) => {
    let val = Math.floor((mainBalance * percent) / 100);
    // Cap at maxWithdraw (last package amount)
    if (maxWithdraw > 0 && val > maxWithdraw) val = maxWithdraw;
    // Ensure at least minWithdraw
    if (val < minWithdraw) val = minWithdraw;
    setAmount(val.toString());
  };

  // Preset nominal amounts — sama dengan paket investasi
  const presetAmounts = [
    { label: '160K', value: 160000 },
    { label: '320K', value: 320000 },
    { label: '640K', value: 640000 },
    { label: '1.92J', value: 1920000 },
    { label: '5.76J', value: 5760000 },
    { label: '17.28J', value: 17280000 },
  ];

  const setPresetAmount = (val: number) => {
    setAmount(val.toString());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isFormValid()) {
      toast({ title: 'Error', description: 'Please fill in all fields', variant: 'destructive' });
      return;
    }

    const paymentMethod = getPaymentMethodName();
    const finalAccountNo = selectedCategory === 'usdt' ? usdtAddress : accountNo;
    const finalHolderName = selectedCategory === 'usdt' ? 'USDT Wallet' : holderName;

    setSubmitting(true);
    try {
      const res = await fetch('/api/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          paymentType: selectedCategory,
          paymentMethod,
          accountNo: finalAccountNo,
          holderName: finalHolderName,
          amount: numAmount,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setLastWithdrawAmount(numAmount);
        setLastWithdrawNet(netAmount);
        setLastWithdrawMethod(paymentMethod || 'USDT');
        setLastWithdrawId(data.data?.withdrawalId || '');
        setShowSuccessModal(true);
        toast({ title: 'Success', description: data.message || t('withdraw.withdrawSuccess') });
        setAmount('');
        setAccountNo('');
        setHolderName('');
        setUsdtAddress('');
        await hydrateUser();
        fetchData();
      } else {
        toast({ title: 'Gagal', description: data.error || 'Withdrawal failed', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error occurred', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const formatAmountDisplay = (val: string) => {
    const num = val.replace(/[^0-9]/g, '');
    if (!num) return '';
    return parseInt(num).toLocaleString('id-ID');
  };

  const retry = () => {
    setError(null);
    setLoading(true);
    fetchData();
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-6">
        <div className="animate-pulse space-y-4">
          <div className="glass rounded-3xl p-4 sm:p-6 h-48 sm:h-64" />
          <div className="glass rounded-3xl p-4 sm:p-6 h-36 sm:h-48" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-6">
        <div className="glass glow-gold rounded-3xl p-5 sm:p-8 lg:p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-red-400" />
          </div>
          <h3 className="text-foreground font-semibold mb-1">{t('dashboard.loadFailed')}</h3>
          <p className="text-muted-foreground text-sm mb-4 sm:mb-6">{error}</p>
          <Button onClick={retry} className="bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90 glow-gold">
            <RefreshCw className="w-4 h-4 mr-2" />{t('dashboard.tryAgain')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-6 space-y-4 sm:space-y-6 pb-4 sm:pb-6">
      {/* ─── Weekend Libur Notice ─── */}
      <WeekendNoticeBanner activity="Withdrawal" />

      {/* ─── Success Modal ─── */}
      <AnimatePresence>
        {showSuccessModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/70 backdrop-blur-md"
            onClick={() => setShowSuccessModal(false)}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.85, opacity: 0 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-strong rounded-3xl p-5 sm:p-7 max-w-sm w-full glow-gold-strong border border-primary/20 relative overflow-hidden"
            >
              <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-blue-400/10 blur-3xl" />
              <div className="absolute -bottom-20 -left-20 w-40 h-40 rounded-full bg-primary/10 blur-3xl" />

              <div className="text-center relative z-10">
                <motion.div
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring', damping: 12, stiffness: 200 }}
                  className="w-20 h-20 rounded-full bg-yellow-400/15 flex items-center justify-center mx-auto mb-4 relative"
                >
                  <div className="absolute inset-0 rounded-full bg-yellow-400/10 animate-ping" />
                  <Clock className="w-11 h-11 text-yellow-400 relative z-10" />
                </motion.div>

                <h2 className="text-foreground text-xl font-bold mb-1">Withdrawal Diterima!</h2>
                <p className="text-muted-foreground text-sm mb-5">Permintaan withdrawal Anda sedang <span className="text-yellow-400 font-semibold">menunggu persetujuan admin</span>. Dana akan masuk ke rekening Anda setelah admin menyetujui. Anda tidak bisa membuat withdrawal baru sampai withdrawal ini diproses.</p>

                <div className="glass rounded-2xl p-4 mb-5 space-y-3 border border-primary/10">
                  <div>
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-1">Withdrawal ID</p>
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-gold-gradient text-2xl font-bold font-mono tracking-wider">{lastWithdrawId}</span>
                    </div>
                  </div>
                  <div className="border-t border-white/5 pt-3">
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-1">Metode</p>
                    <p className="text-foreground text-sm font-semibold">{lastWithdrawMethod}</p>
                  </div>
                  <div className="border-t border-white/5 pt-3">
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-1">Jumlah Withdraw</p>
                    <p className="text-foreground text-xl font-bold">{formatRupiah(lastWithdrawAmount)}</p>
                  </div>
                  <div className="border-t border-white/5 pt-3">
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-1">Fee (10%)</p>
                    <p className="text-yellow-400 text-sm font-bold">{formatRupiah(lastWithdrawAmount - lastWithdrawNet)}</p>
                  </div>
                  <div className="border-t border-white/5 pt-3">
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-1">Diterima</p>
                    <p className="text-emerald-400 text-2xl font-bold">{formatRupiah(lastWithdrawNet)}</p>
                  </div>
                </div>

                <button onClick={() => setShowSuccessModal(false)} className="text-muted-foreground text-sm hover:text-foreground transition-colors">
                  Tutup
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Premium Header ─── */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3"
      >
        <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gold-gradient flex items-center justify-center shrink-0 glow-gold">
          <ArrowUpCircle className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-foreground text-xl sm:text-2xl font-bold">{t('withdraw.title')}</h1>
          <p className="text-muted-foreground text-xs sm:text-sm">{t('withdraw.withdrawFunds')}</p>
        </div>
      </motion.div>

      {/* ─── Premium Balance Showcase ─── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl bg-card-gradient border border-primary/20 p-5 sm:p-6"
      >
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-primary/8 blur-3xl" />
        <div className="absolute -bottom-12 -left-12 w-40 h-40 rounded-full bg-[#1E3A5F]/15 blur-3xl" />
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center">
                <Wallet className="w-4 h-4 text-primary" />
              </div>
              <span className="text-muted-foreground text-xs sm:text-sm font-medium">Saldo Tersedia</span>
            </div>
            <p className="text-3xl sm:text-4xl font-bold text-gold-gradient">{formatRupiah(mainBalance)}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
              <p className="text-muted-foreground text-[10px] sm:text-xs">Min: <span className="text-foreground font-medium">{formatRupiah(minWithdraw)}</span></p>
              <p className="text-muted-foreground text-[10px] sm:text-xs">Max: <span className="text-foreground font-medium">{maxWithdraw > 0 ? formatRupiah(maxWithdraw) : '—'}</span></p>
              <p className="text-muted-foreground text-[10px] sm:text-xs">Fee: <span className="text-yellow-400 font-medium">10%</span></p>
            </div>
          </div>
          <div className="hidden sm:flex flex-col items-center gap-1 px-4 py-3 rounded-2xl glass border border-primary/10">
            <Shield className="w-5 h-5 text-primary" />
            <span className="text-[10px] text-muted-foreground font-medium">Aman</span>
          </div>
        </div>
      </motion.div>

      {/* ─── Working Hours Banner ─── */}
      <AnimatePresence>
        {!workingHours.isWorking && (
          <motion.div
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="glass-gold rounded-2xl p-4 flex items-center gap-3 border border-yellow-400/20"
          >
            <div className="w-10 h-10 rounded-xl bg-yellow-400/15 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-foreground text-sm font-semibold">{t('withdraw.outsideHours')}</p>
              <p className="text-muted-foreground text-xs">{workingHours.message}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Pending Withdrawal Warning (block new WD) ─── */}
      {hasPendingWithdrawal && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-4 flex items-center gap-3 border border-yellow-400/30 bg-yellow-400/5"
        >
          <div className="w-10 h-10 rounded-xl bg-yellow-400/15 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-yellow-400" />
          </div>
          <div className="flex-1">
            <p className="text-foreground text-sm font-semibold">Withdrawal Pending</p>
            <p className="text-muted-foreground text-xs">
              Anda masih memiliki withdrawal <span className="text-yellow-400 font-mono font-bold">{meta.pendingWithdrawalId}</span> yang sedang menunggu persetujuan admin. Tunggu hingga withdrawal tersebut diproses sebelum membuat withdrawal baru.
            </p>
          </div>
        </motion.div>
      )}

      {/* ─── No Package Warning (maxWithdraw = 0) ─── */}
      {!hasPendingWithdrawal && maxWithdraw <= 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-4 flex items-center gap-3 border border-red-400/30 bg-red-400/5"
        >
          <div className="w-10 h-10 rounded-xl bg-red-400/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div className="flex-1">
            <p className="text-foreground text-sm font-semibold">Belum Ada Pembelian Paket/Produk</p>
            <p className="text-muted-foreground text-xs">
              Maksimal withdrawal ditentukan oleh paket/produk terakhir yang Anda beli. Silakan beli paket/produk terlebih dahulu sebelum melakukan withdrawal.
            </p>
          </div>
        </motion.div>
      )}

      {/* ─── Premium Withdraw Form ─── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="glass glow-gold rounded-3xl p-4 sm:p-6 border border-primary/10">
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">

          {/* ── Category Tabs (Bank / E-Wallet / USDT) ── */}
          <div className="space-y-2">
            <Label className="text-foreground text-sm font-medium flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-primary" />
              Kategori Penarikan
            </Label>
            <div className="flex gap-2 p-1 glass rounded-2xl">
              {WITHDRAW_PAYMENT_CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isActive = selectedCategory === cat.key;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setSelectedCategory(cat.key as PaymentCategory)}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                      isActive
                        ? 'bg-gold-gradient text-primary-foreground glow-gold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Scrollable Bank Selector ── */}
          <AnimatePresence mode="wait">
            {selectedCategory === 'bank' && (
              <motion.div
                key="bank-scroll"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <PaymentMethodScroll
                  options={BANK_OPTIONS}
                  selected={selectedBank}
                  onSelect={setSelectedBank}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Scrollable E-Wallet Selector ── */}
          <AnimatePresence mode="wait">
            {selectedCategory === 'ewallet' && (
              <motion.div
                key="ewallet-scroll"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <PaymentMethodScroll
                  options={EWALLET_OPTIONS}
                  selected={selectedEwallet}
                  onSelect={setSelectedEwallet}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── USDT BEP20 ── */}
          <AnimatePresence mode="wait">
            {selectedCategory === 'usdt' && (
              <motion.div
                key="usdt"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                <div className="glass rounded-2xl p-4 border border-[#26A17B]/20">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-xl bg-[#26A17B]/10 flex items-center justify-center shadow-sm">
                      <Coins className="w-6 h-6 text-[#26A17B]" />
                    </div>
                    <div>
                      <p className="text-foreground text-sm font-semibold">USDT (BEP20)</p>
                      <p className="text-muted-foreground text-[10px]">Binance Smart Chain Network</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground text-xs">Wallet Address (BEP20)</Label>
                    <Input
                      placeholder="0x..."
                      value={usdtAddress}
                      onChange={(e) => setUsdtAddress(e.target.value)}
                      className="h-11 bg-input/50 border-border/50 rounded-xl text-foreground font-mono text-sm placeholder:text-muted-foreground/50 focus:border-[#26A17B]/50 focus:ring-[#26A17B]/20"
                    />
                  </div>
                  <div className="mt-3 p-3 rounded-xl bg-[#26A17B]/5 border border-[#26A17B]/10">
                    <p className="text-[#26A17B] text-[10px] font-semibold mb-1">⚠️ Penting:</p>
                    <ul className="text-muted-foreground text-[10px] space-y-0.5">
                      <li>• Kirim hanya USDT via jaringan BEP20 (BSC)</li>
                      <li>• Pastikan wallet address benar sebelum submit</li>
                      <li>• Jangan kirim aset selain USDT</li>
                    </ul>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Account Number / Holder Name (for bank & ewallet) ── */}
          <AnimatePresence mode="wait">
            {(selectedCategory === 'bank' || selectedCategory === 'ewallet') && (
              <motion.div
                key="account-fields"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                <div className="space-y-2">
                  <Label className="text-foreground text-sm font-medium">{getAccountLabel()}</Label>
                  <Input
                    type="text"
                    inputMode={selectedCategory === 'ewallet' ? 'tel' : 'numeric'}
                    placeholder={getAccountPlaceholder()}
                    value={accountNo}
                    onChange={(e) => setAccountNo(e.target.value.replace(selectedCategory === 'bank' ? /[^0-9]/g : /[^0-9+]/g, ''))}
                    className="h-11 sm:h-12 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-[#D4AF37]/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground text-sm font-medium">Nama Pemilik Rekening</Label>
                  <Input
                    type="text"
                    placeholder="Nama sesuai buku tabungan / akun"
                    value={holderName}
                    onChange={(e) => setHolderName(e.target.value)}
                    className="h-11 sm:h-12 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-[#D4AF37]/20"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Premium Amount Input ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-foreground text-sm font-medium flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-primary" />
                {t('withdraw.withdrawAmount')}
              </Label>
              <span className="text-[10px] text-muted-foreground">Saldo: {formatRupiah(mainBalance)}</span>
            </div>
            <div className="relative group">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-primary text-base sm:text-lg font-bold">Rp</span>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={amount ? formatAmountDisplay(amount) : ''}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9]/g, '');
                  setAmount(raw);
                }}
                className="pl-12 h-14 sm:h-16 text-2xl sm:text-3xl font-bold bg-input/50 border-primary/20 rounded-2xl text-foreground placeholder:text-muted-foreground/20 focus:border-primary/50 focus:ring-primary/20 transition-all"
              />
              <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-gold-gradient scale-x-0 group-focus-within:scale-x-100 transition-transform origin-left" />
            </div>
            {/* Percent quick-fill */}
            <div className="flex gap-2">
              {[25, 50, 75, 100].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPercentAmount(p)}
                  className="flex-1 px-2 py-1.5 rounded-lg glass text-muted-foreground text-[11px] font-medium hover:text-foreground hover:bg-white/5 transition-all"
                >
                  {p}%
                </button>
              ))}
            </div>
            {/* Preset nominal — sesuai paket investasi */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {presetAmounts.map((preset) => {
                // Disable preset if: insufficient balance, exceeds maxWithdraw, or user has pending WD
                const exceedsMax = maxWithdraw > 0 && preset.value > maxWithdraw;
                const disabled = mainBalance < preset.value || exceedsMax || hasPendingWithdrawal || maxWithdraw <= 0;
                const isSelected = amount === preset.value.toString();
                return (
                  <motion.button
                    key={preset.value}
                    type="button"
                    onClick={() => !disabled && setPresetAmount(preset.value)}
                    disabled={disabled}
                    whileTap={!disabled ? { scale: 0.95 } : undefined}
                    className={`relative px-2 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-bold transition-all overflow-hidden border ${
                      disabled
                        ? 'glass text-muted-foreground/40 border-transparent cursor-not-allowed opacity-50'
                        : isSelected
                          ? 'bg-gold-gradient text-primary-foreground glow-gold border-transparent'
                          : 'glass text-muted-foreground hover:text-foreground hover:border-primary/30 border-transparent'
                      }`}
                  >
                    {preset.label}
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* ── Premium Fee & Net Summary ── */}
          {numAmount > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              className="glass-gold rounded-2xl p-4 space-y-2.5 border border-primary/15">
              <h4 className="text-foreground font-semibold text-sm mb-1.5 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                Ringkasan Withdrawal
              </h4>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('withdraw.amount')}</span>
                <span className="text-foreground font-medium">{formatRupiah(numAmount)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  {t('withdraw.adminFee')}
                  <Info className="w-3 h-3" />
                </span>
                <span className="text-red-400 font-medium">-{formatRupiah(fee)}</span>
              </div>
              <div className="border-t border-primary/10 pt-2.5 flex items-center justify-between">
                <span className="text-foreground font-semibold text-sm">{t('withdraw.received')}</span>
                <span className="text-emerald-400 font-bold text-base">{formatRupiah(netAmount)}</span>
              </div>
              {numAmount > mainBalance && (
                <p className="text-red-400 text-[10px]">⚠️ Jumlah melebihi saldo tersedia</p>
              )}
            </motion.div>
          )}

          {/* ── Premium Submit ── */}
          <Button
            type="submit"
            disabled={submitting || !isFormValid()}
            data-tour="withdraw-submit"
            className="w-full h-14 bg-gold-gradient text-primary-foreground font-semibold rounded-2xl hover:opacity-90 transition-all glow-gold-strong text-base disabled:opacity-50"
          >
            {submitting ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                {t('common.processing')}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <ArrowUpCircle className="w-5 h-5" />
                Withdraw {amount ? formatRupiah(numAmount) : ''}
              </div>
            )}
          </Button>
        </form>
      </motion.div>

      {/* ─── Premium Withdrawal History ─── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-3xl p-4 sm:p-6 border border-primary/10"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-foreground font-semibold text-sm sm:text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            {t('withdraw.withdrawHistory')}
          </h3>
          {withdrawals.length > 0 && <Badge className="bg-primary/10 text-primary text-[10px]">{withdrawals.length} transaksi</Badge>}
        </div>

        {withdrawals.length > 0 ? (
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1 nexvo-scroll">
            {withdrawals.map((wd, idx) => {
              const PayIcon = getPaymentTypeIcon(wd.paymentType || 'bank');
              return (
                <motion.div
                  key={wd.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="relative flex items-center gap-3 p-3 sm:p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] transition-all border border-white/5"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl bg-blue-400/50" />
                  <div className="w-10 h-10 rounded-xl bg-blue-400/10 flex items-center justify-center shrink-0">
                    <PayIcon className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-gold-gradient text-[10px] font-bold font-mono tracking-wider">{wd.withdrawalId || 'WD-?'}</span>
                    </div>
                    <p className="text-foreground text-sm font-semibold">{wd.bankName}</p>
                    <p className="text-muted-foreground text-xs">{wd.accountNo?.slice(-8) || '****'}</p>
                    <p className="text-muted-foreground text-[10px]">{formatDate(wd.createdAt)}</p>
                    {wd.note && (
                      <p className="text-muted-foreground text-xs mt-0.5 italic">{wd.note}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <p className="text-blue-400 text-sm font-bold">
                      {formatRupiah(wd.amount)}
                    </p>
                    <p className="text-muted-foreground text-[10px]">
                      Net: {formatRupiah(wd.netAmount)}
                    </p>
                    {getStatusBadge(wd.status, t)}
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-10">
            <div className="w-16 h-16 rounded-2xl bg-foreground/5 flex items-center justify-center mx-auto mb-3">
              <Clock className="w-8 h-8 text-muted-foreground/30" />
            </div>
            <p className="text-muted-foreground text-sm">{t('withdraw.noWithdrawHistory')}</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
