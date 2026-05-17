'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Landmark, Plus, Pencil, Trash2, Star, CheckCircle2,
  Building2, User, Hash, Loader2, AlertTriangle, RefreshCw
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/lib/i18n';

interface Bank {
  id: string;
  bankName: string;
  accountNo: string;
  holderName: string;
  isPrimary: boolean;
}

export default function BankPage() {
  const { token } = useAuthStore();
  const t = useT();
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingBank, setEditingBank] = useState<Bank | null>(null);
  const [deletingBank, setDeletingBank] = useState<Bank | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [bankName, setBankName] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [holderName, setHolderName] = useState('');

  const fetchBanks = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/user/bank', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setBanks(data.data || []);
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchBanks();
  }, [fetchBanks]);

  const openAddDialog = () => {
    setEditingBank(null);
    setBankName('');
    setAccountNo('');
    setHolderName('');
    setDialogOpen(true);
  };

  const openEditDialog = (bank: Bank) => {
    setEditingBank(bank);
    setBankName(bank.bankName);
    setAccountNo(bank.accountNo);
    setHolderName(bank.holderName);
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!bankName || !accountNo || !holderName) {
      toast({ title: 'Error', description: t('bank.allFieldsRequired'), variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const url = '/api/user/bank';
      const method = editingBank ? 'PUT' : 'POST';
      const body = editingBank
        ? { id: editingBank.id, bankName, accountNo, holderName }
        : { bankName, accountNo, holderName };

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.success) {
        toast({ title: 'Berhasil', description: editingBank ? t('bank.updated') : t('bank.added') });
        setDialogOpen(false);
        fetchBanks();
      } else {
        toast({ title: 'Gagal', description: data.error || t('common.operationFailed'), variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: t('common.error'), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingBank) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/user/bank', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: deletingBank.id }),
      });
      const data = await res.json();

      if (data.success) {
        toast({ title: 'Berhasil', description: t('bank.deleted') });
        setDeleteDialogOpen(false);
        setDeletingBank(null);
        fetchBanks();
      } else {
        toast({ title: 'Gagal', description: data.error || t('common.operationFailed'), variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: t('common.error'), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const retry = () => {
    setError(null);
    setLoading(true);
    fetchBanks();
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6">
        <div className="animate-pulse space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="glass rounded-2xl p-4 sm:p-6 h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6">
        <div className="glass glow-gold rounded-2xl p-5 sm:p-8 lg:p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-red-400" />
          </div>
          <h3 className="text-foreground font-semibold mb-1">{t('dashboard.loadFailed')}</h3>
          <p className="text-muted-foreground text-sm mb-6">{error}</p>
          <Button
            onClick={retry}
            className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('dashboard.tryAgain')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6 space-y-4 sm:space-y-6 pb-4 sm:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground text-xl font-bold">{t('bank.title')}</h1>
          <p className="text-muted-foreground text-sm">{t('bank.title')}</p>
        </div>
        <Button
          onClick={openAddDialog}
          className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold"
        >
          <Plus className="w-4 h-4 mr-2" />
          {t('bank.addBtn')}</Button>
      </div>

      {/* Bank List */}
      {banks.length > 0 ? (
        <div className="space-y-4">
          <AnimatePresence>
            {banks.map((bank, i) => (
              <motion.div
                key={bank.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: i * 0.05 }}
                className="glass glow-gold rounded-2xl p-3 sm:p-5 lg:p-6 hover:glow-gold-strong transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center shrink-0">
                      <Landmark className="w-6 h-6 text-[#D4AF37]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-foreground font-semibold text-base truncate">{bank.bankName}</h3>
                        {bank.isPrimary && (
                          <Badge className="bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 text-[10px]">
                            <Star className="w-3 h-3 mr-0.5 fill-[#D4AF37]" />
                            {t('bank.primary')}</Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground text-sm font-mono">{bank.accountNo}</p>
                      <p className="text-muted-foreground text-xs mt-0.5">{bank.holderName}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => openEditDialog(bank)}
                      className="p-2 rounded-xl hover:bg-white/5 text-muted-foreground hover:text-[#D4AF37] transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setDeletingBank(bank);
                        setDeleteDialogOpen(true);
                      }}
                      className="p-2 rounded-xl hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-5 sm:p-8 lg:p-12 text-center"
        >
          <Landmark className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-foreground font-semibold mb-1">{t('bank.noBanks')}</h3>
          <p className="text-muted-foreground text-sm mb-4">
            {t('bank.noBanks')}
          </p>
          <Button
            onClick={openAddDialog}
            className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('bank.addBank')}</Button>
        </motion.div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="glass-strong border-border/30 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {editingBank ? 'Edit Rekening' : 'Tambah Rekening'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              {editingBank ? t('bank.editBank') : t('bank.addBank')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-foreground text-sm">{t('bank.bankName')}</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={t('bank.bankExample')}
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="pl-10 h-11 sm:h-12 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground text-sm">{t('bank.accountNo')}</Label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={t('bank.enterAccountNo')}
                  value={accountNo}
                  onChange={(e) => setAccountNo(e.target.value.replace(/[^0-9]/g, ''))}
                  className="pl-10 h-11 sm:h-12 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground text-sm">{t('bank.holderName')}</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={t('bank.namePerBook')}
                  value={holderName}
                  onChange={(e) => setHolderName(e.target.value)}
                  className="pl-10 h-11 sm:h-12 bg-input/50 border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground/50"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              className="rounded-xl text-muted-foreground"
            >
              Batal
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              {editingBank ? 'Simpan' : 'Tambah'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="glass-strong border-border/30 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">{t('bank.deleteBank')}</DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Rekening <span className="text-foreground font-medium">{deletingBank?.bankName}</span> {t('bank.deleteConfirm')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteDialogOpen(false)}
              className="rounded-xl text-muted-foreground"
            >
              Batal
            </Button>
            <Button
              onClick={handleDelete}
              disabled={submitting}
              className="bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
