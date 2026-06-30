'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Package, Clock, TrendingUp, AlertTriangle, RefreshCw,
  Coins, Calendar, CheckCircle2, XCircle, Loader2, ShieldCheck, Zap, Timer, CalendarX2
} from 'lucide-react';
import { WeekendNoticeBanner } from '@/components/nexvo/shared/WeekendNoticeBanner';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { formatRupiah } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useT } from '@/lib/i18n';

/* ───────── Profit Countdown (real-time, next 00:00 WIB) ───────── */
function getNextMidnightWIB(): Date {
  // WIB = UTC+7. Hitung waktu WIB sekarang, lalu cari 00:00 WIB berikutnya.
  const now = new Date();
  const wibNowMs = now.getTime() + (7 * 60 + now.getTimezoneOffset()) * 60000;
  const wibNow = new Date(wibNowMs);
  // 00:00 WIB hari ini (dalam WIB wall-clock)
  const wibMidnightToday = new Date(wibNow);
  wibMidnightToday.setHours(24, 0, 0, 0); // 00:00 besok (WIB wall-clock)
  // Konversi balik ke UTC ms
  const utcMs = wibMidnightToday.getTime() - (7 * 60 + now.getTimezoneOffset()) * 60000;
  return new Date(utcMs);
}

function isWeekendWIB(): boolean {
  const now = new Date();
  const wibNowMs = now.getTime() + (7 * 60 + now.getTimezoneOffset()) * 60000;
  const wibNow = new Date(wibNowMs);
  const day = wibNow.getDay(); // 0=Sun, 6=Sat
  return day === 0 || day === 6;
}

function getNextWeekdayMidnightWIB(): Date {
  // Cari 00:00 WIB hari kerja berikutnya (Senin-Jumat)
  // Lewati Sabtu & Minggu — profit tidak masuk di weekend
  const now = new Date();
  let next = getNextMidnightWIB();
  for (let i = 0; i < 7; i++) {
    const wibMs = next.getTime() + (7 * 60 + now.getTimezoneOffset()) * 60000;
    const wibDate = new Date(wibMs);
    const day = wibDate.getDay();
    if (day >= 1 && day <= 5) return next; // Senin-Jumat
    // Tambah 1 hari (24h) untuk cek 00:00 WIB berikutnya
    next = new Date(next.getTime() + 24 * 3600000);
  }
  return getNextMidnightWIB();
}

