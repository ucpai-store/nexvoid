'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Banknote, Search, Filter, RefreshCw, Play, X, CheckCircle2,
  AlertTriangle, ChevronLeft, ChevronRight, Edit2, Trash2,
  DollarSign, Users, TrendingUp, Calendar, Clock, Eye, Ban,
  Plus, Loader2
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useLanguageStore } from '@/stores/language-store';
import { formatRupiah } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';

/* ───────── Types ───────── */
interface SalaryBonusItem {
  id: string;
  userId: string;
  weekNumber: number;
  year: number;
  directReferrals: number;
  omzet: number;
  amount: number;
  status: string;
  note: string;
  paidAt: string | null;
  createdAt: string;
  user: {
    id: string;
    userId: string;
    name: string;
    whatsapp: string;
    referralCode: string;
  };
}

interface SalaryStats {
  totalPaidAmount: number;
  totalPaidCount: number;
  totalCancelledAmount: number;
  totalCancelledCount: number;
  totalPendingCount: number;
  currentWeek: { weekNumber: number; year: number };
}

/* ───────── Status Config ───────── */
function getStatusConfig(status: string, t: (key: string) => string) {
  switch (status) {
    case 'paid':
      return { label: t('status.cancelled').replace('Dibatalkan', 'Dibayar'), color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20' };
    case 'pending':
      return { label: t('common.pending'), color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/20' };
    case 'cancelled':
      return { label: t('status.cancelled'), color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/20' };
    default:
      return { label: status, color: 'text-muted-foreground', bg: 'bg-white/5', border: 'border-white/10' };
  }
}

/* ───────── Main Component ───────── */
export default function AdminSalaryPage() {
  const { adminToken } = useAuthStore();
  const { t } = useLanguageStore();
  const [salaryBonuses, setSalaryBonuses] = useState<SalaryBonusItem[]>([]);
  const [stats, setStats] = useState<SalaryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SalaryBonusItem | null>(null);

  // Manual credit form
  const [manualForm, setManualForm] = useState({
    userId: '',
    amount: 25000,
    weekNumber: 0,
    year: 0,
    note: '',
  });

  // Edit form
  const [editForm, setEditForm] = useState({
    id: '',
    amount: 0,
    note: '',
  });

  const fetchData = useCallback(async () => {
    if (!adminToken) return;
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        status: statusFilter,
        search,
      });
      const res = await fetch(`/api/admin/salary-bonus?${params}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (data.success) {
        setSalaryBonuses(data.data || []);
        setStats(data.stats);
        setTotalPages(data.pagination?.totalPages || 1);
      }
    } catch {
      toast({ title: t('common.error'), description: t('admin.loadFailed'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [adminToken, page, statusFilter, search, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Initialize manual form with current week
  useEffect(() => {
    const now = new Date();
    const jan4 = new Date(now.getFullYear(), 0, 4);
    const dayOfWeek = jan4.getDay() || 7;
    const week1Monday = new Date(now.getFullYear(), 0, 4 - dayOfWeek + 1);
    const weekNumber = 1 + Math.round(((now.getTime() - week1Monday.getTime()) / 86400000 - 3 + ((week1Monday.getDay() + 6) % 7)) / 7);
    setManualForm((prev) => ({
      ...prev,
      weekNumber,
      year: now.getFullYear(),
    }));
  }, []);

  const handleProcessWeekly = async () => {
    if (!adminToken) return;
    setProcessing(true);
    try {
      const res = await fetch('/api/admin/salary-bonus', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'process' }),
      });
      const data = await res.json();
      if (data.success) {
        toast({
          title: t('common.success'),
          description: data.message,
        });
        fetchData();
      } else {
        toast({ title: t('common.failed'), description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: t('common.error'), description: t('admin.createFailed'), variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handleManualCredit = async () => {
    if (!adminToken || !manualForm.userId) {
      toast({ title: t('common.error'), description: t('admin.allFieldsRequired'), variant: 'destructive' });
      return;
    }
    setProcessing(true);
    try {
      const res = await fetch('/api/admin/salary-bonus', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'manual',
          userId: manualForm.userId,
          amount: manualForm.amount,
          weekNumber: manualForm.weekNumber,
          year: manualForm.year,
          note: manualForm.note,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: t('common.success'), description: t('adminSalary.salaryMarkedPaid') });
        setShowManualDialog(false);
        setManualForm((prev) => ({ ...prev, userId: '', note: '' }));
        fetchData();
      } else {
        toast({ title: t('common.failed'), description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: t('common.error'), description: t('admin.createFailed'), variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handlePay = async (id: string) => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/salary-bonus', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id, action: 'pay' }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: t('common.success'), description: t('adminSalary.salaryMarkedPaid') });
        fetchData();
      } else {
        toast({ title: t('common.failed'), description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: t('common.error'), description: t('admin.createFailed'), variant: 'destructive' });
    }
  };

  const handleCancel = async (id: string) => {
    if (!adminToken) return;
    if (!confirm(t('admin.confirmDelete') + '?')) return;
    try {
      const res = await fetch('/api/admin/salary-bonus', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id, action: 'cancel' }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: t('common.success'), description: t('status.cancelled') });
        fetchData();
      } else {
        toast({ title: t('common.failed'), description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: t('common.error'), description: t('admin.createFailed'), variant: 'destructive' });
    }
  };

  const handleEdit = async () => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/salary-bonus', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: editForm.id,
          action: 'edit',
          amount: editForm.amount,
          note: editForm.note,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: t('common.success'), description: t('admin.updateInfo') });
        setShowEditDialog(false);
        fetchData();
      } else {
        toast({ title: t('common.failed'), description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: t('common.error'), description: t('admin.updateFailed'), variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!adminToken) return;
    if (!confirm(t('admin.confirmDelete') + '?')) return;
    try {
      const res = await fetch(`/api/admin/salary-bonus?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: t('common.success'), description: t('admin.deleteFailed') });
        fetchData();
      } else {
        toast({ title: t('common.failed'), description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: t('common.error'), description: t('admin.deleteFailed'), variant: 'destructive' });
    }
  };

  const openEditDialog = (item: SalaryBonusItem) => {
    setEditForm({ id: item.id, amount: item.amount, note: item.note });
    setSelectedItem(item);
    setShowEditDialog(true);
  };

  const openDetailDialog = (item: SalaryBonusItem) => {
    setSelectedItem(item);
    setShowDetailDialog(true);
  };

  /* ───────── Render ───────── */
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-foreground text-xl font-bold flex items-center gap-2">
            <Banknote className="w-5 h-5 text-[#D4AF37]" />
            {t('adminSalary.title')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t('adminSalary.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleProcessWeekly}
            disabled={processing}
            className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold"
          >
            {processing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            {t('adminSalary.title')}
          </Button>
          <Button
            onClick={() => setShowManualDialog(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl"
          >
            <Plus className="w-4 h-4 mr-2" />
            Manual
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass glow-gold rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-400/10 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="text-muted-foreground text-xs">{t('adminSalary.paidLabel')}</span>
          </div>
          <p className="text-emerald-400 text-lg font-bold">{formatRupiah(stats?.totalPaidAmount || 0)}</p>
          <p className="text-muted-foreground text-[10px]">{stats?.totalPaidCount || 0}</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-yellow-400/10 flex items-center justify-center">
              <Clock className="w-4 h-4 text-yellow-400" />
            </div>
            <span className="text-muted-foreground text-xs">{t('common.pending')}</span>
          </div>
          <p className="text-yellow-400 text-lg font-bold">{stats?.totalPendingCount || 0}</p>
          <p className="text-muted-foreground text-[10px]">{t('adminSalary.unpaidLabel')}</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-red-400/10 flex items-center justify-center">
              <Ban className="w-4 h-4 text-red-400" />
            </div>
            <span className="text-muted-foreground text-xs">{t('status.cancelled')}</span>
          </div>
          <p className="text-red-400 text-lg font-bold">{stats?.totalCancelledCount || 0}</p>
          <p className="text-muted-foreground text-[10px]">{formatRupiah(stats?.totalCancelledAmount || 0)}</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-[#D4AF37]" />
            </div>
            <span className="text-muted-foreground text-xs">W{t('adminSalary.weekNumber')}</span>
          </div>
          <p className="text-[#D4AF37] text-lg font-bold">W{stats?.currentWeek?.weekNumber || '-'}</p>
          <p className="text-muted-foreground text-[10px]">{stats?.currentWeek?.year || '-'}</p>
        </motion.div>
      </div>

      {/* Requirements Info */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-gold glow-gold rounded-2xl p-5">
        <h3 className="text-foreground font-semibold text-sm mb-3 flex items-center gap-2">
          <Banknote className="w-4 h-4 text-[#D4AF37]" />
          {t('networkPage.weeklySalaryBonus')}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="flex items-center gap-2 p-3 rounded-xl bg-white/[0.03]">
            <Banknote className="w-4 h-4 text-red-400" />
            <div>
              <p className="text-foreground text-xs font-medium">Deposit Aktif</p>
              <p className="text-muted-foreground text-[10px]">Wajib Sendiri</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-xl bg-white/[0.03]">
            <Users className="w-4 h-4 text-blue-400" />
            <div>
              <p className="text-foreground text-xs font-medium">Semua L1 Aktif</p>
              <p className="text-muted-foreground text-[10px]">Wajib Deposit Aktif</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-xl bg-white/[0.03]">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <div>
              <p className="text-foreground text-xs font-medium">2.5%</p>
              <p className="text-muted-foreground text-[10px]">Auto Detect</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-xl bg-white/[0.03]">
            <Banknote className="w-4 h-4 text-[#D4AF37]" />
            <div>
              <p className="text-foreground text-xs font-medium">Group Omzet</p>
              <p className="text-muted-foreground text-[10px]">{t('adminSalary.salaryAmountSetting')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-xl bg-white/[0.03]">
            <Calendar className="w-4 h-4 text-purple-400" />
            <div>
              <p className="text-foreground text-xs font-medium">{t('networkPage.weeklySalary')}</p>
              <p className="text-muted-foreground text-[10px]">{t('adminSalary.weekNumber')}</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={t('common.search') + '...'}
            className="glass rounded-xl pl-10 border-white/10 focus:border-[#D4AF37]/30 bg-transparent"
          />
        </div>
        <div className="flex gap-2">
          {['all', 'paid', 'pending', 'cancelled'].map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`rounded-xl text-xs ${
                statusFilter === s
                  ? 'bg-gold-gradient text-[#070B14] font-semibold'
                  : 'border-white/10 text-foreground/60 hover:text-foreground hover:bg-white/5'
              }`}
            >
              {s === 'all' ? t('common.all') : s === 'paid' ? t('adminSalary.paidLabel') : s === 'pending' ? t('common.pending') : t('status.cancelled')}
            </Button>
          ))}
        </div>
      </div>

      {/* Table / Cards */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="glass rounded-2xl p-4 animate-pulse h-20" />
          ))}
        </div>
      ) : salaryBonuses.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center">
          <Banknote className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">{t('adminSalary.noSalaryRecords')}</p>
          <p className="text-muted-foreground text-xs mt-1">{t('admin.fillDetails')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {salaryBonuses.map((item) => {
            const statusCfg = getStatusConfig(item.status, t);
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="glass rounded-2xl p-4 hover:glow-gold transition-all"
              >
                <div className="flex items-start gap-3">
                  {/* User Avatar */}
                  <div className="w-10 h-10 rounded-xl bg-gold-gradient flex items-center justify-center text-sm font-bold text-[#070B14] shrink-0">
                    {item.user?.name?.charAt(0) || 'U'}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-foreground text-sm font-medium truncate">
                        {item.user?.name || item.user?.userId || 'User'}
                      </p>
                      <Badge className={`${statusCfg.bg} ${statusCfg.color} ${statusCfg.border} border text-[10px]`}>
                        {statusCfg.label}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-xs">{item.user?.userId} • {item.user?.whatsapp}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        W{item.weekNumber}/{item.year}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {item.directReferrals} {t('adminSalary.directReferrals').toLowerCase()}
                      </span>
                      <span className="flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        {t('adminSalary.omzetAmount')}: {formatRupiah(item.omzet)}
                      </span>
                    </div>
                    {item.note && (
                      <p className="text-muted-foreground/70 text-[10px] mt-1 truncate">{item.note}</p>
                    )}
                  </div>

                  {/* Amount & Actions */}
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-[#D4AF37]">{formatRupiah(item.amount)}</p>
                    <div className="flex items-center gap-1 mt-2 justify-end">
                      <button
                        onClick={() => openDetailDialog(item)}
                        className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                        title={t('admin.previewLabel')}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      {item.status === 'pending' && (
                        <button
                          onClick={() => handlePay(item.id)}
                          className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-400 transition-colors"
                          title={t('adminSalary.markAsPaid')}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {item.status === 'paid' && (
                        <button
                          onClick={() => handleCancel(item.id)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                          title={t('status.cancelled')}
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => openEditDialog(item)}
                        className="p-1.5 rounded-lg hover:bg-blue-500/10 text-muted-foreground hover:text-blue-400 transition-colors"
                        title={t('common.edit')}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                        title={t('common.delete')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-xl border-white/10"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-muted-foreground text-sm">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-xl border-white/10"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* ─── Manual Credit Dialog ─── */}
      <AnimatePresence>
        {showManualDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowManualDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-strong rounded-2xl p-6 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-foreground font-semibold flex items-center gap-2">
                  <Plus className="w-4 h-4 text-emerald-400" />
                  {t('admin.addNew')} {t('adminSalary.title')}
                </h3>
                <button onClick={() => setShowManualDialog(false)} className="p-1 rounded-lg hover:bg-white/5">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-muted-foreground text-xs mb-1 block">User ID</label>
                  <Input
                    value={manualForm.userId}
                    onChange={(e) => setManualForm((p) => ({ ...p, userId: e.target.value }))}
                    placeholder={t('common.search')}
                    className="glass rounded-xl border-white/10 bg-transparent"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-muted-foreground text-xs mb-1 block">{t('adminSalary.weekNumber')}</label>
                    <Input
                      type="number"
                      value={manualForm.weekNumber}
                      onChange={(e) => setManualForm((p) => ({ ...p, weekNumber: parseInt(e.target.value) || 0 }))}
                      className="glass rounded-xl border-white/10 bg-transparent"
                    />
                  </div>
                  <div>
                    <label className="text-muted-foreground text-xs mb-1 block">{t('adminSalary.year')}</label>
                    <Input
                      type="number"
                      value={manualForm.year}
                      onChange={(e) => setManualForm((p) => ({ ...p, year: parseInt(e.target.value) || 0 }))}
                      className="glass rounded-xl border-white/10 bg-transparent"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-muted-foreground text-xs mb-1 block">{t('admin.amountLabel')} (Rp)</label>
                  <Input
                    type="number"
                    value={manualForm.amount}
                    onChange={(e) => setManualForm((p) => ({ ...p, amount: parseInt(e.target.value) || 0 }))}
                    className="glass rounded-xl border-white/10 bg-transparent"
                  />
                </div>
                <div>
                  <label className="text-muted-foreground text-xs mb-1 block">{t('admin.descriptionLabel')}</label>
                  <Input
                    value={manualForm.note}
                    onChange={(e) => setManualForm((p) => ({ ...p, note: e.target.value }))}
                    placeholder={t('common.noData')}
                    className="glass rounded-xl border-white/10 bg-transparent"
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <Button
                  onClick={() => setShowManualDialog(false)}
                  variant="outline"
                  className="flex-1 rounded-xl border-white/10"
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={handleManualCredit}
                  disabled={processing}
                  className="flex-1 bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90"
                >
                  {processing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  {t('admin.addNew')}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Edit Dialog ─── */}
      <AnimatePresence>
        {showEditDialog && selectedItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowEditDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-strong rounded-2xl p-6 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-foreground font-semibold flex items-center gap-2">
                  <Edit2 className="w-4 h-4 text-blue-400" />
                  {t('common.edit')} {t('adminSalary.title')}
                </h3>
                <button onClick={() => setShowEditDialog(false)} className="p-1 rounded-lg hover:bg-white/5">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="glass rounded-xl p-3 text-sm">
                  <p className="text-muted-foreground text-xs mb-1">{t('admin.userLabel')}</p>
                  <p className="text-foreground font-medium">{selectedItem.user?.name || selectedItem.user?.userId}</p>
                  <p className="text-muted-foreground text-xs">W{selectedItem.weekNumber}/{selectedItem.year}</p>
                </div>
                <div>
                  <label className="text-muted-foreground text-xs mb-1 block">{t('admin.amountLabel')} (Rp)</label>
                  <Input
                    type="number"
                    value={editForm.amount}
                    onChange={(e) => setEditForm((p) => ({ ...p, amount: parseInt(e.target.value) || 0 }))}
                    className="glass rounded-xl border-white/10 bg-transparent"
                  />
                </div>
                <div>
                  <label className="text-muted-foreground text-xs mb-1 block">{t('admin.descriptionLabel')}</label>
                  <Input
                    value={editForm.note}
                    onChange={(e) => setEditForm((p) => ({ ...p, note: e.target.value }))}
                    className="glass rounded-xl border-white/10 bg-transparent"
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <Button
                  onClick={() => setShowEditDialog(false)}
                  variant="outline"
                  className="flex-1 rounded-xl border-white/10"
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={handleEdit}
                  className="flex-1 bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90"
                >
                  {t('common.save')}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Detail Dialog ─── */}
      <AnimatePresence>
        {showDetailDialog && selectedItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowDetailDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-strong rounded-2xl p-6 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-foreground font-semibold flex items-center gap-2">
                  <Eye className="w-4 h-4 text-[#D4AF37]" />
                  {t('admin.previewLabel')} {t('adminSalary.title')}
                </h3>
                <button onClick={() => setShowDetailDialog(false)} className="p-1 rounded-lg hover:bg-white/5">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="glass rounded-xl p-3">
                  <p className="text-muted-foreground text-xs mb-1">{t('admin.userLabel')}</p>
                  <p className="text-foreground font-medium">{selectedItem.user?.name || selectedItem.user?.userId}</p>
                  <p className="text-muted-foreground text-xs">{selectedItem.user?.userId} • {selectedItem.user?.whatsapp}</p>
                  <p className="text-muted-foreground text-xs">{t('adminSalary.directReferrals')}: {selectedItem.user?.referralCode}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="glass rounded-xl p-3">
                    <p className="text-muted-foreground text-[10px]">{t('adminSalary.weekNumber')}</p>
                    <p className="text-foreground font-semibold">W{selectedItem.weekNumber}/{selectedItem.year}</p>
                  </div>
                  <div className="glass rounded-xl p-3">
                    <p className="text-muted-foreground text-[10px]">{t('admin.statusLabel')}</p>
                    <Badge className={`${getStatusConfig(selectedItem.status, t).bg} ${getStatusConfig(selectedItem.status, t).color} ${getStatusConfig(selectedItem.status, t).border} border text-[10px]`}>
                      {getStatusConfig(selectedItem.status, t).label}
                    </Badge>
                  </div>
                  <div className="glass rounded-xl p-3">
                    <p className="text-muted-foreground text-[10px]">{t('adminSalary.directReferrals')}</p>
                    <p className="text-foreground font-semibold">{selectedItem.directReferrals}</p>
                  </div>
                  <div className="glass rounded-xl p-3">
                    <p className="text-muted-foreground text-[10px]">{t('adminSalary.omzetAmount')}</p>
                    <p className="text-foreground font-semibold">{formatRupiah(selectedItem.omzet)}</p>
                  </div>
                </div>

                <div className="glass-gold glow-gold rounded-xl p-3 text-center">
                  <p className="text-muted-foreground text-[10px]">{t('adminSalary.salaryAmount')}</p>
                  <p className="text-2xl font-bold text-gold-gradient">{formatRupiah(selectedItem.amount)}</p>
                </div>

                {selectedItem.note && (
                  <div className="glass rounded-xl p-3">
                    <p className="text-muted-foreground text-[10px] mb-1">{t('admin.descriptionLabel')}</p>
                    <p className="text-foreground text-xs">{selectedItem.note}</p>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{t('admin.dateLabel')}: {new Date(selectedItem.createdAt).toLocaleString('id-ID')}</span>
                  {selectedItem.paidAt && (
                    <span>{t('adminSalary.paidLabel')}: {new Date(selectedItem.paidAt).toLocaleString('id-ID')}</span>
                  )}
                </div>
              </div>

              <Button
                onClick={() => setShowDetailDialog(false)}
                className="w-full mt-4 bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90"
              >
                {t('common.close')}
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

