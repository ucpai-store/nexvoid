'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Database, Search, TrendingUp, Square, CheckCircle, Loader2,
  ChevronLeft, ChevronRight,
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

/* ───────── Types ───────── */
interface Purchase {
  id: string;
  userId: string;
  productId: string;
  quantity: number;
  totalPrice: number;
  status: string;
  profitEarned: number;
  createdAt: string;
  user: { name: string; userId: string };
  product: { name: string; price: number };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type StatusFilter = 'all' | 'active' | 'completed' | 'stopped';

const PAGE_SIZE = 10;

/* ═══════════════════════════════════════════
   ADMIN ASSET PAGE
   ═══════════════════════════════════════════ */
export default function AdminAssetPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [profitDialog, setProfitDialog] = useState<string | null>(null);
  const [profitAmount, setProfitAmount] = useState('');
  const [addingProfit, setAddingProfit] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const { adminToken } = useAuthStore();
  const { toast } = useToast();

  const fetchPurchases = useCallback((page: number = 1) => {
    if (!adminToken) return;
    setLoading(true);
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
    if (statusFilter !== 'all') params.set('status', statusFilter);
    fetch(`/api/admin/asset?${params.toString()}`, { headers: { Authorization: `Bearer ${adminToken}` } })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setPurchases(res.data.purchases || []);
          setPagination(res.data.pagination || { page, limit: PAGE_SIZE, total: 0, totalPages: 0 });
        }
      })
      .catch(() => { toast({ title: 'Error', description: 'Gagal memuat data', variant: 'destructive' }); })
      .finally(() => setLoading(false));
   
  }, [adminToken, statusFilter]);

  useEffect(() => {
    fetchPurchases(1);
  }, [adminToken, statusFilter]);

  /* Client-side search filter on top of server-side data */
  const filtered = purchases.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.user?.name?.toLowerCase().includes(q) ||
      p.product?.name?.toLowerCase().includes(q) ||
      p.user?.userId?.toLowerCase().includes(q)
    );
  });

  /* ── Actions ── */
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ purchaseId: profitDialog, profitEarned: amount, action: 'add-profit' }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Profit berhasil ditambahkan' });
        setPurchases((prev) =>
          prev.map((p) =>
            p.id === profitDialog ? { ...p, profitEarned: p.profitEarned + amount } : p
          )
        );
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

  const handleStatusAction = async (purchaseId: string, action: 'stop' | 'complete') => {
    if (!adminToken) return;
    setActionLoading((prev) => ({ ...prev, [purchaseId]: true }));
    try {
      const res = await fetch('/api/admin/asset', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ purchaseId, action }),
      });
      const data = await res.json();
      if (data.success) {
        const newStatus = action === 'stop' ? 'stopped' : 'completed';
        toast({ title: action === 'stop' ? 'Aset berhasil dihentikan' : 'Aset berhasil diselesaikan' });
        setPurchases((prev) =>
          prev.map((p) => (p.id === purchaseId ? { ...p, status: newStatus } : p))
        );
      } else {
        toast({ title: 'Gagal', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Kesalahan Jaringan', variant: 'destructive' });
    } finally {
      setActionLoading((prev) => ({ ...prev, [purchaseId]: false }));
    }
  };

  /* ── Helpers ── */
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

  const totalValue = filtered.reduce((sum, p) => sum + p.totalPrice, 0);
  const totalProfit = filtered.reduce((sum, p) => sum + p.profitEarned, 0);

  const goToPage = (page: number) => {
    if (page < 1 || page > pagination.totalPages) return;
    fetchPurchases(page);
  };

  return (
    <div className="p-3 sm:p-5 lg:p-6 pb-4 sm:pb-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6"
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gold-gradient">Kelola Aset</h1>
          <p className="text-muted-foreground text-sm">{pagination.total} aset terdaftar</p>
        </div>
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari user atau produk..."
            className="pl-10 glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </motion.div>

      {/* Summary Cards */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6"
      >
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
          <p className="text-[#D4AF37] font-bold text-lg">
            {filtered.filter((p) => p.status === 'active').length}
          </p>
          <p className="text-muted-foreground text-xs">Aset Aktif</p>
        </div>
      </motion.div>

      {/* Filter Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="flex items-center gap-2 mb-6 overflow-x-auto no-scrollbar"
      >
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setStatusFilter(tab.key); setSearch(''); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
              statusFilter === tab.key
                ? 'bg-[#D4AF37]/15 text-[#D4AF37] glow-gold'
                : 'glass text-foreground/60 hover:text-foreground hover:bg-white/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass rounded-2xl overflow-hidden"
      >
        {loading ? (
          <div className="p-6 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <>
            {/* Desktop */}
            <div className="hidden lg:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#D4AF37]/10 hover:bg-transparent">
                    <TableHead className="text-muted-foreground text-xs">User</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Produk</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Qty</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Total Harga</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Profit</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Status</TableHead>
                    <TableHead className="text-muted-foreground text-xs text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((purchase) => {
                    const sc = statusConfig[purchase.status] || statusConfig.active;
                    const isLoading = actionLoading[purchase.id];
                    return (
                      <TableRow key={purchase.id} className="border-[#D4AF37]/5 hover:bg-white/[0.02]">
                        <TableCell>
                          <p className="text-foreground text-sm font-medium">{purchase.user?.name || 'Unknown'}</p>
                          <p className="text-muted-foreground text-xs">{purchase.user?.userId}</p>
                        </TableCell>
                        <TableCell className="text-foreground text-sm">{purchase.product?.name || '-'}</TableCell>
                        <TableCell className="text-foreground text-sm">{purchase.quantity}</TableCell>
                        <TableCell className="text-foreground font-semibold text-sm">{formatRupiah(purchase.totalPrice)}</TableCell>
                        <TableCell className="text-emerald-400 font-semibold text-sm">{formatRupiah(purchase.profitEarned)}</TableCell>
                        <TableCell>
                          <Badge className={`${sc.bg} ${sc.color} border-0 text-[10px]`}>{sc.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {purchase.status === 'active' && (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => setProfitDialog(purchase.id)}
                                className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center hover:bg-[#D4AF37]/20 transition-colors"
                                title="Tambah Profit"
                              >
                                <TrendingUp className="w-4 h-4 text-[#D4AF37]" />
                              </button>
                              <button
                                onClick={() => handleStatusAction(purchase.id, 'stop')}
                                disabled={isLoading}
                                className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-red-500/10 flex items-center justify-center hover:bg-red-500/20 transition-colors disabled:opacity-50"
                                title="Hentikan Aset"
                              >
                                {isLoading ? (
                                  <Loader2 className="w-4 h-4 text-red-400 animate-spin" />
                                ) : (
                                  <Square className="w-4 h-4 text-red-400" />
                                )}
                              </button>
                              <button
                                onClick={() => handleStatusAction(purchase.id, 'complete')}
                                disabled={isLoading}
                                className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                                title="Selesaikan Aset"
                              >
                                {isLoading ? (
                                  <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                                ) : (
                                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                                )}
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

            {/* Mobile */}
            <div className="lg:hidden space-y-3 p-4 max-h-[60vh] overflow-y-auto">
              {filtered.map((purchase) => {
                const sc = statusConfig[purchase.status] || statusConfig.active;
                const isLoading = actionLoading[purchase.id];
                return (
                  <div key={purchase.id} className="glass rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-foreground text-sm font-medium">{purchase.user?.name}</p>
                        <p className="text-muted-foreground text-xs">{purchase.product?.name}</p>
                      </div>
                      <Badge className={`${sc.bg} ${sc.color} border-0 text-[10px]`}>{sc.label}</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                      <div>
                        <span className="text-muted-foreground">Qty</span>
                        <p className="text-foreground font-medium">{purchase.quantity}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Total</span>
                        <p className="text-foreground font-semibold">{formatRupiah(purchase.totalPrice)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Profit</span>
                        <p className="text-emerald-400 font-semibold">{formatRupiah(purchase.profitEarned)}</p>
                      </div>
                    </div>
                    {purchase.status === 'active' && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setProfitDialog(purchase.id)}
                          className="flex-1 rounded-xl border-[#D4AF37]/20 text-[#D4AF37] hover:bg-[#D4AF37]/10 h-9 sm:h-8 text-xs"
                        >
                          <TrendingUp className="w-3 h-3 mr-1" /> Profit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStatusAction(purchase.id, 'stop')}
                          disabled={isLoading}
                          className="flex-1 rounded-xl border-red-400/30 text-red-400 hover:bg-red-500/10 h-9 sm:h-8 text-xs"
                        >
                          {isLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Square className="w-3 h-3 mr-1" />}
                          Stop
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStatusAction(purchase.id, 'complete')}
                          disabled={isLoading}
                          className="flex-1 rounded-xl border-emerald-400/30 text-emerald-400 hover:bg-emerald-500/10 h-9 sm:h-8 text-xs"
                        >
                          {isLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                          Selesai
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

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex items-center justify-between mt-4 px-2"
        >
          <p className="text-muted-foreground text-xs">
            Halaman {pagination.page} dari {pagination.totalPages} &middot; {pagination.total} total
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => goToPage(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg glass flex items-center justify-center hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4 text-foreground" />
            </button>
            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === pagination.totalPages || Math.abs(p - pagination.page) <= 1)
              .map((p, idx, arr) => {
                const prev = arr[idx - 1];
                const showEllipsis = prev !== undefined && p - prev > 1;
                return (
                  <span key={p} className="flex items-center">
                    {showEllipsis && <span className="text-muted-foreground/40 text-xs px-1">&hellip;</span>}
                    <button
                      onClick={() => goToPage(p)}
                      className={`w-9 h-9 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-xs font-medium transition-colors ${
                        p === pagination.page
                          ? 'bg-[#D4AF37]/15 text-[#D4AF37]'
                          : 'glass text-foreground/60 hover:bg-white/5'
                      }`}
                    >
                      {p}
                    </button>
                  </span>
                );
              })}
            <button
              onClick={() => goToPage(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg glass flex items-center justify-center hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4 text-foreground" />
            </button>
          </div>
        </motion.div>
      )}

      {/* Add Profit Dialog */}
      <Dialog open={!!profitDialog} onOpenChange={(open) => { if (!open) { setProfitDialog(null); setProfitAmount(''); } }}>
        <DialogContent className="glass-strong border-[#D4AF37]/20 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-gold-gradient">Tambah Profit</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Masukkan jumlah profit yang ingin ditambahkan ke aset ini
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label className="text-muted-foreground text-xs mb-2 block">Jumlah Profit (Rp)</Label>
            <Input
              type="number"
              value={profitAmount}
              onChange={(e) => setProfitAmount(e.target.value)}
              placeholder="Masukkan jumlah..."
              className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground"
            />
            {profitAmount && parseFloat(profitAmount) > 0 && (
              <p className="text-emerald-400 text-sm mt-2 font-medium">
                = {formatRupiah(parseFloat(profitAmount))}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setProfitDialog(null); setProfitAmount(''); }}
              disabled={addingProfit}
              className="rounded-xl border-[#D4AF37]/20 text-foreground"
            >
              Batal
            </Button>
            <Button
              onClick={handleAddProfit}
              disabled={addingProfit || !profitAmount}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {addingProfit ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Tambah Profit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
