'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowDownCircle, CheckCircle2,
  Clock, XCircle, Loader2, AlertTriangle, RefreshCw,
  QrCode, Copy, Check,
  ShoppingBag, Wallet, ArrowLeft, MessageCircle, Phone,
  Upload, ImagePlus, X
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { formatRupiah } from '@/lib/auth';
import { getFileUrl } from '@/lib/file-url';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/lib/i18n';

interface PaymentMethod {
  id: string;
  type: string;
  name: string;
  accountNo: string;
  holderName: string;
  qrImage: string;
  iconUrl: string;
  color: string;
  isActive: boolean;
  order: number;
}

interface Deposit {
  id: string;
  depositId: string;
  amount: number;
  fee: number;
  netAmount: number;
  proofImage: string;
  status: string;
  note: string;
  paymentType: string;
  paymentName: string;
  createdAt: string;
}

interface WhatsAppAdmin {
  id: string;
  name: string;
  phone: string;
  order: number;
}

const presetAmounts = [
  { label: '100K', value: 100000 },
  { label: '500K', value: 500000 },
  { label: '1M', value: 1000000 },
  { label: '2.5M', value: 2500000 },
  { label: '5M', value: 5000000 },
  { label: '10M', value: 10000000 },
];

const categoryTabKeys = [
  { key: 'qris' as const, labelKey: 'deposit.qris', icon: QrCode },
  { key: 'usdt' as const, labelKey: 'deposit.usdt', icon: Wallet },
];

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

