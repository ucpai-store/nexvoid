'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Users, Search, Plus, Minus, Ban, CheckCircle2,
  Loader2, ChevronLeft, ChevronRight, Crown, Phone,
  Wallet, AlertTriangle, Pencil, Mail, ShieldCheck, ShieldX, Trash2,
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
}

interface EditForm { name: string; whatsapp: string; email: string; level: string; }

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [saldoDialog, setSaldoDialog] = useState<{ userId: string; type: 'add' | 'reduce' } | null>(null);
  const [saldoAmount, setSaldoAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [editDialog, setEditDialog] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: '', whatsapp: '', email: '', level: 'Bronze' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);
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
      toast({ title: 'Error', description: 'Gagal memuat data', variant: 'destructive' });
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, [adminToken]);

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
      const action = saldoDialog.type === 'add' ? 'add-saldo' : 'reduce-saldo';
      const res = await fetch('/api/admin/users', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id: saldoDialog.userId, action, amount }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: `Saldo berhasil ${saldoDialog.type === 'add' ? 'ditambah' : 'dikurangi'}` });
        fetchUsers();
        setSaldoDialog(null); setSaldoAmount('');
      } else { toast({ title: 'Gagal', description: data.error, variant: 'destructive' }); }
    } catch { toast({ title: 'Kesalahan Jaringan', variant: 'destructive' }); }
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
      } else { toast({ title: 'Gagal', description: data.error, variant: 'destructive' }); }
    } catch { toast({ title: 'Kesalahan Jaringan', variant: 'destructive' }); }
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
      } else { toast({ title: 'Gagal', description: data.error, variant: 'destructive' }); }
    } catch { toast({ title: 'Kesalahan Jaringan', variant: 'destructive' }); }
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
        toast({ title: 'User berhasil diperbarui' });
        setUsers((prev) => prev.map((u) => u.id === editDialog.id ? { ...u, name: editForm.name, whatsapp: editForm.whatsapp, email: editForm.email, level: editForm.level } : u));
        setEditDialog(null);
      } else { toast({ title: 'Gagal memperbarui', description: data.error, variant: 'destructive' }); }
    } catch { toast({ title: 'Kesalahan Jaringan', variant: 'destructive' }); }
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
        toast({ title: 'User berhasil dihapus' });
        setUsers((prev) => prev.filter((u) => u.id !== currentDeleteId));
        setDeleteUserId(null);
      } else { toast({ title: 'Gagal menghapus', description: data.error, variant: 'destructive' }); }
    } catch { toast({ title: 'Kesalahan Jaringan', variant: 'destructive' }); }
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
            className="pl-10 glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground placeholder:text-muted-foreground" />
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
                  <TableRow className="border-[#D4AF37]/10 hover:bg-transparent">
                    <TableHead className="text-muted-foreground text-xs">ID</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Nama</TableHead>
                    <TableHead className="text-muted-foreground text-xs">WhatsApp</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Email</TableHead>
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
                    <TableRow key={user.id} className="border-[#D4AF37]/5 hover:bg-white/[0.02]">
                      <TableCell className="text-foreground text-xs font-mono">{user.userId}</TableCell>
                      <TableCell className="text-foreground text-sm font-medium">{user.name || '-'}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{maskWhatsApp(user.whatsapp)}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{user.email}</TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${user.level === 'Gold' ? 'bg-[#D4AF37]/10 text-[#D4AF37]' : user.level === 'Platinum' ? 'bg-purple-400/10 text-purple-400' : 'bg-gray-400/10 text-gray-400'} border-0`}>
                          <Crown className="w-3 h-3 mr-1" />{user.level}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-foreground text-sm">{formatRupiah(user.mainBalance)}</TableCell>
                      <TableCell className="text-blue-400 text-sm">{formatRupiah(user.depositBalance || 0)}</TableCell>
                      <TableCell className="text-emerald-400 text-sm">{formatRupiah(user.totalProfit || 0)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Badge className={`text-[10px] ${user.isSuspended ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'} border-0`}>
                            {user.isSuspended ? 'Suspended' : 'Aktif'}
                          </Badge>
                          {!user.isVerified && <Badge className="bg-yellow-500/10 text-yellow-400 text-[9px] border-0">Unverified</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEditDialog(user)} className="w-8 h-8 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center hover:bg-[#D4AF37]/20 transition-colors" title="Edit User">
                            <Pencil className="w-3.5 h-3.5 text-[#D4AF37]" />
                          </button>
                          <button onClick={() => setSaldoDialog({ userId: user.id, type: 'add' })} className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center hover:bg-emerald-500/20 transition-colors" title="Tambah Saldo">
                            <Plus className="w-3.5 h-3.5 text-emerald-400" />
                          </button>
                          <button onClick={() => setSaldoDialog({ userId: user.id, type: 'reduce' })} className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center hover:bg-orange-500/20 transition-colors" title="Kurangi Saldo">
                            <Minus className="w-3.5 h-3.5 text-orange-400" />
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
                      <Badge className={`text-[10px] ${user.isSuspended ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'} border-0`}>
                        {user.isSuspended ? 'Suspend' : 'Aktif'}
                      </Badge>
                      {!user.isVerified && <Badge className="bg-yellow-500/10 text-yellow-400 text-[9px] border-0">Unverified</Badge>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                    <div><span className="text-muted-foreground">WhatsApp</span><p className="text-foreground">{maskWhatsApp(user.whatsapp)}</p></div>
                    <div><span className="text-muted-foreground">Email</span><p className="text-foreground truncate">{user.email}</p></div>
                    <div><span className="text-muted-foreground">Level</span><p className="text-[#D4AF37]">{user.level}</p></div>
                    <div><span className="text-muted-foreground">Saldo Utama</span><p className="text-foreground">{formatRupiah(user.mainBalance)}</p></div>
                    <div><span className="text-muted-foreground">Saldo Deposit</span><p className="text-blue-400">{formatRupiah(user.depositBalance || 0)}</p></div>
                    <div><span className="text-muted-foreground">Total Profit</span><p className="text-emerald-400">{formatRupiah(user.totalProfit || 0)}</p></div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => openEditDialog(user)} className="rounded-xl border-[#D4AF37]/20 text-[#D4AF37] hover:bg-[#D4AF37]/5 h-8 text-xs">
                      <Pencil className="w-3 h-3 mr-1" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setSaldoDialog({ userId: user.id, type: 'add' })} className="rounded-xl border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10 h-8 text-xs">
                      <Plus className="w-3 h-3 mr-1" /> Saldo
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setSaldoDialog({ userId: user.id, type: 'reduce' })} className="rounded-xl border-orange-500/20 text-orange-400 hover:bg-orange-500/10 h-8 text-xs">
                      <Minus className="w-3 h-3 mr-1" /> Saldo
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
              <div className="flex items-center justify-between p-4 border-t border-[#D4AF37]/10">
                <p className="text-muted-foreground text-xs">Halaman {page} dari {totalPages}</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="w-8 h-8 rounded-lg glass flex items-center justify-center disabled:opacity-30 hover:bg-white/5"><ChevronLeft className="w-4 h-4" /></button>
                  <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="w-8 h-8 rounded-lg glass flex items-center justify-center disabled:opacity-30 hover:bg-white/5"><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
            )}
          </>
        )}
      </motion.div>

      {/* Edit User Dialog */}
      <Dialog open={!!editDialog} onOpenChange={(open) => { if (!open) setEditDialog(null); }}>
        <DialogContent className="glass-strong border-[#D4AF37]/20 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-gold-gradient flex items-center gap-2"><Pencil className="w-4 h-4" />Edit User</DialogTitle>
            <DialogDescription className="text-muted-foreground">Edit informasi user <span className="text-foreground font-medium">{editDialog?.userId}</span></DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label className="text-muted-foreground text-xs">Nama</Label><Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nama user" className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground mt-1" /></div>
            <div><Label className="text-muted-foreground text-xs">Nomor WhatsApp</Label><div className="relative mt-1"><Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input value={editForm.whatsapp} onChange={(e) => setEditForm((f) => ({ ...f, whatsapp: e.target.value }))} placeholder="628123456789" className="pl-10 glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground" /></div></div>
            <div><Label className="text-muted-foreground text-xs">Email</Label><div className="relative mt-1"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} placeholder="user@email.com" className="pl-10 glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground" /></div></div>
            <div><Label className="text-muted-foreground text-xs">Level</Label>
              <Select value={editForm.level} onValueChange={(value) => setEditForm((f) => ({ ...f, level: value }))}>
                <SelectTrigger className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground mt-1"><SelectValue placeholder="Pilih Level" /></SelectTrigger>
                <SelectContent className="glass-strong border-[#D4AF37]/20">
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
            <Button variant="outline" onClick={() => setEditDialog(null)} disabled={savingEdit} className="rounded-xl border-[#D4AF37]/20 text-foreground">Batal</Button>
            <Button onClick={handleEditSave} disabled={savingEdit} className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90">
              {savingEdit ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Pencil className="w-4 h-4 mr-2" />}Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Saldo Dialog */}
      <Dialog open={!!saldoDialog} onOpenChange={(open) => { if (!open) { setSaldoDialog(null); setSaldoAmount(''); } }}>
        <DialogContent className="glass-strong border-[#D4AF37]/20 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-gold-gradient">{saldoDialog?.type === 'add' ? 'Tambah Saldo' : 'Kurangi Saldo'}</DialogTitle>
            <DialogDescription className="text-muted-foreground">Masukkan jumlah saldo yang ingin {saldoDialog?.type === 'add' ? 'ditambahkan' : 'dikurangi'}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label className="text-muted-foreground text-xs mb-2 block">Jumlah (Rp)</Label>
            <Input type="number" value={saldoAmount} onChange={(e) => setSaldoAmount(e.target.value)} placeholder="Masukkan jumlah..." className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground" />
            {saldoAmount && parseFloat(saldoAmount) > 0 && (<p className="text-foreground text-sm mt-2">= {formatRupiah(parseFloat(saldoAmount))}</p>)}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setSaldoDialog(null); setSaldoAmount(''); }} disabled={processing} className="rounded-xl border-[#D4AF37]/20 text-foreground">Batal</Button>
            <Button onClick={handleSaldoAction} disabled={processing || !saldoAmount} className={`rounded-xl font-semibold ${saldoDialog?.type === 'add' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-orange-600 hover:bg-orange-700 text-white'}`}>
              {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : saldoDialog?.type === 'add' ? 'Tambah' : 'Kurangi'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <AlertDialog open={!!deleteUserId} onOpenChange={(open) => { if (!open) setDeleteUserId(null); }}>
        <AlertDialogContent className="glass-strong border-[#D4AF37]/20">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" /> Hapus User
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Tindakan ini tidak dapat dibatalkan. User dan semua data terkait (deposit, withdraw, investasi, referral) akan dihapus permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl border-[#D4AF37]/20 text-foreground" disabled={deletingUser}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} disabled={deletingUser} className="rounded-xl bg-red-600 hover:bg-red-700 text-white" forceMount>
              {deletingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

