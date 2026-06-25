'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Banknote, CheckCircle2, XCircle, TrendingUp,
  Calendar, AlertTriangle, RefreshCw, Clock, Users, Wallet, ArrowRight,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { formatRupiah } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/lib/i18n';

interface EligibilityInfo {
  directRefs: number;
  activeRefDeposits: number;
  minDirectRefs: number;
  groupOmzet: number;
  salaryRate: number;
  maxWeeks: number;
  weeksReceived: number;
  weeksRemaining: number;
  estimatedSalary: number;
  isEligible: boolean;
  isActive: boolean;
  refProgress: number;
  isCompleted: boolean;
  requireActiveDeposit: boolean;
  userHasActiveDeposit: boolean;
  allRefsActive: boolean;
  meetsMinDirectRefs: boolean;
}

interface SalaryBonusEntry {
  id: string;
  weekNumber: number;
  year: number;
  weekOfTotal: number;
  amount: number;
  baseOmzet: number;
  salaryRate: number;
  activeRefDeposits: number;
  directRefs: number;
  groupOmzet: number;
  status: string;
  createdAt: string;
}

interface SalaryData {
  eligibility: EligibilityInfo;
  salaryBonuses: SalaryBonusEntry[];
  totalSalaryEarned: number;
  canClaim: boolean;
  alreadyClaimedThisWeek: boolean;
  currentWeek: number;
}

