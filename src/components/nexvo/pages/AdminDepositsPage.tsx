'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowDownCircle, Search, CheckCircle2, XCircle,
  Eye, Loader2, Filter, Image as ImageIcon, Clock
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { formatRupiah, timeAgo } from '@/lib/auth';
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
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { getFileUrl } from '@/lib/file-url';

/* ───────── Types ───────── */
interface Deposit {
  id: string;
  depositId: string;
  userId: string;
  amount: number;
  fee: number;
  netAmount: number;
  proofImage: string;
  status: string;
  note: string;
  paymentType: string;
  paymentName: string;
  paymentAccount: string;
  createdAt: string;
  user: { name: string; userId: string; whatsapp: string };
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

/* ═══════════════════════════════════════════
   ADMIN DEPOSITS PAGE
   ═══════════════════════════════════════════ */
export default function AdminDepositsPage() {
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [processing, setProcessing] = useState<Record<string, boolean>>({});
  const [proofDialog, setProofDialog] = useState<string | null>(null);
  const [rejectDialog, setRejectDialog] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const { adminToken } = useAuthStore();
  const { toast } = useToast();

  const fetchDeposits = useCallback(() => {
    if (!adminToken) return;
    fetch('/api/admin/deposits?limit=100', { headers: { Authorization: `Bearer ${adminToken}` } })
      .then((r) => r.json())
      .then((res) => res.success && setDeposits(res.data))
      .catch(() => { toast({ title: 'Error', description: 'Gagal memuat data', variant: 'destructive' }); })
      .finally(() => setLoading(false));
   
  }, [adminToken]);

  useEffect(() => {
    fetchDeposits();
  }, [fetchDeposits]);

  const filtered = deposits.filter((d) => {
    const matchStatus = statusFilter === 'all' || d.status === statusFilter;
    const matchSearch = !search ||
      d.user?.name?.toLowerCase().includes(search.toLowerCase()) ||
      d.user?.userId?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const handleAction = async (id: string, status: 'approved' | 'rejected', note?: string) => {
    setProcessing((p) => ({ ...p, [id]: true }));
    try {
      const res = await fetch('/api/admin/deposits', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ id, status, note: note || '' }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: `Deposit ${status === 'approved' ? 'disetujui' : 'ditolak'}` });
        setDeposits((prev) =>
          prev.map((d) => (d.id === id ? { ...d, status } : d))
        );
      } else {
        toast({ title: 'Gagal', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Kesalahan Jaringan', variant: 'destructive' });
    } finally {
      setProcessing((p) => ({ ...p, [id]: false }));
    }
  };

  const statusConfig: Record<string, { color: string; bg: string; label: string }> = {
    pending: { color: 'text-yellow-400', bg: 'bg-yellow-400/10', label: 'Pending' },
    approved: { color: 'text-emerald-400', bg: 'bg-emerald-400/10', label: 'Disetujui' },
    rejected: { color: 'text-red-400', bg: 'bg-red-400/10', label: 'Ditolak' },
  };

  const filterTabs: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'Semua' },
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Disetujui' },
    { key: 'rejected', label: 'Ditolak' },
  ];

  return (
    <div className="p-3 sm:p-5 lg:p-6 pb-4 sm:pb-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6"
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gold-gradient">Kelola Deposit</h1>
          <p className="text-muted-foreground text-sm">{deposits.filter((d) => d.status === 'pending').length} deposit menunggu</p>
        </div>
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari user..."
            className="pl-10 glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </motion.div>

      {/* Filter Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex items-center gap-2 mb-6 overflow-x-auto no-scrollbar"
      >
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
              statusFilter === tab.key
                ? 'bg-[#D4AF37]/15 text-[#D4AF37] glow-gold'
                : 'glass text-foreground/60 hover:text-foreground hover:bg-white/5'
            }`}
          >
            {tab.label}
            {tab.key !== 'all' && (
              <Badge className="bg-white/10 text-foreground/50 text-[10px] h-4 px-1.5 border-0">
                {deposits.filter((d) => d.status === tab.key).length}
              </Badge>
            )}
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
                    <TableHead className="text-muted-foreground text-xs">Deposit ID</TableHead>
                    <TableHead className="text-muted-foreground text-xs">User</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Jumlah</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Bukti</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Tanggal</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Status</TableHead>
                    <TableHead className="text-muted-foreground text-xs text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((deposit) => {
                    const sc = statusConfig[deposit.status] || statusConfig.pending;
                    return (
                      <TableRow key={deposit.id} className="border-[#D4AF37]/5 hover:bg-white/[0.02]">
                        <TableCell>
                          <span className="text-[#D4AF37] font-mono font-bold text-xs bg-[#D4AF37]/10 px-2 py-0.5 rounded-md">{deposit.depositId || '-'}</span>
                        </TableCell>
                        <TableCell>
                          <p className="text-foreground text-sm font-medium">{deposit.user?.name || 'Unknown'}</p>
                          <p className="text-muted-foreground text-xs">{deposit.user?.userId}</p>
                        </TableCell>
                        <TableCell className="text-foreground font-semibold text-sm">
                          {formatRupiah(deposit.amount)}
                          {deposit.fee > 0 && (
                            <p className="text-muted-foreground text-[10px] font-normal">Fee: {formatRupiah(deposit.fee)} → Net: {formatRupiah(deposit.netAmount)}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          {deposit.proofImage ? (
                            <button
                              onClick={() => setProofDialog(deposit.proofImage)}
                              className="flex items-center gap-1.5 text-[#D4AF37] hover:text-[#F0D060] text-xs"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Lihat
                            </button>
                          ) : (
                            <span className="text-muted-foreground text-xs">Tidak ada</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {timeAgo(new Date(deposit.createdAt))}
                        </TableCell>
                        <TableCell>
                          <Badge className={`${sc.bg} ${sc.color} border-0 text-[10px]`}>
                            {sc.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {deposit.status === 'pending' && (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleAction(deposit.id, 'approved')}
                                disabled={processing[deposit.id]}
                                className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                                title="Setujui"
                              >
                                {processing[deposit.id] ? (
                                  <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                )}
                              </button>
                              <button
                                onClick={() => setRejectDialog(deposit.id)}
                                disabled={processing[deposit.id]}
                                className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-red-500/10 flex items-center justify-center hover:bg-red-500/20 transition-colors disabled:opacity-50"
                                title="Tolak"
                              >
                                <XCircle className="w-4 h-4 text-red-400" />
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
            <div className="lg:hidden space-y-3 p-4">
              {filtered.map((deposit) => {
                const sc = statusConfig[deposit.status] || statusConfig.pending;
                return (
                  <div key={deposit.id} className="glass rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-[#D4AF37] font-mono font-bold text-xs bg-[#D4AF37]/10 px-2 py-0.5 rounded-md mr-2">{deposit.depositId || '-'}</span>
                        <p className="text-foreground text-sm font-medium mt-1">{deposit.user?.name}</p>
                        <p className="text-muted-foreground text-xs">{deposit.user?.userId}</p>
                      </div>
                      <Badge className={`${sc.bg} ${sc.color} border-0 text-[10px]`}>{sc.label}</Badge>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-foreground font-semibold">{formatRupiah(deposit.amount)}</span>
                      <span className="text-muted-foreground text-xs">{timeAgo(new Date(deposit.createdAt))}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      {deposit.proofImage ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setProofDialog(deposit.proofImage)}
                          className="rounded-xl border-[#D4AF37]/20 text-[#D4AF37] h-7 text-xs"
                        >
                          <Eye className="w-3 h-3 mr-1" /> Bukti
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-xs">Tidak ada bukti</span>
                      )}
                      {deposit.status === 'pending' && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleAction(deposit.id, 'approved')}
                            disabled={processing[deposit.id]}
                            className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center hover:bg-emerald-500/20 disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          </button>
                          <button
                            onClick={() => setRejectDialog(deposit.id)}
                            disabled={processing[deposit.id]}
                            className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-red-500/10 flex items-center justify-center hover:bg-red-500/20 disabled:opacity-50"
                          >
                            <XCircle className="w-4 h-4 text-red-400" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="p-8 text-center">
            <ArrowDownCircle className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Tidak ada deposit ditemukan</p>
          </div>
        )}
      </motion.div>

      {/* Proof Image Dialog */}
      <Dialog open={!!proofDialog} onOpenChange={() => setProofDialog(null)}>
        <DialogContent className="glass-strong border-[#D4AF37]/20 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-gold-gradient">Bukti Transfer</DialogTitle>
          </DialogHeader>
          {proofDialog && (
            <div className="rounded-xl overflow-hidden">
              <img src={getFileUrl(proofDialog || '')} alt="Bukti transfer" className="w-full h-auto" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={() => { setRejectDialog(null); setRejectNote(''); }}>
        <DialogContent className="glass-strong border-[#D4AF37]/20 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Tolak Deposit</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-muted-foreground text-xs mb-2 block">Alasan Penolakan (opsional)</Label>
            <Textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Masukkan alasan penolakan..."
              rows={3}
              className="glass rounded-xl border-[#D4AF37]/20 bg-transparent text-foreground resize-none"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setRejectDialog(null); setRejectNote(''); }}
              className="rounded-xl border-[#D4AF37]/20 text-foreground"
            >
              Batal
            </Button>
            <Button
              onClick={async () => {
                if (rejectDialog) {
                  await handleAction(rejectDialog, 'rejected', rejectNote);
                }
                setRejectDialog(null);
                setRejectNote('');
              }}
              className="rounded-xl bg-red-600 hover:bg-red-700 text-white"
            >
              Tolak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