function CopyButton({ text, t, onCopied }: { text: string; t: (key: string) => string; onCopied?: () => void }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ title: t('common.copied'), description: 'Copied to clipboard' });
      onCopied?.();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Failed', description: t('common.error'), variant: 'destructive' });
    }
  };
  return (
    <button type="button" onClick={handleCopy} className="p-1.5 rounded-lg bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 text-[#D4AF37] transition-colors" title="Copy">
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export default function DepositPage() {
  const { token, user, hydrateUser } = useAuthStore();
  const { pageData, navigate } = useAppStore();
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [amount, setAmount] = useState('');
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [whatsappAdmins, setWhatsappAdmins] = useState<WhatsAppAdmin[]>([]);
  const [activeTab, setActiveTab] = useState<'qris' | 'usdt'>('qris');
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Step flow state
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1=amount, 2=payment details, 3=upload proof
  const [hasConfirmedPayment, setHasConfirmedPayment] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string>('');
  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofImageUrl, setProofImageUrl] = useState('');

  // Deposit result
  const [lastDepositId, setLastDepositId] = useState<string | null>(null);
  const [lastDepositAmount, setLastDepositAmount] = useState<number>(0);
  const [lastDepositFee, setLastDepositFee] = useState<number>(0);
  const [lastDepositNet, setLastDepositNet] = useState<number>(0);
  const [lastDepositPayment, setLastDepositPayment] = useState<string>('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Admin fee from settings (configurable by admin)
  const [adminFee, setAdminFee] = useState(0);

  // QR image error tracking
  const [qrImageError, setQrImageError] = useState<Record<string, boolean>>({});

  // Payment context
  const purpose = pageData?.purpose as string | undefined;
  const productId = pageData?.productId as string | undefined;
  const productName = pageData?.productName as string | undefined;
  const quantity = pageData?.quantity as number | undefined;
  const packageId = pageData?.packageId as string | undefined;
  const packageName = pageData?.packageName as string | undefined;
  const prefillAmount = pageData?.amount as number | undefined;

  const isProductPurchase = purpose === 'product';
  const isInvestmentPurchase = purpose === 'investment';

  const targetAmount = prefillAmount || 0;
  const hasEnoughBalance = (user?.mainBalance || 0) >= targetAmount && (isProductPurchase || isInvestmentPurchase) && targetAmount > 0;
  const primaryAdminPhone = whatsappAdmins.length > 0 ? whatsappAdmins[0].phone : '';

  const numAmount = parseInt(amount.replace(/[^0-9]/g, '')) || 0;
  const netAmount = numAmount - adminFee;

  const handleBuyWithBalance = async () => {
    if (!token) return;
    setSubmitting(true);
    try {
      if (isProductPurchase && productId) {
        const res = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: 'buy', productId, quantity: quantity || 1 }),
        });
        const data = await res.json();
        if (data.success) {
          toast({ title: 'Success!', description: data.message || 'Product purchase successful!' });
          await hydrateUser();
          navigate('history');
        } else {
          toast({ title: 'Failed', description: data.error || 'Purchase failed', variant: 'destructive' });
        }
      } else if (isInvestmentPurchase && packageId) {
        const res = await fetch('/api/investments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ packageId }),
        });
        const data = await res.json();
        if (data.success) {
          toast({ title: 'Success!', description: data.message || 'Investment successful!' });
          await hydrateUser();
          navigate('history');
        } else {
          toast({ title: 'Failed', description: data.error || 'Investment failed', variant: 'destructive' });
        }
      }
    } catch {
      toast({ title: 'Error', description: 'Network error. Please try again.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const [depositRes, paymentRes, waRes, settingsRes] = await Promise.all([
        fetch('/api/deposit', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/payment-methods'),
        fetch('/api/whatsapp'),
        fetch('/api/settings'),
      ]);
      const depositData = await depositRes.json();
      const paymentData = await paymentRes.json();
      const waData = await waRes.json();

      if (depositData.success) setDeposits(depositData.data || []);
      if (paymentData.success) setPaymentMethods(paymentData.data || []);
      if (waData.success) setWhatsappAdmins(waData.data || []);
      const settingsData = await settingsRes.json();
      if (settingsData.success && settingsData.data) {
        setAdminFee(parseFloat(settingsData.data.deposit_fee) || 0);
      }
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (prefillAmount) setAmount(prefillAmount.toString());
  }, [prefillAmount]);

  // Reset on tab/payment change
  useEffect(() => {
    const filtered = paymentMethods.filter((pm) => pm.type === activeTab || (activeTab === 'usdt' && pm.type === 'crypto'));
    if (filtered.length > 0 && (!selectedPayment || !filtered.find(f => f.id === selectedPayment.id))) {
      setSelectedPayment(filtered[0]);
    } else if (filtered.length === 0) {
      setSelectedPayment(null);
    }
    setHasConfirmedPayment(false);
    setQrImageError({});
  }, [activeTab, paymentMethods]);

  const filteredMethods = paymentMethods.filter((pm) => pm.type === activeTab || (activeTab === 'usdt' && pm.type === 'crypto'));

  // Handle proof image upload
  const handleProofSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Error', description: 'Image must be under 5MB', variant: 'destructive' });
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      toast({ title: 'Error', description: 'Only JPG, PNG, WebP, GIF allowed', variant: 'destructive' });
      return;
    }
    setProofFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setProofPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const removeProof = () => {
    setProofFile(null);
    setProofPreview('');
    setProofImageUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadProof = async (): Promise<string> => {
    if (!proofFile || !token) return '';
    setUploadingProof(true);
    try {
      const formData = new FormData();
      formData.append('file', proofFile);
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setProofImageUrl(data.data.url);
        return data.data.url;
      }
      return '';
    } catch {
      return '';
    } finally {
      setUploadingProof(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!numAmount || numAmount < 100000) {
      toast({ title: 'Error', description: t('deposit.minDepositAmount'), variant: 'destructive' });
      return;
    }
    if (!selectedPayment) {
      toast({ title: 'Error', description: t('deposit.selectPayment'), variant: 'destructive' });
      return;
    }
    if (!hasConfirmedPayment) {
      toast({ title: 'Error', description: 'Please confirm payment first', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      // Upload proof if selected
      let proofUrl = '';
      if (proofFile) {
        proofUrl = await uploadProof();
      }

      const res = await fetch('/api/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          amount: numAmount,
          proofImage: proofUrl,
          paymentMethodId: selectedPayment?.id || null,
          paymentType: selectedPayment?.type || activeTab,
          paymentName: selectedPayment?.name || '',
          paymentAccount: selectedPayment?.accountNo || '',
        }),
      });
      const data = await res.json();

      if (data.success) {
        const newDepositId = data.data?.depositId || '';
        setLastDepositId(newDepositId);
        setLastDepositAmount(numAmount);
        setLastDepositFee(data.data?.fee || adminFee);
        setLastDepositNet(data.data?.netAmount || netAmount);
        setLastDepositPayment(selectedPayment?.name || activeTab.toUpperCase());
        setShowSuccessModal(true);
        // Reset form
        setAmount('');
        setStep(1);
        setHasConfirmedPayment(false);
        setProofFile(null);
        setProofPreview('');
        setProofImageUrl('');
        await hydrateUser();
        fetchData();
      } else {
        toast({ title: 'Failed', description: data.error || 'Deposit failed', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error. Please try again.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleChatAdmin = (depositId?: string, depositAmount?: number, paymentName?: string) => {
    if (!primaryAdminPhone) {
      toast({ title: 'Error', description: 'Admin WhatsApp number not available.', variant: 'destructive' });
      return;
    }
    const id = depositId || lastDepositId || '';
    const amt = depositAmount || lastDepositAmount || 0;
    const pay = paymentName || lastDepositPayment || '-';
    const msg = encodeURIComponent(
      `Hello NEXVO Admin,\n\nI would like to confirm my deposit:\n\n🆔 Deposit ID: ${id}\n💰 Amount: ${formatRupiah(amt)}\n📋 Payment Method: ${pay}\n\nI will attach my transfer proof here. Please process ASAP. Thank you!`
    );
    const phone = primaryAdminPhone.replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
  };

  const formatAmountDisplay = (val: string) => {
    const num = val.replace(/[^0-9]/g, '');
    if (!num) return '';
    return parseInt(num).toLocaleString('id-ID');
  };

  const retry = () => { setError(null); setLoading(true); fetchData(); };

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
          <p className="text-muted-foreground text-sm mb-6">{error}</p>
          <Button onClick={retry} className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold">
            <RefreshCw className="w-4 h-4 mr-2" />Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6 space-y-4 sm:space-y-6 pb-4 sm:pb-6">
      {/* ─── Success Modal ─── */}
      <AnimatePresence>
        {showSuccessModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowSuccessModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-strong rounded-3xl p-4 sm:p-6 lg:p-8 max-w-sm w-full glow-gold-strong"
            >
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-9 h-9 text-emerald-400" />
                </div>
                <h2 className="text-foreground text-lg font-bold mb-1">Deposit Dikirim!</h2>
                <p className="text-muted-foreground text-sm mb-4">Deposit Anda sedang menunggu persetujuan admin. Saldo akan masuk setelah disetujui.</p>

                <div className="glass rounded-xl p-4 mb-5 space-y-3">
                  <div>
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-1">Deposit ID</p>
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-gold-gradient text-2xl font-bold font-mono tracking-wider">{lastDepositId}</span>
                      <CopyButton text={lastDepositId || ''} t={t} />
                    </div>
                  </div>
                  <div className="border-t border-white/5 pt-3">
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-1">Amount Deposited</p>
                    <p className="text-foreground text-xl font-bold">{formatRupiah(lastDepositAmount)}</p>
                  </div>
                  {lastDepositFee > 0 && <div className="border-t border-white/5 pt-3">
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-1">Admin Fee</p>
                    <p className="text-yellow-400 text-lg font-bold">{formatRupiah(lastDepositFee)}</p>
                  </div>}
                  <div className="border-t border-white/5 pt-3">
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-1">Credited to Balance</p>
                    <p className="text-emerald-400 text-xl font-bold">{formatRupiah(lastDepositNet)}</p>
                    {lastDepositFee > 0 ? <p className="text-yellow-400/70 text-[10px] mt-1">⚠️ Fee admin: {formatRupiah(lastDepositFee)}</p> : <p className="text-emerald-400/70 text-[10px] mt-1">✓ Tanpa potongan admin</p>}
                  </div>
                </div>

                <Button
                  onClick={() => handleChatAdmin()}
                  className="w-full h-14 bg-[#25D366] text-white font-bold rounded-xl hover:bg-[#20BD5A] transition-all text-base mb-2 shadow-lg shadow-[#25D366]/20"
                >
                  <Phone className="w-5 h-5 mr-2" />
                  Chat Admin via WhatsApp
                </Button>
                <p className="text-muted-foreground text-[10px] mb-3">Auto-sends your Deposit ID &amp; Amount</p>

                <button onClick={() => setShowSuccessModal(false)} className="text-muted-foreground text-sm hover:text-foreground transition-colors">
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div>
        {(isProductPurchase || isInvestmentPurchase) && (
          <button onClick={() => navigate(isProductPurchase ? 'products' : 'paket')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-3">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">{t('common.back')}</span>
          </button>
        )}
        <h1 className="text-foreground text-xl font-bold">
          {isProductPurchase ? t('deposit.productPayment') : isInvestmentPurchase ? t('deposit.investmentPayment') : t('deposit.title')}
        </h1>
        <p className="text-muted-foreground text-sm">
          {isProductPurchase ? `${t('deposit.productPayment')} - ${productName || ''}` : isInvestmentPurchase ? `${t('deposit.investmentPayment')} - ${packageName || ''}` : t('deposit.topUpBalance')}
        </p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all ${
              step >= s ? 'bg-gold-gradient text-[#070B14]' : 'bg-white/5 text-muted-foreground'
            }`}>
              {step > s ? <Check className="w-4 h-4" /> : s}
            </div>
            <span className={`text-xs font-medium hidden sm:block ${step >= s ? 'text-foreground' : 'text-muted-foreground'}`}>
              {s === 1 ? 'Amount' : s === 2 ? 'Payment' : 'Proof'}
            </span>
            {s < 3 && <div className={`flex-1 h-0.5 rounded-full ${step > s ? 'bg-[#D4AF37]' : 'bg-white/10'}`} />}
          </div>
        ))}
      </div>

      {/* Payment Purpose Card */}
      {(isProductPurchase || isInvestmentPurchase) && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-gold glow-gold-strong rounded-2xl p-3 sm:p-5 lg:p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gold-gradient flex items-center justify-center shrink-0">
              {isProductPurchase ? <ShoppingBag className="w-5 h-5 text-[#070B14]" /> : <Wallet className="w-5 h-5 text-[#070B14]" />}
            </div>
            <div>
              <h3 className="text-foreground font-semibold text-sm">{isProductPurchase ? productName : packageName}</h3>
              <p className="text-muted-foreground text-xs">{isProductPurchase ? `Qty: ${quantity || 1}x` : `Contract: ${pageData?.contractDays || 90} days`}</p>
            </div>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03]">
            <span className="text-muted-foreground text-sm">{t('deposit.totalPayment')}</span>
            <span className="text-gold-gradient text-xl font-bold">{formatRupiah(prefillAmount || 0)}</span>
          </div>
          {hasEnoughBalance && (
            <div className="mt-4 p-4 rounded-xl bg-emerald-400/5 border border-emerald-400/20">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400 text-sm font-medium">{t('deposit.balanceSufficient')}</span>
              </div>
              <p className="text-muted-foreground text-xs mb-3">Your balance {formatRupiah(user?.mainBalance || 0)} is sufficient.</p>
              <Button onClick={handleBuyWithBalance} disabled={submitting} className="w-full h-11 bg-emerald-500 text-white font-semibold rounded-xl hover:bg-emerald-600 transition-all text-sm">
                {submitting ? <div className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{t('common.processing')}</div> : <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{t('deposit.payFromBalance')}</div>}
              </Button>
            </div>
          )}
        </motion.div>
      )}

      {/* Deposit Form */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass glow-gold rounded-2xl p-3 sm:p-5 lg:p-6">
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">

          {/* ═══ STEP 1: Amount & Payment Method ═══ */}
          <AnimatePresence mode="wait">
            {step >= 1 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 sm:space-y-5">
                {/* Amount Input — FIRST: select amount before showing payment methods */}
                <div className="space-y-2">
                  <Label className="text-foreground text-sm font-medium">{t('deposit.amount')}</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">Rp</span>
                    <Input type="text" inputMode="numeric" placeholder="0" value={amount ? formatAmountDisplay(amount) : ''}
                      onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g, ''); setAmount(raw); }}
                      className="pl-10 h-11 sm:h-14 text-lg sm:text-xl font-bold bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/30 focus:border-[#D4AF37]/50 focus:ring-[#D4AF37]/20" />
                  </div>
                </div>

                {/* Preset amounts */}
                <div className="flex flex-wrap gap-2">
                  {presetAmounts.map((preset) => (
                    <button key={preset.value} type="button" onClick={() => setAmount(preset.value.toString())}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${amount === preset.value.toString() ? 'bg-gold-gradient text-[#070B14] glow-gold' : 'glass text-muted-foreground hover:text-foreground hover:glow-gold'}`}>
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* Amount Summary — no admin fee for deposit */}
                {numAmount > 0 && (
                  <div className="glass rounded-xl p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Deposit Amount</span>
                      <span className="text-foreground font-medium">{formatRupiah(numAmount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Admin Fee</span>
                      <span className="text-foreground font-medium">{adminFee > 0 ? formatRupiah(adminFee) : 'Gratis'}</span>
                    </div>
                    <div className="border-t border-white/5 pt-2 flex justify-between text-sm">
                      <span className="text-foreground font-semibold">Credited to Balance</span>
                      <span className="text-emerald-400 font-bold">{formatRupiah(netAmount)}</span>
                    </div>
                    {adminFee > 0 && <p className="text-yellow-400/70 text-[10px]">⚠️ Saldo dikurangi fee admin Rp {adminFee.toLocaleString('id-ID')}</p>}
                  </div>
                )}

                {/* Payment Method — ONLY shown after amount >= minimum (100K) */}
                {numAmount >= 100000 && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                    <Label className="text-foreground text-sm font-medium">{t('deposit.paymentMethod')}</Label>

                    {/* Payment Type Tabs */}
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {categoryTabKeys.map((tab) => {
                        const Icon = tab.icon;
                        const count = paymentMethods.filter((pm) => pm.type === tab.key || (tab.key === 'usdt' && pm.type === 'crypto')).length;
                        const isActive = activeTab === tab.key;
                        return (
                          <button key={tab.key} type="button" onClick={() => { setActiveTab(tab.key); setHasConfirmedPayment(false); }}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${isActive ? 'bg-gold-gradient text-[#070B14] glow-gold' : 'glass text-muted-foreground hover:text-foreground'}`}>
                            <Icon className="w-4 h-4" />
                            {t(tab.labelKey)}
                            {count > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-[#070B14]/20 text-[#070B14]' : 'bg-white/10 text-muted-foreground'}`}>{count}</span>}
                          </button>
                        );
                      })}
                    </div>

                    {/* Payment Methods Grid */}
                    {filteredMethods.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                        {filteredMethods.map((pm) => {
                          const isSelected = selectedPayment?.id === pm.id;
                          return (
                            <motion.button key={pm.id} type="button" onClick={() => { setSelectedPayment(pm); setHasConfirmedPayment(false); }}
                              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                              className={`relative flex flex-col items-center gap-2 p-3 rounded-xl transition-all ${isSelected ? 'glass-gold glow-gold border border-[#D4AF37]/40' : 'glass border border-transparent hover:border-border/50'}`}>
                              {isSelected && <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[#D4AF37] flex items-center justify-center"><Check className="w-2.5 h-2.5 text-[#070B14]" /></div>}
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden" style={{ backgroundColor: pm.color ? `${pm.color}15` : 'rgba(212,175,55,0.1)' }}>
                                {pm.iconUrl ? <img src={getFileUrl(pm.iconUrl)} alt={pm.name} className="w-6 h-6 object-contain" /> : <span className="text-xs font-bold" style={{ color: pm.color || '#D4AF37' }}>{(pm.name || '').charAt(0)}</span>}
                              </div>
                              <span className="text-foreground text-xs font-medium text-center leading-tight">{pm.name}</span>
                            </motion.button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-4 sm:py-6 glass rounded-xl">
                        <Clock className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-muted-foreground text-sm">{t('deposit.noPaymentMethods')}</p>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Amount too low warning */}
                {numAmount > 0 && numAmount < 100000 && (
                  <div className="p-3 rounded-xl bg-yellow-400/5 border border-yellow-400/20">
                    <p className="text-yellow-400 text-xs font-medium">⚠️ Minimum deposit is Rp100,000</p>
                  </div>
                )}

                {/* Continue to Step 2 */}
                {numAmount >= 100000 && selectedPayment && (
                  <Button type="button" onClick={() => setStep(2)}
                    className="w-full h-12 bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 transition-all glow-gold text-sm">
                    Continue to Payment Details →
                  </Button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ═══ STEP 2: Payment Details (QR / USDT Address) ═══ */}
          <AnimatePresence mode="wait">
            {step >= 2 && selectedPayment && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <button type="button" onClick={() => setStep(1)} className="text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <h3 className="text-foreground font-semibold text-sm">Step 2: Complete Payment</h3>
                </div>

                <div className="glass rounded-xl p-4 space-y-3">
                  {/* Amount to pay */}
                  <div className="p-3 rounded-xl bg-emerald-400/5 border border-emerald-400/20 text-center">
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-1">Amount to Pay</p>
                    <p className="text-emerald-400 text-2xl font-bold">{formatRupiah(numAmount)}</p>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden" style={{ backgroundColor: selectedPayment.color ? `${selectedPayment.color}15` : 'rgba(212,175,55,0.1)' }}>
                      {selectedPayment.iconUrl ? <img src={getFileUrl(selectedPayment.iconUrl)} alt={selectedPayment.name} className="w-5 h-5 object-contain" /> : <span className="text-xs font-bold" style={{ color: selectedPayment.color || '#D4AF37' }}>{(selectedPayment.name || '').charAt(0)}</span>}
                    </div>
                    <h4 className="text-foreground font-semibold text-sm">{selectedPayment.name}</h4>
                  </div>

                  {activeTab === 'qris' ? (
                    <div className="space-y-3">
                      {selectedPayment.qrImage && !qrImageError[selectedPayment.id] ? (
                        <div className="flex justify-center">
                          <div className="w-52 h-52 rounded-xl bg-white p-3">
                            <img
                              src={getFileUrl(selectedPayment.qrImage)}
                              alt="QRIS Payment"
                              className="w-full h-full object-contain"
                              onError={() => setQrImageError(prev => ({ ...prev, [selectedPayment.id]: true }))}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-center">
                          <div className="w-52 h-52 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-2">
                            <QrCode className="w-12 h-12 text-muted-foreground/30" />
                            <p className="text-muted-foreground/50 text-[10px]">{selectedPayment.qrImage ? 'QR image failed to load' : 'No QR image configured'}</p>
                          </div>
                        </div>
                      )}
                      <p className="text-muted-foreground text-xs text-center">Scan this QR code with your payment app to pay {formatRupiah(numAmount)}</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {selectedPayment.accountNo ? (
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-muted-foreground text-[10px] uppercase tracking-wider">USDT Wallet Address (BEP20)</p>
                            <p className="text-foreground font-mono text-sm font-semibold tracking-wide break-all">{selectedPayment.accountNo}</p>
                          </div>
                          <CopyButton text={selectedPayment.accountNo} t={t} onCopied={() => setHasConfirmedPayment(true)} />
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl bg-red-400/5 border border-red-400/20">
                          <p className="text-red-400 text-xs font-medium">Wallet address not configured. Please contact admin.</p>
                        </div>
                      )}
                      {selectedPayment.holderName && (
                        <div>
                          <p className="text-muted-foreground text-[10px] uppercase tracking-wider">{t('deposit.holderName')}</p>
                          <p className="text-foreground text-sm font-medium">{selectedPayment.holderName}</p>
                        </div>
                      )}
                      <div className="mt-2 p-3 rounded-xl bg-[#26A17B]/5 border border-[#26A17B]/20">
                        <p className="text-[#26A17B] text-xs font-medium mb-1">⚠️ Important:</p>
                        <ul className="text-muted-foreground text-[10px] space-y-0.5">
                          <li>• Send only USDT via BEP20 (BSC) network</li>
                          <li>• Do not send any asset other than USDT</li>
                          <li>• Make sure the address is correct before sending</li>
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Confirm Payment Button */}
                  <button type="button" onClick={() => setHasConfirmedPayment(true)}
                    className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all ${
                      hasConfirmedPayment ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-400/30' : 'bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/30 hover:bg-[#D4AF37]/20'
                    }`}>
                    {hasConfirmedPayment ? <><CheckCircle2 className="w-4 h-4" />Payment Confirmed ✓</> : <>{activeTab === 'qris' ? <><QrCode className="w-4 h-4" />I've Completed the QR Payment</> : <><Copy className="w-4 h-4" />I've Sent USDT to the Address</>}</>}
                  </button>
                </div>

                {/* Continue to Step 3 */}
                {hasConfirmedPayment && (
                  <Button type="button" onClick={() => setStep(3)}
                    className="w-full h-12 bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 transition-all glow-gold text-sm">
                    Continue to Upload Proof →
                  </Button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ═══ STEP 3: Upload Proof & Submit ═══ */}
          <AnimatePresence mode="wait">
            {step >= 3 && hasConfirmedPayment && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <button type="button" onClick={() => setStep(2)} className="text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <h3 className="text-foreground font-semibold text-sm">Step 3: Upload Transfer Proof</h3>
                </div>

                {/* Upload Area */}
                <div className="glass rounded-xl p-4 space-y-3">
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleProofSelect} className="hidden" />
                  
                  {proofPreview ? (
                    <div className="relative">
                      <img src={proofPreview} alt="Transfer proof" className="w-full max-h-64 object-contain rounded-xl" />
                      <button type="button" onClick={removeProof} className="absolute top-2 right-2 w-8 h-8 rounded-full bg-red-500/80 text-white flex items-center justify-center hover:bg-red-600 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      className="w-full py-8 rounded-xl border-2 border-dashed border-[#D4AF37]/30 hover:border-[#D4AF37]/50 bg-[#D4AF37]/5 hover:bg-[#D4AF37]/10 transition-all flex flex-col items-center gap-3">
                      <ImagePlus className="w-10 h-10 text-[#D4AF37]/50" />
                      <div className="text-center">
                        <p className="text-[#D4AF37] text-sm font-medium">Upload Transfer Proof</p>
                        <p className="text-muted-foreground text-[10px] mt-0.5">JPG, PNG, WebP, GIF • Max 5MB</p>
                      </div>
                    </button>
                  )}

                  {!proofPreview && (
                    <p className="text-muted-foreground text-xs text-center">
                      Upload your transfer receipt/screenshot, or send proof via WhatsApp after submitting
                    </p>
                  )}
                </div>

                {/* Summary */}
                <div className="glass rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Deposit Amount</span>
                    <span className="text-foreground font-medium">{formatRupiah(numAmount)}</span>
                  </div>
                  {adminFee > 0 && <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Admin Fee</span>
                    <span className="text-yellow-400 font-medium">{formatRupiah(adminFee)}</span>
                  </div>}
                  <div className="border-t border-white/5 pt-2 flex justify-between text-sm">
                    <span className="text-foreground font-semibold">Credited to Balance</span>
                    <span className="text-emerald-400 font-bold">{formatRupiah(netAmount)}</span>
                  </div>
                  {adminFee > 0 ? <p className="text-yellow-400/70 text-[10px]">⚠️ Saldo dikurangi fee admin</p> : <p className="text-emerald-400/70 text-[10px]">✓ Tanpa potongan admin</p>}
                  <div className="flex justify-between text-xs text-muted-foreground pt-1">
                    <span>Payment Method</span>
                    <span>{selectedPayment?.name}</span>
                  </div>
                </div>

                {/* Submit */}
                <Button type="submit" disabled={submitting || uploadingProof}
                  className="w-full h-12 bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 transition-all glow-gold text-sm disabled:opacity-50">
                  {submitting || uploadingProof ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {uploadingProof ? 'Uploading proof...' : t('common.processing')}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <ArrowDownCircle className="w-4 h-4" />
                      Deposit {formatRupiah(numAmount)}
                    </div>
                  )}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </motion.div>

      {/* Deposit History */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-2xl p-3 sm:p-5 lg:p-6">
        <h3 className="text-foreground font-semibold text-sm sm:text-base mb-4">{t('deposit.depositHistory')}</h3>

        {deposits.length > 0 ? (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {deposits.map((deposit) => (
              <div key={deposit.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition-colors">
                <div className="w-9 h-9 rounded-xl bg-emerald-400/10 flex items-center justify-center shrink-0">
                  <ArrowDownCircle className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-foreground text-sm font-medium">{t('deposit.title')}</p>
                    <span className="text-[10px] font-mono font-bold text-[#D4AF37] bg-[#D4AF37]/10 px-2 py-0.5 rounded-md">{deposit.depositId || '-'}</span>
                    {deposit.paymentName && <Badge className="bg-white/5 text-muted-foreground text-[9px] border-0 px-1.5 py-0">{deposit.paymentName}</Badge>}
                  </div>
                  <p className="text-muted-foreground text-xs">{formatDate(deposit.createdAt)}</p>
                  {deposit.fee > 0 && <p className="text-muted-foreground text-[10px]">Fee: {formatRupiah(deposit.fee)} • Net: {formatRupiah(deposit.netAmount)}</p>}
                  {deposit.status === 'pending' && (
                    <button onClick={() => handleChatAdmin(deposit.depositId, deposit.amount, deposit.paymentName)}
                      className="inline-flex items-center gap-1.5 bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] text-[11px] font-semibold px-3 py-1.5 rounded-lg mt-1.5 transition-all">
                      <Phone className="w-3.5 h-3.5" />Chat Admin
                    </button>
                  )}
                  {deposit.proofImage && (
                    <a href={getFileUrl(deposit.proofImage)} target="_blank" rel="noopener noreferrer" className="text-[#D4AF37] text-[10px] hover:underline mt-1 inline-block">
                      📎 View Proof
                    </a>
                  )}
                  {deposit.note && <p className="text-muted-foreground text-xs mt-0.5 italic">{deposit.note}</p>}
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <p className="text-emerald-400 text-sm font-semibold">+{formatRupiah(deposit.netAmount || deposit.amount)}</p>
                  {getStatusBadge(deposit.status, t)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Clock className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">{t('deposit.noDepositHistory')}</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
