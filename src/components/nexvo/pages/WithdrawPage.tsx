'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowUpCircle, AlertTriangle, Clock, CheckCircle2,
  XCircle, Landmark, Loader2, Info, RefreshCw,
  Building2, Wallet, Smartphone, Coins
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { formatRupiah } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/lib/i18n';

// ─── Withdrawal Payment Method Definitions ───
const WITHDRAW_PAYMENT_CATEGORIES = [
  { key: 'bank', label: 'Bank Transfer', icon: Building2, color: '#3B82F6' },
  { key: 'ewallet', label: 'E-Wallet', icon: Smartphone, color: '#8B5CF6' },
  { key: 'usdt', label: 'USDT (BEP20)', icon: Coins, color: '#26A17B' },
] as const;

type PaymentCategory = 'bank' | 'ewallet' | 'usdt';

const BANK_OPTIONS = [
  { value: 'BCA', label: 'Bank BCA', color: '#003D79' },
  { value: 'BNI', label: 'Bank BNI', color: '#F15A22' },
  { value: 'BRI', label: 'Bank BRI', color: '#00529C' },
  { value: 'Mandiri', label: 'Bank Mandiri', color: '#003066' },
  { value: 'BSI', label: 'Bank BSI', color: '#00A650' },
  { value: 'CIMB', label: 'CIMB Niaga', color: '#7B0E24' },
  { value: 'Danamon', label: 'Bank Danamon', color: '#FDDA24' },
  { value: 'Permata', label: 'Bank Permata', color: '#005BAA' },
  { value: 'Bukopin', label: 'Bank KB Bukopin', color: '#006B3F' },
  { value: 'OCBC', label: 'OCBC NISP', color: '#E31937' },
  { value: 'Panin', label: 'Panin Bank', color: '#003366' },
  { value: 'Sinarmas', label: 'Bank Sinarmas', color: '#FF6600' },
  { value: 'Maybank', label: 'Maybank', color: '#003366' },
  { value: 'UOB', label: 'UOB Indonesia', color: '#E31937' },
  { value: 'BTN', label: 'Bank BTN', color: '#F7941D' },
] as const;

const EWALLET_OPTIONS = [
  { value: 'DANA', label: 'DANA', color: '#118EEA' },
  { value: 'OVO', label: 'OVO', color: '#4C2A86' },
  { value: 'GoPay', label: 'GoPay', color: '#00AED6' },
  { value: 'ShopeePay', label: 'ShopeePay', color: '#EE4D2D' },
  { value: 'LinkAja', label: 'LinkAja', color: '#E82529' },
  { value: 'Doku', label: 'Doku', color: '#FF6C00' },
  { value: 'Sakuku', label: 'Sakuku', color: '#003D79' },
  { value: 'Jenius', label: 'Jenius', color: '#F7941D' },
  { value: 'Flip', label: 'Flip', color: '#FF5722' },
] as const;

