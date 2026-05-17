'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Database, Search, TrendingUp, Square, CheckCircle, Loader2,
  ChevronLeft, ChevronRight, Package, ShieldCheck,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { formatRupiah } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

/* Types */
interface Asset {
  id: string;
  type: 'purchase' | 'investment';
  userId: string;
  userName: string;
  userNxvId: string;
  productName: string;
  quantity: number;
  totalPrice: number;
  dailyProfit: number;
  profitEarned: number;
  profitRate: number;
  contractDays: number;
  status: string;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type StatusFilter = 'all' | 'active' | 'completed' | 'stopped';

export default function AdminAssetPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [profitDialog, setProfitDialog] = useState<string | null>(null);
  const [profitDialogType, setProfitDialogType] = useState<'purchase' | 'investment'>('purchase');
  const [profitAmount, setProfitAmount] = useState('');
  const [addingProfit, setAddingProfit] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const { adminToken } = useAuthStore();
  const { toast } = useToast();

  const fetchAssets = useCallback(() => {
    if (!adminToken) return;
    setLoading(true);
    const params = new URLSearchParams({ limit: '50', page: '1' });
    if (statusFilter !== 'all') params.set('status', statusFilter);
    fetch('/api/admin/asset?' + params.toString(), { headers: { Authorization: 'Bearer ' + adminToken } })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setAssets(res.data.purchases || []);
          setPagination(res.data.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 });
        }
      })
      .catch(() => { toast({ title: 'Error', description: 'Gagal memuat data', variant: 'destructive' }); })
      .finally(() => setLoading(false));
  }, [adminToken, statusFilter]);

  useEffect(() => {
    fetchAssets();
  }, [adminToken, statusFilter]);

  const filtered = assets.filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      a.userName?.toLowerCase().includes(q) ||
      a.productName?.toLowerCase().includes(q) ||
      a.userNxvId?.toLowerCase().includes(q)
    );
  });

  const handleAddProfit = async () => {
    if (!profitDialog || !profitAmount || !adminToken) return;
    const amount = parseFloat(profitAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: 'Jumlah tidak valid', variant: 'destructive' });
      return;
    }
    setAddingProfit(true);
    try {
      const res = await fetch('/api/admin/asset', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken },
        body: JSON.stringify({ purchaseId: profitDialog, assetType: profitDialogType, profitEarned: amount, action: 'add-profit' }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Profit berhasil ditambahkan' });
        setAssets((prev) => prev.map((a) => a.id === profitDialog ? { ...a, profitEarned: a.profitEarned + amount } : a));
        setProfitDialog(null);
        setProfitAmount('');
      } else {
        toast({ title: 'Gagal', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Kesalahan Jaringan', variant: 'destructive' });
    } finally {
      setAddingProfit(false);
    }
  };

  const handleStatusAction = async (assetId: string, assetType: 'purchase' | 'investment', action: 'stop' | 'complete') => {
    if (!adminToken) return;
    setActionLoading((prev) => ({ ...prev, [assetId]: true }));
    try {
      const res = await fetch('/api/admin/asset', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken },
        body: JSON.stringify({ purchaseId: assetId, assetType, action }),
      });
      const data = await res.json();
      if (data.success) {
        const newStatus = action === 'stop' ? 'stopped' : 'completed';
        toast({ title: action === 'stop' ? 'Aset berhasil dihentikan' : 'Aset berhasil diselesaikan' });
        setAssets((prev) => prev.map((a) => (a.id === assetId ? { ...a, status: newStatus } : a)));
      } else {
        toast({ title: 'Gagal', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Kesalahan Jaringan', variant: 'destructive' });
    } finally {
      setActionLoading((prev) => ({ ...prev, [assetId]: false }));
    }
  };

  const statusConfig: Record<string, { color: string; bg: string; label: string }> = {
    active: { color: 'text-emerald-400', bg: 'bg-emerald-400/10', label: 'Aktif' },
    completed: { color: 'text-blue-400', bg: 'bg-blue-400/10', label: 'Selesai' },
    stopped: { color: 'text-red-400', bg: 'bg-red-400/10', label: 'Dihentikan' },
  };

  const filterTabs: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'Semua' },
    { key: 'active', label: 'Aktif' },
    { key: 'completed', label: 'Selesai' },
    { key: 'stopped', label: 'Dihentikan' },
  ];

  const totalValue = filtered.reduce((sum, a) => sum + a.totalPrice, 0);
  const totalProfit = filtered.reduce((sum, a) => sum + a.profitEarned, 0);

  return (
    <div className="p-3 sm:p-5 lg:p-6 pb-4 sm:pb-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gold-gradient">Kelola Aset</h1>
          <p className="text-muted-foreground text-sm">{pagination.total} aset terdaftar</p>
        </div>
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari user atau produk..." className="pl-10 glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground placeholder:text-muted-foreground" />
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="glass glow-gold rounded-2xl p-4 text-center">
          <p className="text-foreground font-bold text-lg">{filtered.length}</p>
          <p className="text-muted-foreground text-xs">Total Aset</p>
        </div>
        <div className="glass glow-gold rounded-2xl p-4 text-center">
          <p className="text-foreground font-bold text-lg">{formatRupiah(totalValue)}</p>
          <p className="text-muted-foreground text-xs">Total Nilai</p>
        </div>
        <div className="glass glow-gold rounded-2xl p-4 text-center">
          <p className="text-emerald-400 font-bold text-lg">{formatRupiah(totalProfit)}</p>
          <p className="text-muted-foreground text-xs">Total Profit</p>
        </div>
        <div className="glass glow-gold rounded-2xl p-4 text-center">
          <p className="text-[#D4AF37] font-bold text-lg">{filtered.filter((a) => a.status === 'active').length}</p>
          <p className="text-muted-foreground text-xs">Aset Aktif</p>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="flex items-center gap-2 mb-6 overflow-x-auto no-scrollbar">
        {filterTabs.map((tab) => (
          <button key={tab.key} onClick={() => { setStatusFilter(tab.key); setSearch(''); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${statusFilter === tab.key ? 'bg-[#D4AF37]/15 text-[#D4AF37] glow-gold' : 'glass text-foreground/60 hover:text-foreground hover:bg-white/5'}`}>
            {tab.label}
          </button>
        ))}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4">{Array.from({ length: 5 }).map((_, i) => (<Skeleton key={i} className="h-12 w-full rounded-xl" />))}</div>
        ) : filtered.length > 0 ? (
          <>
            <div className="hidden lg:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#D4AF37]/10 hover:bg-transparent">
                    <TableHead className="text-muted-foreground text-xs">User</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Tipe</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Produk/Paket</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Nilai</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Profit/Hari</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Total Profit</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Status</TableHead>
                    <TableHead className="text-muted-foreground text-xs text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((asset) => {
                    const sc = statusConfig[asset.status] || statusConfig.active;
                    const isLoading = actionLoading[asset.id];
                    return (
                      <TableRow key={asset.type + '-' + asset.id} className="border-[#D4AF37]/5 hover:bg-white/[0.02]">
                        <TableCell>
                          <p className="text-foreground text-sm font-medium">{asset.userName}</p>
                          <p className="text-muted-foreground text-xs">{asset.userNxvId}</p>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${asset.type === 'investment' ? 'bg-purple-400/10 text-purple-400' : 'bg-[#D4AF37]/10 text-[#D4AF37]'} border-0 text-[10px]`}>
                            {asset.type === 'investment' ? 'Investasi' : 'Produk'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-foreground text-sm">{asset.productName}</TableCell>
                        <TableCell className="text-foreground font-semibold text-sm">{formatRupiah(asset.totalPrice)}</TableCell>
                        <TableCell className="text-emerald-400 text-sm">+{formatRupiah(asset.dailyProfit)}</TableCell>
                        <TableCell className="text-[#D4AF37] font-semibold text-sm">{formatRupiah(asset.profitEarned)}</TableCell>
                        <TableCell><Badge className={`${sc.bg} ${sc.color} border-0 text-[10px]`}>{sc.label}</Badge></TableCell>
                        <TableCell className="text-right">
                          {asset.status === 'active' && (
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => { setProfitDialog(asset.id); setProfitDialogType(asset.type); }} className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center hover:bg-[#D4AF37]/20 transition-colors" title="Tambah Profit">
                                <TrendingUp className="w-4 h-4 text-[#D4AF37]" />
                              </button>
                              <button onClick={() => handleStatusAction(asset.id, asset.type, 'stop')} disabled={isLoading} className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-red-500/10 flex items-center justify-center hover:bg-red-500/20 transition-colors disabled:opacity-50" title="Hentikan Aset">
                                {isLoading ? <Loader2 className="w-4 h-4 text-red-400 animate-spin" /> : <Square className="w-4 h-4 text-red-400" />}
                              </button>
                              <button onClick={() => handleStatusAction(asset.id, asset.type, 'complete')} disabled={isLoading} className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center hover:bg-emerald-500/20 transition-colors disabled:opacity-50" title="Selesaikan Aset">
                                {isLoading ? <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" /> : <CheckCircle className="w-4 h-4 text-emerald-400" />}
                              </button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="lg:hidden space-y-3 p-4 max-h-[60vh] overflow-y-auto">
              {filtered.map((asset) => {
                const sc = statusConfig[asset.status] || statusConfig.active;
                const isLoading = actionLoading[asset.id];
                return (
                  <div key={asset.type + '-' + asset.id} className="glass rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-foreground text-sm font-medium">{asset.userName}</p>
                        <p className="text-muted-foreground text-xs">{asset.productName}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge className={`${asset.type === 'investment' ? 'bg-purple-400/10 text-purple-400' : 'bg-[#D4AF37]/10 text-[#D4AF37]'} border-0 text-[10px]`}>
                          {asset.type === 'investment' ? 'Investasi' : 'Produk'}
                        </Badge>
                        <Badge className={`${sc.bg} ${sc.color} border-0 text-[10px]`}>{sc.label}</Badge>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                      <div><span className="text-muted-foreground">Nilai</span><p className="text-foreground font-semibold">{formatRupiah(asset.totalPrice)}</p></div>
                      <div><span className="text-muted-foreground">Profit/Hari</span><p className="text-emerald-400 font-semibold">+{formatRupiah(asset.dailyProfit)}</p></div>
                      <div><span className="text-muted-foreground">Total Profit</span><p className="text-[#D4AF37] font-semibold">{formatRupiah(asset.profitEarned)}</p></div>
                    </div>
                    {asset.status === 'active' && (
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => { setProfitDialog(asset.id); setProfitDialogType(asset.type); }} className="flex-1 rounded-xl border-[#D4AF37]/20 text-[#D4AF37] hover:bg-[#D4AF37]/10 h-9 sm:h-8 text-xs">
                          <TrendingUp className="w-3 h-3 mr-1" /> Profit
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleStatusAction(asset.id, asset.type, 'stop')} disabled={isLoading} className="flex-1 rounded-xl border-red-400/30 text-red-400 hover:bg-red-500/10 h-9 sm:h-8 text-xs">
                          {isLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Square className="w-3 h-3 mr-1" />} Stop
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleStatusAction(asset.id, asset.type, 'complete')} disabled={isLoading} className="flex-1 rounded-xl border-emerald-400/30 text-emerald-400 hover:bg-emerald-500/10 h-9 sm:h-8 text-xs">
                          {isLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle className="w-3 h-3 mr-1" />} Selesai
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="p-8 text-center">
            <Database className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Tidak ada aset ditemukan</p>
          </div>
        )}
      </motion.div>

      <Dialog open={!!profitDialog} onOpenChange={(open) => { if (!open) { setProfitDialog(null); setProfitAmount(''); } }}>
        <DialogContent className="glass-strong border-[#D4AF37]/20 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-gold-gradient">Tambah Profit</DialogTitle>
            <DialogDescription className="text-muted-foreground">Masukkan jumlah profit yang ingin ditambahkan ke aset ini</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label className="text-muted-foreground text-xs mb-2 block">Jumlah Profit (Rp)</Label>
            <Input type="number" value={profitAmount} onChange={(e) => setProfitAmount(e.target.value)} placeholder="Masukkan jumlah..." className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground" />
            {profitAmount && parseFloat(profitAmount) > 0 && (
              <p className="text-emerald-400 text-sm mt-2 font-medium">= {formatRupiah(parseFloat(profitAmount))}</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setProfitDialog(null); setProfitAmount(''); }} disabled={addingProfit} className="rounded-xl border-[#D4AF37]/20 text-foreground">Batal</Button>
            <Button onClick={handleAddProfit} disabled={addingProfit || !profitAmount} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
              {addingProfit ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Tambah Profit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
