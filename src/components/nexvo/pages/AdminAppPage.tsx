'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Smartphone, Upload, Save, Loader2, Download,
  Package, Info
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

/* ═══════════════════════════════════════════
   ADMIN APP PAGE
   ═══════════════════════════════════════════ */
export default function AdminAppPage() {
  const [apkInfo, setApkInfo] = useState<{ fileName: string; filePath: string; version: string; fileSize: number; isActive: boolean } | null>(null);
  const [version, setVersion] = useState('');
  const [downloadLink, setDownloadLink] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { adminToken } = useAuthStore();
  const { toast } = useToast();

  useEffect(() => {
    if (!adminToken) return;
    // Fetch settings
    fetch('/api/admin/settings', { headers: { Authorization: `Bearer ${adminToken}` } })
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          const settings = res.data as Record<string, string>;
          setVersion(settings.apk_version || '1.0.0');
          setDownloadLink(settings.apk_download_link || '');
        }
      })
      .catch(() => { toast({ title: 'Error', description: 'Gagal memuat pengaturan', variant: 'destructive' }); });

    // Fetch APK info (version comes from settings, not from APK metadata)
    fetch('/api/apk')
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setApkInfo({
            fileName: res.data.fileName || '',
            filePath: res.data.filePath || '',
            version: res.data.version || '1.0.0',
            fileSize: res.data.fileSize || 0,
            isActive: res.data.isActive ?? false,
          });
        }
      })
      .catch(() => { toast({ title: 'Error', description: 'Gagal memuat info APK', variant: 'destructive' }); })
      .finally(() => setLoading(false));
   
  }, [adminToken]);

  const handleApkUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/admin/apk', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'APK berhasil diupload' });
        if (data.data) setApkInfo(data.data);
      } else {
        toast({ title: 'Gagal upload APK', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Kesalahan Jaringan', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const settings = [
        { key: 'apk_version', value: version },
        { key: 'apk_download_link', value: downloadLink },
      ];
      const results = await Promise.all(
        settings.map((setting) =>
          fetch('/api/admin/settings', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify(setting),
          }).then((r) => r.json())
        )
      );
      const failed = results.filter((r) => !r.success);
      if (failed.length > 0) {
        toast({ title: 'Gagal menyimpan pengaturan', description: `${failed.length} pengaturan gagal disimpan`, variant: 'destructive' });
      } else {
        toast({ title: 'Pengaturan app disimpan' });
      }
    } catch {
      toast({ title: 'Gagal menyimpan pengaturan', description: 'Kesalahan jaringan', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="p-3 sm:p-5 lg:p-6">
        <Skeleton className="h-10 w-64 mb-6" />
        <div className="space-y-6 max-w-2xl">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
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
        className="mb-6"
      >
        <h1 className="text-2xl sm:text-3xl font-bold text-gold-gradient">Pengaturan Aplikasi</h1>
        <p className="text-muted-foreground text-sm">Kelola APK dan versi aplikasi</p>
      </motion.div>

      <div className="max-w-2xl space-y-6">
        {/* Current APK Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass glow-gold rounded-2xl p-4 sm:p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-5 h-5 text-[#D4AF37]" />
            <h3 className="text-foreground font-semibold">APK Saat Ini</h3>
          </div>

          {apkInfo ? (
            <div className="glass rounded-xl p-4 mb-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">File Name</span>
                  <p className="text-foreground font-medium truncate">{apkInfo.fileName}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Ukuran</span>
                  <p className="text-foreground font-medium">{formatFileSize(apkInfo.fileSize)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Versi</span>
                  <p className="text-foreground font-medium">{apkInfo.version}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Status</span>
                  <Badge className={`${apkInfo.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'} border-0 text-[10px]`}>
                    {apkInfo.isActive ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                </div>
              </div>
            </div>
          ) : (
            <div className="glass rounded-xl p-6 text-center mb-4">
              <Smartphone className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">Belum ada APK yang diupload</p>
            </div>
          )}

          {/* Upload APK */}
          <label className="block cursor-pointer">
            <input
              type="file"
              accept=".apk"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleApkUpload(file);
              }}
            />
            <div className="glass rounded-xl border-2 border-dashed border-[#D4AF37]/20 p-6 text-center hover:border-[#D4AF37]/40 transition-colors">
              {uploading ? (
                <div>
                  <Loader2 className="w-8 h-8 text-[#D4AF37] mx-auto animate-spin mb-2" />
                  <p className="text-muted-foreground text-sm">Mengupload APK...</p>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-[#D4AF37] mx-auto mb-2" />
                  <p className="text-foreground font-medium text-sm mb-1">Upload APK Baru</p>
                  <p className="text-muted-foreground text-xs">Klik untuk memilih file .apk</p>
                </>
              )}
            </div>
          </label>
        </motion.div>

        {/* Version Number */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass glow-gold rounded-2xl p-4 sm:p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Smartphone className="w-5 h-5 text-[#D4AF37]" />
            <h3 className="text-foreground font-semibold">Versi Aplikasi</h3>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs mb-2 block">Nomor Versi</Label>
            <Input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="1.0.0"
              className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground"
            />
            <div className="flex items-start gap-2 mt-2">
              <Info className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-muted-foreground text-xs">Gunakan format semver (contoh: 1.2.3)</p>
            </div>
          </div>
        </motion.div>

        {/* Download Link */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass glow-gold rounded-2xl p-4 sm:p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Download className="w-5 h-5 text-[#D4AF37]" />
            <h3 className="text-foreground font-semibold">Link Download</h3>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs mb-2 block">URL Download APK</Label>
            <Input
              value={downloadLink}
              onChange={(e) => setDownloadLink(e.target.value)}
              placeholder="https://example.com/app.apk"
              className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground"
            />
          </div>
        </motion.div>

        {/* Save Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-gold-gradient text-[#070B14] font-semibold rounded-2xl hover:opacity-90 transition-all h-12 glow-gold-strong"
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
            ) : (
              <Save className="w-5 h-5 mr-2" />
            )}
            Simpan Pengaturan
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
