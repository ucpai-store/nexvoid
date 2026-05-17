'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Upload, Image as ImageIcon, Save, RotateCcw, Check, AlertCircle, Loader2, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useSiteStore } from '@/stores/site-store';
import { getFileUrl, getFileUrlStatic } from '@/lib/file-url';
import { Button } from '@/components/ui/button';

export default function AdminAppearancePage() {
  const { adminToken } = useAuthStore();
  const { refreshLogo, setLogoUrl } = useSiteStore();
  const [currentLogo, setCurrentLogo] = useState<string>('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchCurrentLogo = async () => {
    try {
      const res = await fetch('/api/admin/logo', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const fetchableUrl = getFileUrlStatic(data.data.url);
          const separator = fetchableUrl.includes('?') ? '&' : '?';
          const url = fetchableUrl + separator + 't=' + Date.now();
          setCurrentLogo(url);
        }
      }
    } catch {
      setCurrentLogo('/api/files/nexvo-logo.png');
    } finally {
      setLoading(false);
    }
  };

  // Fetch current logo on mount (and when adminToken changes)
  useEffect(() => {
    if (adminToken) fetchCurrentLogo();
  }, [adminToken]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      setMessage({ type: 'error', text: 'Tipe file tidak diizinkan. Gunakan JPG, PNG, GIF, WebP, atau SVG.' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'File terlalu besar. Maksimum 5MB.' });
      return;
    }

    setSelectedFile(file);
    setMessage(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      setPreviewUrl(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('logo', selectedFile);

      const res = await fetch('/api/admin/logo', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: formData,
      });

      const data = await res.json();

      if (data.success) {
        // Refresh the logo in the admin page preview
        const fetchableUrl = getFileUrlStatic(data.data.url);
        const separator = fetchableUrl.includes('?') ? '&' : '?';
        const newUrl = fetchableUrl + separator + 't=' + Date.now();
        setCurrentLogo(newUrl);
        // Update the global store so ALL components see the new logo immediately
        setLogoUrl(data.data.url);
        setPreviewUrl(null);
        setSelectedFile(null);
        setMessage({ type: 'success', text: 'Logo website berhasil diperbarui!' });

        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else {
        setMessage({ type: 'error', text: data.error || 'Gagal mengunggah logo' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Terjadi kesalahan saat mengunggah logo' });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteLogo = async () => {
    if (!confirm('Apakah Anda yakin ingin menghapus logo dan mengembalikan ke default NEXVO?')) return;

    setDeleting(true);
    setMessage(null);

    try {
      const res = await fetch('/api/admin/logo', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const data = await res.json();

      if (data.success) {
        setCurrentLogo('/api/files/nexvo-logo.png');
        setLogoUrl('/api/files/nexvo-logo.png');
        setPreviewUrl(null);
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        // Force service worker to update and clear all caches
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then(function(registrations) {
            registrations.forEach(function(registration) {
              registration.update();
            });
          });
          // Also clear all caches manually
          if ('caches' in window) {
            caches.keys().then(function(names) {
              for (const name of names) {
                caches.delete(name);
              }
            });
          }
        }
        setMessage({ type: 'success', text: data.message || 'Logo berhasil dihapus dan dikembalikan ke default!' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Gagal menghapus logo' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Terjadi kesalahan saat menghapus logo' });
    } finally {
      setDeleting(false);
    }
  };

  const handleReset = () => {
    setPreviewUrl(null);
    setSelectedFile(null);
    setMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      setMessage({ type: 'error', text: 'Tipe file tidak diizinkan. Gunakan JPG, PNG, GIF, WebP, atau SVG.' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'File terlalu besar. Maksimum 5MB.' });
      return;
    }

    setSelectedFile(file);
    setMessage(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      setPreviewUrl(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  if (loading) {
    return (
      <div className="p-3 sm:p-5 lg:p-6">
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="w-8 h-8 text-[#D4AF37] animate-spin" />
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
        className="mb-8"
      >
        <h1 className="text-2xl sm:text-3xl font-bold text-gold-gradient">Tampilan Website</h1>
        <p className="text-muted-foreground mt-1 text-sm">Kelola logo dan tampilan website NEXVO</p>
      </motion.div>

      {/* Message */}
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mb-6 flex items-center gap-2 p-4 rounded-xl text-sm ${
            message.type === 'success'
              ? 'bg-green-500/10 border border-green-500/20 text-green-400'
              : 'bg-red-500/10 border border-red-500/20 text-red-400'
          }`}
        >
          {message.type === 'success' ? (
            <Check className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          {message.text}
        </motion.div>
      )}

      {/* Logo Management */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-2xl p-4 sm:p-8"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-[#D4AF37]" />
          </div>
          <div>
            <h2 className="text-foreground font-semibold text-lg">Logo Website</h2>
            <p className="text-muted-foreground text-xs">Logo ini akan ditampilkan di seluruh halaman website</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Current Logo */}
          <div>
            <h3 className="text-foreground text-sm font-medium mb-3">Logo Saat Ini</h3>
            <div className="glass-strong rounded-xl p-6 flex items-center justify-center min-h-[200px]">
              <img
                key={currentLogo}
                src={currentLogo}
                alt="Current Logo"
                className="max-h-32 max-w-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/api/files/nexvo-logo.png';
                }}
              />
            </div>
            <p className="text-muted-foreground text-xs mt-2 text-center">
              Logo aktif yang ditampilkan di website
            </p>
            {/* Delete Logo Button - only show if not using default */}
            {currentLogo && !currentLogo.includes('nexvo-logo.png') && (
              <Button
                onClick={handleDeleteLogo}
                disabled={deleting}
                variant="ghost"
                className="mt-3 w-full rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20"
              >
                {deleting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Menghapus...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Hapus Logo & Kembalikan ke Default
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Upload New Logo */}
          <div>
            <h3 className="text-foreground text-sm font-medium mb-3">Upload Logo Baru</h3>

            {/* Drop Zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
              className="glass-strong rounded-xl p-6 min-h-[200px] flex flex-col items-center justify-center cursor-pointer border-2 border-dashed border-border hover:border-[#D4AF37]/30 transition-colors group"
            >
              {previewUrl ? (
                <div className="text-center">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="max-h-28 max-w-full object-contain mx-auto mb-3"
                  />
                  <p className="text-muted-foreground text-xs">
                    {selectedFile?.name} ({selectedFile ? (selectedFile.size / 1024).toFixed(1) : 0} KB)
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <div className="w-14 h-14 rounded-2xl bg-[#D4AF37]/10 flex items-center justify-center mx-auto mb-3 group-hover:bg-[#D4AF37]/20 transition-colors">
                    <Upload className="w-6 h-6 text-[#D4AF37]" />
                  </div>
                  <p className="text-foreground text-sm font-medium mb-1">
                    Klik atau seret file ke sini
                  </p>
                  <p className="text-muted-foreground text-xs">
                    JPG, PNG, GIF, WebP, SVG • Maks 5MB
                  </p>
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Action Buttons */}
            {selectedFile && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 mt-4"
              >
                <Button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="flex-1 bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Mengunggah...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Simpan Logo
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleReset}
                  variant="ghost"
                  className="rounded-xl text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Batal
                </Button>
              </motion.div>
            )}
          </div>
        </div>

        {/* Tips */}
        <div className="mt-8 p-4 rounded-xl bg-[#D4AF37]/5 border border-[#D4AF37]/10">
          <h4 className="text-[#D4AF37] text-sm font-medium mb-2">💡 Tips Logo</h4>
          <ul className="text-muted-foreground text-xs space-y-1.5">
            <li>• Gunakan logo dengan latar transparan (PNG/SVG) untuk hasil terbaik</li>
            <li>• Ukuran rekomendasi: lebar 200-400px untuk tampilan optimal</li>
            <li>• Logo akan ditampilkan di header, footer, sidebar admin, dan halaman loading</li>
            <li>• Perubahan logo akan langsung terlihat di seluruh halaman website</li>
          </ul>
        </div>
      </motion.div>

      {/* Preview Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass rounded-2xl p-4 sm:p-8 mt-4 sm:mt-6"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-[#D4AF37]" />
          </div>
          <div>
            <h2 className="text-foreground font-semibold text-lg">Preview Logo</h2>
            <p className="text-muted-foreground text-xs">Tampilan logo di berbagai ukuran</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          {[
            { size: 'h-16', label: 'Besar (h-16)' },
            { size: 'h-10', label: 'Sedang (h-10)' },
            { size: 'h-8', label: 'Kecil (h-8)' },
            { size: 'h-6', label: 'Mini (h-6)' },
          ].map(({ size, label }) => (
            <div key={size} className="text-center">
              <div className="glass-strong rounded-xl p-4 flex items-center justify-center h-24 mb-2">
                <img
                  key={currentLogo + size}
                  src={currentLogo}
                  alt={label}
                  className={`${size} max-w-full object-contain`}
                  onError={(e) => { (e.target as HTMLImageElement).src = '/api/files/nexvo-logo.png'; }}
                />
              </div>
              <p className="text-muted-foreground text-xs">{label}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
