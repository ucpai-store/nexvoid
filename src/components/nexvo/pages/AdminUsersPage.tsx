'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Users, Search, Plus, Minus, Ban, CheckCircle2,
  Loader2, ChevronLeft, ChevronRight, Crown, Phone,
  Wallet, AlertTriangle, Pencil, Mail, ShieldCheck, ShieldX, Trash2, Coins,
  Eye, EyeOff, KeyRound, Copy, Calendar, Building2, TrendingUp, Gift, Users as UsersIcon,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { formatRupiah, formatNumber, maskWhatsApp } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

interface User {
  id: string; userId: string; name: string; whatsapp: string; email: string;
  level: string; mainBalance: number; depositBalance: number; profitBalance: number;
  totalDeposit: number; totalProfit: number; totalWithdraw: number;
  isSuspended: boolean; isVerified: boolean; createdAt: string;
  plainPassword?: string | null;
}

interface EditForm { name: string; whatsapp: string; email: string; level: string; }

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [saldoDialog, setSaldoDialog] = useState<{ userId: string; type: 'add' | 'reduce' | 'profit' } | null>(null);
  const [saldoAmount, setSaldoAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [editDialog, setEditDialog] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: '', whatsapp: '', email: '', level: 'Bronze' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);
  const [detailUser, setDetailUser] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resetPwdDialog, setResetPwdDialog] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resettingPwd, setResettingPwd] = useState(false);
  const [revealedPasswords, setRevealedPasswords] = useState<Set<string>>(new Set());
  const [detailPwdRevealed, setDetailPwdRevealed] = useState(false);
  const { adminToken } = useAuthStore();
  const { toast } = useToast();
  const perPage = 10;

  const fetchUsers = async () => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/users?limit=9999', { headers: { Authorization: `Bearer ${adminToken}` } });
      const data = await res.json();
      if (data.success) setUsers(data.data);
    } catch {
      toast({ title: 'Error', description: 'Failed to load data', variant: 'destructive' });
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, [adminToken]);

  const openDetail = async (userId: string) => {
    if (!adminToken) return;
    setDetailLoading(true);
    setDetailUser(null);
    setDetailPwdRevealed(false);
    try {
      const res = await fetch(`/api/admin/users/${userId}/detail`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (data.success) {
        setDetailUser(data.data);
      } else {
        toast({ title: 'Error', description: data.error || 'Gagal memuat detail', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Gagal memuat detail', variant: 'destructive' });
    } finally {
      setDetailLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetPwdDialog || !newPassword || !adminToken) return;
    if (newPassword.length < 6) {
      toast({ title: 'Error', description: 'Password minimal 6 karakter', variant: 'destructive' });
      return;
    }
    setResettingPwd(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id: resetPwdDialog.id, action: 'reset-password', password: newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Berhasil', description: `Password user ${resetPwdDialog.userId} berhasil direset` });
        setResetPwdDialog(null);
        setNewPassword('');
      } else {
        toast({ title: 'Gagal', description: data.error || 'Gagal reset password', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setResettingPwd(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Disalin', description: `${label} disalin ke clipboard` });
  };

  const togglePasswordReveal = (userId: string) => {
    setRevealedPasswords((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const filtered = useMemo(() => {
    if (!search) return users;
    const q = search.toLowerCase();
    return users.filter((u) => u.name.toLowerCase().includes(q) || u.userId.toLowerCase().includes(q) || u.whatsapp.includes(q) || u.email.toLowerCase().includes(q));
  }, [users, search]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  const handleSaldoAction = async () => {
    if (!saldoDialog || !saldoAmount || !adminToken) return;
    const amount = parseFloat(saldoAmount);
    if (isNaN(amount) || amount <= 0) { toast({ title: 'Jumlah tidak valid', variant: 'destructive' }); return; }
    setProcessing(true);
    try {
      // ★ v2.3: type='profit' → kirim isProfit=true biar backend bikin BonusLog + update investment
      const action = saldoDialog.type === 'add' ? 'add-saldo' : saldoDialog.type === 'reduce' ? 'reduce-saldo' : 'add-saldo';
      const payload: Record<string, unknown> = { id: saldoDialog.userId, action, amount };
      if (saldoDialog.type === 'profit') {
        payload.isProfit = true;
        payload.source = 'profit';
      }
      const res = await fetch('/api/admin/users', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        const msg = saldoDialog.type === 'add' ? 'Saldo ditambahkan' : saldoDialog.type === 'reduce' ? 'Saldo dikurangi' : 'Profit manual dikredit (saldo + riwayat + aset updated)';
        toast({ title: msg });
        fetchUsers();
        setSaldoDialog(null); setSaldoAmount('');
      } else { toast({ title: 'Failed', description: data.error, variant: 'destructive' }); }
    } catch { toast({ title: 'Network Error', variant: 'destructive' }); }
    finally { setProcessing(false); }
  };

  const handleSuspend = async (userId: string, isSuspended: boolean) => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id: userId, action: 'suspend' }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: `User ${isSuspended ? 'diaktifkan' : 'disuspend'}` });
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, isSuspended: !isSuspended } : u)));
      } else { toast({ title: 'Failed', description: data.error, variant: 'destructive' }); }
    } catch { toast({ title: 'Network Error', variant: 'destructive' }); }
  };

  const handleVerify = async (userId: string, isVerified: boolean) => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id: userId, action: isVerified ? 'unverify' : 'verify' }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: `User ${isVerified ? 'unverifikasi' : 'verifikasi'}` });
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, isVerified: !isVerified } : u)));
      } else { toast({ title: 'Failed', description: data.error, variant: 'destructive' }); }
    } catch { toast({ title: 'Network Error', variant: 'destructive' }); }
  };

  const openEditDialog = (user: User) => {
    setEditForm({ name: user.name, whatsapp: user.whatsapp, email: user.email, level: user.level });
    setEditDialog(user);
  };

  const handleEditSave = async () => {
    if (!editDialog || !adminToken) return;
    setSavingEdit(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id: editDialog.id, action: 'edit', name: editForm.name, whatsapp: editForm.whatsapp, email: editForm.email, level: editForm.level }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'User updated successfully' });
        setUsers((prev) => prev.map((u) => u.id === editDialog.id ? { ...u, name: editForm.name, whatsapp: editForm.whatsapp, email: editForm.email, level: editForm.level } : u));
        setEditDialog(null);
      } else { toast({ title: 'Update failed', description: data.error, variant: 'destructive' }); }
    } catch { toast({ title: 'Network Error', variant: 'destructive' }); }
    finally { setSavingEdit(false); }
  };

  const handleDeleteUser = async (e?: React.MouseEvent) => {
    // Prevent Radix AlertDialogAction from closing the dialog automatically
    // We need to keep deleteUserId alive until the async operation completes
    if (e) e.preventDefault();
    if (!deleteUserId || !adminToken) return;
    setDeletingUser(true);
    try {
      const currentDeleteId = deleteUserId;
      const res = await fetch('/api/admin/users', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id: currentDeleteId, action: 'delete' }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'User deleted successfully' });
        setUsers((prev) => prev.filter((u) => u.id !== currentDeleteId));
        setDeleteUserId(null);
      } else { toast({ title: 'Delete failed', description: data.error, variant: 'destructive' }); }
    } catch { toast({ title: 'Network Error', variant: 'destructive' }); }
    finally { setDeletingUser(false); }
  };

  return (
    <div className="p-3 sm:p-5 lg:p-6 pb-4 sm:pb-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gold-gradient">Kelola Users</h1>
          <p className="text-muted-foreground text-sm">{filtered.length} pengguna terdaftar</p>
        </div>
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Cari nama, ID, WhatsApp, email..."
            className="pl-10 glass rounded-xl border-primary/20 bg-transparent text-foreground placeholder:text-muted-foreground" />
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="glass rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4">{Array.from({ length: 5 }).map((_, i) => (<Skeleton key={i} className="h-12 w-full rounded-xl" />))}</div>
        ) : (
          <>
            <div className="hidden lg:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-primary/10 hover:bg-transparent">
                    <TableHead className="text-muted-foreground text-xs">ID</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Nama</TableHead>
                    <TableHead className="text-muted-foreground text-xs">WhatsApp</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Email</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Sandi</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Level</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Saldo Utama</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Saldo Deposit</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Total Profit</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Status</TableHead>
                    <TableHead className="text-muted-foreground text-xs text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((user) => (
                    <TableRow key={user.id} className="border-primary/5 hover:bg-white/[0.02]">
                      <TableCell className="text-foreground text-xs font-mono">{user.userId}</TableCell>
                      <TableCell className="text-foreground text-sm font-medium">{user.name || '-'}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{maskWhatsApp(user.whatsapp)}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{user.email}</TableCell>
                      <TableCell className="text-foreground text-xs">
                        <div className="flex items-center gap-1">
                          {user.plainPassword ? (
                            <>
                              <span className="font-mono text-[11px] max-w-[120px] truncate">
                                {revealedPasswords.has(user.id) ? user.plainPassword : '•••••••'}
                              </span>
                              <button
                                onClick={() => togglePasswordReveal(user.id)}
                                className="w-6 h-6 rounded-md bg-foreground/5 flex items-center justify-center hover:bg-foreground/10 transition-colors shrink-0"
                                title={revealedPasswords.has(user.id) ? 'Sembunyikan' : 'Lihat Sandi'}
                              >
                                {revealedPasswords.has(user.id)
                                  ? <EyeOff className="w-3 h-3 text-muted-foreground" />
                                  : <Eye className="w-3 h-3 text-primary" />}
                              </button>
                              <button
                                onClick={() => copyToClipboard(user.plainPassword!, 'Sandi')}
                                className="w-6 h-6 rounded-md bg-foreground/5 flex items-center justify-center hover:bg-foreground/10 transition-colors shrink-0"
                                title="Salin Sandi"
                              >
                                <Copy className="w-3 h-3 text-muted-foreground" />
                              </button>
                            </>
                          ) : (
                            <span className="text-yellow-400/70 text-[10px] italic">legacy (reset dulu)</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${user.level === 'Gold' ? 'bg-primary/10 text-primary' : user.level === 'Platinum' ? 'bg-purple-400/10 text-purple-400' : 'bg-gray-400/10 text-muted-foreground'} border-border`}>
                          <Crown className="w-3 h-3 mr-1" />{user.level}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-foreground text-sm">{formatRupiah(user.mainBalance)}</TableCell>
                      <TableCell className="text-blue-400 text-sm">{formatRupiah(user.depositBalance || 0)}</TableCell>
                      <TableCell className="text-emerald-400 text-sm">{formatRupiah(user.totalProfit || 0)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Badge className={`text-[10px] ${user.isSuspended ? 'bg-red-500/10 text-red-400' : 'bg-cardmerald-500/10 text-emerald-400'} border-border`}>
                            {user.isSuspended ? 'Suspended' : 'Aktif'}
                          </Badge>
                          {!user.isVerified && <Badge className="bg-yellow-500/10 text-yellow-400 text-[9px] border-border">Unverified</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openDetail(user.id)} className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center hover:bg-blue-500/20 transition-colors" title="Lihat Detail Lengkap">
                            <Eye className="w-3.5 h-3.5 text-blue-400" />
                          </button>
                          <button onClick={() => openEditDialog(user)} className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors" title="Edit User">
                            <Pencil className="w-3.5 h-3.5 text-primary" />
                          </button>
                          <button onClick={() => setSaldoDialog({ userId: user.id, type: 'add' })} className="w-8 h-8 rounded-lg bg-cardmerald-500/10 flex items-center justify-center hover:bg-cardmerald-500/20 transition-colors" title="Tambah Saldo">
                            <Plus className="w-3.5 h-3.5 text-emerald-400" />
                          </button>
                          <button onClick={() => setSaldoDialog({ userId: user.id, type: 'profit' })} className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center hover:bg-yellow-500/20 transition-colors" title="Tambah Profit Manual (saldo + riwayat + aset)">
                            <Coins className="w-3.5 h-3.5 text-yellow-400" />
                          </button>
                          <button onClick={() => setSaldoDialog({ userId: user.id, type: 'reduce' })} className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center hover:bg-orange-500/20 transition-colors" title="Kurangi Saldo">
                            <Minus className="w-3.5 h-3.5 text-orange-400" />
                          </button>
                          <button onClick={() => setResetPwdDialog(user)} className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center hover:bg-purple-500/20 transition-colors" title="Reset Password">
                            <KeyRound className="w-3.5 h-3.5 text-purple-400" />
                          </button>
                          <button onClick={() => handleVerify(user.id, user.isVerified)} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                            style={{ backgroundColor: user.isVerified ? 'rgba(234,179,8,0.1)' : 'rgba(16,185,129,0.1)' }} title={user.isVerified ? 'Unverify' : 'Verify'}>
                            {user.isVerified ? <ShieldX className="w-3.5 h-3.5 text-yellow-400" /> : <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />}
                          </button>
                          <button onClick={() => handleSuspend(user.id, user.isSuspended)} className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center hover:bg-red-500/20 transition-colors" title={user.isSuspended ? 'Aktifkan' : 'Suspend'}>
                            <Ban className="w-3.5 h-3.5 text-red-400" />
                          </button>
                          <button onClick={() => setDeleteUserId(user.id)} className="w-8 h-8 rounded-lg bg-red-900/10 flex items-center justify-center hover:bg-red-900/20 transition-colors" title="Hapus User">
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="lg:hidden space-y-3 p-4">
              {paged.map((user) => (
                <div key={user.id} className="glass rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-foreground font-medium text-sm">{user.name || '-'}</p>
                      <p className="text-muted-foreground text-xs font-mono">{user.userId}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge className={`text-[10px] ${user.isSuspended ? 'bg-red-500/10 text-red-400' : 'bg-cardmerald-500/10 text-emerald-400'} border-border`}>
                        {user.isSuspended ? 'Suspend' : 'Aktif'}
                      </Badge>
                      {!user.isVerified && <Badge className="bg-yellow-500/10 text-yellow-400 text-[9px] border-border">Unverified</Badge>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                    <div><span className="text-muted-foreground">WhatsApp</span><p className="text-foreground">{maskWhatsApp(user.whatsapp)}</p></div>
                    <div><span className="text-muted-foreground">Email</span><p className="text-foreground truncate">{user.email}</p></div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Sandi</span>
                      {user.plainPassword ? (
                        <div className="flex items-center gap-2 mt-0.5">
                          <code className="text-foreground font-mono text-[11px] bg-foreground/5 px-2 py-1 rounded-md flex-1 break-all">
                            {revealedPasswords.has(user.id) ? user.plainPassword : '••••••••••'}
                          </code>
                          <button onClick={() => togglePasswordReveal(user.id)} className="w-7 h-7 rounded-md bg-foreground/5 flex items-center justify-center hover:bg-foreground/10 transition-colors shrink-0" title={revealedPasswords.has(user.id) ? 'Sembunyikan' : 'Lihat Sandi'}>
                            {revealedPasswords.has(user.id) ? <EyeOff className="w-3.5 h-3.5 text-muted-foreground" /> : <Eye className="w-3.5 h-3.5 text-primary" />}
                          </button>
                          <button onClick={() => copyToClipboard(user.plainPassword!, 'Sandi')} className="w-7 h-7 rounded-md bg-foreground/5 flex items-center justify-center hover:bg-foreground/10 transition-colors shrink-0" title="Salin Sandi">
                            <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        </div>
                      ) : (
                        <p className="text-yellow-400/70 text-[10px] italic mt-0.5">legacy (reset dulu untuk lihat)</p>
                      )}
                    </div>
                    <div><span className="text-muted-foreground">Level</span><p className="text-primary">{user.level}</p></div>
                    <div><span className="text-muted-foreground">Saldo Utama</span><p className="text-foreground">{formatRupiah(user.mainBalance)}</p></div>
                    <div><span className="text-muted-foreground">Saldo Deposit</span><p className="text-blue-400">{formatRupiah(user.depositBalance || 0)}</p></div>
                    <div><span className="text-muted-foreground">Total Profit</span><p className="text-emerald-400">{formatRupiah(user.totalProfit || 0)}</p></div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => openDetail(user.id)} className="rounded-xl border-blue-500/20 text-blue-400 hover:bg-blue-500/10 h-8 text-xs">
                      <Eye className="w-3 h-3 mr-1" /> Detail
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openEditDialog(user)} className="rounded-xl border-primary/20 text-primary hover:bg-primary/5 h-8 text-xs">
                      <Pencil className="w-3 h-3 mr-1" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setSaldoDialog({ userId: user.id, type: 'add' })} className="rounded-xl border-emerald-500/20 text-emerald-400 hover:bg-cardmerald-500/10 h-8 text-xs">
                      <Plus className="w-3 h-3 mr-1" /> Saldo
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setSaldoDialog({ userId: user.id, type: 'reduce' })} className="rounded-xl border-orange-500/20 text-orange-400 hover:bg-orange-500/10 h-8 text-xs">
                      <Minus className="w-3 h-3 mr-1" /> Saldo
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setResetPwdDialog(user)} className="rounded-xl border-purple-500/20 text-purple-400 hover:bg-purple-500/10 h-8 text-xs">
                      <KeyRound className="w-3 h-3 mr-1" /> Password
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleVerify(user.id, user.isVerified)} className={`rounded-xl h-8 text-xs ${user.isVerified ? 'border-yellow-500/20 text-yellow-400' : 'border-emerald-500/20 text-emerald-400'}`}>
                      {user.isVerified ? <><ShieldX className="w-3 h-3 mr-1" />Unv</> : <><ShieldCheck className="w-3 h-3 mr-1" />Ver</>}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleSuspend(user.id, user.isSuspended)} className="rounded-xl border-red-500/20 text-red-400 hover:bg-red-500/10 h-8 text-xs px-2">
                      <Ban className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDeleteUserId(user.id)} className="rounded-xl border-red-900/20 text-red-500 hover:bg-red-900/10 h-8 text-xs px-2">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-primary/10">
                <p className="text-muted-foreground text-xs">Halaman {page} dari {totalPages}</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="w-8 h-8 rounded-lg glass flex items-center justify-center disabled:opacity-30 hover:bg-foreground/5"><ChevronLeft className="w-4 h-4" /></button>
                  <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="w-8 h-8 rounded-lg glass flex items-center justify-center disabled:opacity-30 hover:bg-foreground/5"><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
            )}
          </>
        )}
      </motion.div>

      {/* Edit User Dialog */}
      <Dialog open={!!editDialog} onOpenChange={(open) => { if (!open) setEditDialog(null); }}>
        <DialogContent className="glass-strong border-primary/20 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-gold-gradient flex items-center gap-2"><Pencil className="w-4 h-4" />Edit User</DialogTitle>
            <DialogDescription className="text-muted-foreground">Edit informasi user <span className="text-foreground font-medium">{editDialog?.userId}</span></DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label className="text-muted-foreground text-xs">Nama</Label><Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nama user" className="glass rounded-xl border-primary/20 bg-transparent text-foreground mt-1" /></div>
            <div><Label className="text-muted-foreground text-xs">Nomor WhatsApp</Label><div className="relative mt-1"><Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input value={editForm.whatsapp} onChange={(e) => setEditForm((f) => ({ ...f, whatsapp: e.target.value }))} placeholder="628123456789" className="pl-10 glass rounded-xl border-primary/20 bg-transparent text-foreground" /></div></div>
            <div><Label className="text-muted-foreground text-xs">Email</Label><div className="relative mt-1"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} placeholder="user@email.com" className="pl-10 glass rounded-xl border-primary/20 bg-transparent text-foreground" /></div></div>
            <div><Label className="text-muted-foreground text-xs">Level</Label>
              <Select value={editForm.level} onValueChange={(value) => setEditForm((f) => ({ ...f, level: value }))}>
                <SelectTrigger className="glass rounded-xl border-primary/20 bg-transparent text-foreground mt-1"><SelectValue placeholder="Pilih Level" /></SelectTrigger>
                <SelectContent className="glass-strong border-primary/20">
                  <SelectItem value="Bronze">🥉 Bronze</SelectItem>
                  <SelectItem value="Silver">🥈 Silver</SelectItem>
                  <SelectItem value="Gold">🥇 Gold</SelectItem>
                  <SelectItem value="Platinum">💎 Platinum</SelectItem>
                  <SelectItem value="Diamond">💠 Diamond</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditDialog(null)} disabled={savingEdit} className="rounded-xl border-primary/20 text-foreground">Batal</Button>
            <Button onClick={handleEditSave} disabled={savingEdit} className="bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90">
              {savingEdit ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Pencil className="w-4 h-4 mr-2" />}Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Saldo Dialog */}
      <Dialog open={!!saldoDialog} onOpenChange={(open) => { if (!open) { setSaldoDialog(null); setSaldoAmount(''); } }}>
        <DialogContent className="glass-strong border-primary/20 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-gold-gradient">
              {saldoDialog?.type === 'add' ? 'Tambah Saldo' : saldoDialog?.type === 'reduce' ? 'Kurangi Saldo' : 'Tambah Profit Manual'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {saldoDialog?.type === 'profit'
                ? 'Kredit profit ke user. Saldo + Riwayat + Aset + Total Profit semua ter-update. Anti double-credit (cron gak akan re-credit).'
                : `Masukkan jumlah saldo yang ingin ${saldoDialog?.type === 'add' ? 'ditambahkan' : 'dikurangi'}`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label className="text-muted-foreground text-xs mb-2 block">Jumlah (Rp)</Label>
            <Input type="number" value={saldoAmount} onChange={(e) => setSaldoAmount(e.target.value)} placeholder="Masukkan jumlah..." className="glass rounded-xl border-primary/20 bg-transparent text-foreground" />
            {saldoAmount && parseFloat(saldoAmount) > 0 && (<p className="text-foreground text-sm mt-2">= {formatRupiah(parseFloat(saldoAmount))}</p>)}
            {saldoDialog?.type === 'profit' && (
              <p className="text-yellow-400/80 text-[11px] mt-2 leading-relaxed">
                ⚠️ Ini akan: +saldo, +total profit, +riwayat profit, +aset total profit, update lastProfitDate (anti cron double-credit).
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setSaldoDialog(null); setSaldoAmount(''); }} disabled={processing} className="rounded-xl border-primary/20 text-foreground">Batal</Button>
            <Button onClick={handleSaldoAction} disabled={processing || !saldoAmount} className={`rounded-xl font-semibold ${saldoDialog?.type === 'add' ? 'bg-cardmerald-600 hover:bg-cardmerald-700 text-white' : saldoDialog?.type === 'profit' ? 'bg-yellow-600 hover:bg-yellow-700 text-white' : 'bg-orange-600 hover:bg-orange-700 text-white'}`}>
              {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : saldoDialog?.type === 'add' ? 'Tambah' : saldoDialog?.type === 'profit' ? 'Kredit Profit' : 'Kurangi'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail User Dialog - Full data lengkap */}
      <Dialog open={!!detailUser || detailLoading} onOpenChange={(open) => { if (!open) { setDetailUser(null); setDetailLoading(false); setDetailPwdRevealed(false); } }}>
        <DialogContent className="glass-strong border-primary/20 max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-gold-gradient flex items-center gap-2">
              <Eye className="w-4 h-4" /> Detail Lengkap User
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Semua data & riwayat transaksi user
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : detailUser ? (
            <div className="space-y-4 py-2">
              {/* Akun Info */}
              <div className="glass rounded-xl p-4 border border-primary/10">
                <h3 className="text-foreground text-sm font-semibold mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" /> Informasi Akun
                </h3>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">User ID</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      <p className="text-foreground font-mono font-medium">{detailUser.userId}</p>
                      <button onClick={() => copyToClipboard(detailUser.userId, 'User ID')} className="text-muted-foreground hover:text-primary"><Copy className="w-3 h-3" /></button>
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Referral Code</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      <p className="text-foreground font-mono font-medium">{detailUser.referralCode}</p>
                      <button onClick={() => copyToClipboard(detailUser.referralCode, 'Referral Code')} className="text-muted-foreground hover:text-primary"><Copy className="w-3 h-3" /></button>
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Nama</span>
                    <p className="text-foreground font-medium mt-0.5">{detailUser.name || '-'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Email</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      <p className="text-foreground font-medium truncate">{detailUser.email}</p>
                      <button onClick={() => copyToClipboard(detailUser.email, 'Email')} className="text-muted-foreground hover:text-primary shrink-0"><Copy className="w-3 h-3" /></button>
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">WhatsApp</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      <p className="text-foreground font-medium">{detailUser.whatsapp}</p>
                      <button onClick={() => copyToClipboard(detailUser.whatsapp, 'WhatsApp')} className="text-muted-foreground hover:text-primary"><Copy className="w-3 h-3" /></button>
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Level</span>
                    <p className="text-primary font-medium mt-0.5">{detailUser.level}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Badge className={`text-[10px] ${detailUser.isSuspended ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'} border-border`}>
                        {detailUser.isSuspended ? 'Suspended' : 'Aktif'}
                      </Badge>
                      {detailUser.isVerified ? (
                        <Badge className="bg-emerald-500/10 text-emerald-400 text-[9px] border-border">Verified</Badge>
                      ) : (
                        <Badge className="bg-yellow-500/10 text-yellow-400 text-[9px] border-border">Unverified</Badge>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Sandi (Password)</span>
                    {detailUser.plainPassword ? (
                      <div className="flex items-center gap-2 mt-0.5">
                        <code className="text-foreground font-mono text-xs bg-foreground/5 px-2 py-1 rounded-md flex-1 break-all">
                          {detailPwdRevealed ? detailUser.plainPassword : '••••••••••••'}
                        </code>
                        <button
                          onClick={() => setDetailPwdRevealed((v) => !v)}
                          className="w-7 h-7 rounded-md bg-foreground/5 flex items-center justify-center hover:bg-foreground/10 transition-colors shrink-0"
                          title={detailPwdRevealed ? 'Sembunyikan' : 'Lihat Sandi'}
                        >
                          {detailPwdRevealed
                            ? <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
                            : <Eye className="w-3.5 h-3.5 text-primary" />}
                        </button>
                        <button
                          onClick={() => copyToClipboard(detailUser.plainPassword, 'Sandi')}
                          className="w-7 h-7 rounded-md bg-foreground/5 flex items-center justify-center hover:bg-foreground/10 transition-colors shrink-0"
                          title="Salin Sandi"
                        >
                          <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      </div>
                    ) : (
                      <p className="text-yellow-400/70 font-mono text-[11px] mt-0.5 italic">
                        Belum tersedia sandi plaintext untuk user lama. Klik "Reset Password" untuk set sandi baru yang bisa dilihat admin.
                      </p>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Direkrut Oleh</span>
                    <p className="text-foreground font-medium mt-0.5">
                      {detailUser.referrer ? `${detailUser.referrer.userId} (${detailUser.referrer.name || '-'})` : 'Tidak ada (langsung daftar)'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Terdaftar</span>
                    <p className="text-foreground mt-0.5 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-muted-foreground" />
                      {new Date(detailUser.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' })} WIB
                    </p>
                  </div>
                </div>
              </div>

              {/* Saldo */}
              <div className="glass rounded-xl p-4 border border-primary/10">
                <h3 className="text-foreground text-sm font-semibold mb-3 flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-primary" /> Saldo & Statistik
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-foreground/5 rounded-lg p-3">
                    <p className="text-muted-foreground text-[10px] uppercase">Saldo Utama</p>
                    <p className="text-foreground text-lg font-bold">{formatRupiah(detailUser.mainBalance)}</p>
                  </div>
                  <div className="bg-foreground/5 rounded-lg p-3">
                    <p className="text-muted-foreground text-[10px] uppercase">Saldo Deposit</p>
                    <p className="text-blue-400 text-lg font-bold">{formatRupiah(detailUser.depositBalance)}</p>
                  </div>
                  <div className="bg-foreground/5 rounded-lg p-3">
                    <p className="text-muted-foreground text-[10px] uppercase">Saldo Profit</p>
                    <p className="text-emerald-400 text-lg font-bold">{formatRupiah(detailUser.profitBalance)}</p>
                  </div>
                  <div className="bg-foreground/5 rounded-lg p-3">
                    <p className="text-muted-foreground text-[10px] uppercase">Total Deposit</p>
                    <p className="text-blue-400 font-bold">{formatRupiah(detailUser.totalDeposit)}</p>
                  </div>
                  <div className="bg-foreground/5 rounded-lg p-3">
                    <p className="text-muted-foreground text-[10px] uppercase">Total Withdraw</p>
                    <p className="text-orange-400 font-bold">{formatRupiah(detailUser.totalWithdraw)}</p>
                  </div>
                  <div className="bg-foreground/5 rounded-lg p-3">
                    <p className="text-muted-foreground text-[10px] uppercase">Total Profit</p>
                    <p className="text-emerald-400 font-bold">{formatRupiah(detailUser.totalProfit)}</p>
                  </div>
                </div>
              </div>

              {/* Rekening Bank */}
              <div className="glass rounded-xl p-4 border border-primary/10">
                <h3 className="text-foreground text-sm font-semibold mb-3 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-primary" /> Rekening Bank ({detailUser.banks?.length || 0})
                </h3>
                {detailUser.banks?.length > 0 ? (
                  <div className="space-y-2">
                    {detailUser.banks.map((bank: any) => (
                      <div key={bank.id} className="bg-foreground/5 rounded-lg p-2 text-xs flex items-center justify-between">
                        <div>
                          <p className="text-foreground font-medium">{bank.bankName} - {bank.accountNo}</p>
                          <p className="text-muted-foreground">{bank.holderName}</p>
                        </div>
                        {bank.isPrimary && <Badge className="bg-primary/10 text-primary text-[9px] border-border">Utama</Badge>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs italic">Belum ada rekening bank</p>
                )}
              </div>

              {/* Deposit */}
              <div className="glass rounded-xl p-4 border border-primary/10">
                <h3 className="text-foreground text-sm font-semibold mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" /> Deposit ({detailUser._counts?.deposits || 0})
                </h3>
                {detailUser.deposits?.length > 0 ? (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {detailUser.deposits.map((dep: any) => (
                      <div key={dep.id} className="bg-foreground/5 rounded-lg p-2 text-xs flex items-center justify-between">
                        <div>
                          <p className="text-foreground font-medium">{formatRupiah(dep.amount)} - {dep.method}</p>
                          <p className="text-muted-foreground text-[10px]">{new Date(dep.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'short', timeStyle: 'short' })} WIB</p>
                        </div>
                        <Badge className={`text-[9px] ${dep.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400' : dep.status === 'pending' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-red-500/10 text-red-400'} border-border`}>
                          {dep.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs italic">Belum ada deposit</p>
                )}
              </div>

              {/* Withdrawal */}
              <div className="glass rounded-xl p-4 border border-primary/10">
                <h3 className="text-foreground text-sm font-semibold mb-3 flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-primary" /> Withdrawal ({detailUser._counts?.withdrawals || 0})
                </h3>
                {detailUser.withdrawals?.length > 0 ? (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {detailUser.withdrawals.map((wd: any) => (
                      <div key={wd.id} className="bg-foreground/5 rounded-lg p-2 text-xs flex items-center justify-between">
                        <div>
                          <p className="text-foreground font-medium">{formatRupiah(wd.amount)} - {wd.bankName} ({wd.accountNo})</p>
                          <p className="text-muted-foreground text-[10px]">{wd.withdrawalId} • {new Date(wd.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'short', timeStyle: 'short' })} WIB</p>
                        </div>
                        <Badge className={`text-[9px] ${wd.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400' : wd.status === 'pending' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-red-500/10 text-red-400'} border-border`}>
                          {wd.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs italic">Belum ada withdrawal</p>
                )}
              </div>

              {/* Bonus Logs */}
              <div className="glass rounded-xl p-4 border border-primary/10">
                <h3 className="text-foreground text-sm font-semibold mb-3 flex items-center gap-2">
                  <Gift className="w-4 h-4 text-primary" /> Riwayat Bonus ({detailUser._counts?.bonusLogs || 0})
                </h3>
                {detailUser.bonusLogs?.length > 0 ? (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {detailUser.bonusLogs.map((bl: any) => (
                      <div key={bl.id} className="bg-foreground/5 rounded-lg p-2 text-xs">
                        <div className="flex items-center justify-between">
                          <p className="text-foreground font-medium">{formatRupiah(bl.amount)} - <span className="capitalize">{bl.type}</span></p>
                          <p className="text-muted-foreground text-[10px]">{new Date(bl.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'short', timeStyle: 'short' })} WIB</p>
                        </div>
                        {bl.description && <p className="text-muted-foreground text-[10px] mt-0.5">{bl.description}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs italic">Belum ada riwayat bonus</p>
                )}
              </div>

              {/* Investasi & Produk */}
              <div className="glass rounded-xl p-4 border border-primary/10">
                <h3 className="text-foreground text-sm font-semibold mb-3 flex items-center gap-2">
                  <Coins className="w-4 h-4 text-primary" /> Investasi ({detailUser._counts?.investments || 0}) & Produk ({detailUser._counts?.purchases || 0})
                </h3>
                {detailUser.investments?.length > 0 ? (
                  <div className="space-y-1.5 mb-3">
                    {detailUser.investments.map((inv: any) => (
                      <div key={inv.id} className="bg-foreground/5 rounded-lg p-2 text-xs flex items-center justify-between">
                        <div>
                          <p className="text-foreground font-medium">{inv.package?.name || 'Package'} - {formatRupiah(inv.amount)}</p>
                          <p className="text-muted-foreground text-[10px]">Profit earned: {formatRupiah(inv.totalProfitEarned || 0)} • {new Date(inv.createdAt).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' })}</p>
                        </div>
                        <Badge className={`text-[9px] ${inv.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-muted-500/10 text-muted-foreground'} border-border`}>
                          {inv.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs italic mb-3">Belum ada investasi</p>
                )}
              </div>

              {/* Referral Network */}
              <div className="glass rounded-xl p-4 border border-primary/10">
                <h3 className="text-foreground text-sm font-semibold mb-3 flex items-center gap-2">
                  <UsersIcon className="w-4 h-4 text-primary" /> Jaringan Referral ({detailUser._counts?.referrals || 0})
                </h3>
                {detailUser.referralsFrom?.length > 0 ? (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {detailUser.referralsFrom.map((ref: any) => (
                      <div key={ref.id} className="bg-foreground/5 rounded-lg p-2 text-xs flex items-center justify-between">
                        <div>
                          <p className="text-foreground font-medium">{ref.referred?.userId} - {ref.referred?.name || '-'}</p>
                          <p className="text-muted-foreground text-[10px]">{ref.referred?.whatsapp}</p>
                        </div>
                        <p className="text-muted-foreground text-[10px]">{new Date(ref.createdAt).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' })}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs italic">Belum ada referral</p>
                )}
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDetailUser(null); setDetailLoading(false); }} className="rounded-xl border-primary/20 text-foreground">
              Tutup
            </Button>
            {detailUser && (
              <Button onClick={() => { setResetPwdDialog(detailUser); setDetailUser(null); }} className="rounded-xl bg-purple-600 hover:bg-purple-700 text-white">
                <KeyRound className="w-4 h-4 mr-2" /> Reset Password
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetPwdDialog} onOpenChange={(open) => { if (!open) { setResetPwdDialog(null); setNewPassword(''); } }}>
        <DialogContent className="glass-strong border-primary/20 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-gold-gradient flex items-center gap-2">
              <KeyRound className="w-4 h-4" /> Reset Password User
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Set password baru untuk user <span className="text-foreground font-medium">{resetPwdDialog?.userId}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div>
              <Label className="text-muted-foreground text-xs mb-2 block">Password Baru (min. 6 karakter)</Label>
              <Input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Masukkan password baru..."
                className="glass rounded-xl border-primary/20 bg-transparent text-foreground"
              />
              <p className="text-yellow-400/80 text-[11px] mt-2 leading-relaxed">
                ⚠️ Password lama akan ditimpa. User harus login dengan password baru ini.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setResetPwdDialog(null); setNewPassword(''); }} disabled={resettingPwd} className="rounded-xl border-primary/20 text-foreground">
              Batal
            </Button>
            <Button onClick={handleResetPassword} disabled={resettingPwd || newPassword.length < 6} className="rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold">
              {resettingPwd ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <AlertDialog open={!!deleteUserId} onOpenChange={(open) => { if (!open) setDeleteUserId(null); }}>
        <AlertDialogContent className="glass-strong border-primary/20">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" /> Hapus User
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Tindakan ini tidak dapat dibatalkan. User dan semua data terkait (deposit, withdraw, investasi, referral) akan dihapus permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl border-primary/20 text-foreground" disabled={deletingUser}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} disabled={deletingUser} className="rounded-xl bg-red-600 hover:bg-red-700 text-white" forceMount>
              {deletingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

