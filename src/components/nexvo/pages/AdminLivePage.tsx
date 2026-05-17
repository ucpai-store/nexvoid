'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Radio, Plus, Trash2, Loader2, Zap, ArrowDown,
  ArrowUp, ShoppingBag, RefreshCw, Eye, Send
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { formatRupiah, maskWhatsApp, timeAgo } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

/* ───────── Types ───────── */
interface Activity {
  id: string;
  type: string;
  userName: string;
  amount: number;
  productName: string | null;
  isFake: boolean;
  createdAt: string;
}

/* ───────── Random Data ───────── */
const randomNames = [
  'Ahmad Rizki', 'Siti Nurhaliza', 'Budi Santoso', 'Dewi Lestari',
  'Rina Wati', 'Hendra Pratama', 'Maya Sari', 'Dian Permata',
  'Rudi Hartono', 'Ani Yulianti', 'Tono Sugiarto', 'Lina Marlina',
  'Eko Prasetyo', 'Fitri Handayani', 'Joko Widodo', 'Ratna Dewi',
];

const randomProducts = [
  'Paket Emas', 'Paket Perak', 'Paket Berlian', 'Paket Platinum',
  'Paket Premium', 'Paket Starter', 'Paket Pro', 'Paket VIP',
];

const randomAmounts = [50000, 100000, 150000, 200000, 250000, 500000, 750000, 1000000, 2000000];

/* ═══════════════════════════════════════════
   ADMIN LIVE PAGE
   ═══════════════════════════════════════════ */
