'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, Key, UserPlus, ScrollText, Lock, Eye, EyeOff,
  Loader2, AlertTriangle, CheckCircle2,
  Trash2, Users, Clock, Unlock, Phone, Plus, Pencil, MessageCircle, DollarSign, Banknote,
  Database, RotateCcw, AlertOctagon
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { formatNumber, timeAgo } from '@/lib/auth';

interface AdminInfo {
  id: string;
  username: string;
  email: string;
  name: string;
  role: string;
  lastLogin: string | null;
  loginAttempts: number;
  lockedUntil: string | null;
  createdAt: string;
}

interface LogEntry {
  id: string;
  action: string;
  detail: string;
  ip: string;
  createdAt: string;
  admin: { name: string; username: string };
}

interface WhatsAppAdmin {
  id: string;
  name: string;
  phone: string;
  isActive: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export default function AdminSettingsPage() {
  const { adminToken, admin } = useAuthStore();
  
  // Password change state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPass, setShowOldPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Add admin state
  const [addUsername, setAddUsername] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addName, setAddName] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // Delete admin state
  const [deleteTarget, setDeleteTarget] = useState<AdminInfo | null>(null);
  const [deletingAdmin, setDeletingAdmin] = useState(false);

  // WhatsApp admin state
  const [waAdmins, setWaAdmins] = useState<WhatsAppAdmin[]>([]);
  const [waLoading, setWaLoading] = useState(false);
  const [waDialogOpen, setWaDialogOpen] = useState(false);
  const [waEditMode, setWaEditMode] = useState(false);
  const [waEditId, setWaEditId] = useState<string>('');
  const [waName, setWaName] = useState('');
  const [waPhone, setWaPhone] = useState('');

  // Salary config state
  const [salaryConfig, setSalaryConfig] = useState<any>(null);
  const [savingSalary, setSavingSalary] = useState(false);

  // Fees state
  const [depositFee, setDepositFee] = useState('500');
  const [withdrawFee, setWithdrawFee] = useState('10');
  const [savingFees, setSavingFees] = useState(false);

  // Important Numbers state
  const [adminNumber, setAdminNumber] = useState('');
  const [depositAdminNumber, setDepositAdminNumber] = useState('');
  const [csAdminNumber, setCsAdminNumber] = useState('');
  const [savingNumbers, setSavingNumbers] = useState(false);
  const [waOrder, setWaOrder] = useState(0);
  const [waSaving, setWaSaving] = useState(false);
  const [waDeleteTarget, setWaDeleteTarget] = useState<WhatsAppAdmin | null>(null);
  const [waDeleting, setWaDeleting] = useState(false);

