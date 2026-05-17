'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  User, Shield, Crown, Camera, Upload, Loader2,
  CheckCircle2, Building2, Plus, Trash2, Edit3, Phone, Mail,
  AlertTriangle, RefreshCw, Eye, EyeOff, Lock, ChevronRight
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { formatRupiah, maskWhatsApp } from '@/lib/auth';
import { getFileUrl } from '@/lib/file-url';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/lib/i18n';

interface BankAccount {
  id: string;
  bankName: string;
  accountNo: string;
  holderName: string;
  isPrimary: boolean;
}

const levelConfig: Record<string, { color: string; bg: string; border: string }> = {
  Bronze: { color: 'text-amber-600', bg: 'bg-amber-600/10', border: 'border-amber-600/20' },
  Silver: { color: 'text-gray-300', bg: 'bg-gray-300/10', border: 'border-gray-300/20' },
  Gold: { color: 'text-[#D4AF37]', bg: 'bg-[#D4AF37]/10', border: 'border-[#D4AF37]/20' },
  Platinum: { color: 'text-cyan-400', bg: 'bg-cyan-400/10', border: 'border-cyan-400/20' },
};

export default function ProfilePage() {
  const { navigate } = useAppStore();
  const { user, token, setUser, logout, hydrateUser } = useAuthStore();
  const t = useT();

  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [banksLoading, setBanksLoading] = useState(true);
  const [name, setName] = useState(user?.name || '');
  const [nameLoading, setNameLoading] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showOldPw, setShowOldPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [bankDialog, setBankDialog] = useState(false);
  const [editBank, setEditBank] = useState<BankAccount | null>(null);
  const [bankForm, setBankForm] = useState({ bankName: '', accountNo: '', holderName: '', isPrimary: false });
  const [bankSaving, setBankSaving] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<BankAccount | null>(null);

  const fetchBanks = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/user/bank', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) setBanks(data.data || []);
    } catch {} finally {
      setBanksLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchBanks();
  }, [fetchBanks]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Error', description: 'File terlalu besar (maks 5MB)', variant: 'destructive' });
      return;
    }
    setAvatarLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await fetch('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData });
      const uploadData = await uploadRes.json();
      if (uploadData.success) {
        const avatarUrl = uploadData.data.url || uploadData.data.filePath || '';
        const res = await fetch('/api/user/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ avatar: avatarUrl }),
        });
        const data = await res.json();
        if (data.success) {
          setUser(data.data);
          toast({ title: 'Berhasil', description: 'Avatar berhasil diperbarui' });
        }
      }
    } catch {
      toast({ title: 'Error', description: 'Gagal upload avatar', variant: 'destructive' });
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setNameLoading(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setUser(data.data);
        toast({ title: 'Berhasil', description: 'Nama berhasil diperbarui' });
      } else {
        toast({ title: 'Gagal', description: data.error || 'Gagal memperbarui', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Kesalahan jaringan', variant: 'destructive' });
    } finally {
      setNameLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword || !confirmPassword) return;
    if (newPassword.length < 6) {
      toast({ title: 'Error', description: 'Password minimal 6 karakter', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Error', description: 'Konfirmasi password tidak cocok', variant: 'destructive' });
      return;
    }
    setPasswordLoading(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ oldPassword, password: newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        toast({ title: 'Berhasil', description: 'Password berhasil diperbarui' });
      } else {
        toast({ title: 'Gagal', description: data.error || 'Gagal memperbarui password', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Kesalahan jaringan', variant: 'destructive' });
    } finally {
      setPasswordLoading(false);
    }
  };

  const openBankDialog = (bank?: BankAccount) => {
    if (bank) {
      setEditBank(bank);
      setBankForm({ bankName: bank.bankName, accountNo: bank.accountNo, holderName: bank.holderName, isPrimary: bank.isPrimary });
    } else {
      setEditBank(null);
      setBankForm({ bankName: '', accountNo: '', holderName: '', isPrimary: banks.length === 0 });
    }
    setBankDialog(true);
  };

  const handleSaveBank = async () => {
    if (!bankForm.bankName || !bankForm.accountNo || !bankForm.holderName) {
      toast({ title: 'Error', description: 'Semua field harus diisi', variant: 'destructive' });
      return;
    }
    setBankSaving(true);
    try {
      const url = editBank ? `/api/user/bank?id=${editBank.id}` : '/api/user/bank';
      const method = editBank ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(bankForm),
      });
      const data = await res.json();
      if (data.success) {
        setBankDialog(false);
        fetchBanks();
        toast({ title: 'Berhasil', description: editBank ? 'Rekening diperbarui' : 'Rekening ditambahkan' });
      } else {
        toast({ title: 'Gagal', description: data.error || 'Gagal menyimpan', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Kesalahan jaringan', variant: 'destructive' });
    } finally {
      setBankSaving(false);
    }
  };

  const handleDeleteBank = async () => {
    if (!deleteDialog) return;
    try {
      const res = await fetch(`/api/user/bank?id=${deleteDialog.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setDeleteDialog(null);
        fetchBanks();
        toast({ title: 'Berhasil', description: 'Rekening dihapus' });
      } else {
        toast({ title: 'Gagal', description: data.error || 'Gagal menghapus', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Kesalahan jaringan', variant: 'destructive' });
    }
  };

  const handleLogout = () => {
    logout();
    navigate('login');
  };

  const level = levelConfig[user?.level || 'Bronze'] || levelConfig.Bronze;
  const avatarSrc = user?.avatar ? getFileUrl(user.avatar) : null;

  const itemVariants = { hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.06 } } }}
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6 space-y-4 sm:space-y-6 pb-4"
    >
      <motion.div variants={itemVariants}>
        <h1 className="text-foreground text-xl font-bold flex items-center gap-2">
          <User className="w-5 h-5 text-[#D4AF37]" />Profil
        </h1>
        <p className="text-muted-foreground text-sm">Kelola informasi akun dan rekening bank Anda</p>
      </motion.div>

      <motion.div variants={itemVariants} className="glass glow-gold rounded-2xl p-4 sm:p-6">
        <div className="flex items-center gap-4">
          <div className="relative group shrink-0">
            <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
            <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={avatarLoading} className="relative block">
              {avatarSrc ? (
                <img src={avatarSrc} alt="Avatar" className="w-16 h-16 rounded-2xl object-cover ring-2 ring-[#D4AF37]/30 group-hover:ring-[#D4AF37]/60 transition-all" />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-gold-gradient flex items-center justify-center text-2xl font-bold text-[#070B14] ring-2 ring-transparent group-hover:ring-[#D4AF37]/60 transition-all">
                  {user?.name?.charAt(0) || 'U'}
                </div>
              )}
              <div className="absolute inset-0 rounded-2xl bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {avatarLoading ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Camera className="w-5 h-5 text-white" />}
              </div>
            </button>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-foreground font-semibold text-base truncate">{user?.name || 'User'}</h2>
            <p className="text-muted-foreground text-sm">ID: {user?.userId || '-'}</p>
            <div className="flex items-center gap-3 mt-1">
              <Badge className={`${level.bg} ${level.color} ${level.border} border text-[10px] font-semibold`}>
                <Crown className="w-3 h-3 mr-0.5" />{user?.level || 'Bronze'}
              </Badge>
            </div>
          </div>
        </div>
        <Separator className="my-4 bg-border/30" />
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground text-xs mb-0.5 flex items-center gap-1"><Phone className="w-3 h-3" />WhatsApp</p>
            <p className="text-foreground font-medium">{user?.whatsapp ? maskWhatsApp(user.whatsapp) : '-'}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs mb-0.5 flex items-center gap-1"><Mail className="w-3 h-3" />Email</p>
            <p className="text-foreground font-medium truncate">{user?.email || '-'}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">Saldo Utama</p>
            <p className="text-gold-gradient font-bold">{formatRupiah(user?.mainBalance || 0)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">Total Profit</p>
            <p className="text-emerald-400 font-medium">{formatRupiah(user?.totalProfit || 0)}</p>
          </div>
        </div>
      </motion.div>

      <motion.div variants={itemVariants} className="glass rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4">
          <User className="w-4 h-4 text-[#D4AF37]" />
          <h3 className="text-foreground font-semibold text-sm">Ubah Nama</h3>
        </div>
        <form onSubmit={handleUpdateName} className="flex items-center gap-3">
          <div className="relative flex-1">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={name} onChange={(e) => setName(e.target.value)} className="pl-10 h-11 bg-input/50 border-border/50 rounded-xl text-foreground" />
          </div>
          <Button type="submit" disabled={nameLoading || name === user?.name} className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold text-sm disabled:opacity-50 shrink-0">
            {nameLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          </Button>
        </form>
      </motion.div>

      <motion.div variants={itemVariants} className="glass rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-4 h-4 text-[#D4AF37]" />
          <h3 className="text-foreground font-semibold text-sm">Ubah Password</h3>
        </div>
        <form onSubmit={handleUpdatePassword} className="space-y-3">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input type={showOldPw ? 'text' : 'password'} value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} placeholder="Password lama" className="pl-10 pr-10 h-11 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50" />
            <button type="button" onClick={() => setShowOldPw(!showOldPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showOldPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input type={showNewPw ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Password baru (min 6 karakter)" className="pl-10 pr-10 h-11 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50" />
            <button type="button" onClick={() => setShowNewPw(!showNewPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Konfirmasi password baru" className="pl-10 h-11 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50" />
          </div>
          {confirmPassword && newPassword !== confirmPassword && (
            <p className="text-red-400 text-xs">Konfirmasi password tidak cocok</p>
          )}
          <Button type="submit" disabled={passwordLoading} className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold text-sm disabled:opacity-50">
            {passwordLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Ubah Password
          </Button>
        </form>
      </motion.div>

      <motion.div variants={itemVariants} className="glass rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#D4AF37]" />
            <h3 className="text-foreground font-semibold text-sm">Rekening Bank</h3>
          </div>
          <Button onClick={() => openBankDialog()} variant="outline" className="border-[#D4AF37]/30 text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-xl text-xs h-8">
            <Plus className="w-3.5 h-3.5 mr-1" />Tambah
          </Button>
        </div>

        {banksLoading ? (
          <div className="animate-pulse space-y-3">
            {[...Array(2)].map((_, i) => <div key={i} className="h-16 bg-white/5 rounded-xl" />)}
          </div>
        ) : banks.length > 0 ? (
          <div className="space-y-3">
            {banks.map((bank) => (
              <div key={bank.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition-colors">
                <div className="w-10 h-10 rounded-xl bg-blue-400/10 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-foreground text-sm font-medium">{bank.bankName}</p>
                    {bank.isPrimary && <Badge className="bg-[#D4AF37]/10 text-[#D4AF37] border-0 text-[8px] px-1.5 py-0">Utama</Badge>}
                  </div>
                  <p className="text-muted-foreground text-xs">{bank.accountNo}</p>
                  <p className="text-muted-foreground text-[10px]">a/n {bank.holderName}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openBankDialog(bank)} className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors">
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button onClick={() => setDeleteDialog(bank)} className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <Building2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">Belum ada rekening bank</p>
            <p className="text-muted-foreground text-xs mt-1">Tambahkan rekening bank untuk melakukan withdrawal</p>
          </div>
        )}
      </motion.div>

      <motion.div variants={itemVariants} className="glass rounded-2xl overflow-hidden">
        {[
          { icon: Shield, label: 'Pengaturan', page: 'settings' as const },
          { icon: Crown, label: 'Referral', page: 'referral' as const },
        ].map((item, i) => (
          <button key={item.page} onClick={() => navigate(item.page)} className={`w-full flex items-center gap-3 px-5 py-4 text-sm hover:bg-white/[0.03] transition-colors ${i > 0 ? 'border-t border-border/20' : ''}`}>
            <item.icon className="w-4 h-4 text-[#D4AF37]" />
            <span className="flex-1 text-left text-foreground">{item.label}</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        ))}
      </motion.div>

      <motion.div variants={itemVariants}>
        <Button onClick={handleLogout} variant="ghost" className="w-full h-12 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-2xl font-medium">
          Keluar dari Akun
        </Button>
      </motion.div>

      <Dialog open={bankDialog} onOpenChange={setBankDialog}>
        <DialogContent className="glass-strong border-[#D4AF37]/20 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#D4AF37]" />
              {editBank ? 'Edit Rekening' : 'Tambah Rekening'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {editBank ? 'Perbarui informasi rekening bank Anda' : 'Tambahkan rekening bank untuk withdrawal'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label className="text-foreground text-xs">Nama Bank</Label>
              <Input value={bankForm.bankName} onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })} placeholder="BCA, Mandiri, BNI..." className="h-11 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50" />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground text-xs">Nomor Rekening</Label>
              <Input value={bankForm.accountNo} onChange={(e) => setBankForm({ ...bankForm, accountNo: e.target.value.replace(/[^0-9]/g, '') })} placeholder="Masukkan nomor rekening" className="h-11 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50" />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground text-xs">Nama Pemilik</Label>
              <Input value={bankForm.holderName} onChange={(e) => setBankForm({ ...bankForm, holderName: e.target.value })} placeholder="Nama sesuai buku rekening" className="h-11 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBankDialog(false)} className="border-border/50 text-muted-foreground rounded-xl">Batal</Button>
            <Button onClick={handleSaveBank} disabled={bankSaving} className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold">
              {bankSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              {editBank ? 'Simpan' : 'Tambah'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteDialog} onOpenChange={(open) => { if (!open) setDeleteDialog(null); }}>
        <DialogContent className="glass-strong border-red-500/20 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              Hapus Rekening?
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Rekening {deleteDialog?.bankName} - {deleteDialog?.accountNo} akan dihapus permanen.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteDialog(null)} className="border-border/50 text-muted-foreground rounded-xl">Batal</Button>
            <Button onClick={handleDeleteBank} className="bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600">Hapus</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