export default function AdminLivePage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [formData, setFormData] = useState({
    type: 'deposit',
    userName: '',
    amount: '',
    productName: '',
  });
  const { adminToken } = useAuthStore();
  const { toast } = useToast();

  const fetchActivities = useCallback(() => {
    if (!adminToken) return;
    fetch('/api/admin/live', { headers: { Authorization: `Bearer ${adminToken}` } })
      .then((r) => r.json())
      .then((res) => res.success && setActivities(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [adminToken]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  const handleCreate = async () => {
    if (!formData.userName || !formData.amount) {
      toast({ title: 'Lengkapi semua field', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        type: formData.type,
        userName: formData.userName,
        amount: parseFloat(formData.amount),
        isFake: true,
      };
      if (formData.type === 'purchase' && formData.productName) {
        body.productName = formData.productName;
      }
      const res = await fetch('/api/admin/live', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Aktivitas ditambahkan' });
        setFormOpen(false);
        setFormData({ type: 'deposit', userName: '', amount: '', productName: '' });
        fetchActivities();
      } else {
        toast({ title: 'Gagal', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Kesalahan Jaringan', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleAutoGenerate = async () => {
    setAutoGenerating(true);
    try {
      const type = ['deposit', 'withdraw', 'purchase'][Math.floor(Math.random() * 3)];
      const body: Record<string, unknown> = {
        type,
        userName: randomNames[Math.floor(Math.random() * randomNames.length)],
        amount: randomAmounts[Math.floor(Math.random() * randomAmounts.length)],
        isFake: true,
      };
      if (type === 'purchase') {
        body.productName = randomProducts[Math.floor(Math.random() * randomProducts.length)];
      }
      const res = await fetch('/api/admin/live', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        fetchActivities();
        toast({ title: 'Aktivitas acak ditambahkan' });
      }
    } catch {
      toast({ title: 'Gagal generate aktivitas', variant: 'destructive' });
    } finally {
      setAutoGenerating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/live', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.success) {
        setActivities((prev) => prev.filter((a) => a.id !== id));
      }
    } catch {
      toast({ title: 'Gagal menghapus', variant: 'destructive' });
    }
  };

  const getTypeConfig = (type: string) => {
    switch (type) {
      case 'deposit':
        return { icon: ArrowDown, color: 'text-emerald-400', bg: 'bg-emerald-400/10', label: 'Deposit' };
      case 'withdraw':
        return { icon: ArrowUp, color: 'text-blue-400', bg: 'bg-blue-400/10', label: 'Withdraw' };
      case 'purchase':
        return { icon: ShoppingBag, color: 'text-[#D4AF37]', bg: 'bg-[#D4AF37]/10', label: 'Purchase' };
      default:
        return { icon: ArrowDown, color: 'text-emerald-400', bg: 'bg-emerald-400/10', label: type };
    }
  };

  return (
    <div className="p-3 sm:p-5 lg:p-6 pb-4 sm:pb-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6"
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gold-gradient">Aktivitas Live</h1>
          <p className="text-muted-foreground text-sm">{activities.length} aktivitas tercatat</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleAutoGenerate}
            disabled={autoGenerating}
            variant="outline"
            className="rounded-xl border-[#D4AF37]/20 text-[#D4AF37] hover:bg-[#D4AF37]/10"
          >
            {autoGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Zap className="w-4 h-4 mr-2" />
            )}
            Generate Acak
          </Button>
          <Button
            onClick={() => setFormOpen(true)}
            className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold"
          >
            <Plus className="w-4 h-4 mr-2" />
            Tambah Manual
          </Button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activities List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 glass rounded-2xl p-3 sm:p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Radio className="w-5 h-5 text-[#D4AF37]" />
              <h3 className="text-foreground font-semibold">Daftar Aktivitas</h3>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={fetchActivities}
              className="rounded-xl border-[#D4AF37]/20 text-foreground hover:bg-white/5 h-9 sm:h-8 text-xs"
            >
              <RefreshCw className="w-3 h-3 mr-1" /> Refresh
            </Button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          ) : activities.length > 0 ? (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              <AnimatePresence>
                {activities.map((activity) => {
                  const config = getTypeConfig(activity.type);
                  return (
                    <motion.div
                      key={activity.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="flex items-center gap-3 glass rounded-xl p-3 group"
                    >
                      <div className={`w-9 h-9 rounded-lg ${config.bg} flex items-center justify-center shrink-0`}>
                        <config.icon className={`w-4 h-4 ${config.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-foreground text-sm font-medium truncate">
                            {maskWhatsApp(activity.userName)}
                          </span>
                          <Badge className={`${config.bg} ${config.color} border-0 text-[9px] h-4 px-1.5`}>
                            {config.label}
                          </Badge>
                          {activity.isFake && (
                            <Badge className="bg-purple-500/10 text-purple-400 border-0 text-[9px] h-4 px-1.5">
                              Fake
                            </Badge>
                          )}
                        </div>
                        {activity.productName && (
                          <p className="text-muted-foreground text-xs truncate">{activity.productName}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-semibold ${config.color}`}>{formatRupiah(activity.amount)}</p>
                        <p className="text-muted-foreground text-[10px]">{timeAgo(new Date(activity.createdAt))}</p>
                      </div>
                      <button
                        onClick={() => handleDelete(activity.id)}
                        className="w-9 h-9 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center hover:bg-red-500/10 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all shrink-0"
                        title="Hapus"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          ) : (
            <div className="text-center py-8">
              <Radio className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">Belum ada aktivitas</p>
            </div>
          )}
        </motion.div>

        {/* Live Preview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass glow-gold rounded-2xl p-3 sm:p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Eye className="w-5 h-5 text-[#D4AF37]" />
            <h3 className="text-foreground font-semibold">Preview Homepage</h3>
          </div>

          {/* Simulated Preview */}
          <div className="glass rounded-xl p-3 border border-[#D4AF37]/10">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-muted-foreground">Aktivitas Terkini</span>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {activities.slice(0, 6).map((activity) => {
                const config = getTypeConfig(activity.type);
                return (
                  <div key={activity.id} className="flex items-center gap-2 text-xs">
                    <div className={`w-6 h-6 rounded ${config.bg} flex items-center justify-center shrink-0`}>
                      <config.icon className={`w-3 h-3 ${config.color}`} />
                    </div>
                    <span className="text-foreground/70 truncate">{maskWhatsApp(activity.userName)}</span>
                    <span className={`ml-auto font-medium ${config.color}`}>
                      {formatRupiah(activity.amount)}
                    </span>
                  </div>
                );
              })}
              {activities.length === 0 && (
                <p className="text-muted-foreground text-xs text-center py-4">Belum ada aktivitas</p>
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <Separator className="bg-[#D4AF37]/10 my-4" />
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-emerald-400 font-semibold text-sm">
                {activities.filter((a) => a.type === 'deposit').length}
              </p>
              <p className="text-muted-foreground text-[10px]">Deposit</p>
            </div>
            <div>
              <p className="text-blue-400 font-semibold text-sm">
                {activities.filter((a) => a.type === 'withdraw').length}
              </p>
              <p className="text-muted-foreground text-[10px]">Withdraw</p>
            </div>
            <div>
              <p className="text-[#D4AF37] font-semibold text-sm">
                {activities.filter((a) => a.type === 'purchase').length}
              </p>
              <p className="text-muted-foreground text-[10px]">Purchase</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Add Activity Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="glass-strong border-[#D4AF37]/20 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-gold-gradient">Tambah Aktivitas</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Buat aktivitas baru untuk ditampilkan di homepage
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Type */}
            <div>
              <Label className="text-muted-foreground text-xs mb-2 block">Tipe Aktivitas</Label>
              <Select
                value={formData.type}
                onValueChange={(val) => setFormData((f) => ({ ...f, type: val }))}
              >
                <SelectTrigger className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="glass-strong border-[#D4AF37]/20">
                  <SelectItem value="deposit">
                    <div className="flex items-center gap-2">
                      <ArrowDown className="w-3.5 h-3.5 text-emerald-400" />
                      Deposit
                    </div>
                  </SelectItem>
                  <SelectItem value="withdraw">
                    <div className="flex items-center gap-2">
                      <ArrowUp className="w-3.5 h-3.5 text-blue-400" />
                      Withdraw
                    </div>
                  </SelectItem>
                  <SelectItem value="purchase">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-3.5 h-3.5 text-[#D4AF37]" />
                      Purchase
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* User Name */}
            <div>
              <Label className="text-muted-foreground text-xs mb-2 block">Nama User</Label>
              <Input
                value={formData.userName}
                onChange={(e) => setFormData((f) => ({ ...f, userName: e.target.value }))}
                placeholder="Contoh: Ahmad Rizki"
                className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground"
              />
            </div>

            {/* Amount */}
            <div>
              <Label className="text-muted-foreground text-xs mb-2 block">Jumlah (Rp)</Label>
              <Input
                type="number"
                value={formData.amount}
                onChange={(e) => setFormData((f) => ({ ...f, amount: e.target.value }))}
                placeholder="500000"
                className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground"
              />
              {formData.amount && parseFloat(formData.amount) > 0 && (
                <p className="text-foreground text-xs mt-1">= {formatRupiah(parseFloat(formData.amount))}</p>
              )}
            </div>

            {/* Product Name (for purchase) */}
            {formData.type === 'purchase' && (
              <div>
                <Label className="text-muted-foreground text-xs mb-2 block">Nama Produk</Label>
                <Input
                  value={formData.productName}
                  onChange={(e) => setFormData((f) => ({ ...f, productName: e.target.value }))}
                  placeholder="Contoh: Paket Emas Premium"
                  className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground"
                />
              </div>
            )}

            {/* Quick Fill */}
            <div className="glass rounded-xl p-3">
              <p className="text-muted-foreground text-[10px] mb-2">Isi Cepat:</p>
              <div className="flex flex-wrap gap-1.5">
                {randomNames.slice(0, 5).map((name) => (
                  <button
                    key={name}
                    onClick={() => setFormData((f) => ({ ...f, userName: name }))}
                    className="px-2 py-1 rounded-lg bg-[#D4AF37]/10 text-[#D4AF37] text-[10px] hover:bg-[#D4AF37]/20 transition-colors"
                  >
                    {name.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setFormOpen(false)}
              disabled={saving}
              className="rounded-xl border-[#D4AF37]/20 text-foreground"
            >
              Batal
            </Button>
            <Button
              onClick={handleCreate}
              disabled={saving || !formData.userName || !formData.amount}
              className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Tambah
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