  // Data state
  const [admins, setAdmins] = useState<AdminInfo[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Factory Reset state
  const [resetPreview, setResetPreview] = useState<{
    willDelete: Record<string, number>;
    willKeep: Record<string, number>;
  } | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const isSuperAdmin = admin?.role === 'super_admin';

  const fetchResetPreview = async () => {
    setResetLoading(true);
    try {
      const res = await fetch('/api/admin/factory-reset', {
        headers: { Authorization: `Bearer ${localStorage.getItem('adminToken') || ''}` },
      });
      const data = await res.json();
      if (data.success) {
        setResetPreview({ willDelete: data.willDelete, willKeep: data.willKeep });
      } else {
        toast({ title: 'Error', description: data.error || 'Gagal memuat preview', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Error', description: 'Gagal memuat preview', variant: 'destructive' });
    } finally {
      setResetLoading(false);
    }
  };

  const handleFactoryReset = async () => {
    if (resetConfirmText !== 'RESET ALL USER DATA') {
      toast({
        title: 'Konfirmasi salah',
        description: 'Ketik ulang: RESET ALL USER DATA',
        variant: 'destructive',
      });
      return;
    }
    setResetting(true);
    try {
      const res = await fetch('/api/admin/factory-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('adminToken') || ''}`,
        },
        body: JSON.stringify({ confirm: resetConfirmText }),
      });
      const data = await res.json();
      if (data.success) {
        toast({
          title: 'Factory Reset Berhasil',
          description: data.message,
        });
        setResetConfirmText('');
        setResetDialogOpen(false);
        await fetchResetPreview();
      } else {
        toast({ title: 'Gagal', description: data.error, variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Error', description: 'Gagal melakukan reset', variant: 'destructive' });
    } finally {
      setResetting(false);
    }
  };

  const fetchData = async () => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/auth/me', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (data.success) {
        setAdmins(data.data.admins || []);
      }

      const logsRes = await fetch('/api/admin/auth/logs?limit=50', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const logsData = await logsRes.json();
      if (logsData.success) {
        setLogs(logsData.data || []);
      }

      // Fetch deposit fee setting
      const settingsRes = await fetch('/api/admin/settings', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const settingsData = await settingsRes.json();
      if (settingsData.success && settingsData.data) {
        if (settingsData.data.deposit_fee) setDepositFee(settingsData.data.deposit_fee);
        if (settingsData.data.withdraw_fee) setWithdrawFee(settingsData.data.withdraw_fee);
        if (settingsData.data.bot_admin_number) setAdminNumber(settingsData.data.bot_admin_number);
        if (settingsData.data.deposit_admin_number) setDepositAdminNumber(settingsData.data.deposit_admin_number);
        if (settingsData.data.cs_admin_number) setCsAdminNumber(settingsData.data.cs_admin_number);
      }

      // Fetch salary config
      const salaryRes = await fetch('/api/admin/salary-config', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const salaryData = await salaryRes.json();
      if (salaryData.success && salaryData.data) {
        setSalaryConfig(salaryData.data);
      }
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchWhatsAppAdmins = async () => {
    if (!adminToken) return;
    setWaLoading(true);
    try {
      const res = await fetch('/api/admin/whatsapp', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (data.success) {
        setWaAdmins(data.data || []);
      }
    } catch (error) {
      console.error('Fetch WhatsApp admins error:', error);
    } finally {
      setWaLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchWhatsAppAdmins();
    fetchResetPreview();
  }, [adminToken]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword || !confirmPassword) {
      toast({ title: 'Error', description: 'Semua field wajib diisi', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Error', description: 'Password baru tidak cocok', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: 'Error', description: 'Password baru minimal 6 karakter', variant: 'destructive' });
      return;
    }

    setChangingPassword(true);
    try {
      const res = await fetch('/api/admin/auth/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Success', description: 'Password berhasil diubah' });
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        toast({ title: 'Failed', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Kesalahan jaringan', variant: 'destructive' });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addUsername || !addEmail || !addName || !addPassword) {
      toast({ title: 'Error', description: 'Semua field wajib diisi', variant: 'destructive' });
      return;
    }
    if (addPassword.length < 6) {
      toast({ title: 'Error', description: 'Password minimal 6 karakter', variant: 'destructive' });
      return;
    }

    setAddingAdmin(true);
    try {
      const res = await fetch('/api/admin/auth/add-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ username: addUsername, email: addEmail, name: addName, password: addPassword }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Success', description: `Admin ${addUsername} berhasil ditambahkan` });
        setAddUsername('');
        setAddEmail('');
        setAddName('');
        setAddPassword('');
        setAddDialogOpen(false);
        fetchData();
      } else {
        toast({ title: 'Failed', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Kesalahan jaringan', variant: 'destructive' });
    } finally {
      setAddingAdmin(false);
    }
  };

  const handleUnlockAdmin = async (targetAdmin: AdminInfo) => {
    try {
      const res = await fetch('/api/admin/auth/add-admin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id: targetAdmin.id, action: 'unlock' }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Success', description: `Admin ${targetAdmin.username} berhasil di-unlock` });
        fetchData();
      } else {
        toast({ title: 'Failed', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Kesalahan jaringan', variant: 'destructive' });
    }
  };

  const handleDeleteAdmin = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!deleteTarget) return;
    setDeletingAdmin(true);
    try {
      const targetId = deleteTarget.id;
      const targetUsername = deleteTarget.username;
      const res = await fetch('/api/admin/auth/add-admin', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id: targetId }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Success', description: `Admin ${targetUsername} berhasil dihapus` });
        setDeleteTarget(null);
        fetchData();
      } else {
        toast({ title: 'Failed', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Kesalahan jaringan', variant: 'destructive' });
    } finally {
      setDeletingAdmin(false);
    }
  };

  const handleWaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waName || !waPhone) {
      toast({ title: 'Error', description: 'Nama dan nomor telepon wajib diisi', variant: 'destructive' });
      return;
    }

    setWaSaving(true);
    try {
      const url = '/api/admin/whatsapp';
      const method = waEditMode ? 'PUT' : 'POST';
      const body = waEditMode
        ? { id: waEditId, name: waName, phone: waPhone, order: waOrder }
        : { name: waName, phone: waPhone, order: waOrder };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Success', description: waEditMode ? 'WhatsApp admin berhasil diperbarui' : 'WhatsApp admin berhasil ditambahkan' });
        setWaDialogOpen(false);
        resetWaForm();
        fetchWhatsAppAdmins();
      } else {
        toast({ title: 'Failed', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Kesalahan jaringan', variant: 'destructive' });
    } finally {
      setWaSaving(false);
    }
  };

  const handleWaToggle = async (wa: WhatsAppAdmin) => {
    try {
      const res = await fetch('/api/admin/whatsapp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id: wa.id, isActive: !wa.isActive }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Success', description: `WhatsApp admin ${wa.isActive ? 'dinonaktifkan' : 'diaktifkan'}` });
        fetchWhatsAppAdmins();
      } else {
        toast({ title: 'Failed', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Kesalahan jaringan', variant: 'destructive' });
    }
  };

  const handleWaEdit = (wa: WhatsAppAdmin) => {
    setWaEditMode(true);
    setWaEditId(wa.id);
    setWaName(wa.name);
    setWaPhone(wa.phone);
    setWaOrder(wa.order);
    setWaDialogOpen(true);
  };

  const handleWaDelete = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!waDeleteTarget) return;
    setWaDeleting(true);
    try {
      const targetId = waDeleteTarget.id;
      const res = await fetch(`/api/admin/whatsapp?id=${targetId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Success', description: 'WhatsApp admin berhasil dihapus' });
        setWaDeleteTarget(null);
        fetchWhatsAppAdmins();
      } else {
        toast({ title: 'Failed', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Kesalahan jaringan', variant: 'destructive' });
    } finally {
      setWaDeleting(false);
    }
  };

  const resetWaForm = () => {
    setWaEditMode(false);
    setWaEditId('');
    setWaName('');
    setWaPhone('');
    setWaOrder(0);
  };

  const isLocked = (a: AdminInfo) => a.lockedUntil && new Date(a.lockedUntil) > new Date();

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'LOGIN_SUCCESS':
        return <Badge className="bg-cardmerald-400/10 text-emerald-400 border-emerald-400/20 text-[10px]">Login</Badge>;
      case 'LOGIN_FAILED':
        return <Badge className="bg-red-400/10 text-red-400 border-red-400/20 text-[10px]">Gagal</Badge>;
      case 'CHANGE_PASSWORD':
        return <Badge className="bg-blue-400/10 text-blue-400 border-blue-400/20 text-[10px]">Password</Badge>;
      case 'ADD_ADMIN':
        return <Badge className="bg-purple-400/10 text-purple-400 border-purple-400/20 text-[10px]">Admin Baru</Badge>;
      case 'DELETE_ADMIN':
        return <Badge className="bg-red-400/10 text-red-400 border-red-400/20 text-[10px]">Hapus Admin</Badge>;
      case 'UNLOCK_ADMIN':
        return <Badge className="bg-cardmerald-400/10 text-emerald-400 border-emerald-400/20 text-[10px]">Unlock Admin</Badge>;
      default:
        return <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">{action}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="p-3 sm:p-5 lg:p-6 space-y-4">
        <div className="h-10 w-48 bg-foreground/5 rounded-xl animate-pulse" />
        <div className="h-64 bg-foreground/5 rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-5 lg:p-6 pb-4 sm:pb-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gold-gradient">Keamanan & Pengaturan Admin</h1>
        <p className="text-muted-foreground text-sm">Kelola keamanan, akun admin, dan log aktivitas</p>
      </motion.div>

      <Tabs defaultValue="password" className="space-y-6">
        <TabsList className="bg-secondary/60 border border-primary/10 rounded-xl p-1 overflow-x-auto no-scrollbar w-full sm:w-auto">
          <TabsTrigger value="password" className="rounded-lg data-[state=active]:bg-primary/10 data-[state=active]:text-primary text-xs sm:text-sm shrink-0">
            <Key className="w-4 h-4 mr-2" />
            Ganti Password
          </TabsTrigger>
          <TabsTrigger value="admins" className="rounded-lg data-[state=active]:bg-primary/10 data-[state=active]:text-primary text-xs sm:text-sm shrink-0" disabled={!isSuperAdmin}>
            <Users className="w-4 h-4 mr-2" />
            Daftar Admin
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="rounded-lg data-[state=active]:bg-primary/10 data-[state=active]:text-primary text-xs sm:text-sm shrink-0">
            <MessageCircle className="w-4 h-4 mr-2" />
            WhatsApp
          </TabsTrigger>
          <TabsTrigger value="numbers" className="rounded-lg data-[state=active]:bg-primary/10 data-[state=active]:text-primary text-xs sm:text-sm shrink-0">
            <Phone className="w-4 h-4 mr-2" />
            Nomor Penting
          </TabsTrigger>
          <TabsTrigger value="fees" className="rounded-lg data-[state=active]:bg-primary/10 data-[state=active]:text-primary text-xs sm:text-sm shrink-0">
            <DollarSign className="w-4 h-4 mr-2" />
            Fees
          </TabsTrigger>
          <TabsTrigger value="salary" className="rounded-lg data-[state=active]:bg-primary/10 data-[state=active]:text-primary text-xs sm:text-sm shrink-0">
            <Banknote className="w-4 h-4 mr-2" />
            Gaji Mingguan
          </TabsTrigger>
          <TabsTrigger value="logs" className="rounded-lg data-[state=active]:bg-primary/10 data-[state=active]:text-primary text-xs sm:text-sm shrink-0">
            <ScrollText className="w-4 h-4 mr-2" />
            Log Aktivitas
          </TabsTrigger>
          <TabsTrigger value="reset" className="rounded-lg data-[state=active]:bg-red-500/10 data-[state=active]:text-red-500 text-xs sm:text-sm shrink-0" disabled={!isSuperAdmin}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset Data
          </TabsTrigger>
        </TabsList>

        {/* Change Password Tab */}
        <TabsContent value="password">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg">
            <div className="glass glow-gold rounded-2xl p-4 sm:p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Lock className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-foreground font-semibold">Ganti Password</h3>
                  <p className="text-muted-foreground text-xs">Ubah password akun admin Anda</p>
                </div>
              </div>

              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-foreground text-sm">Password Lama</Label>
                  <div className="relative">
                    <Input
                      type={showOldPass ? 'text' : 'password'}
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      placeholder="Masukkan password lama"
                      className="h-11 bg-secondary/60 border-primary/20 rounded-xl pr-10"
                    />
                    <button type="button" onClick={() => setShowOldPass(!showOldPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary">
                      {showOldPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-foreground text-sm">Password Baru</Label>
                  <div className="relative">
                    <Input
                      type={showNewPass ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Masukkan password baru"
                      className="h-11 bg-secondary/60 border-primary/20 rounded-xl pr-10"
                    />
                    <button type="button" onClick={() => setShowNewPass(!showNewPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary">
                      {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {newPassword && newPassword.length < 6 && (
                    <p className="text-yellow-400 text-xs flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Password minimal 6 karakter
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-foreground text-sm">Konfirmasi Password Baru</Label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ulangi password baru"
                    className="h-11 bg-secondary/60 border-primary/20 rounded-xl"
                  />
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-red-400 text-xs flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Password tidak cocok
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={changingPassword || !oldPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
                  className="w-full h-11 bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90 transition-all"
                >
                  {changingPassword ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" />Menyimpan...</>
                  ) : (
                    <><Key className="w-4 h-4 mr-2" />Ubah Password</>
                  )}
                </Button>
              </form>
            </div>
          </motion.div>
        </TabsContent>

        {/* Admin List Tab */}
        <TabsContent value="admins">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            {!isSuperAdmin ? (
              <div className="glass rounded-2xl p-8 text-center">
                <Shield className="w-12 h-12 text-red-400/50 mx-auto mb-3" />
                <p className="text-muted-foreground">Hanya Super Admin yang bisa mengakses fitur ini</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-foreground font-semibold">Daftar Admin ({admins.length})</h3>
                  <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90">
                        <UserPlus className="w-4 h-4 mr-2" />
                        Tambah Admin
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="glass-strong border-primary/20 max-w-md">
                      <DialogHeader>
                        <DialogTitle className="text-gold-gradient">Tambah Admin Baru</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleAddAdmin} className="space-y-4 mt-4">
                        <div className="space-y-2">
                          <Label className="text-sm">Nama Lengkap</Label>
                          <Input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Nama admin" className="h-11 bg-secondary/60 border-primary/20 rounded-xl" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm">Username</Label>
                          <Input value={addUsername} onChange={(e) => setAddUsername(e.target.value)} placeholder="Username login" className="h-11 bg-secondary/60 border-primary/20 rounded-xl" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm">Email</Label>
                          <Input type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="Email admin" className="h-11 bg-secondary/60 border-primary/20 rounded-xl" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm">Password</Label>
                          <Input type="password" value={addPassword} onChange={(e) => setAddPassword(e.target.value)} placeholder="Minimal 6 karakter" className="h-11 bg-secondary/60 border-primary/20 rounded-xl" />
                        </div>
                        <Button type="submit" disabled={addingAdmin} className="w-full h-11 bg-gold-gradient text-primary-foreground font-semibold rounded-xl">
                          {addingAdmin ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
                          Tambah Admin
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>

                <div className="space-y-3">
                  {admins.map((a, i) => (
                    <motion.div
                      key={a.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="glass rounded-2xl p-4 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-gold-gradient flex items-center justify-center text-sm font-bold text-primary-foreground">
                          {a.name.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-foreground font-medium text-sm">{a.name}</p>
                            <Badge className={`${a.role === 'super_admin' ? 'bg-primary/10 text-primary' : 'bg-blue-400/10 text-blue-400'} text-[9px] border-border`}>
                              {a.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                            </Badge>
                          </div>
                          <p className="text-muted-foreground text-xs">{a.username} &bull; {a.email}</p>
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{a.lastLogin ? timeAgo(new Date(a.lastLogin)) : 'Belum login'}</span>
                            {isLocked(a) && (
                              <span className="text-red-400 flex items-center gap-1"><Lock className="w-3 h-3" />Terkunci</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isLocked(a) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUnlockAdmin(a)}
                            className="h-9 sm:h-8 rounded-lg border-emerald-400/30 text-emerald-400 hover:bg-cardmerald-400/10 text-xs gap-1"
                          >
                            <Unlock className="w-3.5 h-3.5" />
                            Unlock
                          </Button>
                        )}
                        {a.id !== admin?.id && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDeleteTarget(a)}
                            className="h-9 sm:h-8 rounded-lg border-red-400/30 text-red-400 hover:bg-red-400/10 text-xs gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Hapus
                          </Button>
                        )}
                        {!isLocked(a) && a.id === admin?.id && (
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Delete Confirmation Dialog */}
                <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
                  <AlertDialogContent className="glass-strong border-red-400/20">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-foreground">Hapus Admin</AlertDialogTitle>
                      <AlertDialogDescription className="text-muted-foreground">
                        Apakah Anda yakin ingin menghapus admin <span className="text-foreground font-medium">{deleteTarget?.name}</span> ({deleteTarget?.username})? Tindakan ini tidak dapat dibatalkan.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="rounded-xl" disabled={deletingAdmin}>Batal</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDeleteAdmin}
                        disabled={deletingAdmin}
                        className="bg-red-500 hover:bg-red-600 text-white rounded-xl" forceMount
                      >
                        {deletingAdmin ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                        Hapus Admin
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </motion.div>
        </TabsContent>

        {/* WhatsApp Admin Tab */}
        <TabsContent value="whatsapp">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-foreground font-semibold">WhatsApp Admin ({waAdmins.length})</h3>
              <Dialog open={waDialogOpen} onOpenChange={(open) => {
                setWaDialogOpen(open);
                if (!open) resetWaForm();
              }}>
                <DialogTrigger asChild>
                  <Button className="bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90">
                    <Plus className="w-4 h-4 mr-2" />
                    Tambah WhatsApp
                  </Button>
                </DialogTrigger>
                <DialogContent className="glass-strong border-primary/20 max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-gold-gradient">{waEditMode ? 'Edit WhatsApp Admin' : 'Tambah WhatsApp Admin'}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleWaSubmit} className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label className="text-sm">Nama</Label>
                      <Input
                        value={waName}
                        onChange={(e) => setWaName(e.target.value)}
                        placeholder="Contoh: CS John, Admin 1"
                        className="h-11 bg-secondary/60 border-primary/20 rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Nomor Telepon</Label>
                      <Input
                        value={waPhone}
                        onChange={(e) => setWaPhone(e.target.value)}
                        placeholder="Contoh: 628123456789"
                        className="h-11 bg-secondary/60 border-primary/20 rounded-xl"
                      />
                      <p className="text-muted-foreground text-[11px]">Gunakan format internasional tanpa + (contoh: 628123456789)</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Urutan</Label>
                      <Input
                        type="number"
                        value={waOrder}
                        onChange={(e) => setWaOrder(parseInt(e.target.value) || 0)}
                        placeholder="0"
                        className="h-11 bg-secondary/60 border-primary/20 rounded-xl"
                      />
                      <p className="text-muted-foreground text-[11px]">Angka lebih kecil ditampilkan lebih dulu</p>
                    </div>
                    <Button type="submit" disabled={waSaving} className="w-full h-11 bg-gold-gradient text-primary-foreground font-semibold rounded-xl">
                      {waSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : waEditMode ? <Pencil className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                      {waEditMode ? 'Simpan Perubahan' : 'Tambah WhatsApp'}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {waLoading ? (
              <div className="glass rounded-2xl p-8 text-center">
                <Loader2 className="w-8 h-8 text-primary mx-auto mb-3 animate-spin" />
                <p className="text-muted-foreground text-sm">Memuat data WhatsApp admin...</p>
              </div>
            ) : waAdmins.length === 0 ? (
              <div className="glass rounded-2xl p-8 text-center">
                <MessageCircle className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">Belum ada WhatsApp admin</p>
                <p className="text-muted-foreground text-xs mt-1">Klik tombol "Tambah WhatsApp" untuk menambahkan nomor</p>
              </div>
            ) : (
              <div className="space-y-3">
                {waAdmins.map((wa, i) => (
                  <motion.div
                    key={wa.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="glass rounded-2xl p-4 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${wa.isActive ? 'bg-cardmerald-400/10' : 'bg-foreground/5'}`}>
                        <Phone className={`w-5 h-5 ${wa.isActive ? 'text-emerald-400' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-foreground font-medium text-sm">{wa.name}</p>
                          <Badge className={`${wa.isActive ? 'bg-cardmerald-400/10 text-emerald-400 border-emerald-400/20' : 'bg-red-400/10 text-red-400 border-red-400/20'} text-[9px]`}>
                            {wa.isActive ? 'Aktif' : 'Nonaktif'}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground text-xs mt-0.5">+{wa.phone}</p>
                        <p className="text-muted-foreground text-[10px] mt-0.5">Urutan: {wa.order}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={wa.isActive}
                        onCheckedChange={() => handleWaToggle(wa)}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleWaEdit(wa)}
                        className="h-9 sm:h-8 rounded-lg border-primary/30 text-primary hover:bg-primary/10 text-xs gap-1"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setWaDeleteTarget(wa)}
                        className="h-9 sm:h-8 rounded-lg border-red-400/30 text-red-400 hover:bg-red-400/10 text-xs gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* WhatsApp Delete Confirmation Dialog */}
            <AlertDialog open={!!waDeleteTarget} onOpenChange={(open) => { if (!open) setWaDeleteTarget(null); }}>
              <AlertDialogContent className="glass-strong border-red-400/20">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-foreground">Hapus WhatsApp Admin</AlertDialogTitle>
                  <AlertDialogDescription className="text-muted-foreground">
                    Apakah Anda yakin ingin menghapus WhatsApp admin <span className="text-foreground font-medium">{waDeleteTarget?.name}</span> (+{waDeleteTarget?.phone})? Tindakan ini tidak dapat dibatalkan.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-xl" disabled={waDeleting}>Batal</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleWaDelete}
                    disabled={waDeleting}
                    className="bg-red-500 hover:bg-red-600 text-white rounded-xl" forceMount
                  >
                    {waDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                    Hapus
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </motion.div>
        </TabsContent>

        {/* Important Numbers Tab */}
        <TabsContent value="numbers">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg">
            <h3 className="text-foreground font-semibold mb-4 flex items-center gap-2">
              <Phone className="w-5 h-5 text-primary" />
              Nomor Penting Admin
            </h3>

            <div className="glass rounded-xl p-5 space-y-5">
              {/* Admin Number */}
              <div className="space-y-2">
                <Label className="text-foreground text-sm font-medium">📱 Nomor Admin (Bot WhatsApp)</Label>
                <p className="text-muted-foreground text-xs">Nomor WhatsApp yang digunakan sebagai bot/admin utama. Digunakan untuk koneksi WhatsApp Bot.</p>
                <Input
                  value={adminNumber}
                  onChange={(e) => setAdminNumber(e.target.value)}
                  placeholder="628xxxxxxxxxx"
                  className="h-12 bg-input/50 border-border/50 rounded-xl text-foreground font-semibold"
                />
                <p className="text-muted-foreground text-[10px]">Format: 628xxxxxxxxxx (tanpa + atau spasi)</p>
              </div>

              {/* Deposit Admin Number */}
              <div className="space-y-2">
                <Label className="text-foreground text-sm font-medium">💰 Nomor Admin Deposit</Label>
                <p className="text-muted-foreground text-xs">Nomor WhatsApp admin yang menerima notifikasi deposit. Jika kosong, menggunakan Nomor Admin.</p>
                <Input
                  value={depositAdminNumber}
                  onChange={(e) => setDepositAdminNumber(e.target.value)}
                  placeholder="628xxxxxxxxxx (kosongkan = sama dengan admin)"
                  className="h-12 bg-input/50 border-border/50 rounded-xl text-foreground font-semibold"
                />
              </div>

              {/* CS Admin Number */}
              <div className="space-y-2">
                <Label className="text-foreground text-sm font-medium">🎧 Nomor CS Admin</Label>
                <p className="text-muted-foreground text-xs">Main Customer Service WhatsApp number. Displayed in bot and help page.</p>
                <Input
                  value={csAdminNumber}
                  onChange={(e) => setCsAdminNumber(e.target.value)}
                  placeholder="628xxxxxxxxxx (kosongkan = sama dengan admin)"
                  className="h-12 bg-input/50 border-border/50 rounded-xl text-foreground font-semibold"
                />
              </div>

              {/* Info Box */}
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
                <p className="text-primary text-xs font-medium mb-1">📌 Informasi:</p>
                <p className="text-muted-foreground text-xs">
                  • Nomor Admin = nomor untuk koneksi WhatsApp Bot (pairing code)
                </p>
                <p className="text-muted-foreground text-xs">
                  • Nomor Admin Deposit = menerima notifikasi deposit baru
                </p>
                <p className="text-muted-foreground text-xs">
                  • Nomor CS Admin = Customer Service utama yang ditampilkan ke user
                </p>
              </div>

              {/* Save Button */}
              <Button
                onClick={async () => {
                  setSavingNumbers(true);
                  try {
                    const updates: Record<string, string> = {};
                    if (adminNumber) updates.bot_admin_number = adminNumber;
                    if (depositAdminNumber) updates.deposit_admin_number = depositAdminNumber;
                    if (csAdminNumber) updates.cs_admin_number = csAdminNumber;
                    
                    const res = await fetch('/api/admin/settings', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
                      body: JSON.stringify(updates),
                    });
                    const data = await res.json();
                    if (data.success) {
                      toast({ title: '✅ Berhasil', description: 'Nomor penting berhasil disimpan' });
                    } else {
                      toast({ title: 'Failed', description: data.error, variant: 'destructive' });
                    }
                  } catch {
                    toast({ title: 'Error', description: 'Kesalahan jaringan', variant: 'destructive' });
                  } finally {
                    setSavingNumbers(false);
                  }
                }}
                disabled={savingNumbers}
                className="w-full h-11 bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90 transition-all"
              >
                {savingNumbers ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" />Menyimpan...</>
                ) : (
                  <><Phone className="w-4 h-4 mr-2" />Simpan Nomor Penting</>
                )}
              </Button>
            </div>
          </motion.div>
        </TabsContent>

        {/* Fees Tab */}
        <TabsContent value="fees">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg">
            <h3 className="text-foreground font-semibold mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary" />
              Fee Configuration
            </h3>

            <div className="glass rounded-xl p-5 space-y-5">
              {/* Deposit Fee */}
              <div className="space-y-2">
                <Label className="text-foreground text-sm font-medium">Deposit Admin Fee</Label>
                <p className="text-muted-foreground text-xs">Biaya admin yang dipotong dari setiap deposit. Nilai dalam Rupiah.</p>
                <div className="relative">
                  <Input
                    type="number"
                    value={depositFee}
                    onChange={(e) => setDepositFee(e.target.value)}
                    placeholder="0"
                    className="h-12 bg-input/50 border-border/50 rounded-xl text-foreground font-semibold pr-12"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">Rp</span>
                </div>
                <p className="text-muted-foreground text-[10px]">
                  Contoh: Deposit Rp100,000 → potongan Rp{depositFee} → saldo user + Rp{100000 - parseInt(depositFee || '0')}
                </p>
              </div>

              {/* Withdraw Fee */}
              <div className="space-y-2">
                <Label className="text-foreground text-sm font-medium">Withdraw Admin Fee (%)</Label>
                <p className="text-muted-foreground text-xs">Persentase yang dipotong dari setiap penarikan. Sisa saldo setelah potongan dikirim ke rekening user.</p>
                <div className="relative">
                  <Input
                    type="number"
                    value={withdrawFee}
                    onChange={(e) => setWithdrawFee(e.target.value)}
                    placeholder="10"
                    className="h-12 bg-input/50 border-border/50 rounded-xl text-foreground font-semibold pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                </div>
                <p className="text-muted-foreground text-[10px]">
                  Contoh: Withdraw Rp100,000 → potongan {withdrawFee}% (Rp{Math.round(100000 * parseInt(withdrawFee || '0') / 100)}) → user terima Rp{Math.round(100000 * (100 - parseInt(withdrawFee || '0')) / 100)}
                </p>
              </div>

              {/* Save Button */}
              <Button
                onClick={async () => {
                  setSavingFees(true);
                  try {
                    const res = await fetch('/api/admin/settings', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
                      body: JSON.stringify({ deposit_fee: depositFee, withdraw_fee: withdrawFee }),
                    });
                    const data = await res.json();
                    if (data.success) {
                      toast({ title: 'Success', description: 'Fee configuration berhasil disimpan' });
                    } else {
                      toast({ title: 'Failed', description: data.error, variant: 'destructive' });
                    }
                  } catch {
                    toast({ title: 'Error', description: 'Kesalahan jaringan', variant: 'destructive' });
                  } finally {
                    setSavingFees(false);
                  }
                }}
                disabled={savingFees}
                className="w-full h-11 bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90 transition-all"
              >
                {savingFees ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" />Menyimpan...</>
                ) : (
                  <><DollarSign className="w-4 h-4 mr-2" />Simpan Fee Configuration</>
                )}
              </Button>
            </div>
          </motion.div>
        </TabsContent>

        {/* Salary Config Tab */}
        <TabsContent value="salary">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg">
            <h3 className="text-foreground font-semibold mb-4 flex items-center gap-2">
              <Banknote className="w-5 h-5 text-primary" />
              Konfigurasi Gaji Mingguan (Bonus Salary)
            </h3>

            <div className="glass rounded-xl p-5 space-y-5">
              {salaryConfig ? (
                <>
                  {/* Min Direct Refs */}
                  <div className="space-y-2">
                    <Label className="text-foreground text-sm font-medium">Minimal Referral Langsung Aktif</Label>
                    <p className="text-muted-foreground text-xs">Jumlah minimal referral langsung (level 1) yang memiliki deposit/investasi aktif</p>
                    <Input
                      type="number"
                      value={salaryConfig.minDirectRefs ?? 10}
                      onChange={(e) => setSalaryConfig({ ...salaryConfig, minDirectRefs: parseInt(e.target.value) || 10 })}
                      className="h-12 bg-input/50 border-border/50 rounded-xl text-foreground font-semibold"
                    />
                  </div>

                  {/* Salary Rate */}
                  <div className="space-y-2">
                    <Label className="text-foreground text-sm font-medium">Rate Gaji per Minggu (%)</Label>
                    <p className="text-muted-foreground text-xs">Persentase dari omzet grup yang dibayarkan setiap minggu (default: 1%)</p>
                    <div className="relative">
                      <Input
                        type="number"
                        step="0.1"
                        value={salaryConfig.salaryRate ?? 1}
                        onChange={(e) => setSalaryConfig({ ...salaryConfig, salaryRate: parseFloat(e.target.value) || 1 })}
                        className="h-12 bg-input/50 border-border/50 rounded-xl text-foreground font-semibold pr-8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                    </div>
                  </div>

                  {/* Max Weeks */}
                  <div className="space-y-2">
                    <Label className="text-foreground text-sm font-medium">Maksimal Minggu</Label>
                    <p className="text-muted-foreground text-xs">
                      Isi <b className="text-primary">0</b> = <b className="text-primary">SELAMANYA</b> (tidak terbatas).
                      Contoh: 12 = total {(salaryConfig.salaryRate ?? 1) * 12}% omzet selama 12 minggu.
                    </p>
                    <Input
                      type="number"
                      value={salaryConfig.maxWeeks ?? 0}
                      onChange={(e) => setSalaryConfig({ ...salaryConfig, maxWeeks: parseInt(e.target.value) || 0 })}
                      className="h-12 bg-input/50 border-border/50 rounded-xl text-foreground font-semibold"
                    />
                  </div>

                  {/* Require Active Deposit */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03]">
                    <div>
                      <Label className="text-foreground text-sm font-medium">Wajib Deposit Aktif</Label>
                      <p className="text-muted-foreground text-xs">Referral harus punya investasi/deposit aktif</p>
                    </div>
                    <Switch
                      checked={salaryConfig.requireActiveDeposit ?? true}
                      onCheckedChange={(checked) => setSalaryConfig({ ...salaryConfig, requireActiveDeposit: checked })}
                    />
                  </div>

                  {/* Active toggle */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03]">
                    <div>
                      <Label className="text-foreground text-sm font-medium">Aktifkan Sistem Gaji</Label>
                      <p className="text-muted-foreground text-xs">Aktifkan/nonaktifkan bonus gaji mingguan</p>
                    </div>
                    <Switch
                      checked={salaryConfig.isActive ?? true}
                      onCheckedChange={(checked) => setSalaryConfig({ ...salaryConfig, isActive: checked })}
                    />
                  </div>

                  {/* Summary */}
                  <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
                    <p className="text-primary text-xs font-medium mb-1">Ringkasan Sistem:</p>
                    <p className="text-muted-foreground text-xs">
                      User WAJIB memiliki deposit aktif sendiri + ≥{salaryConfig.minDirectRefs ?? 10} referral langsung (L1) dengan deposit aktif → sistem otomatis mendeteksi {salaryConfig.salaryRate ?? 1}% omzet grup/minggu selama {(salaryConfig.maxWeeks ?? 0) > 0 ? `${salaryConfig.maxWeeks} minggu (total ${((salaryConfig.salaryRate ?? 1) * (salaryConfig.maxWeeks ?? 0))}% omzet)` : <span className="text-primary font-semibold">SELAMANYA (tidak terbatas)</span>}. Auto-credit setiap Senin 00:00 WIB.
                    </p>
                  </div>

                  <Button
                    onClick={async () => {
                      setSavingSalary(true);
                      try {
                        const res = await fetch('/api/admin/salary-config', {
                          method: 'PUT',
                          headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${adminToken}`,
                          },
                          body: JSON.stringify({
                            minDirectRefs: salaryConfig.minDirectRefs,
                            salaryRate: salaryConfig.salaryRate,
                            maxWeeks: salaryConfig.maxWeeks,
                            requireActiveDeposit: salaryConfig.requireActiveDeposit,
                            isActive: salaryConfig.isActive,
                          }),
                        });
                        const data = await res.json();
                        if (data.success) {
                          toast({ title: 'Success', description: 'Konfigurasi gaji mingguan berhasil disimpan' });
                          setSalaryConfig(data.data);
                        } else {
                          toast({ title: 'Failed', description: data.error || 'Gagal menyimpan konfigurasi', variant: 'destructive' });
                        }
                      } catch {
                        toast({ title: 'Error', description: 'Kesalahan jaringan', variant: 'destructive' });
                      } finally {
                        setSavingSalary(false);
                      }
                    }}
                    disabled={savingSalary}
                    className="w-full h-11 bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90"
                  >
                    {savingSalary ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                    Simpan Konfigurasi Gaji
                  </Button>
                </>
              ) : (
                <div className="text-center py-8">
                  <Loader2 className="w-8 h-8 text-primary mx-auto mb-3 animate-spin" />
                  <p className="text-muted-foreground text-sm">Memuat konfigurasi gaji...</p>
                </div>
              )}
            </div>
          </motion.div>
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-foreground font-semibold">Log Aktivitas Admin ({formatNumber(logs.length)})</h3>
              <Button variant="outline" onClick={fetchData} className="rounded-xl border-primary/20 text-foreground hover:bg-foreground/5 text-xs">
                Refresh
              </Button>
            </div>

            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {logs.map((log, i) => (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className="glass rounded-xl p-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                      {log.admin?.name?.charAt(0) || '?'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-foreground text-xs font-medium">{log.admin?.name || 'Unknown'}</span>
                        {getActionBadge(log.action)}
                      </div>
                      <p className="text-muted-foreground text-[11px] mt-0.5">{log.detail || log.action}</p>
                    </div>
                  </div>
                  <span className="text-muted-foreground text-[10px] shrink-0 ml-3">{timeAgo(new Date(log.createdAt))}</span>
                </motion.div>
              ))}

              {logs.length === 0 && (
                <div className="glass rounded-2xl p-8 text-center">
                  <ScrollText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-muted-foreground text-sm">Belum ada log aktivitas</p>
                </div>
              )}
            </div>
          </motion.div>
        </TabsContent>

        {/* Reset Data Tab */}
        <TabsContent value="reset">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl">
            {!isSuperAdmin ? (
              <div className="glass rounded-2xl p-6 sm:p-8 text-center">
                <Lock className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">Hanya Super Admin yang dapat melakukan factory reset.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Warning header */}
                <div className="glass rounded-2xl p-4 sm:p-6 border border-red-500/20 bg-red-500/5">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
                      <AlertOctagon className="w-6 h-6 text-red-500" />
                    </div>
                    <div>
                      <h3 className="text-foreground font-semibold text-base sm:text-lg">Factory Reset — Hapus Semua Data User</h3>
                      <p className="text-muted-foreground text-xs sm:text-sm mt-1">
                        Tindakan ini akan <span className="text-red-500 font-semibold">menghapus permanen</span> semua akun user,
                        deposit, withdraw, investasi, referral, bonus, dan profit log. Konfigurasi sistem (paket, payment method,
                        admin, banner, testimonial, settings) akan tetap utuh.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Preview willDelete */}
                <div className="glass rounded-2xl p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-foreground font-semibold text-sm flex items-center gap-2">
                      <Trash2 className="w-4 h-4 text-red-500" />
                      Data yang akan dihapus
                    </h4>
                    <Button
                      variant="outline"
                      onClick={fetchResetPreview}
                      disabled={resetLoading}
                      className="rounded-xl border-primary/20 text-foreground hover:bg-foreground/5 text-xs"
                    >
                      {resetLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                      Refresh
                    </Button>
                  </div>
                  {resetLoading ? (
                    <div className="py-8 text-center">
                      <Loader2 className="w-6 h-6 text-muted-foreground/40 animate-spin mx-auto mb-2" />
                      <p className="text-muted-foreground text-xs">Memuat preview data...</p>
                    </div>
                  ) : resetPreview ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {Object.entries(resetPreview.willDelete).map(([key, val]) => (
                        <div key={key} className="rounded-xl bg-red-500/5 border border-red-500/10 p-3">
                          <p className="text-muted-foreground text-[10px] capitalize">{key.replace(/([A-Z])/g, ' $1')}</p>
                          <p className="text-foreground font-bold text-lg">{formatNumber(val)}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-xs">Gagal memuat preview</p>
                  )}
                </div>

                {/* Preview willKeep */}
                <div className="glass rounded-2xl p-4 sm:p-6">
                  <h4 className="text-foreground font-semibold text-sm flex items-center gap-2 mb-3">
                    <Database className="w-4 h-4 text-emerald-500" />
                    Konfigurasi sistem yang tetap utuh
                  </h4>
                  {resetPreview ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {Object.entries(resetPreview.willKeep).map(([key, val]) => (
                        <div key={key} className="rounded-xl bg-emerald-500/5 border border-emerald-500/10 p-3">
                          <p className="text-muted-foreground text-[10px] capitalize">{key.replace(/([A-Z])/g, ' $1')}</p>
                          <p className="text-foreground font-bold text-lg">{formatNumber(val)}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-xs">Gagal memuat preview</p>
                  )}
                </div>

                {/* Action button */}
                <div className="glass rounded-2xl p-4 sm:p-6 border border-red-500/20">
                  <h4 className="text-foreground font-semibold text-sm mb-2">Eksekusi Factory Reset</h4>
                  <p className="text-muted-foreground text-xs mb-4">
                    Klik tombol di bawah, lalu ketik <code className="px-1.5 py-0.5 rounded bg-muted text-red-500 font-mono text-[10px]">RESET ALL USER DATA</code> untuk konfirmasi.
                  </p>
                  <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
                    <button
                      onClick={() => setResetDialogOpen(true)}
                      disabled={resetting}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm transition-colors disabled:opacity-50"
                    >
                      <RotateCcw className="w-4 h-4" />
                      {resetting ? 'Meriset...' : 'Factory Reset Sekarang'}
                    </button>
                    <AlertDialogContent className="max-w-md">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-red-500 flex items-center gap-2">
                          <AlertTriangle className="w-5 h-5" />
                          Konfirmasi Factory Reset
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-left">
                          Tindakan ini <span className="text-red-500 font-semibold">tidak dapat dibatalkan</span>. Semua data user,
                          transaksi, dan bonus akan dihapus permanen. Untuk konfirmasi, ketik teks berikut persis:
                          <br />
                          <code className="block mt-2 px-2 py-1.5 rounded bg-muted text-red-500 font-mono text-[11px] text-center">
                            RESET ALL USER DATA
                          </code>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <Input
                        value={resetConfirmText}
                        onChange={(e) => setResetConfirmText(e.target.value)}
                        placeholder="Ketik RESET ALL USER DATA"
                        className="font-mono text-xs"
                        autoComplete="off"
                      />
                      <AlertDialogFooter>
                        <AlertDialogCancel
                          onClick={() => setResetConfirmText('')}
                          className="rounded-xl"
                        >
                          Batal
                        </AlertDialogCancel>
                        <button
                          onClick={handleFactoryReset}
                          disabled={resetting || resetConfirmText !== 'RESET ALL USER DATA'}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          Ya, Hapus Semua
                        </button>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            )}
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
