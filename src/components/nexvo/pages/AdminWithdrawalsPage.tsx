'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowUpCircle, Search, CheckCircle2, XCircle,
  Loader2, Landmark, Clock
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

/* ───────── Types ───────── */
interface Withdrawal {
  id: string;
  userId: string;
  bankName: string;
  accountNo: string;
  holderName: string;
  paymentType: string;
  amount: number;
  fee: number;
  netAmount: number;
  status: string;
  note: string;
  createdAt: string;
  user: { name: string; userId: string; whatsapp: string };
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

/* ═══════════════════════════════════════════
   ADMIN WITHDRAWALS PAGE
   ═══════════════════════════════════════════ */
export default function AdminWithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [processing, setProcessing] = useState<Record<string, boolean>>({});
  const [rejectDialog, setRejectDialog] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [approveDialog, setApproveDialog] = useState<string | null>(null);
  const { adminToken } = useAuthStore();
  const { toast } = useToast();

  const fetchWithdrawals = useCallback(() => {
    if (!adminToken) return;
    fetch('/api/admin/withdrawals?limit=100', { headers: { Authorization: `Bearer ${adminToken}` } })
      .then((r) => r.json())
      .then((res) => res.success && setWithdrawals(res.data))
      .catch(() => { toast({ title: 'Error', description: 'Gagal memuat data', variant: 'destructive' }); })
      .finally(() => setLoading(false));
   
  }, [adminToken]);

  useEffect(() => {
    fetchWithdrawals();
  }, [fetchWithdrawals]);

  const filtered = withdrawals.filter((w) => {
    const matchStatus = statusFilter === 'all' || w.status === statusFilter;
    const matchSearch = !search ||
      w.user?.name?.toLowerCase().includes(search.toLowerCase()) ||
      w.user?.userId?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const handleAction = async (id: string, status: 'approved' | 'rejected', note?: string) => {
    setProcessing((p) => ({ ...p, [id]: true }));
    try {
      const res = await fetch('/api/admin/withdrawals', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ id, status, note: note || '' }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: `Withdrawal ${status === 'approved' ? 'disetujui' : 'ditolak'}` });
        setWithdrawals((prev) =>
          prev.map((w) => (w.id === id ? { ...w, status } : w))
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
          <h1 className="text-2xl sm:text-3xl font-bold text-gold-gradient">Kelola Withdrawal</h1>
          <p className="text-muted-foreground text-sm">{withdrawals.filter((w) => w.status === 'pending').length} withdrawal menunggu</p>
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
                {withdrawals.filter((w) => w.status === tab.key).length}
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
                    <TableHead className="text-muted-foreground text-xs">User</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Metode</TableHead>
                    <TableHead className="text-muted-foreground text-xs">No. Akun</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Jumlah</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Fee</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Netto</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Tanggal</TableHead>
                    <TableHead className="text-muted-foreground text-xs">Status</TableHead>
                    <TableHead className="text-muted-foreground text-xs text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((wd) => {
                    const sc = statusConfig[wd.status] || statusConfig.pending;
                    return (
                      <TableRow key={wd.id} className="border-[#D4AF37]/5 hover:bg-white/[0.02]">
                        <TableCell>
                          <p className="text-foreground text-sm font-medium">{wd.user?.name || 'Unknown'}</p>
                          <p className="text-muted-foreground text-xs">{wd.user?.userId}</p>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Landmark className="w-3.5 h-3.5 text-[#D4AF37]" />
                            <span className="text-foreground text-xs">{wd.bankName}</span>
                            {wd.paymentType && wd.paymentType !== 'bank' && (
                              <Badge className="bg-white/5 text-muted-foreground text-[8px] border-0 px-1 py-0">{wd.paymentType}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-foreground text-xs font-mono">{wd.accountNo}</TableCell>
                        <TableCell className="text-foreground font-semibold text-sm">{formatRupiah(wd.amount)}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{formatRupiah(wd.fee)}</TableCell>
                        <TableCell className="text-emerald-400 font-semibold text-sm">{formatRupiah(wd.netAmount)}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{timeAgo(new Date(wd.createdAt))}</TableCell>
                        <TableCell>
                          <Badge className={`${sc.bg} ${sc.color} border-0 text-[10px]`}>{sc.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {wd.status === 'pending' && (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => setApproveDialog(wd.id)}
                                disabled={processing[wd.id]}
                                className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                                title="Setujui"
                              >
                                {processing[wd.id] ? (
                                  <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                )}
                              </button>
                              <button
                                onClick={() => setRejectDialog(wd.id)}
                                disabled={processing[wd.id]}
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

            {/* Mobile / Tablet */}
            <div className="lg:hidden space-y-3 p-4">
              {filtered.map((wd) => {
                const sc = statusConfig[wd.status] || statusConfig.pending;
                return (
                  <div key={wd.id} className="glass rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-foreground text-sm font-medium">{wd.user?.name}</p>
                        <p className="text-muted-foreground text-xs">{wd.user?.userId}</p>
                      </div>
                      <Badge className={`${sc.bg} ${sc.color} border-0 text-[10px]`}>{sc.label}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Metode</span>
                        <p className="text-foreground font-medium">{wd.bankName}{wd.paymentType && wd.paymentType !== 'bank' ? ` (${wd.paymentType})` : ''}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">No. Akun</span>
                        <p className="text-foreground font-mono">{wd.accountNo}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Jumlah</span>
                        <p className="text-foreground font-semibold">{formatRupiah(wd.amount)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Netto</span>
                        <p className="text-emerald-400 font-semibold">{formatRupiah(wd.netAmount)}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#D4AF37]/10">
                      <span className="text-muted-foreground text-xs">{timeAgo(new Date(wd.createdAt))}</span>
                      {wd.status === 'pending' && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setApproveDialog(wd.id)}
                            disabled={processing[wd.id]}
                            className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center hover:bg-emerald-500/20 disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          </button>
                          <button
                            onClick={() => setRejectDialog(wd.id)}
                            disabled={processing[wd.id]}
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
            <ArrowUpCircle className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Tidak ada withdrawal ditemukan</p>
          </div>
        )}
      </motion.div>

      {/* Approve Confirmation Dialog */}
      <Dialog open={!!approveDialog} onOpenChange={() => setApproveDialog(null)}>
        <DialogContent className="glass-strong border-[#D4AF37]/20 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Setujui Withdrawal</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-muted-foreground text-sm">
              Apakah Anda yakin ingin menyetujui withdrawal ini? Dana akan dikirim ke rekening pengguna.
            </p>
            {approveDialog && (() => {
              const wd = withdrawals.find((w) => w.id === approveDialog);
              if (!wd) return null;
              return (
                <div className="mt-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-1 text-sm">
                  <p className="text-foreground font-medium">{wd.user?.name || 'Unknown'}</p>
                  <p className="text-muted-foreground">{wd.bankName} • {wd.accountNo}</p>
                  <p className="text-emerald-400 font-semibold">{formatRupiah(wd.netAmount)}</p>
                </div>
              );
            })()}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setApproveDialog(null)}
              className="rounded-xl border-[#D4AF37]/20 text-foreground"
            >
              Batal
            </Button>
            <Button
              onClick={async () => {
                if (approveDialog) {
                  await handleAction(approveDialog, 'approved');
                }
                setApproveDialog(null);
              }}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Ya, Setujui
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={() => { setRejectDialog(null); setRejectNote(''); }}>
        <DialogContent className="glass-strong border-[#D4AF37]/20 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Tolak Withdrawal</DialogTitle>
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
