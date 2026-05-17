'use client';

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Settings, User, Lock, LogOut, Shield, Phone,
  Eye, EyeOff, ChevronRight, Loader2, CheckCircle2, Crown,
  Camera, Upload
} from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { useAuthStore } from '@/stores/auth-store';
import { formatRupiah, maskWhatsApp } from '@/lib/auth';
import { getFileUrl } from '@/lib/file-url';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/lib/i18n';

export default function SettingsPage() {
  const { navigate } = useAppStore();
  const { user, token, setUser, logout } = useAuthStore();
  const t = useT();

  // Name form
  const [name, setName] = useState(user?.name || '');
  const [nameLoading, setNameLoading] = useState(false);

  // WhatsApp form
  const [whatsapp, setWhatsapp] = useState(user?.whatsapp || '');
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const [editingWhatsapp, setEditingWhatsapp] = useState(false);

  // Password form
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Avatar
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarClick = () => {
    avatarInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Error', description: t('common.error'), variant: 'destructive' });
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);

    // Upload
    setAvatarLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const uploadData = await uploadRes.json();

      if (uploadData.success) {
        const avatarUrl = uploadData.data.url || uploadData.data.filePath || '';
        // Update profile with avatar URL
        const res = await fetch('/api/user/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ avatar: avatarUrl }),
        });
        const data = await res.json();

        if (data.success) {
          setUser(data.data);
          setAvatarPreview(null);
          toast({ title: 'Berhasil', description: t('settings.avatarUpdated') });
        } else {
          toast({ title: 'Gagal', description: data.error || t('settings.avatarUploadFailed'), variant: 'destructive' });
        }
      } else {
        toast({ title: 'Gagal Upload', description: t('settings.avatarUploadFailed'), variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: t('common.error'), variant: 'destructive' });
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: 'Error', description: t('settings.nameRequired'), variant: 'destructive' });
      return;
    }

    setNameLoading(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();

      if (data.success) {
        setUser(data.data);
        toast({ title: 'Berhasil', description: t('settings.nameUpdated') });
      } else {
        toast({ title: 'Gagal', description: data.error || t('common.error'), variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: t('common.error'), variant: 'destructive' });
    } finally {
      setNameLoading(false);
    }
  };

  const handleUpdateWhatsapp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!whatsapp.trim()) {
      toast({ title: 'Error', description: t('settings.whatsappRequired'), variant: 'destructive' });
      return;
    }

    setWhatsappLoading(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ whatsapp: whatsapp.trim() }),
      });
      const data = await res.json();

      if (data.success) {
        setUser(data.data);
        setEditingWhatsapp(false);
        toast({ title: 'Berhasil', description: t('settings.whatsappUpdated') });
      } else {
        toast({ title: 'Gagal', description: data.error || t('common.error'), variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: t('common.error'), variant: 'destructive' });
    } finally {
      setWhatsappLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword || !confirmPassword) {
      toast({ title: 'Error', description: t('common.allFieldsRequired'), variant: 'destructive' });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: 'Error', description: t('settings.passwordMin6'), variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Error', description: t('settings.passwordMismatch'), variant: 'destructive' });
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ oldPassword, password: newPassword }),
      });
      const data = await res.json();

      if (data.success) {
        setUser(data.data);
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        toast({ title: 'Berhasil', description: t('settings.passwordUpdated') });
      } else {
        toast({ title: 'Gagal', description: data.error || t('common.error'), variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: t('common.error'), variant: 'destructive' });
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('login');
    toast({ title: 'Berhasil', description: t('auth.logout') });
  };

  const levelConfig: Record<string, { color: string; bg: string }> = {
    Bronze: { color: 'text-amber-600', bg: 'bg-amber-600/10' },
    Silver: { color: 'text-gray-300', bg: 'bg-gray-300/10' },
    Gold: { color: 'text-[#D4AF37]', bg: 'bg-[#D4AF37]/10' },
    Platinum: { color: 'text-cyan-400', bg: 'bg-cyan-400/10' },
  };

  const level = levelConfig[user?.level || 'Bronze'] || levelConfig.Bronze;

  // Determine avatar display
  const avatarSrc = avatarPreview || (user?.avatar ? getFileUrl(user.avatar) : null);
  const showAvatarImage = avatarSrc && avatarSrc.length > 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6 space-y-4 sm:space-y-6 pb-4 sm:pb-6">
      {/* Header */}
      <div>
        <h1 className="text-foreground text-xl font-bold">{t('settings.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('settings.profileInfo')}</p>
      </div>

      {/* Profile Info Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass glow-gold rounded-2xl p-3 sm:p-5 lg:p-6"
      >
        <div className="flex items-center gap-4">
          {/* Avatar - Clickable */}
          <div className="relative group shrink-0">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={handleAvatarClick}
              className="relative block"
              disabled={avatarLoading}
            >
              {showAvatarImage ? (
                <img
                  src={avatarSrc!}
                  alt={user?.name || 'Avatar'}
                  className="w-16 h-16 rounded-2xl object-cover ring-2 ring-[#D4AF37]/30 group-hover:ring-[#D4AF37]/60 transition-all"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-gold-gradient flex items-center justify-center text-2xl font-bold text-[#070B14] ring-2 ring-transparent group-hover:ring-[#D4AF37]/60 transition-all">
                  {user?.name?.charAt(0) || 'U'}
                </div>
              )}
              {/* Overlay */}
              <div className="absolute inset-0 rounded-2xl bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {avatarLoading ? (
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                ) : (
                  <Camera className="w-5 h-5 text-white" />
                )}
              </div>
            </button>
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-foreground font-semibold text-base truncate">{user?.name || 'User'}</h2>
            <p className="text-muted-foreground text-sm">{user?.userId || '-'}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={`${level.bg} ${level.color} border-0 text-[10px] font-semibold`}>
                <Crown className="w-3 h-3 mr-0.5" />
                {user?.level || 'Bronze'}
              </Badge>
            </div>
          </div>
        </div>

        <Separator className="my-4 bg-border/30" />

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">{t('settings.whatsapp')}</p>
            <p className="text-foreground font-medium">{user?.whatsapp ? maskWhatsApp(user.whatsapp) : '-'}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">{t('settings.mainBalance')}</p>
            <p className="text-gold-gradient font-bold">{formatRupiah(user?.mainBalance || 0)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">{t('settings.totalDeposit')}</p>
            <p className="text-emerald-400 font-medium">{formatRupiah(user?.totalDeposit || 0)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">{t('settings.totalProfit')}</p>
            <p className="text-[#D4AF37] font-medium">{formatRupiah(user?.totalProfit || 0)}</p>
          </div>
        </div>
      </motion.div>

      {/* Change Name */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="glass rounded-2xl p-3 sm:p-5 lg:p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <User className="w-5 h-5 text-[#D4AF37]" />
          <h3 className="text-foreground font-semibold text-sm">{t('settings.changeName')}</h3>
        </div>
        <form onSubmit={handleUpdateName} className="space-y-3">
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="pl-10 h-11 sm:h-12 bg-input/50 border-border/50 rounded-xl text-foreground"
            />
          </div>
          <Button
            type="submit"
            disabled={nameLoading || name === user?.name}
            className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold text-sm disabled:opacity-50"
          >
            {nameLoading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mr-2" />
            )}
            {t('settings.saveName')}</Button>
        </form>
      </motion.div>

      {/* Change WhatsApp */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="glass rounded-2xl p-3 sm:p-5 lg:p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <Phone className="w-5 h-5 text-[#D4AF37]" />
          <h3 className="text-foreground font-semibold text-sm">{t('settings.changeWhatsapp')}</h3>
        </div>

        {!editingWhatsapp ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-foreground font-medium text-sm">
                {user?.whatsapp ? maskWhatsApp(user.whatsapp) : t('settings.notSet')}
              </p>
              <p className="text-muted-foreground text-xs mt-0.5">
                {user?.whatsapp || '-'}
              </p>
            </div>
            <Button
              type="button"
              onClick={() => {
                setWhatsapp(user?.whatsapp || '');
                setEditingWhatsapp(true);
              }}
              variant="outline"
              className="border-[#D4AF37]/30 text-[#D4AF37] hover:bg-[#D4AF37]/5 rounded-xl text-xs"
            >
              Ubah
            </Button>
          </div>
        ) : (
          <form onSubmit={handleUpdateWhatsapp} className="space-y-3">
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="+628xxxxxxxxxx"
                className="pl-10 h-11 sm:h-12 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                disabled={whatsappLoading}
                className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold text-sm disabled:opacity-50"
              >
                {whatsappLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                )}
                {t('settings.saveWhatsapp')}</Button>
              <Button
                type="button"
                onClick={() => {
                  setEditingWhatsapp(false);
                  setWhatsapp(user?.whatsapp || '');
                }}
                variant="ghost"
                className="text-muted-foreground hover:text-foreground rounded-xl text-sm"
              >
                Batal
              </Button>
            </div>
          </form>
        )}
      </motion.div>

      {/* Change Password */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-2xl p-3 sm:p-5 lg:p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-5 h-5 text-[#D4AF37]" />
          <h3 className="text-foreground font-semibold text-sm">{t('settings.changePassword')}</h3>
        </div>
        <form onSubmit={handleUpdatePassword} className="space-y-3">
          <div className="space-y-2">
            <Label className="text-foreground text-xs">{t('settings.oldPassword')}</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type={showOldPassword ? 'text' : 'password'}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder={t('auth.enterPassword')}
                className="pl-10 pr-10 h-11 sm:h-12 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50"
              />
              <button
                type="button"
                onClick={() => setShowOldPassword(!showOldPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showOldPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-foreground text-xs">{t('settings.newPassword')}</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t('auth.minChars')}
                className="pl-10 pr-10 h-11 sm:h-12 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-foreground text-xs">Konfirmasi {t('settings.newPassword')}</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('auth.minChars')}
                className="pl-10 h-11 sm:h-12 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50"
              />
            </div>
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-red-400 text-xs">{t('settings.passwordMismatch')}</p>
            )}
          </div>
          <Button
            type="submit"
            disabled={passwordLoading}
            className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold text-sm disabled:opacity-50"
          >
            {passwordLoading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mr-2" />
            )}
            {t('settings.changePasswordBtn')}</Button>
        </form>
      </motion.div>

      {/* Quick Links */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="glass rounded-2xl overflow-hidden"
      >
        {[
          { icon: Shield, label: t('nav.bank'), page: 'bank' as const },
          { icon: Phone, label: t('nav.referral'), page: 'referral' as const },
        ].map((item, i) => (
          <button
            key={item.page}
            onClick={() => navigate(item.page)}
            className={`w-full flex items-center gap-3 px-5 py-4 text-sm hover:bg-white/[0.03] transition-colors ${
              i > 0 ? 'border-t border-border/20' : ''
            }`}
          >
            <item.icon className="w-4 h-4 text-[#D4AF37]" />
            <span className="flex-1 text-left text-foreground">{item.label}</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        ))}
      </motion.div>

      {/* Logout */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Button
          onClick={handleLogout}
          variant="ghost"
          className="w-full h-12 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-2xl font-medium"
        >
          <LogOut className="w-4 h-4 mr-2" />
          {t('settings.logoutAccount')}
        </Button>
      </motion.div>

      <div className="text-center pb-4">
        <p className="text-muted-foreground/30 text-xs">
          NEXVO v1.0.0
        </p>
      </div>
    </div>
  );
}
