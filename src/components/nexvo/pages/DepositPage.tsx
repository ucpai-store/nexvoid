'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowDownCircle, CheckCircle2,
  Clock, XCircle, Loader2, AlertTriangle, RefreshCw,
  QrCode, Copy, Check,
  ShoppingBag, Wallet, ArrowLeft,
  Upload, ImagePlus, X, Sparkles, TrendingUp, Shield, Zap
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
  { label: '160K', value: 160000 },
  { label: '320K', value: 320000 },
  { label: '640K', value: 640000 },
  { label: '1.92J', value: 1920000 },
  { label: '5.76J', value: 5760000 },
  { label: '17.28J', value: 17280000 },
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
      return <Badge className="bg-foreground/5 text-muted-foreground text-[10px]">{status}</Badge>;
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
    <button type="button" onClick={handleCopy} className="p-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors" title="Copy">
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
  const [step, setStep] = useState<1 | 2 | 3>(1);
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

  const [adminFee, setAdminFee] = useState(0);
  const [qrImageError, setQrImageError] = useState<Record<string, boolean>>({});

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
        // Deposit has NO admin fee (admin fee only applies on withdrawal).
        // Deposit requires manual admin approval before balance is credited.
        setAdminFee(0);
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

  useEffect(() => {
    // Only show methods matching the active tab (qris or usdt).
    // Legacy crypto/bank/ewallet types are no longer exposed by the API.
    const filtered = paymentMethods.filter((pm) => pm.type === activeTab);
    if (filtered.length > 0 && (!selectedPayment || !filtered.find(f => f.id === selectedPayment.id))) {
      setSelectedPayment(filtered[0]);
    } else if (filtered.length === 0) {
      setSelectedPayment(null);
    }
    setHasConfirmedPayment(false);
    setQrImageError({});
  }, [activeTab, paymentMethods]);

  const filteredMethods = paymentMethods.filter((pm) => pm.type === activeTab);

  const handleProofSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: 'Error', description: 'Image must be under 8MB', variant: 'destructive' });
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
      const res = await fetch('/api/deposit/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      // Handle non-OK HTTP responses (413 = Nginx body too large, 401 = token expired, etc.)
      if (!res.ok) {
        let errorMsg = `Upload gagal (HTTP ${res.status})`;
        try {
          const data = await res.json();
          if (data?.error) errorMsg = data.error;
        } catch {
          // Response is not JSON (likely Nginx 413 HTML page)
          if (res.status === 413) {
            errorMsg = 'File terlalu besar (maks 5MB). Kompres gambar lalu coba lagi.';
          } else if (res.status === 401) {
            errorMsg = 'Sesi berakhir, silakan login ulang lalu coba upload lagi.';
          } else if (res.status === 500) {
            errorMsg = 'Server error saat upload. Coba lagi atau hubungi admin.';
          }
        }
        throw new Error(errorMsg);
      }

      const data = await res.json();
      if (data.success && data.data?.url) {
        setProofImageUrl(data.data.url);
        return data.data.url;
      }
      throw new Error(data.error || 'Gagal upload bukti transfer');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal upload bukti transfer';
      toast({ title: 'Upload Gagal', description: msg, variant: 'destructive' });
      throw err;
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
      let proofUrl = '';
      if (proofFile) {
        try {
          proofUrl = await uploadProof();
        } catch {
          // ★ v11 fix: DON'T block deposit if upload fails.
          // Upload might fail because route is missing on VPS (pre-deploy)
          // or network issue. Deposit is MORE important than the proof image.
          // Submit deposit without proof — admin can request proof via WhatsApp.
          toast({
            title: 'Upload Bukti Gagal',
            description: 'Deposit tetap dikirim tanpa bukti. Admin akan meminta bukti transfer via WhatsApp.',
            variant: 'default',
          });
          proofUrl = '';
          setProofFile(null);
          setProofPreview('');
        }
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

  // NOTE: WhatsApp "Chat Admin" buttons removed by user request (2024-06-24).
  // Deposits are processed by admin in the dashboard — users no longer need to contact admin.

  const formatAmountDisplay = (val: string) => {
    const num = val.replace(/[^0-9]/g, '');
    if (!num) return '';
    return parseInt(num).toLocaleString('id-ID');
  };

  const retry = () => { setError(null); setLoading(true); fetchData(); };

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
          <p className="text-muted-foreground text-sm mb-6">{error}</p>
          <Button onClick={retry} className="bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90 glow-gold">
            <RefreshCw className="w-4 h-4 mr-2" />Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-6 space-y-4 sm:space-y-6 pb-4 sm:pb-6">
      {/* NOTE: Deposit is ALLOWED on weekends (only profit + WD are libur). No WeekendNoticeBanner here. */}

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
              <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-emerald-400/10 blur-3xl" />
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

                <h2 className="text-foreground text-xl font-bold mb-1">Deposit Diterima!</h2>
                <p className="text-muted-foreground text-sm mb-5">Deposit Anda sedang <span className="text-yellow-400 font-semibold">menunggu persetujuan admin</span>. Saldo akan masuk otomatis ke akun Anda setelah admin menyetujui deposit ini. Tanpa potongan admin fee.</p>

                <div className="glass rounded-2xl p-4 mb-5 space-y-3 border border-primary/10">
                  <div>
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-1">Deposit ID</p>
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-gold-gradient text-2xl font-bold font-mono tracking-wider">{lastDepositId}</span>
                      <CopyButton text={lastDepositId || ''} t={t} />
                    </div>
                  </div>
                  <div className="border-t border-white/5 pt-3">
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-1">Jumlah Deposit</p>
                    <p className="text-foreground text-xl font-bold">{formatRupiah(lastDepositAmount)}</p>
                  </div>
                  <div className="border-t border-white/5 pt-3">
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-1">Status</p>
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-yellow-400 text-lg font-bold">Menunggu Persetujuan Admin</span>
                    </div>
                    <p className="text-emerald-400/70 text-[10px] mt-1">✓ Tanpa potongan admin fee</p>
                  </div>
                </div>

                <div className="glass rounded-2xl p-4 mb-5 space-y-3 border border-emerald-400/20 bg-emerald-400/5">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                    <span className="text-emerald-400 text-sm font-semibold">Deposit Sedang Diproses</span>
                  </div>
                  <p className="text-muted-foreground text-[11px] text-center leading-relaxed">
                    Deposit Anda sedang dalam antrian proses verifikasi oleh admin. Saldo akan masuk otomatis ke akun Anda setelah deposit disetujui. Mohon tunggu, tidak perlu menghubungi admin.
                  </p>
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
        className="space-y-3"
      >
        {(isProductPurchase || isInvestmentPurchase) && (
          <button onClick={() => navigate(isProductPurchase ? 'products' : 'paket')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">{t('common.back')}</span>
          </button>
        )}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gold-gradient flex items-center justify-center shrink-0 glow-gold">
            <ArrowDownCircle className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-foreground text-xl sm:text-2xl font-bold">
              {isProductPurchase ? t('deposit.productPayment') : isInvestmentPurchase ? t('deposit.investmentPayment') : t('deposit.title')}
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm">
              {isProductPurchase ? `${t('deposit.productPayment')} - ${productName || ''}` : isInvestmentPurchase ? `${t('deposit.investmentPayment')} - ${packageName || ''}` : t('deposit.topUpBalance')}
            </p>
          </div>
        </div>
      </motion.div>

      {/* ─── Premium Balance Showcase ─── */}
      {!isProductPurchase && !isInvestmentPurchase && (
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
                <span className="text-muted-foreground text-xs sm:text-sm font-medium">Saldo Deposit Anda</span>
              </div>
              <p className="text-3xl sm:text-4xl font-bold text-gold-gradient">{formatRupiah(user?.depositBalance || 0)}</p>
              <p className="text-muted-foreground text-[10px] sm:text-xs mt-1">Top up saldo untuk mulai berinvestasi</p>
            </div>
            <div className="hidden sm:flex flex-col items-center gap-1 px-4 py-3 rounded-2xl glass border border-primary/10">
              <Shield className="w-5 h-5 text-primary" />
              <span className="text-[10px] text-muted-foreground font-medium">Aman</span>
            </div>
          </div>
        </motion.div>
      )}

      {/* ─── Premium Step Indicator ─── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-3 sm:p-4 border border-primary/10"
      >
        <div className="flex items-center gap-1 sm:gap-2">
          {[
            { num: 1, label: 'Nominal', icon: Wallet },
            { num: 2, label: 'Bayar', icon: QrCode },
            { num: 3, label: 'Bukti', icon: Upload },
          ].map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.num} className="flex items-center gap-1 sm:gap-2 flex-1">
                <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 ${
                  step >= s.num ? 'bg-gold-gradient text-primary-foreground glow-gold' : 'bg-foreground/5 text-muted-foreground'
                }`}>
                  {step > s.num ? <Check className="w-4 h-4 sm:w-5 sm:h-5" /> : <Icon className="w-4 h-4 sm:w-5 sm:h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <span className={`text-[10px] sm:text-xs font-semibold block ${step >= s.num ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {s.label}
                  </span>
                  <span className={`text-[9px] hidden sm:block ${step >= s.num ? 'text-primary' : 'text-muted-foreground/50'}`}>
                    Step {s.num}
                  </span>
                </div>
                {i < 2 && <div className={`w-6 sm:w-10 h-0.5 rounded-full transition-all ${step > s.num ? 'bg-primary' : 'bg-foreground/10'}`} />}
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* ─── Payment Purpose Card ─── */}
      {(isProductPurchase || isInvestmentPurchase) && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-gold glow-gold-strong rounded-2xl p-3 sm:p-5 border border-primary/20">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gold-gradient flex items-center justify-center shrink-0">
              {isProductPurchase ? <ShoppingBag className="w-5 h-5 text-primary-foreground" /> : <Wallet className="w-5 h-5 text-primary-foreground" />}
            </div>
            <div>
              <h3 className="text-foreground font-semibold text-sm">{isProductPurchase ? productName : packageName}</h3>
              <p className="text-muted-foreground text-xs">{isProductPurchase ? `Qty: ${quantity || 1}x` : `Kontrak: ${pageData?.contractDays || 90} hari`}</p>
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
              <p className="text-muted-foreground text-xs mb-3">Saldo Anda {formatRupiah(user?.mainBalance || 0)} mencukupi.</p>
              <Button onClick={handleBuyWithBalance} disabled={submitting} className="w-full h-11 bg-emerald-500 text-white font-semibold rounded-xl hover:bg-emerald-600 transition-all text-sm">
                {submitting ? <div className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{t('common.processing')}</div> : <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{t('deposit.payFromBalance')}</div>}
              </Button>
            </div>
          )}
        </motion.div>
      )}

      {/* ─── Premium Deposit Form ─── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass glow-gold rounded-3xl p-4 sm:p-6 border border-primary/10">
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">

          {/* ═══ STEP 1: Amount & Payment Method ═══ */}
          <AnimatePresence mode="wait">
            {step >= 1 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4 sm:space-y-5">
                {/* Premium Amount Input */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-foreground text-sm font-medium flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5 text-primary" />
                      {t('deposit.amount')}
                    </Label>
                    <span className="text-[10px] text-muted-foreground">Min: Rp100.000</span>
                  </div>
                  <div className="relative group">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-primary text-base sm:text-lg font-bold">Rp</span>
                    <Input type="text" inputMode="numeric" placeholder="0" value={amount ? formatAmountDisplay(amount) : ''}
                      onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g, ''); setAmount(raw); }}
                      className="pl-12 h-14 sm:h-16 text-2xl sm:text-3xl font-bold bg-input/50 border-primary/20 rounded-2xl text-foreground placeholder:text-muted-foreground/20 focus:border-primary/50 focus:ring-primary/20 transition-all" />
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-gold-gradient scale-x-0 group-focus-within:scale-x-100 transition-transform origin-left" />
                  </div>
                </div>

                {/* Premium Preset Amounts - Sesuai dengan Paket Investasi */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {presetAmounts.map((preset) => {
                    const isSelected = amount === preset.value.toString();
                    return (
                      <motion.button
                        key={preset.value}
                        type="button"
                        onClick={() => setAmount(preset.value.toString())}
                        whileTap={{ scale: 0.95 }}
                        className={`relative px-2 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-bold transition-all overflow-hidden ${
                          isSelected
                            ? 'bg-gold-gradient text-primary-foreground glow-gold'
                            : 'glass text-muted-foreground hover:text-foreground hover:border-primary/30 border border-transparent'
                        }`}
                      >
                        {preset.label}
                      </motion.button>
                    );
                  })}
                </div>

                {/* Premium Amount Summary */}
                {numAmount > 0 && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="glass rounded-2xl p-4 space-y-2.5 border border-primary/10">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-primary" />
                        Jumlah Deposit
                      </span>
                      <span className="text-foreground font-medium">{formatRupiah(numAmount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Admin Fee</span>
                      <span className="text-foreground font-medium">{adminFee > 0 ? formatRupiah(adminFee) : <span className="text-emerald-400">Gratis</span>}</span>
                    </div>
                    <div className="border-t border-primary/10 pt-2.5 flex justify-between">
                      <span className="text-foreground font-semibold text-sm">Saldo Yang Masuk</span>
                      <span className="text-emerald-400 font-bold text-base">{formatRupiah(netAmount)}</span>
                    </div>
                    {adminFee > 0 && <p className="text-yellow-400/70 text-[10px]">⚠️ Saldo dipotong admin fee Rp {adminFee.toLocaleString('id-ID')}</p>}
                  </motion.div>
                )}

                {/* Premium Payment Method Selection */}
                {numAmount >= 100000 && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                    <Label className="text-foreground text-sm font-medium flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-primary" />
                      {t('deposit.paymentMethod')}
                    </Label>

                    {/* Payment Type Tabs */}
                    <div className="flex gap-2 p-1 glass rounded-2xl">
                      {categoryTabKeys.map((tab) => {
                        const Icon = tab.icon;
                        const count = paymentMethods.filter((pm) => pm.type === tab.key).length;
                        const isActive = activeTab === tab.key;
                        return (
                          <button key={tab.key} type="button" onClick={() => { setActiveTab(tab.key); setHasConfirmedPayment(false); }}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                              isActive ? 'bg-gold-gradient text-primary-foreground glow-gold' : 'text-muted-foreground hover:text-foreground'
                            }`}>
                            <Icon className="w-4 h-4" />
                            {t(tab.labelKey)}
                            {count > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-background/20 text-primary-foreground' : 'bg-foreground/10 text-muted-foreground'}`}>{count}</span>}
                          </button>
                        );
                      })}
                    </div>

                    {/* Premium Payment Methods Grid */}
                    {filteredMethods.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {filteredMethods.map((pm) => {
                          const isSelected = selectedPayment?.id === pm.id;
                          return (
                            <motion.button key={pm.id} type="button" onClick={() => { setSelectedPayment(pm); setHasConfirmedPayment(false); }}
                              whileHover={{ scale: 1.03, y: -2 }}
                              whileTap={{ scale: 0.97 }}
                              className={`relative flex flex-col items-center gap-2 p-4 rounded-2xl transition-all border-2 ${
                                isSelected
                                  ? 'glass-gold glow-gold border-primary'
                                  : 'glass border-transparent hover:border-primary/30'
                              }`}>
                              {isSelected && (
                                <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center ring-2 ring-background">
                                  <Check className="w-3 h-3 text-primary-foreground" />
                                </div>
                              )}
                              <div className="w-12 h-12 rounded-2xl flex items-center justify-center overflow-hidden" style={{ backgroundColor: pm.color ? `${pm.color}15` : 'rgba(212,175,55,0.1)' }}>
                                {pm.iconUrl ? <img src={getFileUrl(pm.iconUrl)} alt={pm.name} className="w-7 h-7 object-contain" /> : <span className="text-sm font-bold" style={{ color: pm.color || '#D4AF37' }}>{(pm.name || '').charAt(0)}</span>}
                              </div>
                              <span className="text-foreground text-xs font-semibold text-center leading-tight">{pm.name}</span>
                            </motion.button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-8 glass rounded-2xl">
                        <Clock className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-muted-foreground text-sm">{t('deposit.noPaymentMethods')}</p>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Amount too low warning */}
                {numAmount > 0 && numAmount < 100000 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-3 rounded-xl bg-yellow-400/5 border border-yellow-400/20 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
                    <p className="text-yellow-400 text-xs font-medium">Minimum deposit Rp100.000</p>
                  </motion.div>
                )}

                {/* Continue Button */}
                {numAmount >= 100000 && selectedPayment && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <Button type="button" onClick={() => setStep(2)}
                      className="w-full h-14 bg-gold-gradient text-primary-foreground font-semibold rounded-2xl hover:opacity-90 transition-all glow-gold-strong text-base">
                      Lanjut ke Pembayaran
                      <ArrowLeft className="w-4 h-4 ml-2 rotate-180" />
                    </Button>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ═══ STEP 2: Payment Details (QR / USDT Address) ═══ */}
          <AnimatePresence mode="wait">
            {step >= 2 && selectedPayment && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <button type="button" onClick={() => setStep(1)} className="w-9 h-9 rounded-xl glass flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div>
                    <h3 className="text-foreground font-bold text-base">Selesaikan Pembayaran</h3>
                    <p className="text-muted-foreground text-[10px]">Step 2 dari 3</p>
                  </div>
                </div>

                <div className="glass rounded-2xl p-4 sm:p-5 space-y-4 border border-primary/10">
                  {/* Premium Amount to Pay */}
                  <div className="p-4 rounded-2xl bg-emerald-400/5 border border-emerald-400/20 text-center relative overflow-hidden">
                    <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-emerald-400/10 blur-2xl" />
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-1">Jumlah Bayar</p>
                    <p className="text-emerald-400 text-3xl font-bold">{formatRupiah(numAmount)}</p>
                  </div>

                  {/* Payment Method Info */}
                  <div className="flex items-center gap-3 p-3 rounded-xl glass">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden" style={{ backgroundColor: selectedPayment.color ? `${selectedPayment.color}15` : 'rgba(212,175,55,0.1)' }}>
                      {selectedPayment.iconUrl ? <img src={getFileUrl(selectedPayment.iconUrl)} alt={selectedPayment.name} className="w-6 h-6 object-contain" /> : <span className="text-sm font-bold" style={{ color: selectedPayment.color || '#D4AF37' }}>{(selectedPayment.name || '').charAt(0)}</span>}
                    </div>
                    <div>
                      <p className="text-foreground font-semibold text-sm">{selectedPayment.name}</p>
                      <p className="text-muted-foreground text-[10px]">{activeTab === 'qris' ? 'Scan QR untuk bayar' : 'Transfer ke alamat wallet'}</p>
                    </div>
                  </div>

                  {activeTab === 'qris' ? (
                    <div className="space-y-3">
                      {selectedPayment.qrImage && !qrImageError[selectedPayment.id] ? (
                        <div className="flex justify-center">
                          <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="p-3 rounded-3xl bg-white glow-gold-strong"
                          >
                            <img
                              src={getFileUrl(selectedPayment.qrImage)}
                              alt="QRIS Payment"
                              className="w-56 h-56 object-contain rounded-xl"
                              onError={() => setQrImageError(prev => ({ ...prev, [selectedPayment.id]: true }))}
                            />
                          </motion.div>
                        </div>
                      ) : (
                        <div className="flex justify-center">
                          <div className="w-56 h-56 rounded-2xl bg-foreground/5 border border-white/10 flex flex-col items-center justify-center gap-2">
                            <QrCode className="w-16 h-16 text-muted-foreground/30" />
                            <p className="text-muted-foreground/50 text-[10px]">{selectedPayment.qrImage ? 'QR gagal dimuat' : 'QR belum dikonfigurasi'}</p>
                          </div>
                        </div>
                      )}
                      <p className="text-muted-foreground text-xs text-center">Scan QR ini dengan app pembayaran untuk bayar <span className="text-foreground font-semibold">{formatRupiah(numAmount)}</span></p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* USDT QR Code (if admin uploaded one) */}
                      {selectedPayment.qrImage && !qrImageError[selectedPayment.id] && (
                        <div className="flex justify-center">
                          <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="p-3 rounded-3xl bg-white glow-gold-strong"
                          >
                            <img
                              src={getFileUrl(selectedPayment.qrImage)}
                              alt="USDT QR"
                              className="w-48 h-48 object-contain rounded-xl"
                              onError={() => setQrImageError(prev => ({ ...prev, [selectedPayment.id]: true }))}
                            />
                          </motion.div>
                        </div>
                      )}
                      {selectedPayment.qrImage && !qrImageError[selectedPayment.id] && (
                        <p className="text-muted-foreground text-xs text-center">Scan QR di atas atau copy alamat wallet USDT di bawah</p>
                      )}
                      {selectedPayment.accountNo ? (
                        <div className="flex items-center justify-between gap-2 p-3 rounded-xl glass">
                          <div className="min-w-0 flex-1">
                            <p className="text-muted-foreground text-[10px] uppercase tracking-wider">USDT Wallet (BEP20)</p>
                            <p className="text-foreground font-mono text-sm font-semibold tracking-wide break-all">{selectedPayment.accountNo}</p>
                          </div>
                          <CopyButton text={selectedPayment.accountNo} t={t} onCopied={() => setHasConfirmedPayment(true)} />
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl bg-red-400/5 border border-red-400/20">
                          <p className="text-red-400 text-xs font-medium">Wallet address belum dikonfigurasi. Hubungi admin.</p>
                        </div>
                      )}
                      {selectedPayment.holderName && (
                        <div className="p-3 rounded-xl glass">
                          <p className="text-muted-foreground text-[10px] uppercase tracking-wider">{t('deposit.holderName')}</p>
                          <p className="text-foreground text-sm font-medium">{selectedPayment.holderName}</p>
                        </div>
                      )}
                      <div className="p-3 rounded-xl bg-[#26A17B]/5 border border-[#26A17B]/20">
                        <p className="text-[#26A17B] text-xs font-semibold mb-1.5">⚠️ Penting:</p>
                        <ul className="text-muted-foreground text-[10px] space-y-1">
                          <li>• Kirim hanya USDT via jaringan BEP20 (BSC)</li>
                          <li>• Jangan kirim aset selain USDT</li>
                          <li>• Pastikan alamat benar sebelum kirim</li>
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Confirm Payment Button */}
                  <motion.button
                    type="button"
                    onClick={() => setHasConfirmedPayment(!hasConfirmedPayment)}
                    whileTap={{ scale: 0.98 }}
                    className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold transition-all ${
                      hasConfirmedPayment
                        ? 'bg-emerald-500/15 text-emerald-400 border-2 border-emerald-400/30'
                        : 'bg-primary/10 text-primary border-2 border-primary/30 hover:bg-primary/20'
                    }`}
                  >
                    {hasConfirmedPayment ? (
                      <><CheckCircle2 className="w-4 h-4" />Pembayaran Dikonfirmasi ✓</>
                    ) : (
                      activeTab === 'qris'
                        ? <><QrCode className="w-4 h-4" />Saya Sudah Scan QR & Bayar</>
                        : <><Copy className="w-4 h-4" />Saya Sudah Transfer USDT</>
                    )}
                  </motion.button>
                </div>

                {/* Continue to Step 3 */}
                {hasConfirmedPayment && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <Button type="button" onClick={() => setStep(3)}
                      className="w-full h-14 bg-gold-gradient text-primary-foreground font-semibold rounded-2xl hover:opacity-90 transition-all glow-gold-strong text-base">
                      Lanjut Upload Bukti
                      <ArrowLeft className="w-4 h-4 ml-2 rotate-180" />
                    </Button>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ═══ STEP 3: Upload Proof & Submit ═══ */}
          <AnimatePresence mode="wait">
            {step >= 3 && hasConfirmedPayment && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <button type="button" onClick={() => setStep(2)} className="w-9 h-9 rounded-xl glass flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div>
                    <h3 className="text-foreground font-bold text-base">Upload Bukti Transfer</h3>
                    <p className="text-muted-foreground text-[10px]">Step 3 dari 3</p>
                  </div>
                </div>

                {/* Premium Upload Area */}
                <div className="glass rounded-2xl p-4 space-y-3 border border-primary/10">
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleProofSelect} className="hidden" />

                  {proofPreview ? (
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative">
                      <img src={proofPreview} alt="Transfer proof" className="w-full max-h-72 object-contain rounded-2xl" />
                      <button type="button" onClick={removeProof} className="absolute top-2 right-2 w-9 h-9 rounded-full bg-red-500/90 text-white flex items-center justify-center hover:bg-red-600 transition-colors backdrop-blur-sm">
                        <X className="w-4 h-4" />
                      </button>
                      <div className="absolute bottom-2 left-2 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm flex items-center gap-1.5">
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-white text-[10px] font-medium">{proofFile?.name}</span>
                      </div>
                    </motion.div>
                  ) : (
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      className="w-full py-10 rounded-2xl border-2 border-dashed border-primary/30 hover:border-primary/50 bg-primary/5 hover:bg-primary/10 transition-all flex flex-col items-center gap-3 group">
                      <motion.div whileHover={{ scale: 1.1 }} className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                        <ImagePlus className="w-7 h-7 text-primary" />
                      </motion.div>
                      <div className="text-center">
                        <p className="text-primary text-sm font-semibold">Upload Bukti Transfer</p>
                        <p className="text-muted-foreground text-[10px] mt-0.5">JPG, PNG, WebP, GIF • Max 5MB</p>
                      </div>
                    </button>
                  )}

                  {!proofPreview && (
                    <p className="text-muted-foreground text-xs text-center">
                      Upload bukti transfer/screenshot untuk mempercepat verifikasi deposit
                    </p>
                  )}
                </div>

                {/* Premium Summary */}
                <div className="glass-gold rounded-2xl p-4 space-y-2.5 border border-primary/15">
                  <h4 className="text-foreground font-semibold text-sm mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    Ringkasan Deposit
                  </h4>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Jumlah Deposit</span>
                    <span className="text-foreground font-medium">{formatRupiah(numAmount)}</span>
                  </div>
                  {adminFee > 0 && <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Admin Fee</span>
                    <span className="text-yellow-400 font-medium">{formatRupiah(adminFee)}</span>
                  </div>}
                  <div className="border-t border-primary/10 pt-2.5 flex justify-between">
                    <span className="text-foreground font-semibold text-sm">Saldo Masuk</span>
                    <span className="text-emerald-400 font-bold text-base">{formatRupiah(netAmount)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground pt-1">
                    <span>Metode Pembayaran</span>
                    <span className="text-foreground font-medium">{selectedPayment?.name}</span>
                  </div>
                </div>

                {/* Submit */}
                <Button type="submit" disabled={submitting || uploadingProof}
                  data-tour="deposit-submit"
                  className="w-full h-14 bg-gold-gradient text-primary-foreground font-semibold rounded-2xl hover:opacity-90 transition-all glow-gold-strong text-base disabled:opacity-50">
                  {submitting || uploadingProof ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {uploadingProof ? 'Upload bukti...' : t('common.processing')}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <ArrowDownCircle className="w-5 h-5" />
                      Deposit {formatRupiah(numAmount)}
                    </div>
                  )}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </motion.div>

      {/* ─── Premium Deposit History ─── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-3xl p-4 sm:p-6 border border-primary/10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-foreground font-semibold text-sm sm:text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            {t('deposit.depositHistory')}
          </h3>
          {deposits.length > 0 && <Badge className="bg-primary/10 text-primary text-[10px]">{deposits.length} transaksi</Badge>}
        </div>

        {deposits.length > 0 ? (
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {deposits.map((deposit, idx) => (
              <motion.div
                key={deposit.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="relative flex items-center gap-3 p-3 sm:p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] transition-all border border-white/5"
              >
                <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl bg-emerald-400/50" />
                <div className="w-10 h-10 rounded-xl bg-emerald-400/10 flex items-center justify-center shrink-0">
                  <ArrowDownCircle className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <p className="text-foreground text-sm font-semibold">{t('deposit.title')}</p>
                    <span className="text-[10px] font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">{deposit.depositId || '-'}</span>
                  </div>
                  <p className="text-muted-foreground text-xs">{formatDate(deposit.createdAt)}</p>
                  {deposit.paymentName && (
                    <Badge className="bg-foreground/5 text-muted-foreground text-[9px] border-border px-1.5 py-0 mt-1">{deposit.paymentName}</Badge>
                  )}
                  {deposit.fee > 0 && <p className="text-muted-foreground text-[10px] mt-0.5">Fee: {formatRupiah(deposit.fee)} • Net: {formatRupiah(deposit.netAmount)}</p>}
                  {deposit.status === 'pending' && (
                    <span className="inline-flex items-center gap-1.5 bg-yellow-400/10 text-yellow-400 text-[11px] font-semibold px-3 py-1.5 rounded-lg mt-1.5">
                      <Clock className="w-3.5 h-3.5" /> Sedang Diproses
                    </span>
                  )}
                  {deposit.proofImage && (
                    <a href={getFileUrl(deposit.proofImage)} target="_blank" rel="noopener noreferrer" className="text-primary text-[10px] hover:underline mt-1 inline-block">
                      📎 Lihat Bukti
                    </a>
                  )}
                  {deposit.note && <p className="text-muted-foreground text-xs mt-0.5 italic">{deposit.note}</p>}
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <p className="text-emerald-400 text-sm font-bold">+{formatRupiah(deposit.netAmount || deposit.amount)}</p>
                  {getStatusBadge(deposit.status, t)}
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10">
            <div className="w-16 h-16 rounded-2xl bg-foreground/5 flex items-center justify-center mx-auto mb-3">
              <Clock className="w-8 h-8 text-muted-foreground/30" />
            </div>
            <p className="text-muted-foreground text-sm">{t('deposit.noDepositHistory')}</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
