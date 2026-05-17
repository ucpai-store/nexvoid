'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ShoppingBag, Plus, Pencil, Trash2, Upload, Loader2,
  Image as ImageIcon, X, AlertTriangle, CheckCircle2, Ban, Play
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { formatRupiah } from '@/lib/auth';
import { getFileUrl } from '@/lib/file-url';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

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
  isStopped: boolean;
}

interface ProductForm {
  name: string;
  price: string;
  duration: string;
  estimatedProfit: string;
  quota: string;
  description: string;
  profitRate: string;
  banner: string;
  isActive: boolean;
}

const emptyForm: ProductForm = {
  name: '', price: '', duration: '', estimatedProfit: '',
  quota: '', description: '', profitRate: '', banner: '', isActive: true,
};

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState<string>('');
  const [deleting, setDeleting] = useState(false);
  const { adminToken } = useAuthStore();
  const { toast } = useToast();

  const fetchProducts = async () => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/products', { headers: { Authorization: `Bearer ${adminToken}` } });
      const data = await res.json();
      if (data.success) setProducts(data.data);
    } catch {
      toast({ title: 'Error', description: 'Gagal memuat data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProducts(); }, [adminToken]);

  // Auto-calculate estimatedProfit when price or profitRate changes
  const autoCalcProfit = (price: string, profitRate: string): string => {
    const p = parseFloat(price) || 0;
    const r = parseFloat(profitRate) || 0;
    if (p > 0 && r > 0) return Math.floor(p * (r / 100)).toString();
    return '';
  };

  const handleImageUpload = async (file: File) => {
    if (!adminToken) {
      toast({ title: 'Error', description: 'Sesi telah berakhir, silakan login kembali', variant: 'destructive' });
      return;
    }
    setUploading(true);
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
        setForm((f) => ({ ...f, banner: data.data.url || data.data.filePath }));
        toast({ title: 'Gambar berhasil diupload' });
      } else {
        toast({ title: 'Gagal upload gambar', description: data.error || 'Terjadi kesalahan', variant: 'destructive' });
      }
    } catch (err) {
      console.error('Upload error:', err);
      toast({ title: 'Kesalahan Jaringan', description: 'Gagal mengunggah file, coba lagi', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!adminToken) {
      toast({ title: 'Error', description: 'Sesi telah berakhir, silakan login kembali', variant: 'destructive' });
      return;
    }
    if (!form.name || !form.price || !form.duration || !form.quota) {
      toast({ title: 'Lengkapi semua field wajib', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      // Auto-calculate estimatedProfit from price × profitRate%
      const profitRate = parseFloat(form.profitRate) || 0;
      const price = parseFloat(form.price) || 0;
      const autoProfit = profitRate > 0 ? Math.floor(price * (profitRate / 100)) : 0;

      const body = {
        ...(editId ? { id: editId } : {}),
        name: form.name,
        price,
        duration: parseInt(form.duration),
        estimatedProfit: autoProfit || parseFloat(form.estimatedProfit) || 0,
        quota: parseInt(form.quota),
        description: form.description,
        profitRate,
        banner: form.banner,
        isActive: form.isActive,
      };

      const res = await fetch('/api/admin/products', {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`Save failed with status ${res.status}`);
      }
      const data = await res.json();
      if (data.success) {
        toast({ title: editId ? 'Produk diperbarui' : 'Produk ditambahkan' });
        setFormOpen(false);
        setEditId(null);
        setForm(emptyForm);
        fetchProducts();
      } else {
        toast({ title: 'Gagal menyimpan', description: data.error, variant: 'destructive' });
      }
    } catch (err) {
      console.error('Save error:', err);
      toast({ title: 'Kesalahan Jaringan', description: 'Gagal menyimpan, coba lagi', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!deleteId || !adminToken) return;
    setDeleting(true);
    try {
      const currentDeleteId = deleteId;
      const currentDeleteName = deleteName;
      const res = await fetch('/api/admin/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id: currentDeleteId }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Produk dihapus', description: `${currentDeleteName} berhasil dihapus beserta data terkait` });
        setProducts((prev) => prev.filter((p) => p.id !== currentDeleteId));
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

  const handleToggleStop = async (product: Product) => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id: product.id, isStopped: !product.isStopped }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: product.isStopped ? 'Produk diaktifkan kembali' : 'Produk dihentikan' });
        setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, isStopped: !p.isStopped } : p));
      } else {
        toast({ title: 'Gagal', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Kesalahan Jaringan', variant: 'destructive' });
    }
  };

  const handleToggleActive = async (product: Product) => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id: product.id, isActive: !product.isActive }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: product.isActive ? 'Produk dinonaktifkan' : 'Produk diaktifkan' });
        setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, isActive: !p.isActive } : p));
      } else {
        toast({ title: 'Gagal', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Kesalahan Jaringan', variant: 'destructive' });
    }
  };

  const openEdit = (product: Product) => {
    setEditId(product.id);
    setForm({
      name: product.name,
      price: product.price.toString(),
      duration: product.duration.toString(),
      estimatedProfit: product.estimatedProfit.toString(),
      quota: product.quota.toString(),
      description: product.description,
      profitRate: product.profitRate.toString(),
      banner: product.banner,
      isActive: product.isActive,
    });
    setFormOpen(true);
  };

  const openAdd = () => {
    setEditId(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const confirmDelete = (product: Product) => {
    setDeleteId(product.id);
    setDeleteName(product.name);
  };

  return (
    <div className="p-3 sm:p-5 lg:p-6 pb-4 sm:pb-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gold-gradient">Kelola Produk</h1>
          <p className="text-muted-foreground text-sm">{products.length} produk terdaftar</p>
        </div>
        <Button onClick={openAdd} className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold">
          <Plus className="w-4 h-4 mr-2" /> Tambah Produk
        </Button>
      </motion.div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (<Skeleton key={i} className="h-48 rounded-2xl" />))}
        </div>
      ) : products.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product, i) => (
            <motion.div key={product.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="glass glow-gold rounded-2xl overflow-hidden group hover:glow-gold-strong transition-all">
              <div className="relative h-32 overflow-hidden">
                {product.banner ? (
                  <img src={getFileUrl(product.banner)} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-card-gradient flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-[#D4AF37]/20" />
                  </div>
                )}
                <div className="absolute top-2 right-2 flex gap-1">
                  <Badge className={`text-[10px] border-0 ${product.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                    {product.isActive ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                </div>
                {product.isStopped && (
                  <div className="absolute top-2 left-2">
                    <Badge className="bg-orange-500/20 text-orange-400 border-0 text-[10px]">Dihentikan</Badge>
                  </div>
                )}
              </div>
              <div className="p-4">
                <h3 className="text-foreground font-semibold text-sm mb-1 line-clamp-1">{product.name}</h3>
                <p className="text-gold-gradient font-bold text-lg mb-2">{formatRupiah(product.price)}</p>
                <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                  <div className="text-center">
                    <p className="text-foreground font-medium">{product.duration}h</p>
                    <p className="text-muted-foreground">Durasi</p>
                  </div>
                  <div className="text-center">
                    <p className="text-emerald-400 font-medium">{product.profitRate}%</p>
                    <p className="text-muted-foreground">Profit/Hari</p>
                  </div>
                  <div className="text-center">
                    <p className="text-foreground font-medium">{product.quotaUsed}/{product.quota}</p>
                    <p className="text-muted-foreground">Kuota</p>
                  </div>
                </div>
                {/* Auto-calculated daily profit */}
                {product.profitRate > 0 && (
                  <div className="glass rounded-lg p-2 mb-3 text-center">
                    <p className="text-muted-foreground text-[10px]">Profit Harian</p>
                    <p className="text-emerald-400 font-bold text-sm">{formatRupiah(Math.floor(product.price * product.profitRate / 100))}</p>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(product)}
                    className="flex-1 rounded-xl border-[#D4AF37]/20 text-foreground hover:bg-white/5 h-9 sm:h-8 text-xs">
                    <Pencil className="w-3 h-3 mr-1" /> Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleToggleStop(product)}
                    className={`rounded-xl h-9 sm:h-8 text-xs px-2 ${product.isStopped ? 'border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10' : 'border-orange-500/20 text-orange-400 hover:bg-orange-500/10'}`}
                    title={product.isStopped ? 'Aktifkan' : 'Hentikan'}>
                    {product.isStopped ? <Play className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleToggleActive(product)}
                    className={`rounded-xl h-9 sm:h-8 text-xs px-2 ${product.isActive ? 'border-red-500/20 text-red-400 hover:bg-red-500/10' : 'border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10'}`}
                    title={product.isActive ? 'Nonaktifkan' : 'Aktifkan'}>
                    {product.isActive ? <Ban className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => confirmDelete(product)}
                    className="rounded-xl border-red-500/20 text-red-400 hover:bg-red-500/10 h-9 sm:h-8 text-xs px-2">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="glass rounded-2xl p-8 text-center">
          <ShoppingBag className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-foreground font-semibold mb-2">Belum Ada Produk</h3>
          <p className="text-muted-foreground text-sm mb-4">Klik tombol di atas untuk menambah produk baru</p>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={(open) => {
        setFormOpen(open);
        if (!open) {
          setEditId(null);
          setForm(emptyForm);
        }
      }}>
        <DialogContent className="glass-strong border-[#D4AF37]/20 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-gold-gradient">{editId ? 'Edit Produk' : 'Tambah Produk Baru'}</DialogTitle>
            <DialogDescription className="text-muted-foreground">{editId ? 'Perbarui informasi produk' : 'Isi detail produk baru'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-muted-foreground text-xs">Nama Produk *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Contoh: Paket Emas Premium" className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-muted-foreground text-xs">Harga (Rp) *</Label>
                <Input type="number" value={form.price} onChange={(e) => {
                  const val = e.target.value;
                  setForm((f) => ({ ...f, price: val, estimatedProfit: autoCalcProfit(val, f.profitRate) }));
                }} placeholder="100000" className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground mt-1" />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Durasi (Hari) *</Label>
                <Input type="number" value={form.duration} onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))}
                  placeholder="30" className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-muted-foreground text-xs">Profit Rate (%) *</Label>
                <Input type="number" step="0.1" value={form.profitRate} onChange={(e) => {
                  const val = e.target.value;
                  setForm((f) => ({ ...f, profitRate: val, estimatedProfit: autoCalcProfit(f.price, val) }));
                }} placeholder="10" className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground mt-1" />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Est. Profit Harian (Rp) <span className="text-emerald-400">Auto</span></Label>
                <Input type="number" value={form.estimatedProfit} readOnly
                  className="glass rounded-xl border-[#D4AF37]/20 bg-[#D4AF37]/5 text-emerald-400 mt-1 cursor-not-allowed" />
                <p className="text-muted-foreground text-[10px] mt-1">Harga × Profit% = {form.estimatedProfit ? formatRupiah(parseFloat(form.estimatedProfit)) : '-'}</p>
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Kuota *</Label>
              <Input type="number" value={form.quota} onChange={(e) => setForm((f) => ({ ...f, quota: e.target.value }))}
                placeholder="100" className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground mt-1" />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Deskripsi</Label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Deskripsi produk..." rows={3} className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground mt-1 resize-none" />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Banner Produk</Label>
              <div className="mt-1">
                {form.banner ? (
                  <div className="relative rounded-xl overflow-hidden h-32">
                    <img src={getFileUrl(form.banner)} alt="Banner" className="w-full h-full object-cover" />
                    <button onClick={() => setForm((f) => ({ ...f, banner: '' }))}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-500/80 flex items-center justify-center">
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ) : (
                  <label className="block glass rounded-xl border-2 border-dashed border-[#D4AF37]/20 p-6 text-center cursor-pointer hover:border-[#D4AF37]/40 transition-colors">
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImageUpload(file); e.target.value = ''; }} />
                    {uploading ? <Loader2 className="w-6 h-6 text-[#D4AF37] mx-auto animate-spin" /> : (
                      <><Upload className="w-6 h-6 text-[#D4AF37] mx-auto mb-2" /><p className="text-muted-foreground text-xs">Klik untuk upload gambar</p></>
                    )}
                  </label>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between glass rounded-xl p-3">
              <Label className="text-foreground text-sm">Produk Aktif</Label>
              <Switch checked={form.isActive} onCheckedChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={saving} className="rounded-xl border-[#D4AF37]/20 text-foreground">Batal</Button>
            <Button type="button" onClick={handleSave} disabled={saving} className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editId ? 'Simpan' : 'Tambah'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => { setDeleteId(null); setDeleteName(''); }}>
        <AlertDialogContent className="glass-strong border-[#D4AF37]/20">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" /> Hapus Produk
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Apakah Anda yakin ingin menghapus <strong className="text-foreground">{deleteName}</strong>? 
              Semua data terkait (pembelian & profit log) juga akan dihapus. Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl border-[#D4AF37]/20 text-foreground" disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}
              className="rounded-xl bg-red-600 hover:bg-red-700 text-white">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

