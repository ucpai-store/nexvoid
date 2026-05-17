'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Image as ImageIcon, Plus, Pencil, Trash2, Upload, Loader2,
  X, Eye, ToggleLeft, ToggleRight
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
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
import { getFileUrl } from '@/lib/file-url';

/* ───────── Types ───────── */
interface Banner {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  ctaText: string;
  ctaLink: string;
  image: string;
  order: number;
  isActive: boolean;
}

interface BannerForm {
  title: string;
  subtitle: string;
  description: string;
  ctaText: string;
  ctaLink: string;
  image: string;
  order: string;
  isActive: boolean;
}

const emptyForm: BannerForm = {
  title: '',
  subtitle: '',
  description: '',
  ctaText: '',
  ctaLink: '',
  image: '',
  order: '0',
  isActive: true,
};

/* ═══════════════════════════════════════════
   ADMIN BANNERS PAGE
   ═══════════════════════════════════════════ */
export default function AdminBannersPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<BannerForm>(emptyForm);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [previewBanner, setPreviewBanner] = useState<Banner | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { adminToken } = useAuthStore();
  const { toast } = useToast();

  const fetchBanners = useCallback(() => {
    if (!adminToken) return;
    fetch('/api/admin/banners', { headers: { Authorization: `Bearer ${adminToken}` } })
      .then((r) => r.json())
      .then((res) => res.success && setBanners(res.data))
      .catch(() => { toast({ title: 'Error', description: 'Gagal memuat data', variant: 'destructive' }); })
      .finally(() => setLoading(false));
   
  }, [adminToken]);

  useEffect(() => {
    fetchBanners();
  }, [fetchBanners]);

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setForm((f) => ({ ...f, image: data.data.url || data.data.filePath }));
        toast({ title: 'Gambar berhasil diupload' });
      } else {
        toast({ title: 'Gagal upload gambar', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Kesalahan Jaringan', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.title) {
      toast({ title: 'Judul banner wajib diisi', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const body = {
        ...(editId ? { id: editId } : {}),
        title: form.title,
        subtitle: form.subtitle,
        description: form.description,
        ctaText: form.ctaText,
        ctaLink: form.ctaLink,
        image: form.image,
        order: parseInt(form.order) || 0,
        isActive: form.isActive,
      };

      const res = await fetch('/api/admin/banners', {
        method: editId ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: editId ? 'Banner diperbarui' : 'Banner ditambahkan' });
        setFormOpen(false);
        setEditId(null);
        setForm(emptyForm);
        fetchBanners();
      } else {
        toast({ title: 'Gagal menyimpan', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Kesalahan Jaringan', variant: 'destructive' });
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
      const res = await fetch(`/api/admin/banners?id=${currentDeleteId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Banner dihapus' });
        setBanners((prev) => prev.filter((b) => b.id !== currentDeleteId));
        setDeleteId(null);
      } else {
        toast({ title: 'Gagal menghapus', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Kesalahan Jaringan', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleActive = async (banner: Banner) => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/banners', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ id: banner.id, isActive: !banner.isActive }),
      });
      const data = await res.json();
      if (data.success) {
        setBanners((prev) =>
          prev.map((b) => (b.id === banner.id ? { ...b, isActive: !b.isActive } : b))
        );
        toast({ title: `Banner ${banner.isActive ? 'dinonaktifkan' : 'diaktifkan'}` });
      }
    } catch {
      toast({ title: 'Gagal mengubah status', variant: 'destructive' });
    }
  };

  const openEdit = (banner: Banner) => {
    setEditId(banner.id);
    setForm({
      title: banner.title,
      subtitle: banner.subtitle,
      description: banner.description,
      ctaText: banner.ctaText,
      ctaLink: banner.ctaLink,
      image: banner.image,
      order: banner.order.toString(),
      isActive: banner.isActive,
    });
    setFormOpen(true);
  };

  const openAdd = () => {
    setEditId(null);
    setForm({ ...emptyForm, order: banners.length.toString() });
    setFormOpen(true);
  };

  const sortedBanners = [...banners].sort((a, b) => a.order - b.order);

  return (
    <div className="p-3 sm:p-5 lg:p-6 pb-4 sm:pb-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6"
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gold-gradient">Kelola Banner</h1>
          <p className="text-muted-foreground text-sm">{banners.length} banner terdaftar</p>
        </div>
        <Button
          onClick={openAdd}
          className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold"
        >
          <Plus className="w-4 h-4 mr-2" />
          Tambah Banner
        </Button>
      </motion.div>

      {/* Banners List */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : sortedBanners.length > 0 ? (
        <div className="space-y-4">
          {sortedBanners.map((banner, i) => (
            <motion.div
              key={banner.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`glass rounded-2xl overflow-hidden group transition-all ${
                banner.isActive ? 'glow-gold' : 'opacity-60'
              }`}
            >
              <div className="flex flex-col sm:flex-row">
                {/* Banner Image */}
                <div className="relative w-full sm:w-48 h-32 sm:h-auto shrink-0">
                  {banner.image ? (
                    <img src={getFileUrl(banner.image)} alt={banner.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-card-gradient flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-[#D4AF37]/20" />
                    </div>
                  )}
                  {/* Order Badge */}
                  <div className="absolute top-2 left-2">
                    <Badge className="bg-black/50 text-white border-0 text-[10px] backdrop-blur-sm">
                      #{banner.order}
                    </Badge>
                  </div>
                </div>

                {/* Banner Info */}
                <div className="flex-1 p-4 sm:p-5">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-foreground font-semibold text-base truncate">{banner.title}</h3>
                      <p className="text-[#D4AF37] text-sm">{banner.subtitle}</p>
                    </div>
                    <Badge className={`text-[10px] border-0 ml-2 shrink-0 ${
                      banner.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                    }`}>
                      {banner.isActive ? 'Aktif' : 'Nonaktif'}
                    </Badge>
                  </div>

                  {banner.description && (
                    <p className="text-muted-foreground text-xs mb-2 line-clamp-2">{banner.description}</p>
                  )}

                  {banner.ctaText && (
                    <div className="text-xs text-muted-foreground mb-3">
                      CTA: <span className="text-foreground font-medium">{banner.ctaText}</span>
                      {banner.ctaLink && <span className="ml-1">→ {banner.ctaLink}</span>}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPreviewBanner(banner)}
                      className="rounded-xl border-[#D4AF37]/20 text-foreground hover:bg-white/5 h-9 sm:h-8 text-xs"
                    >
                      <Eye className="w-3 h-3 mr-1" /> Preview
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(banner)}
                      className="rounded-xl border-[#D4AF37]/20 text-foreground hover:bg-white/5 h-9 sm:h-8 text-xs"
                    >
                      <Pencil className="w-3 h-3 mr-1" /> Edit
                    </Button>
                    <button
                      onClick={() => handleToggleActive(banner)}
                      className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center hover:bg-white/5 transition-colors"
                      title={banner.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    >
                      {banner.isActive ? (
                        <ToggleRight className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <ToggleLeft className="w-5 h-5 text-red-400" />
                      )}
                    </button>
                    <button
                      onClick={() => setDeleteId(banner.id)}
                      className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center hover:bg-red-500/10 transition-colors"
                      title="Hapus"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="glass rounded-2xl p-8 text-center">
          <ImageIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-foreground font-semibold mb-2">Belum Ada Banner</h3>
          <p className="text-muted-foreground text-sm mb-4">Klik tombol di atas untuk menambah banner baru</p>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="glass-strong border-[#D4AF37]/20 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-gold-gradient">
              {editId ? 'Edit Banner' : 'Tambah Banner Baru'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {editId ? 'Perbarui informasi banner' : 'Isi detail banner baru'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-muted-foreground text-xs">Judul *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Judul banner"
                className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground mt-1"
              />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Subtitle</Label>
              <Input
                value={form.subtitle}
                onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
                placeholder="Subtitle banner"
                className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground mt-1"
              />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Deskripsi</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Deskripsi banner..."
                rows={3}
                className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground mt-1 resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-muted-foreground text-xs">Tombol CTA</Label>
                <Input
                  value={form.ctaText}
                  onChange={(e) => setForm((f) => ({ ...f, ctaText: e.target.value }))}
                  placeholder="Mulai Sekarang"
                  className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground mt-1"
                />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Link CTA</Label>
                <Input
                  value={form.ctaLink}
                  onChange={(e) => setForm((f) => ({ ...f, ctaLink: e.target.value }))}
                  placeholder="/products"
                  className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground mt-1"
                />
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Urutan</Label>
              <Input
                type="number"
                value={form.order}
                onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))}
                placeholder="0"
                className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground mt-1"
              />
            </div>

            {/* Image Upload */}
            <div>
              <Label className="text-muted-foreground text-xs">Gambar Banner</Label>
              <div className="mt-1">
                {form.image ? (
                  <div className="relative rounded-xl overflow-hidden h-32">
                    <img src={getFileUrl(form.image)} alt="Banner preview" className="w-full h-full object-cover" />
                    <button
                      onClick={() => setForm((f) => ({ ...f, image: '' }))}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-500/80 flex items-center justify-center"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ) : (
                  <label className="block glass rounded-xl border-2 border-dashed border-[#D4AF37]/20 p-6 text-center cursor-pointer hover:border-[#D4AF37]/40 transition-colors">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file);
                      }}
                    />
                    {uploading ? (
                      <Loader2 className="w-6 h-6 text-[#D4AF37] mx-auto animate-spin" />
                    ) : (
                      <>
                        <Upload className="w-6 h-6 text-[#D4AF37] mx-auto mb-2" />
                        <p className="text-muted-foreground text-xs">Klik untuk upload gambar</p>
                      </>
                    )}
                  </label>
                )}
              </div>
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between glass rounded-xl p-3">
              <Label className="text-foreground text-sm">Banner Aktif</Label>
              <Switch
                checked={form.isActive}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))}
              />
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
              onClick={handleSave}
              disabled={saving}
              className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editId ? 'Simpan' : 'Tambah'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewBanner} onOpenChange={() => setPreviewBanner(null)}>
        <DialogContent className="glass-strong border-[#D4AF37]/20 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-gold-gradient">Preview Banner</DialogTitle>
          </DialogHeader>
          {previewBanner && (
            <div className="rounded-xl overflow-hidden">
              <div className="relative h-48 bg-card-gradient">
                {previewBanner.image ? (
                  <img src={getFileUrl(previewBanner.image)} alt={previewBanner.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-12 h-12 text-[#D4AF37]/20" />
                  </div>
                )}
              </div>
              <div className="p-4">
                {previewBanner.subtitle && (
                  <p className="text-[#D4AF37] text-xs font-medium mb-1">{previewBanner.subtitle}</p>
                )}
                <h3 className="text-gold-gradient text-xl font-bold mb-2">{previewBanner.title}</h3>
                {previewBanner.description && (
                  <p className="text-muted-foreground text-sm mb-3">{previewBanner.description}</p>
                )}
                {previewBanner.ctaText && (
                  <Button className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl">
                    {previewBanner.ctaText}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="glass-strong border-[#D4AF37]/20">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Hapus Banner</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Banner akan dihapus secara permanen. Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl border-[#D4AF37]/20 text-foreground" disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="rounded-xl bg-red-600 hover:bg-red-700 text-white" forceMount>
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