interface Withdrawal {
  id: string;
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
      return <Badge className="bg-white/5 text-muted-foreground text-[10px]">{status}</Badge>;
  }
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function isWorkingHours(t: (key: string) => string): { isWorking: boolean; message: string } {
  // Convert to WIB (UTC+7) regardless of server timezone
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const wibNow = new Date(utcMs + 7 * 3600000);
  const day = wibNow.getDay();
  const hours = wibNow.getHours();
  const minutes = wibNow.getMinutes();
  const currentTime = hours * 60 + minutes;

  if (day === 0 || day === 6) {
    return { isWorking: false, message: 'Penarikan hanya bisa dilakukan pada hari kerja (Senin-Jumat), jam 09:00-16:00 WIB' };
  }
  if (currentTime < 9 * 60 || currentTime > 16 * 60) {
    return { isWorking: false, message: 'Penarikan hanya bisa dilakukan jam 09:00-16:00 WIB (hari kerja)' };
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

export default function WithdrawPage() {
  const { token, user, hydrateUser } = useAuthStore();
  const t = useT();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [settings, setSettings] = useState<SystemSettings>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

      if (withdrawData.success) setWithdrawals(withdrawData.data || []);
      if (settingsData.success) setSettings(settingsData.data || {});
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset form when category changes
  useEffect(() => {
    setSelectedBank('');
    setSelectedEwallet('');
    setUsdtAddress('');
    setAccountNo('');
    setHolderName('');
  }, [selectedCategory]);

  const numAmount = parseInt(amount.replace(/[^0-9]/g, '')) || 0;
  const feeRate = parseFloat(settings.withdraw_fee || '10') / 100;
  const minWithdraw = parseInt(settings.min_withdraw || '50000');
  const fee = Math.round(numAmount * feeRate);
  const netAmount = numAmount - fee;
  const mainBalance = user?.mainBalance || 0;

  const workingHours = isWorkingHours(t);

  // Get the payment method display name
  const getPaymentMethodName = (): string => {
    switch (selectedCategory) {
      case 'bank': return selectedBank;
      case 'ewallet': return selectedEwallet;
      case 'usdt': return 'USDT (BEP20)';
      default: return '';
    }
  };

  // Get the account number/label
  const getAccountLabel = (): string => {
    switch (selectedCategory) {
      case 'bank': return 'Nomor Rekening';
      case 'ewallet': return 'Nomor HP / ID E-Wallet';
      case 'usdt': return 'Wallet Address (BEP20)';
      default: return 'Nomor Akun';
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
    if (!numAmount || numAmount < minWithdraw) return false;
    if (numAmount > mainBalance) return false;
    switch (selectedCategory) {
      case 'bank': return !!selectedBank && !!accountNo && !!holderName;
      case 'ewallet': return !!selectedEwallet && !!accountNo && !!holderName;
      case 'usdt': return !!usdtAddress;
      default: return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isFormValid()) {
      toast({ title: 'Error', description: 'Lengkapi semua field', variant: 'destructive' });
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
        toast({ title: 'Berhasil', description: t('withdraw.withdrawSuccess') });
        setAmount('');
        setAccountNo('');
        setHolderName('');
        setUsdtAddress('');
        await hydrateUser();
        fetchData();
      } else {
        toast({ title: 'Gagal', description: data.error || 'Withdraw gagal', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Terjadi kesalahan jaringan', variant: 'destructive' });
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6">
        <div className="animate-pulse space-y-4">
          <div className="glass rounded-2xl p-4 sm:p-6 h-48 sm:h-64" />
          <div className="glass rounded-2xl p-4 sm:p-6 h-36 sm:h-48" />
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
          <p className="text-muted-foreground text-sm mb-4 sm:mb-6">{error}</p>
          <Button onClick={retry} className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold">
            <RefreshCw className="w-4 h-4 mr-2" />{t('dashboard.tryAgain')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6 space-y-4 sm:space-y-6 pb-4 sm:pb-6">
      {/* Header */}
      <div>
        <h1 className="text-foreground text-xl font-bold">{t('withdraw.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('withdraw.withdrawFunds')}</p>
      </div>

      {/* Working Hours Warning */}
      {!workingHours.isWorking && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="glass-gold rounded-2xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0" />
          <div>
            <p className="text-foreground text-sm font-medium">{t('withdraw.outsideHours')}</p>
            <p className="text-muted-foreground text-xs">{workingHours.message}</p>
          </div>
        </motion.div>
      )}

      {/* Balance Info */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="glass-gold glow-gold rounded-2xl p-3 sm:p-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-[#D4AF37]/5 blur-2xl" />
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-[#D4AF37]" />
          </div>
          <span className="text-muted-foreground text-sm">Saldo Tersedia</span>
        </div>
        <p className="text-2xl sm:text-3xl font-bold text-gold-gradient">{formatRupiah(mainBalance)}</p>
      </motion.div>

      {/* Withdraw Form */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="glass glow-gold rounded-2xl p-3 sm:p-5 lg:p-6">
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">

          {/* Payment Category Tabs */}
          <div className="space-y-2">
            <Label className="text-foreground text-sm font-medium">Metode Penarikan</Label>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {WITHDRAW_PAYMENT_CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isActive = selectedCategory === cat.key;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setSelectedCategory(cat.key as PaymentCategory)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                      isActive
                        ? 'bg-gold-gradient text-[#070B14] glow-gold'
                        : 'glass text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Bank Transfer Options ── */}
          {selectedCategory === 'bank' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
              <Label className="text-foreground text-sm font-medium">Pilih Bank</Label>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
                {BANK_OPTIONS.map((bank) => {
                  const isSelected = selectedBank === bank.value;
                  return (
                    <button
                      key={bank.value}
                      type="button"
                      onClick={() => setSelectedBank(bank.value)}
                      className={`relative flex flex-col items-center gap-1.5 p-2.5 rounded-xl transition-all text-center ${
                        isSelected
                          ? 'glass-gold glow-gold border border-[#D4AF37]/40'
                          : 'glass border border-transparent hover:border-border/50'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden"
                        style={{ backgroundColor: `${bank.color}15` }}>
                        <Building2 className="w-4 h-4" style={{ color: bank.color }} />
                      </div>
                      <span className="text-foreground text-[10px] sm:text-xs font-medium leading-tight">{bank.label}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ── E-Wallet Options ── */}
          {selectedCategory === 'ewallet' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
              <Label className="text-foreground text-sm font-medium">Pilih E-Wallet</Label>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
                {EWALLET_OPTIONS.map((ew) => {
                  const isSelected = selectedEwallet === ew.value;
                  return (
                    <button
                      key={ew.value}
                      type="button"
                      onClick={() => setSelectedEwallet(ew.value)}
                      className={`relative flex flex-col items-center gap-1.5 p-2.5 rounded-xl transition-all text-center ${
                        isSelected
                          ? 'glass-gold glow-gold border border-[#D4AF37]/40'
                          : 'glass border border-transparent hover:border-border/50'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden"
                        style={{ backgroundColor: `${ew.color}15` }}>
                        <Smartphone className="w-4 h-4" style={{ color: ew.color }} />
                      </div>
                      <span className="text-foreground text-[10px] sm:text-xs font-medium leading-tight">{ew.label}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ── USDT BEP20 ── */}
          {selectedCategory === 'usdt' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
              <div className="glass rounded-xl p-4 border border-[#26A17B]/20">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-[#26A17B]/10 flex items-center justify-center">
                    <Coins className="w-4 h-4 text-[#26A17B]" />
                  </div>
                  <div>
                    <p className="text-foreground text-sm font-medium">USDT (BEP20)</p>
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
                <div className="mt-3 p-2 rounded-lg bg-[#26A17B]/5 border border-[#26A17B]/10">
                  <p className="text-[#26A17B] text-[10px] font-medium mb-1">⚠️ Penting:</p>
                  <ul className="text-muted-foreground text-[10px] space-y-0.5">
                    <li>• Kirim hanya USDT via jaringan BEP20 (BSC)</li>
                    <li>• Pastikan alamat wallet benar sebelum submit</li>
                    <li>• Jangan kirim aset selain USDT</li>
                  </ul>
                </div>
              </div>
            </motion.div>
          )}

          {/* Account Number / Holder Name (for bank & ewallet) */}
          {(selectedCategory === 'bank' || selectedCategory === 'ewallet') && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              <div className="space-y-2">
                <Label className="text-foreground text-sm font-medium">{getAccountLabel()}</Label>
                <Input
                  type="text"
                  inputMode={selectedCategory === 'ewallet' ? 'tel' : 'numeric'}
                  placeholder={getAccountPlaceholder()}
                  value={accountNo}
                  onChange={(e) => setAccountNo(e.target.value.replace(selectedCategory === 'bank' ? /[^0-9]/g : /[^0-9+]/g, ''))}
                  className="h-11 sm:h-12 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:border-[#D4AF37]/50 focus:ring-[#D4AF37]/20"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground text-sm font-medium">Nama Pemilik</Label>
                <Input
                  type="text"
                  placeholder="Nama sesuai buku rekening / akun"
                  value={holderName}
                  onChange={(e) => setHolderName(e.target.value)}
                  className="h-11 sm:h-12 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:border-[#D4AF37]/50 focus:ring-[#D4AF37]/20"
                />
              </div>
            </motion.div>
          )}

          {/* Amount */}
          <div className="space-y-2">
            <Label className="text-foreground text-sm font-medium">{t('withdraw.withdrawAmount')}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">Rp</span>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={amount ? formatAmountDisplay(amount) : ''}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9]/g, '');
                  setAmount(raw);
                }}
                className="pl-10 h-11 sm:h-14 text-lg sm:text-xl font-bold bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/30 focus:border-[#D4AF37]/50 focus:ring-[#D4AF37]/20"
              />
            </div>
            <p className="text-muted-foreground text-xs">
              Minimal: {formatRupiah(minWithdraw)} • Saldo: {formatRupiah(mainBalance)}
            </p>
          </div>

          {/* Fee & Net */}
          {numAmount > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              className="glass rounded-xl p-4 space-y-2">
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
              <div className="border-t border-border/30 pt-2 flex items-center justify-between text-sm">
                <span className="text-foreground font-medium">{t('withdraw.received')}</span>
                <span className="text-emerald-400 font-bold text-base">{formatRupiah(netAmount)}</span>
              </div>
            </motion.div>
          )}

          {/* Submit */}
          <Button
            type="submit"
            disabled={submitting || !isFormValid()}
            className="w-full h-12 bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 transition-all glow-gold text-sm disabled:opacity-50"
          >
            {submitting ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('common.processing')}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <ArrowUpCircle className="w-4 h-4" />
                Withdraw {amount ? formatRupiah(numAmount) : ''}
              </div>
            )}
          </Button>
        </form>
      </motion.div>

      {/* Withdrawal History */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-2xl p-3 sm:p-5 lg:p-6"
      >
        <h3 className="text-foreground font-semibold text-sm sm:text-base mb-3 sm:mb-4">{t('withdraw.withdrawHistory')}</h3>

        {withdrawals.length > 0 ? (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {withdrawals.map((wd) => {
              const PayIcon = getPaymentTypeIcon(wd.paymentType || 'bank');
              return (
                <div key={wd.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-blue-400/10 flex items-center justify-center shrink-0">
                    <PayIcon className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground text-sm font-medium">{wd.bankName}</p>
                    <p className="text-muted-foreground text-xs">{wd.accountNo?.slice(-8) || '****'}</p>
                    <p className="text-muted-foreground text-xs">{formatDate(wd.createdAt)}</p>
                    {wd.note && (
                      <p className="text-muted-foreground text-xs mt-0.5 italic">{wd.note}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <p className="text-blue-400 text-sm font-semibold">
                      {formatRupiah(wd.amount)}
                    </p>
                    <p className="text-muted-foreground text-[10px]">
                      Net: {formatRupiah(wd.netAmount)}
                    </p>
                    {getStatusBadge(wd.status, t)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <Clock className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">{t('withdraw.noWithdrawHistory')}</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