export default function SalaryBonusPage() {
  const { token } = useAuthStore();
  const t = useT();
  const [data, setData] = useState<SalaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/salary-bonus', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error || t('common.error'));
      }
    } catch {
      setError(t('common.networkError'));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleClaim = async () => {
    if (!token || claiming) return;
    setClaiming(true);
    try {
      const res = await fetch('/api/salary-bonus', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        toast({
          title: t('common.success'),
          description: json.message || t('salary.claimSuccess'),
        });
        fetchData();
      } else {
        toast({
          title: t('common.error'),
          description: json.message || json.error || t('common.operationFailed'),
          variant: 'destructive',
        });
      }
    } catch {
      toast({ title: t('common.error'), description: t('common.networkError'), variant: 'destructive' });
    } finally {
      setClaiming(false);
    }
  };

  const retry = () => {
    setError(null);
    setLoading(true);
    fetchData();
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="h-40 rounded-2xl bg-muted/40 animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-muted/40 animate-pulse" />
          ))}
        </div>
        <div className="h-64 rounded-2xl bg-muted/40 animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6 text-destructive" />
          </div>
          <h3 className="text-foreground font-semibold mb-1">{t('salary.loadFailed')}</h3>
          <p className="text-muted-foreground text-sm mb-6">{error}</p>
          <Button onClick={retry} variant="default" className="rounded-xl">
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('salary.tryAgain')}
          </Button>
        </div>
      </div>
    );
  }

  const eligibility = data?.eligibility;
  const isEligible = eligibility?.isEligible ?? false;
  const isCompleted = eligibility?.isCompleted ?? false;
  const salaryRate = eligibility?.salaryRate ?? 1;
  const maxWeeks = eligibility?.maxWeeks ?? 0;
  const weeksReceived = eligibility?.weeksReceived ?? 0;
  const activeRefDeposits = eligibility?.activeRefDeposits ?? 0;
  const directRefs = eligibility?.directRefs ?? 0;
  const minDirectRefs = eligibility?.minDirectRefs ?? 10;
  const meetsMinDirectRefs = eligibility?.meetsMinDirectRefs ?? false;
  const userHasActiveDeposit = eligibility?.userHasActiveDeposit ?? false;
  const allRefsActive = eligibility?.allRefsActive ?? false;
  const unlimited = !maxWeeks || maxWeeks <= 0;
  const refPct = Math.min((directRefs / minDirectRefs) * 100, 100);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5 pb-6">
      {/* ─────────── HEADER ─────────── */}
      <header className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Banknote className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
                  Gaji Mingguan
                </h1>
                <p className="text-muted-foreground text-sm mt-0.5">
                  {salaryRate}% omzet grup · dibayar setiap Senin
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className={
                isEligible
                  ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5'
                  : 'border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5'
              }
            >
              {isEligible ? (
                <><CheckCircle2 className="w-3 h-3 mr-1" />Layak</>
              ) : (
                <><XCircle className="w-3 h-3 mr-1" />Belum Layak</>
              )}
            </Badge>
          </div>

          {/* Quick facts */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            <div className="rounded-xl border border-border bg-background/50 p-3">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                <Clock className="w-3 h-3" /> Jadwal
              </div>
              <p className="text-foreground text-sm font-semibold mt-1">Senin 00:00 WIB</p>
            </div>
            <div className="rounded-xl border border-border bg-background/50 p-3">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                <Users className="w-3 h-3" /> Min. Undangan
              </div>
              <p className="text-foreground text-sm font-semibold mt-1">{minDirectRefs} orang</p>
            </div>
            <div className="rounded-xl border border-border bg-background/50 p-3">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                <TrendingUp className="w-3 h-3" /> Rate
              </div>
              <p className="text-foreground text-sm font-semibold mt-1">{salaryRate}% / minggu</p>
            </div>
            <div className="rounded-xl border border-border bg-background/50 p-3">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                <Calendar className="w-3 h-3" /> Durasi
              </div>
              <p className="text-foreground text-sm font-semibold mt-1">
                {unlimited ? 'Selamanya' : `${maxWeeks} minggu`}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* ─────────── COMPLETED BANNER ─────────── */}
      {isCompleted && (
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          </div>
          <h2 className="text-foreground text-lg font-semibold mb-1">Program Gaji Selesai</h2>
          <p className="text-muted-foreground text-sm">
            Anda telah menerima gaji mingguan selama {unlimited ? 'selamanya' : `${maxWeeks} minggu`}.
            Total: <span className="font-semibold text-foreground">{formatRupiah(data?.totalSalaryEarned || 0)}</span>
          </p>
        </div>
      )}

      {/* ─────────── ELIGIBILITY / REQUIREMENTS ─────────── */}
      {!isCompleted && (
        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <h2 className="text-base font-semibold text-foreground mb-5">Syarat Kelayakan</h2>

          {/* Requirement 1: Invite */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  meetsMinDirectRefs
                    ? 'bg-emerald-500 text-white'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {meetsMinDirectRefs ? '✓' : '1'}
                </span>
                <span className="text-sm font-medium text-foreground">
                  Undang {minDirectRefs} orang (Level 1)
                </span>
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                  Tanpa batas waktu
                </Badge>
              </div>
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                {directRefs} / {minDirectRefs}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  meetsMinDirectRefs ? 'bg-emerald-500' : 'bg-primary'
                }`}
                style={{ width: `${refPct}%` }}
              />
            </div>
            {!meetsMinDirectRefs && (
              <p className="text-xs text-muted-foreground pt-1">
                Undang minimal {minDirectRefs} orang. Bebas kapan saja — tidak ada tenggat waktu.
              </p>
            )}
          </div>

          {/* Divider */}
          <div className="h-px bg-border my-5" />

          {/* Requirement 2: Active investment */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                userHasActiveDeposit
                  ? 'bg-emerald-500 text-white'
                  : meetsMinDirectRefs
                    ? 'bg-amber-500 text-white'
                    : 'bg-muted text-muted-foreground'
              }`}>
                {userHasActiveDeposit ? '✓' : '2'}
              </span>
              <span className="text-sm font-medium text-foreground">Aktif investasi</span>
            </div>
            <span className={`text-xs font-medium ${
              userHasActiveDeposit ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
            }`}>
              {userHasActiveDeposit ? 'Terpenuhi' : 'Belum'}
            </span>
          </div>

          {/* Refs active warning (only if req 1 + req 2 ok but refs not all active) */}
          {meetsMinDirectRefs && userHasActiveDeposit && !allRefsActive && (
            <div className="mt-4 flex items-start gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Semua undangan langsung wajib aktif investasi. Saat ini {activeRefDeposits}/{directRefs} undangan sudah aktif.
              </p>
            </div>
          )}

          {/* Claim area */}
          <div className="mt-6">
            {data?.alreadyClaimedThisWeek ? (
              <div className="flex items-center justify-center gap-2 p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  Gaji minggu ini sudah dikreditkan otomatis
                </span>
              </div>
            ) : isEligible ? (
              <Button
                onClick={handleClaim}
                disabled={claiming}
                className="w-full h-12 rounded-xl font-semibold"
                size="lg"
              >
                {claiming ? (
                  <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Memproses...</>
                ) : (
                  <>Klaim Gaji Mingguan <ArrowRight className="w-4 h-4 ml-2" /></>
                )}
              </Button>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  {!meetsMinDirectRefs
                    ? `Selesaikan syarat 1: undang minimal ${minDirectRefs} orang.`
                    : !userHasActiveDeposit
                      ? 'Selesaikan syarat 2: wajib memiliki investasi aktif.'
                      : 'Pastikan semua undangan langsung sudah aktif investasi.'}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ─────────── STATS ─────────── */}
      {((meetsMinDirectRefs && userHasActiveDeposit) || (data?.totalSalaryEarned || 0) > 0) && (
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-2">
              <Wallet className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-lg font-bold text-foreground tabular-nums">
              {formatRupiah(data?.totalSalaryEarned || 0)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Total diterima</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
              <Calendar className="w-4 h-4 text-primary" />
            </div>
            <p className="text-lg font-bold text-foreground tabular-nums">
              {weeksReceived}
              {unlimited && <span className="text-sm text-muted-foreground ml-1">minggu</span>}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {unlimited ? 'Minggu diterima' : `dari ${maxWeeks} minggu`}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center mb-2">
              <TrendingUp className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-lg font-bold text-foreground tabular-nums">{salaryRate}%</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Rate / minggu</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center mb-2">
              <Users className="w-4 h-4 text-blue-500" />
            </div>
            <p className="text-lg font-bold text-foreground tabular-nums">{activeRefDeposits}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Undangan aktif</p>
          </div>
        </section>
      )}

      {/* ─────────── HISTORY ─────────── */}
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            Riwayat Gaji
          </h2>
          {data?.salaryBonuses && data.salaryBonuses.length > 0 && (
            <span className="text-xs text-muted-foreground">{data.salaryBonuses.length} entri</span>
          )}
        </div>

        {data?.salaryBonuses && data.salaryBonuses.length > 0 ? (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {data.salaryBonuses.map((bonus) => (
              <div
                key={bonus.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-border bg-background/50 hover:bg-muted/40 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Banknote className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground">
                      Minggu {bonus.weekOfTotal}
                    </p>
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">
                      {bonus.salaryRate}%
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Omzet {formatRupiah(bonus.baseOmzet)} · {bonus.activeRefDeposits} undangan aktif
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {formatRupiah(bonus.amount)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(bonus.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
              <Calendar className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">Belum ada riwayat gaji</p>
            <p className="text-xs text-muted-foreground mt-1">
              Gaji dikreditkan otomatis setiap Senin 00:00 WIB setelah syarat terpenuhi
            </p>
          </div>
        )}
      </section>

      {/* ─────────── HOW IT WORKS ─────────── */}
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="text-base font-semibold text-foreground mb-4">Cara Kerja</h2>
        <ol className="space-y-3">
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
              1
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">Undang {minDirectRefs} orang (Level 1)</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Bebas kapan saja — tidak ada tenggat waktu.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
              2
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">Aktif investasi</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Anda dan semua undangan langsung wajib punya investasi aktif.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
              3
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">Gaji {salaryRate}% dikreditkan setiap Senin</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Dihitung dari omzet grup, dibayar otomatis setiap Senin 00:00 WIB.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
              4
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">Berlangsung selamanya</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tidak ada batas minggu. Selama syarat terpenuhi, gaji terus mengalir.
              </p>
            </div>
          </li>
        </ol>

        {/* ★ Contoh perhitungan ilustrasi ★ */}
        <div className="mt-5 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <p className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-primary" />
            Contoh Perhitungan Gaji
          </p>
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>10 undangan × Rp 160.000</span>
              <span className="text-foreground font-medium tabular-nums">= Rp 1.600.000</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Omzet grup minimum</span>
              <span className="text-foreground font-medium tabular-nums">Rp 1.600.000</span>
            </div>
            <div className="h-px bg-border my-2" />
            <div className="flex items-center justify-between">
              <span className="text-foreground font-semibold">Gaji mingguan ({salaryRate}%)</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold text-sm tabular-nums">
                = Rp 16.000
              </span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
            <span className="font-medium text-foreground">Catatan:</span> 1% dihitung dari total omzet grup (investasi Anda + semua downline aktif).
            Semakin besar omzet grup, semakin besar gaji. Berlaku selamanya selama syarat terpenuhi.
          </p>
        </div>

        <div className="mt-5 flex items-center gap-2 p-3.5 rounded-xl bg-muted/50 border border-border">
          <Wallet className="w-4 h-4 text-primary shrink-0" />
          <p className="text-xs text-foreground">
            Gaji masuk ke <span className="font-semibold">saldo utama</span> dan bisa ditarik kapan saja.
          </p>
        </div>
      </section>
    </div>
  );
}