function useProfitCountdown(): { h: string; m: string; s: string; weekend: boolean } {
  const [tick, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => setTick(t => t + 1), 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const weekend = isWeekendWIB();
  // Hitung target 00:00 WIB berikutnya. Kalau weekend → lompat ke Senin 00:00 WIB.
  // Note: kalau weekend, profit TIDAK akan masuk sampai Senin 00:00 WIB.
  const target = weekend ? getNextWeekdayMidnightWIB() : getNextMidnightWIB();
  const diff = Math.max(0, target.getTime() - Date.now());
  const totalSec = Math.floor(diff / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  return {
    h: String(h).padStart(2, '0'),
    m: String(m).padStart(2, '0'),
    s: String(s).padStart(2, '0'),
    weekend,
  };
}

function ProfitCountdownBadge({ dailyProfit }: { dailyProfit: number }) {
  const { h, m, s, weekend } = useProfitCountdown();
  if (weekend) {
    return (
      <div className="mt-3 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <CalendarX2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-[10px] text-amber-400 font-bold truncate">
            ⏸️ LIBUR — Profit masuk Senin 00:00 WIB
          </span>
        </div>
        <div className="flex items-center gap-1 font-mono text-[11px] font-bold">
          <span className="text-amber-400">{h}</span>
          <span className="text-amber-400/50">:</span>
          <span className="text-amber-400">{m}</span>
          <span className="text-amber-400/50">:</span>
          <span className="text-amber-400">{s}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-3 px-3 py-2 rounded-xl bg-emerald-400/5 border border-emerald-400/15 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 min-w-0">
        <Timer className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span className="text-[10px] text-muted-foreground truncate">
          Profit berikutnya masuk (00:00 WIB)
        </span>
      </div>
      <div className="flex items-center gap-1 font-mono text-[11px] font-bold">
        <span className="text-emerald-400">{h}</span>
        <span className="text-muted-foreground">:</span>
        <span className="text-emerald-400">{m}</span>
        <span className="text-muted-foreground">:</span>
        <span className="text-emerald-400">{s}</span>
      </div>
    </div>
  );
}

/* ───────── Types ───────── */
interface AssetItem {
  id: string;
  type: 'investment' | 'product';
  name: string;
  amount: number;
  dailyProfit: number;
  totalProfitEarned: number;
  profitRate: number;
  contractDays: number;
  status: string;
  startDate: string;
  endDate: string | null;
  lastProfitDate: string | null;
  quantity?: number;
}

/* ───────── Helpers ───────── */
function formatDate(dateStr: string) {
  // Convert UTC to WIB (UTC+7) for display
  const d = new Date(dateStr);
  const wibMs = d.getTime() + d.getTimezoneOffset() * 60000 + 7 * 3600000;
  const wibDate = new Date(wibMs);
  return wibDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr: string) {
  // Convert UTC to WIB (UTC+7) for display
  const d = new Date(dateStr);
  const wibMs = d.getTime() + d.getTimezoneOffset() * 60000 + 7 * 3600000;
  const wibDate = new Date(wibMs);
  return wibDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIB';
}

function getDaysRemaining(endDate: string | null): number {
  if (!endDate) return 0;
  // Count calendar days in WIB timezone
  const endUTC = new Date(endDate);
  const nowUTC = new Date();
  const WIB_OFFSET = 7 * 3600000;
  const endWIB = new Date(endUTC.getTime() + endUTC.getTimezoneOffset() * 60000 + WIB_OFFSET);
  const nowWIB = new Date(nowUTC.getTime() + nowUTC.getTimezoneOffset() * 60000 + WIB_OFFSET);
  const endDay = new Date(endWIB.getFullYear(), endWIB.getMonth(), endWIB.getDate());
  const todayDay = new Date(nowWIB.getFullYear(), nowWIB.getMonth(), nowWIB.getDate());
  const diffDays = Math.ceil((endDay.getTime() - todayDay.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/* ───────── v2.6 WEEKDAY HELPERS ───────── */
/* Cron credits profit ONLY on weekdays (Mon-Fri, libur Sabtu-Minggu).
   So progress display must use weekdays too — otherwise user sees
   "10/30 hari" but only 8 × dailyProfit credited (mismatch). */

function countWeekdaysBetween(start: Date, end: Date): number {
  let count = 0;
  const cur = new Date(start);
  // Safety cap
  let safety = 400;
  while (cur < end && safety-- > 0) {
    const day = cur.getDay(); // 0=Sun, 6=Sat
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function getDaysElapsed(startDate: string): number {
  // ★ v2.6: Calendar days (used for "days remaining" display only)
  const startUTC = new Date(startDate);
  const nowUTC = new Date();
  const WIB_OFFSET = 7 * 3600000;
  const startWIB = new Date(startUTC.getTime() + startUTC.getTimezoneOffset() * 60000 + WIB_OFFSET);
  const nowWIB = new Date(nowUTC.getTime() + nowUTC.getTimezoneOffset() * 60000 + WIB_OFFSET);
  const startDay = new Date(startWIB.getFullYear(), startWIB.getMonth(), startWIB.getDate());
  const todayDay = new Date(nowWIB.getFullYear(), nowWIB.getMonth(), nowWIB.getDate());
  const diffDays = Math.floor((todayDay.getTime() - startDay.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

function getWeekdaysElapsed(startDate: string): number {
  // ★ v2.6: Count ONLY weekdays (Mon-Fri) since startDate — matches cron's profit crediting.
  //   Profit libur di Sabtu & Minggu, jadi progress juga harus libur di weekend.
  //   This makes "X hari kerja × dailyProfit = totalProfitEarned" hold true.
  const startUTC = new Date(startDate);
  const nowUTC = new Date();
  const WIB_OFFSET = 7 * 3600000;
  const startWIB = new Date(startUTC.getTime() + startUTC.getTimezoneOffset() * 60000 + WIB_OFFSET);
  const nowWIB = new Date(nowUTC.getTime() + nowUTC.getTimezoneOffset() * 60000 + WIB_OFFSET);
  const startDay = new Date(startWIB.getFullYear(), startWIB.getMonth(), startWIB.getDate());
  const todayDay = new Date(nowWIB.getFullYear(), nowWIB.getMonth(), nowWIB.getDate());
  return countWeekdaysBetween(startDay, todayDay);
}

function getWeekdaysInContract(startDate: string, contractDays: number): number {
  // ★ v2.6: Count weekdays from startDate to startDate + contractDays.
  //   This is the actual number of profit-crediting days for this contract.
  //   contractDays is calendar days, so we compute the weekday equivalent.
  if (contractDays <= 0) return 0;
  const startUTC = new Date(startDate);
  const WIB_OFFSET = 7 * 3600000;
  const startWIB = new Date(startUTC.getTime() + startUTC.getTimezoneOffset() * 60000 + WIB_OFFSET);
  const startDay = new Date(startWIB.getFullYear(), startWIB.getMonth(), startWIB.getDate());
  const endDay = new Date(startDay);
  endDay.setDate(endDay.getDate() + contractDays);
  return countWeekdaysBetween(startDay, endDay);
}

function getProgress(startDate: string, contractDays: number): number {
  // ★ v2.6: Progress based on WEEKDAYS (matches cron's profit crediting)
  const weekdaysElapsed = getWeekdaysElapsed(startDate);
  const weekdaysInContract = getWeekdaysInContract(startDate, contractDays);
  if (weekdaysInContract <= 0) return 0;
  return Math.min(100, Math.round((weekdaysElapsed / weekdaysInContract) * 100));
}

function getExpectedProfit(startDate: string, dailyProfit: number, contractDays: number, status: string): number {
  // ★ v2.6: Expected profit = weekdays elapsed × dailyProfit (matches cron's logic).
  //   For completed/cancelled status, expected = totalProfitEarned (already final).
  if (status !== 'active') return -1; // not applicable
  const weekdaysElapsed = getWeekdaysElapsed(startDate);
  const weekdaysInContract = getWeekdaysInContract(startDate, contractDays);
  const cappedElapsed = Math.min(weekdaysElapsed, weekdaysInContract);
  return cappedElapsed * dailyProfit;
}

function getStatusConfig(status: string, t: (key: string) => string) {
  switch (status) {
    case 'active':
      return { label: t('assets.statusActive'), color: 'text-emerald-400', bg: 'bg-cardmerald-400/10', icon: CheckCircle2 };
    case 'completed':
      return { label: t('assets.statusCompleted'), color: 'text-blue-400', bg: 'bg-blue-400/10', icon: CheckCircle2 };
    case 'stopped':
      return { label: t('assets.statusStopped'), color: 'text-orange-400', bg: 'bg-orange-400/10', icon: XCircle };
    case 'cancelled':
      return { label: t('assets.statusCancelled'), color: 'text-red-400', bg: 'bg-red-400/10', icon: XCircle };
    default:
      return { label: status, color: 'text-muted-foreground', bg: 'bg-foreground/5', icon: Clock };
  }
}

/* ───────── Asset Card ───────── */
function AssetCard({ asset, t }: { asset: AssetItem; t: (key: string) => string }) {
  const statusCfg = getStatusConfig(asset.status, t);
  const StatusIcon = statusCfg.icon;
  const progress = getProgress(asset.startDate, asset.contractDays);
  const daysRemaining = getDaysRemaining(asset.endDate);
  const weekdaysElapsed = getWeekdaysElapsed(asset.startDate);
  const weekdaysInContract = getWeekdaysInContract(asset.startDate, asset.contractDays);
  const isInvestment = asset.type === 'investment';

  // ★ v2.6: Expected profit = weekdays elapsed × dailyProfit
  const expectedProfit = getExpectedProfit(asset.startDate, asset.dailyProfit, asset.contractDays, asset.status);
  const profitDrift = expectedProfit >= 0 ? (asset.totalProfitEarned - expectedProfit) : 0;
  const isProfitShort = expectedProfit >= 0 && profitDrift < -1; // actual < expected (cron missed)
  const isProfitOver = expectedProfit >= 0 && profitDrift > 1;  // actual > expected (manual credit)

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-strong rounded-2xl p-4 sm:p-5 relative overflow-hidden hover:glow-gold transition-all"
    >
      {/* Status indicator bar */}
      <div className={`absolute top-0 left-0 right-0 h-1 ${asset.status === 'active' ? 'bg-cardmerald-400' : asset.status === 'completed' ? 'bg-blue-400' : 'bg-orange-400'}`} />

      {/* Header */}
      <div className="flex items-start justify-between mb-3 pt-1">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isInvestment ? 'bg-purple-400/10' : 'bg-primary/10'}`}>
            <Package className={`w-5 h-5 ${isInvestment ? 'text-purple-400' : 'text-primary'}`} />
          </div>
          <div>
            <h3 className="text-foreground font-semibold text-sm">{asset.name}</h3>
            <p className="text-muted-foreground text-xs">
              {isInvestment ? t('assets.investmentPackage') : t('assets.product')} • {formatDate(asset.startDate)}
            </p>
            {!isInvestment && asset.quantity && asset.quantity > 1 && (
              <Badge className="bg-primary/10 text-primary border border-primary/20 text-[9px] font-semibold mt-0.5">
                {asset.quantity}x
              </Badge>
            )}
          </div>
        </div>
        <Badge className={`${statusCfg.bg} ${statusCfg.color} border-border text-[10px] font-semibold flex items-center gap-1`}>
          <StatusIcon className="w-3 h-3" />
          {statusCfg.label}
        </Badge>
      </div>

      {/* Amount & Profit */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-white/[0.02] rounded-xl p-3">
          <p className="text-muted-foreground text-[10px] mb-1">{t('assets.modal')}</p>
          <p className="text-foreground font-bold text-sm">{formatRupiah(asset.amount)}</p>
        </div>
        <div className="bg-white/[0.02] rounded-xl p-3">
          <p className="text-muted-foreground text-[10px] mb-1">{t('assets.profitPerDay')}</p>
          <p className="text-emerald-400 font-bold text-sm">+{formatRupiah(asset.dailyProfit)}</p>
        </div>
      </div>

      {/* Contract Details */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{t('assets.contract')}</span>
          </div>
          <span className="text-foreground font-medium">{asset.contractDays} Hari</span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>{t('assets.profitRate')}</span>
          </div>
          <span className="text-emerald-400 font-medium">{asset.profitRate}%/hari</span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Coins className="w-3.5 h-3.5" />
            <span>{t('assets.totalProfit')}</span>
          </div>
          <span className="text-primary font-bold">{formatRupiah(asset.totalProfitEarned)}</span>
        </div>

        {asset.endDate && (
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="w-3.5 h-3.5" />
              <span>{t('assets.endDate')}</span>
            </div>
            <span className="text-foreground font-medium">{formatDate(asset.endDate)}</span>
          </div>
        )}
      </div>

      {/* Progress Bar (only for active investments) */}
      {asset.status === 'active' && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-[10px] mb-1.5">
            <span className="text-muted-foreground">{t('assets.contractProgress')}</span>
            <span className="text-foreground font-medium">
              {weekdaysElapsed}/{weekdaysInContract} hari kerja • <span className="text-emerald-400">{daysRemaining} hari tersisa</span>
            </span>
          </div>
          <div className="w-full h-2 bg-foreground/5 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"
            />
          </div>
        </div>
      )}

      {/* ★ v2.6 Profit vs Expected (consistency check) */}
      {asset.status === 'active' && expectedProfit >= 0 && (
        <div className={`mt-3 pt-3 border-t border-white/5 ${isProfitShort ? 'bg-amber-500/5 -mx-4 -mb-1 px-4 pb-1 rounded-b-2xl' : ''}`}>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Profit Seharusnya</span>
            <span className="text-emerald-400 font-semibold">
              {formatRupiah(expectedProfit)}
              <span className="text-muted-foreground/70 text-[9px] ml-1">
                ({weekdaysElapsed} hari × {formatRupiah(asset.dailyProfit)})
              </span>
            </span>
          </div>
          {isProfitShort && (
            <div className="mt-1.5 flex items-start gap-1.5 text-[10px] text-amber-400">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
              <span>
                Profit tertinggal {formatRupiah(Math.abs(profitDrift))}. Cron akan auto-backfill ≤10 detik.
              </span>
            </div>
          )}
          {isProfitOver && (
            <div className="mt-1.5 flex items-start gap-1.5 text-[10px] text-blue-400">
              <Zap className="w-3 h-3 shrink-0 mt-0.5" />
              <span>
                +{formatRupiah(profitDrift)} (manual credit / backfill)
              </span>
            </div>
          )}
        </div>
      )}

      {/* Total Profit Preview (estimasi total profit akhir kontrak) */}
      {asset.status === 'active' && (
        <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
          <span className="text-muted-foreground text-[10px]">Estimasi Total Profit Akhir Kontrak</span>
          <span className="text-emerald-400 text-xs font-bold">
            {formatRupiah(asset.dailyProfit * weekdaysInContract)}
          </span>
        </div>
      )}

      {/* Real-time countdown to next 00:00 WIB profit credit */}
      {asset.status === 'active' && (
        <ProfitCountdownBadge dailyProfit={asset.dailyProfit} />
      )}

      {/* Last profit date */}
      {asset.lastProfitDate && (
        <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground/50">
          <Zap className="w-3 h-3" />
          {t('assets.lastProfit')}: {formatDateTime(asset.lastProfitDate)}
        </div>
      )}
    </motion.div>
  );
}

/* ───────── Summary Card ───────── */
function SummaryCard({ icon: Icon, label, value, color, bgColor }: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="glass glow-gold rounded-2xl p-3 sm:p-4 text-center">
      <div className="flex items-center justify-center gap-1.5 mb-1.5">
        <div className={`w-6 h-6 rounded-lg ${bgColor} flex items-center justify-center`}>
          <Icon className={`w-3 h-3 ${color}`} />
        </div>
        <span className="text-muted-foreground text-[10px] sm:text-xs">{label}</span>
      </div>
      <p className={`${color} font-bold text-sm sm:text-base`}>{value}</p>
    </div>
  );
}

/* ───────── Main AssetPage ───────── */
export default function AssetPage() {
  const { token } = useAuthStore();
  const { navigate } = useAppStore();
  const t = useT();
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('all');

  const fetchAssets = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/assets', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (data.success) {
        setAssets(data.data || []);
      } else {
        setError(t('common.error'));
      }
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const retry = () => {
    setError(null);
    setLoading(true);
    fetchAssets();
  };

  const filteredAssets = activeTab === 'all'
    ? assets
    : assets.filter((a) => a.type === activeTab);

  const activeCount = assets.filter((a) => a.status === 'active').length;
  const totalActiveAmount = assets.filter((a) => a.status === 'active').reduce((sum, a) => sum + a.amount, 0);
  const totalDailyProfit = assets.filter((a) => a.status === 'active').reduce((sum, a) => sum + a.dailyProfit, 0);
  const totalProfitEarned = assets.reduce((sum, a) => sum + a.totalProfitEarned, 0);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6">
        <div className="animate-pulse space-y-4">
          <div className="glass rounded-2xl p-4 sm:p-6 h-20" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="glass rounded-2xl p-4 h-20" />
            ))}
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass rounded-2xl p-4 sm:p-5 h-48" />
            ))}
          </div>
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
            className="bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90 glow-gold"
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
          <h1 className="text-foreground text-xl font-bold flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            {t('assets.myAssets')}</h1>
          <p className="text-muted-foreground text-sm">{t('assets.myAssets')}</p>
        </div>
        <Button
          onClick={() => navigate('paket')}
          className="bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90 glow-gold text-xs sm:text-sm"
        >
          <TrendingUp className="w-4 h-4 mr-1.5" />
          {t('assets.investNew')}</Button>
      </div>

      {/* ─── Weekend Libur Banner (Profit & WD libur di Sabtu & Minggu) ─── */}
      <WeekendNoticeBanner activity="Profit harian aset" />

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard icon={Package} label="Aset Aktif" value={`${activeCount}`} color="text-emerald-400" bgColor="bg-cardmerald-400/10" />
        <SummaryCard icon={Coins} label="Total Modal" value={formatRupiah(totalActiveAmount)} color="text-primary" bgColor="bg-primary/10" />
        <SummaryCard icon={TrendingUp} label="Profit/Hari" value={formatRupiah(totalDailyProfit)} color="text-emerald-400" bgColor="bg-cardmerald-400/10" />
        <SummaryCard icon={Coins} label="Total Profit" value={formatRupiah(totalProfitEarned)} color="text-primary" bgColor="bg-primary/10" />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="glass rounded-xl p-1 h-auto flex-wrap">
          <TabsTrigger
            value="all"
            className="rounded-lg text-xs px-3 py-2 data-[state=active]:bg-gold-gradient data-[state=active]:text-primary-foreground data-[state=active]:font-semibold"
          >
            Semua ({assets.length})
          </TabsTrigger>
          <TabsTrigger
            value="investment"
            className="rounded-lg text-xs px-3 py-2 data-[state=active]:bg-gold-gradient data-[state=active]:text-primary-foreground data-[state=active]:font-semibold"
          >
            Investasi ({assets.filter((a) => a.type === 'investment').length})
          </TabsTrigger>
          <TabsTrigger
            value="product"
            className="rounded-lg text-xs px-3 py-2 data-[state=active]:bg-gold-gradient data-[state=active]:text-primary-foreground data-[state=active]:font-semibold"
          >
            Produk ({assets.filter((a) => a.type === 'product').length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {filteredAssets.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAssets.map((asset) => (
                <AssetCard key={`${asset.type}-${asset.id}`} asset={asset} t={t} />
              ))}
            </div>
          ) : (
            <div className="glass rounded-2xl p-5 sm:p-8 lg:p-12 text-center">
              <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <h3 className="text-foreground font-semibold mb-1">{t('assets.noAssets')}</h3>
              <p className="text-muted-foreground text-sm mb-4">{t('assets.startInvesting')}</p>
              <Button
                onClick={() => navigate('paket')}
                className="bg-gold-gradient text-primary-foreground font-semibold rounded-xl hover:opacity-90 glow-gold"
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                Lihat Paket Investasi
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

