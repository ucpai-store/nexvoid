'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Package, Plus, Pencil, Trash2, Loader2, AlertTriangle, Ban, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { formatRupiah } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

interface InvestmentPackage {
  id: string; name: string; amount: number; profitRate: number; contractDays: number;
  isActive: boolean; order: number; dailyProfit: number; totalProfit: number;
}

interface PackageForm {
  name: string; amount: string; profitRate: string; contractDays: string; order: string; isActive: boolean;
}

const emptyForm: PackageForm = { name: '', amount: '', profitRate: '10', contractDays: '90', order: '0', isActive: true };

export default function AdminPackagesPage() {
  const [packages, setPackages] = useState<InvestmentPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<PackageForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState<string>('');
  const [deleting, setDeleting] = useState(false);
  const { adminToken } = useAuthStore();
  const { toast } = useToast();

  const fetchPackages = async () => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/packages', { headers: { Authorization: `Bearer ${adminToken}` } });
      const data = await res.json();
      if (data.success) setPackages(data.data);
    } catch {
      toast({ title: 'Error', description: 'Gagal memuat data', variant: 'destructive' });
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchPackages(); }, [adminToken]);

  // Auto-calculate daily profit
  const calcDailyProfit = (amount: string, rate: string) => {
    const a = parseFloat(amount) || 0;
    const r = parseFloat(rate) || 0;
    return a > 0 && r > 0 ? Math.floor(a * (r / 100)) : 0;
  };

  const handleSave = async () => {
    if (!form.name || !form.amount) {
      toast({ title: 'Lengkapi semua field wajib', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const body = {
        ...(editId ? { id: editId } : {}),
        name: form.name,
        amount: parseFloat(form.amount),
        profitRate: parseFloat(form.profitRate) || 10,
        contractDays: parseInt(form.contractDays) || 90,
        order: parseInt(form.order) || 0,
        isActive: form.isActive,
      };
      const res = await fetch('/api/admin/packages', {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: editId ? 'Paket diperbarui' : 'Paket ditambahkan' });
        setFormOpen(false);
        setEditId(null);
        setForm(emptyForm);
        fetchPackages();
      } else {
        toast({ title: 'Gagal menyimpan', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Kesalahan Jaringan', variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleDelete = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!deleteId || !adminToken) return;
    setDeleting(true);
    try {
      const currentDeleteId = deleteId;
      const currentDeleteName = deleteName;
      const res = await fetch('/api/admin/packages', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id: currentDeleteId }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Paket dihapus', description: `${currentDeleteName} berhasil dihapus beserta data terkait` });
        setPackages((prev) => prev.filter((p) => p.id !== currentDeleteId));
        setDeleteId(null);
        setDeleteName('');
      } else {
        toast({ title: 'Gagal menghapus', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Kesalahan Jaringan', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleActive = async (pkg: InvestmentPackage) => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/packages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id: pkg.id, isActive: !pkg.isActive }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: pkg.isActive ? 'Paket dinonaktifkan' : 'Paket diaktifkan' });
        setPackages((prev) => prev.map((p) => p.id === pkg.id ? { ...p, isActive: !p.isActive } : p));
      } else {
        toast({ title: 'Gagal', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Kesalahan Jaringan', variant: 'destructive' });
    }
  };

  const openEdit = (pkg: InvestmentPackage) => {
    setEditId(pkg.id);
    setForm({ name: pkg.name, amount: pkg.amount.toString(), profitRate: pkg.profitRate.toString(), contractDays: pkg.contractDays.toString(), order: pkg.order.toString(), isActive: pkg.isActive });
    setFormOpen(true);
  };

  const openAdd = () => { setEditId(null); setForm(emptyForm); setFormOpen(true); };

  const confirmDelete = (pkg: InvestmentPackage) => {
    setDeleteId(pkg.id);
    setDeleteName(pkg.name);
  };

  const dailyProfit = calcDailyProfit(form.amount, form.profitRate);
  const totalProfit = dailyProfit * (parseInt(form.contractDays) || 90);

  return (
    <div className="p-3 sm:p-5 lg:p-6 pb-4 sm:pb-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gold-gradient">Kelola Paket Investasi</h1>
          <p className="text-muted-foreground text-sm">{packages.length} paket terdaftar</p>
        </div>
        <Button onClick={openAdd} className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold">
          <Plus className="w-4 h-4 mr-2" /> Tambah Paket
        </Button>
      </motion.div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (<Skeleton key={i} className="h-48 rounded-2xl" />))}
        </div>
      ) : packages.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {packages.map((pkg, i) => (
            <motion.div key={pkg.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="glass glow-gold rounded-2xl overflow-hidden group hover:glow-gold-strong transition-all">
              <div className="relative h-20 bg-card-gradient flex items-center justify-center overflow-hidden">
                <Package className="w-10 h-10 text-[#D4AF37]/30" />
                <div className="absolute top-2 right-2">
                  <Badge className={`text-[10px] border-0 ${pkg.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                    {pkg.isActive ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                </div>
              </div>
              <div className="p-4">
                <h3 className="text-foreground font-semibold text-sm mb-1 line-clamp-1">{pkg.name}</h3>
                <p className="text-gold-gradient font-bold text-lg mb-2">{formatRupiah(pkg.amount)}</p>
                <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                  <div className="text-center">
                    <p className="text-emerald-400 font-medium">{pkg.profitRate}%</p>
                    <p className="text-muted-foreground">Profit/Hari</p>
                  </div>
                  <div className="text-center">
                    <p className="text-foreground font-medium">{pkg.contractDays}h</p>
                    <p className="text-muted-foreground">Durasi</p>
                  </div>
                  <div className="text-center">
                    <p className="text-foreground font-medium">{formatRupiah(pkg.dailyProfit)}</p>
                    <p className="text-muted-foreground">Harian</p>
                  </div>
                </div>
                <div className="glass rounded-xl p-2 mb-3 text-center">
                  <p className="text-muted-foreground text-[10px] mb-0.5">Total Profit</p>
                  <p className="text-emerald-400 font-bold text-sm">{formatRupiah(pkg.totalProfit)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(pkg)}
                    className="flex-1 rounded-xl border-[#D4AF37]/20 text-foreground hover:bg-white/5 h-9 sm:h-8 text-xs">
                    <Pencil className="w-3 h-3 mr-1" /> Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleToggleActive(pkg)}
                    className={`rounded-xl h-9 sm:h-8 text-xs px-2 ${pkg.isActive ? 'border-orange-500/20 text-orange-400 hover:bg-orange-500/10' : 'border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10'}`}
                    title={pkg.isActive ? 'Nonaktifkan' : 'Aktifkan'}>
                    {pkg.isActive ? <Ban className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => confirmDelete(pkg)}
                    className="rounded-xl border-red-500/20 text-red-400 hover:bg-red-500/10 h-9 sm:h-8 text-xs px-3">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="glass rounded-2xl p-8 text-center">
          <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-foreground font-semibold mb-2">Belum Ada Paket</h3>
          <p className="text-muted-foreground text-sm mb-4">Klik tombol di atas untuk menambah paket investasi baru</p>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="glass-strong border-[#D4AF37]/20 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-gold-gradient">{editId ? 'Edit Paket Investasi' : 'Tambah Paket Investasi Baru'}</DialogTitle>
            <DialogDescription className="text-muted-foreground">{editId ? 'Perbarui informasi paket' : 'Isi detail paket baru'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-muted-foreground text-xs">Nama Paket *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Contoh: Paket Emas Premium" className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground mt-1" />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Jumlah Investasi / Rp *</Label>
              <Input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="1000000" className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-muted-foreground text-xs">Profit Rate / % *</Label>
                <Input type="number" step="0.1" value={form.profitRate} onChange={(e) => setForm((f) => ({ ...f, profitRate: e.target.value }))}
                  placeholder="10" className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground mt-1" />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Durasi Kontrak / Hari</Label>
                <Input type="number" value={form.contractDays} onChange={(e) => setForm((f) => ({ ...f, contractDays: e.target.value }))}
                  placeholder="90" className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground mt-1" />
              </div>
            </div>
            {/* Auto-calculated profit preview */}
            {dailyProfit > 0 && (
              <div className="glass rounded-xl p-3 space-y-1">
                <p className="text-muted-foreground text-[10px]">Kalkulasi Otomatis</p>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Profit Harian:</span>
                  <span className="text-emerald-400 font-bold">{formatRupiah(dailyProfit)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Total Profit ({form.contractDays || 90} hari):</span>
                  <span className="text-emerald-400 font-bold">{formatRupiah(totalProfit)}</span>
                </div>
              </div>
            )}
            <div>
              <Label className="text-muted-foreground text-xs">Urutan / Order</Label>
              <Input type="number" value={form.order} onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))}
                placeholder="0" className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground mt-1" />
            </div>
            <div className="flex items-center justify-between glass rounded-xl p-3">
              <Label className="text-foreground text-sm">Paket Aktif</Label>
              <Switch checked={form.isActive} onCheckedChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving} className="rounded-xl border-[#D4AF37]/20 text-foreground">Batal</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editId ? 'Simpan' : 'Tambah'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => { setDeleteId(null); setDeleteName(''); }}>
        <AlertDialogContent className="glass-strong border-[#D4AF37]/20">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" /> Hapus Paket Investasi
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Apakah Anda yakin ingin menghapus <strong className="text-foreground">{deleteName}</strong>? 
              Semua investasi terkait juga akan dihapus. Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl border-[#D4AF37]/20 text-foreground" disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}
              className="rounded-xl bg-red-600 hover:bg-red-700 text-white" forceMount>
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
