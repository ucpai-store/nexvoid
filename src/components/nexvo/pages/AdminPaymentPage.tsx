'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, Save, Loader2, QrCode, Settings,
  CheckCircle2, Plus, Trash2, Edit3, X,
  Eye, EyeOff, Image as ImageIcon, GripVertical, Wallet,
  AlertTriangle, RefreshCw
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { getFileUrl } from '@/lib/file-url';

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
  createdAt: string;
  updatedAt: string;
}

const typeConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  qris: { label: 'QRIS', icon: QrCode, color: '#E31E24' },
  bank: { label: 'Transfer Bank', icon: Wallet, color: '#0066AF' },
  ewallet: { label: 'E-Wallet', icon: Wallet, color: '#7B61FF' },
  usdt: { label: 'USDT (BEP20)', icon: Wallet, color: '#26A17B' },
  crypto: { label: 'Crypto', icon: Wallet, color: '#F7931A' },
};

const emptyForm: Omit<PaymentMethod, 'id' | 'createdAt' | 'updatedAt'> = {
  type: 'qris',
  name: '',
  accountNo: '',
  holderName: '',
  qrImage: '',
  iconUrl: '',
  color: '',
  isActive: true,
  order: 0,
};

export default function AdminPaymentPage() {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadField, setUploadField] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [autoPayment, setAutoPayment] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const { adminToken } = useAuthStore();
  const iconInputRef = useRef<HTMLInputElement>(null);
  const qrInputRef = useRef<HTMLInputElement>(null);

  const fetchPaymentMethods = async () => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/payment-methods', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (data.success) {
        setPaymentMethods(data.data || []);
      }
    } catch {
      toast({ title: 'Error', description: 'Gagal memuat metode pembayaran', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/settings', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (data.success && data.data) {
        const settings = data.data as Record<string, string>;
        setAutoPayment(settings.auto_payment === 'true');
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchPaymentMethods();
    fetchSettings();
  }, [adminToken]);

  const handleImageUpload = async (file: File, field: string) => {
    if (!adminToken) {
      toast({ title: 'Error', description: 'Sesi telah berakhir, silakan login kembali', variant: 'destructive' });
      return;
    }
    setUploading(true);
    setUploadField(field);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: formData,
      });
      if (!res.ok) {
        throw new Error(`Upload failed with status ${res.status}`);
      }
      const data = await res.json();
      if (data.success) {
        const url = data.data.url || data.data.filePath;
        setForm((prev) => ({ ...prev, [field]: url }));
        toast({ title: 'Gambar berhasil diupload' });
      } else {
        toast({ title: 'Gagal upload gambar', description: data.error || 'Terjadi kesalahan', variant: 'destructive' });
      }
    } catch (err) {
      console.error('Upload error:', err);
      toast({ title: 'Kesalahan Jaringan', description: 'Gagal mengunggah file, coba lagi', variant: 'destructive' });
    } finally {
      setUploading(false);
      setUploadField(null);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Error', description: 'Nama metode pembayaran wajib diisi', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        // Update
        const res = await fetch(`/api/admin/payment-methods/${editingId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (data.success) {
          toast({ title: 'Berhasil', description: 'Metode pembayaran berhasil diperbarui' });
          setShowForm(false);
          setEditingId(null);
          setForm(emptyForm);
          fetchPaymentMethods();
        } else {
          toast({ title: 'Gagal', description: data.error, variant: 'destructive' });
        }
      } else {
        // Create
        const res = await fetch('/api/admin/payment-methods', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (data.success) {
          toast({ title: 'Berhasil', description: 'Metode pembayaran berhasil ditambahkan' });
          setShowForm(false);
          setForm(emptyForm);
          fetchPaymentMethods();
        } else {
          toast({ title: 'Gagal', description: data.error, variant: 'destructive' });
        }
      }
    } catch {
      toast({ title: 'Error', description: 'Terjadi kesalahan jaringan', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/payment-methods/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Berhasil', description: 'Metode pembayaran berhasil dihapus' });
        setDeleteConfirm(null);
        fetchPaymentMethods();
      } else {
        toast({ title: 'Gagal', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Terjadi kesalahan', variant: 'destructive' });
    }
  };

  const handleToggleActive = async (pm: PaymentMethod) => {
    try {
      const res = await fetch(`/api/admin/payment-methods/${pm.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ isActive: !pm.isActive }),
      });
      const data = await res.json();
      if (data.success) {
        toast({
          title: 'Berhasil',
          description: `${pm.name} ${!pm.isActive ? 'diaktifkan' : 'dinonaktifkan'}`,
        });
        fetchPaymentMethods();
      }
    } catch {
      toast({ title: 'Error', description: 'Gagal mengubah status', variant: 'destructive' });
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ key: 'auto_payment', value: autoPayment.toString() }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Berhasil', description: 'Pengaturan pembayaran disimpan' });
      } else {
        toast({ title: 'Gagal', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Gagal menyimpan pengaturan', variant: 'destructive' });
    } finally {
      setSavingSettings(false);
    }
  };

  const openEditForm = (pm: PaymentMethod) => {
    setForm({
      type: pm.type,
      name: pm.name,
      accountNo: pm.accountNo,
      holderName: pm.holderName,
      qrImage: pm.qrImage,
      iconUrl: pm.iconUrl,
      color: pm.color,
      isActive: pm.isActive,
      order: pm.order,
    });
    setEditingId(pm.id);
    setShowForm(true);
  };

  const openNewForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  };

  // Group methods by type
  const groupedMethods = Object.keys(typeConfig).map((key) => ({
    key,
    methods: paymentMethods.filter((pm) => pm.type === key),
  })).filter(group => group.methods.length > 0);
  
  // Catch any methods that don't match a known type
  const uncategorizedMethods = paymentMethods.filter(
    (pm) => !Object.keys(typeConfig).includes(pm.type)
  );
  if (uncategorizedMethods.length > 0) {
    groupedMethods.push({ key: 'other', methods: uncategorizedMethods });
  }

  if (loading) {
    return (
      <div className="p-3 sm:p-5 lg:p-6">
        <Skeleton className="h-10 w-64 mb-6" />
        <div className="space-y-6">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-5 lg:p-6 pb-4 sm:pb-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gold-gradient">Pengaturan Pembayaran</h1>
          <p className="text-muted-foreground text-sm">Kelola metode dan pengaturan pembayaran</p>
        </div>
        <Button
          onClick={openNewForm}
          className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold"
        >
          <Plus className="w-4 h-4 mr-2" />
          Tambah Metode
        </Button>
      </motion.div>

      {/* Payment Methods by Category */}
      <div className="max-w-4xl space-y-6">
        {groupedMethods.map((category) => {
          const config = typeConfig[category.key] || { label: 'Lainnya', icon: Wallet, color: '#888888' };
          const Icon = config.icon;
          return (
            <motion.div
              key={category.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass glow-gold rounded-2xl p-3 sm:p-6"
            >
              <div className="flex items-center gap-2 mb-4">
                <div
                  className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${config.color}15` }}
                >
                  <Icon className="w-4 h-4" style={{ color: config.color }} />
                </div>
                <h3 className="text-foreground font-semibold">{config.label}</h3>
                <Badge className="bg-white/5 text-muted-foreground text-[10px] border-0 ml-auto">
                  {category.methods.length} metode
                </Badge>
              </div>

              {category.methods.length > 0 ? (
                <div className="space-y-2">
                  {category.methods.map((pm) => (
                    <div
                      key={pm.id}
                      className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                        pm.isActive ? 'bg-white/[0.03] hover:bg-white/[0.05]' : 'bg-white/[0.01] opacity-60'
                      }`}
                    >
                      {/* Icon */}
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden shrink-0"
                        style={{ backgroundColor: pm.color ? `${pm.color}15` : 'rgba(212,175,55,0.1)' }}
                      >
                        {pm.iconUrl ? (
                          <img src={getFileUrl(pm.iconUrl)} alt={pm.name} className="w-6 h-6 object-contain" />
                        ) : (
                          <span className="text-xs font-bold" style={{ color: pm.color || '#D4AF37' }}>
                            {pm.name.charAt(0)}
                          </span>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-foreground text-sm font-medium truncate">{pm.name}</p>
                          {!pm.isActive && (
                            <Badge className="bg-red-500/10 text-red-400 text-[9px] border-0">Nonaktif</Badge>
                          )}
                        </div>
                        {pm.accountNo && (
                          <p className="text-muted-foreground text-xs font-mono">{pm.accountNo}</p>
                        )}
                        {pm.holderName && (
                          <p className="text-muted-foreground text-[10px]">{pm.holderName}</p>
                        )}
                      </div>

                      {/* Status Toggle */}
                      <div className="flex items-center gap-2 shrink-0">
                        <Switch
                          checked={pm.isActive}
                          onCheckedChange={() => handleToggleActive(pm)}
                        />
                        <button
                          onClick={() => openEditForm(pm)}
                          className="p-2.5 sm:p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-[#D4AF37] transition-colors"
                          title="Edit"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(pm.id)}
                          className="p-2.5 sm:p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                          title="Hapus"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <Icon className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-muted-foreground text-sm">Belum ada metode {config.label.toLowerCase()}</p>
                  <button
                    onClick={openNewForm}
                    className="text-[#D4AF37] text-xs mt-2 hover:underline"
                  >
                    + Tambah Sekarang
                  </button>
                </div>
              )}
            </motion.div>
          );
        })}

        {/* Auto Payment Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass glow-gold rounded-2xl p-3 sm:p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Settings className="w-5 h-5 text-[#D4AF37]" />
                <h3 className="text-foreground font-semibold">Auto Payment</h3>
              </div>
              <p className="text-muted-foreground text-sm">
                Otomatis menyetujui deposit yang masuk
              </p>
            </div>
            <Switch
              checked={autoPayment}
              onCheckedChange={setAutoPayment}
            />
          </div>
          {autoPayment && (
            <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-emerald-400 text-sm font-medium">Auto Payment Aktif</p>
                  <p className="text-emerald-400/70 text-xs">
                    Deposit akan otomatis disetujui tanpa review manual
                  </p>
                </div>
              </div>
            </div>
          )}
          <Button
            onClick={handleSaveSettings}
            disabled={savingSettings}
            className="mt-4 bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold text-sm disabled:opacity-50"
          >
            {savingSettings ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Simpan Pengaturan
          </Button>
        </motion.div>
      </div>

      {/* Add/Edit Form Modal */}
      <AnimatePresence>
        {showForm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setShowForm(false);
                  setEditingId(null);
                }
              }}
            >
              <div className="glass-strong rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-foreground font-bold text-lg">
                    {editingId ? 'Edit Metode Pembayaran' : 'Tambah Metode Pembayaran'}
                  </h2>
                  <button
                    onClick={() => {
                      setShowForm(false);
                      setEditingId(null);
                    }}
                    className="p-2 rounded-xl hover:bg-white/5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Type */}
                  <div className="space-y-2">
                    <Label className="text-foreground text-sm font-medium">Tipe Pembayaran</Label>
                    <div className="flex gap-2">
                      {Object.entries(typeConfig).map(([key, config]) => {
                        const Icon = config.icon;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setForm((prev) => ({ ...prev, type: key }))}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${
                              form.type === key
                                ? 'bg-gold-gradient text-[#070B14] glow-gold'
                                : 'glass text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                            {config.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Name */}
                  <div className="space-y-2">
                    <Label className="text-foreground text-sm font-medium">Nama Metode</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder={form.type === 'qris' ? 'Contoh: QRIS Universal' : 'Contoh: USDT (BEP20)'}
                      className="h-11 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50"
                    />
                  </div>

                  {/* Account Number / Wallet Address */}
                  {form.type !== 'qris' && (
                    <div className="space-y-2">
                      <Label className="text-foreground text-sm font-medium">
                        {form.type === 'usdt' ? 'Wallet Address (BEP20)' : 'Account Number / Phone'}
                      </Label>
                      <Input
                        value={form.accountNo}
                        onChange={(e) => setForm((prev) => ({ ...prev, accountNo: e.target.value }))}
                        placeholder={form.type === 'usdt' ? 'e.g. TCyberFCb...bep20address' : 'e.g. 081234567890'}
                        className="h-11 bg-input/50 border-border/50 rounded-xl text-foreground font-mono placeholder:text-muted-foreground/50"
                      />
                    </div>
                  )}

                  {/* Holder Name */}
                  {form.type !== 'qris' && (
                    <div className="space-y-2">
                      <Label className="text-foreground text-sm font-medium">Atas Nama</Label>
                      <Input
                        value={form.holderName}
                        onChange={(e) => setForm((prev) => ({ ...prev, holderName: e.target.value }))}
                        placeholder="Contoh: PT NEXVO Indonesia"
                        className="h-11 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50"
                      />
                    </div>
                  )}

                  {/* Color */}
                  <div className="space-y-2">
                    <Label className="text-foreground text-sm font-medium">Warna Brand (Hex)</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        value={form.color}
                        onChange={(e) => setForm((prev) => ({ ...prev, color: e.target.value }))}
                        placeholder="#0066AF"
                        className="flex-1 h-11 bg-input/50 border-border/50 rounded-xl text-foreground font-mono placeholder:text-muted-foreground/50"
                      />
                      {form.color && (
                        <div
                          className="w-11 h-11 rounded-xl shrink-0 border border-border/30"
                          style={{ backgroundColor: form.color }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Icon Upload */}
                  <div className="space-y-2">
                    <Label className="text-foreground text-sm font-medium">Icon / Logo</Label>
                    <input
                      ref={iconInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file, 'iconUrl');
                        // Reset input so the same file can be selected again
                        e.target.value = '';
                      }}
                    />
                    {form.iconUrl ? (
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-white/5 p-2 flex items-center justify-center">
                          <img src={getFileUrl(form.iconUrl)} alt="Icon" className="w-full h-full object-contain" />
                        </div>
                        <div className="flex-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => iconInputRef.current?.click()}
                            className="rounded-xl border-[#D4AF37]/30 text-[#D4AF37] hover:bg-[#D4AF37]/5 text-xs"
                            disabled={uploading && uploadField === 'iconUrl'}
                          >
                            {uploading && uploadField === 'iconUrl' ? (
                              <Loader2 className="w-3 h-3 animate-spin mr-1" />
                            ) : (
                              <Upload className="w-3 h-3 mr-1" />
                            )}
                            Ganti Icon
                          </Button>
                          <button
                            type="button"
                            onClick={() => setForm((prev) => ({ ...prev, iconUrl: '' }))}
                            className="ml-2 text-xs text-red-400 hover:text-red-300"
                          >
                            Hapus
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => iconInputRef.current?.click()}
                        className="w-full glass rounded-xl p-4 flex flex-col items-center gap-2 hover:glow-gold transition-all"
                        disabled={uploading && uploadField === 'iconUrl'}
                      >
                        {uploading && uploadField === 'iconUrl' ? (
                          <Loader2 className="w-6 h-6 text-[#D4AF37] animate-spin" />
                        ) : (
                          <ImageIcon className="w-6 h-6 text-[#D4AF37]" />
                        )}
                        <p className="text-muted-foreground text-xs">Upload Icon / Logo</p>
                      </button>
                    )}
                  </div>

                  {/* QR Image (for QRIS) */}
                  {form.type === 'qris' && (
                    <div className="space-y-2">
                      <Label className="text-foreground text-sm font-medium">Gambar QR Code</Label>
                      <input
                        ref={qrInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(file, 'qrImage');
                          // Reset input so the same file can be selected again
                          e.target.value = '';
                        }}
                      />
                      {form.qrImage ? (
                        <div className="space-y-2">
                          <div className="rounded-xl bg-white/5 p-3 flex justify-center max-w-xs mx-auto">
                            <img src={getFileUrl(form.qrImage)} alt="QR Code" className="max-w-full max-h-48 object-contain" />
                          </div>
                          <div className="flex items-center gap-2 justify-center">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => qrInputRef.current?.click()}
                              className="rounded-xl border-[#D4AF37]/30 text-[#D4AF37] hover:bg-[#D4AF37]/5 text-xs"
                              disabled={uploading && uploadField === 'qrImage'}
                            >
                              {uploading && uploadField === 'qrImage' ? (
                                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                              ) : (
                                <Upload className="w-3 h-3 mr-1" />
                              )}
                              Ganti QR
                            </Button>
                            <button
                              type="button"
                              onClick={() => setForm((prev) => ({ ...prev, qrImage: '' }))}
                              className="text-xs text-red-400 hover:text-red-300"
                            >
                              Hapus
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => qrInputRef.current?.click()}
                          className="w-full"
                          disabled={uploading && uploadField === 'qrImage'}
                        >
                          <div className="glass rounded-2xl border-2 border-dashed border-[#D4AF37]/20 p-6 text-center hover:border-[#D4AF37]/40 transition-colors">
                            {uploading && uploadField === 'qrImage' ? (
                              <Loader2 className="w-8 h-8 text-[#D4AF37] mx-auto animate-spin" />
                            ) : (
                              <>
                                <QrCode className="w-8 h-8 text-[#D4AF37] mx-auto mb-2" />
                                <p className="text-foreground font-medium text-sm">Upload Gambar QR Code</p>
                                <p className="text-muted-foreground text-xs">Klik untuk memilih file</p>
                              </>
                            )}
                          </div>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Order */}
                  <div className="space-y-2">
                    <Label className="text-foreground text-sm font-medium">Urutan Tampil</Label>
                    <Input
                      type="number"
                      value={form.order}
                      onChange={(e) => setForm((prev) => ({ ...prev, order: parseInt(e.target.value) || 0 }))}
                      placeholder="0"
                      className="h-11 bg-input/50 border-border/50 rounded-xl text-foreground font-mono placeholder:text-muted-foreground/50"
                    />
                    <p className="text-muted-foreground text-[10px]">Angka lebih kecil ditampilkan lebih dulu</p>
                  </div>

                  {/* Active Toggle */}
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <Label className="text-foreground text-sm font-medium">Status Aktif</Label>
                      <p className="text-muted-foreground text-xs">Metode ini akan ditampilkan ke pengguna</p>
                    </div>
                    <Switch
                      checked={form.isActive}
                      onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked }))}
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border/30">
                  <Button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setEditingId(null);
                    }}
                    variant="ghost"
                    className="flex-1 rounded-xl text-muted-foreground hover:text-foreground"
                  >
                    Batal
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !form.name.trim()}
                    className="flex-1 bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    {editingId ? 'Simpan Perubahan' : 'Tambah Metode'}
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              onClick={() => setDeleteConfirm(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="glass-strong rounded-2xl p-6 w-full max-w-sm">
                <div className="text-center">
                  <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle className="w-7 h-7 text-red-400" />
                  </div>
                  <h3 className="text-foreground font-semibold text-lg mb-2">Hapus Metode?</h3>
                  <p className="text-muted-foreground text-sm mb-6">
                    Metode pembayaran ini akan dinonaktifkan. Tindakan ini bisa dibatalkan nanti.
                  </p>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      onClick={() => setDeleteConfirm(null)}
                      variant="ghost"
                      className="flex-1 rounded-xl text-muted-foreground hover:text-foreground"
                    >
                      Batal
                    </Button>
                    <Button
                      type="button"
                      onClick={() => handleDelete(deleteConfirm)}
                      className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Hapus
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

