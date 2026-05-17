'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Copy, TrendingUp, Gift, ChevronDown, ChevronRight,
  Sun, Crown, CheckCircle2, Loader2, AlertTriangle, RefreshCw,
  Wallet
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { formatRupiah } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/lib/i18n';

/* ───────── Types ───────── */
interface MemberNode {
  id: string;
  userId: string;
  name: string;
  whatsapp: string;
  totalDeposit: number;
  groupOmzet: number;
  directCount: number;
}

interface LevelData {
  members: MemberNode[];
  count: number;
  levelOmzet: number;
}

interface BonusBreakdown {
  level: number;
  rate: number;
  omzetDiff: number;
  bonus: number;
}

interface MilestoneData {
  level: number;
  omzet: number;
  reward: number;
  label: string;
  achieved: boolean;
  progress: number;
}

interface NetworkData {
  referralCode: string;
  myTotalDeposit: number;
  myGroupOmzet: number;
  totalNetworkCount: number;
  directReferralCount: number;
  levels: Record<string, LevelData>;
  bonusStats: {
    sponsor: { totalAmount: number };
    level: { totalAmount: number; breakdown: BonusBreakdown[] };
    reward: { totalAmount: number; milestones: MilestoneData[] };
  };
}

/* ───────── Sponsor bonus rates for level cards ───────── */
const SPONSOR_RATES: Record<number, number> = { 1: 10, 2: 5, 3: 4, 4: 3, 5: 2 };
const LEVEL_RATES: Record<number, number> = { 1: 5, 2: 4, 3: 3, 4: 2, 5: 1 };

/* ───────── Solar Network Visualization ───────── */
function SolarNetworkVisualization({
  levels,
  directReferralCount,
  totalNetworkCount,
}: {
  levels: Record<string, LevelData>;
  directReferralCount: number;
  totalNetworkCount: number;
}) {
  const levelCounts = [1, 2, 3, 4, 5].map((l) => levels[String(l)]?.count || 0);
  const levelOmzets = [1, 2, 3, 4, 5].map((l) => levels[String(l)]?.levelOmzet || 0);
  const maxCount = Math.max(...levelCounts, 1);

  // Ring radii for 5 levels
  const ringRadii = [52, 84, 116, 148, 180];
  const centerR = 24;
  const svgSize = 400;
  const cx = svgSize / 2;
  const cy = svgSize / 2;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${svgSize} ${svgSize}`} className="w-full max-w-[380px] mx-auto" fill="none">
        <defs>
          <radialGradient id="centerGold" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#F0D060" />
            <stop offset="100%" stopColor="#D4AF37" />
          </radialGradient>
          <radialGradient id="glowGold" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(212,175,55,0.25)" />
            <stop offset="100%" stopColor="rgba(212,175,55,0)" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Radial sun rays */}
        {Array.from({ length: 24 }).map((_, i) => {
          const angle = (i * 15 * Math.PI) / 180;
          const x2 = cx + Math.cos(angle) * 195;
          const y2 = cy + Math.sin(angle) * 195;
          return (
            <motion.line
              key={`ray-${i}`}
              x1={cx} y1={cy} x2={x2} y2={y2}
              stroke="rgba(212,175,55,0.06)"
              strokeWidth="0.8"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ delay: 0.2 + i * 0.02, duration: 0.6 }}
            />
          );
        })}

        {/* Level rings with animation */}
        {ringRadii.map((r, i) => (
          <motion.circle
            key={`ring-${i}`}
            cx={cx} cy={cy} r={r}
            stroke={`rgba(212,175,55,${0.18 - i * 0.025})`}
            strokeWidth="1.2"
            strokeDasharray="6 4"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3 + i * 0.15, duration: 0.5, ease: 'easeOut' }}
            style={{ transformOrigin: `${cx}px ${cy}px` }}
          />
        ))}

        {/* Level ring labels (right side) */}
        {ringRadii.map((r, i) => (
          <motion.text
            key={`ring-label-${i}`}
            x={cx + r + 6}
            y={cy - 2}
            fill={`rgba(212,175,55,${0.5 - i * 0.06})`}
            fontSize="8"
            fontWeight="600"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 + i * 0.12 }}
          >
            L{i + 1}
          </motion.text>
        ))}

        {/* Connection lines from center to level 1 nodes */}
        {levelCounts[0] > 0 && Array.from({ length: Math.min(levelCounts[0], 8) }).map((_, i) => {
          const angle = ((i * 360 / Math.max(levelCounts[0], 1)) - 90) * Math.PI / 180;
          const x = cx + Math.cos(angle) * ringRadii[0];
          const y = cy + Math.sin(angle) * ringRadii[0];
          return (
            <motion.line
              key={`conn-l1-${i}`}
              x1={cx} y1={cy} x2={x} y2={y}
              stroke="rgba(212,175,55,0.25)"
              strokeWidth="1.2"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.8, duration: 0.4 }}
            />
          );
        })}

        {/* Level 1 nodes */}
        {levelCounts[0] > 0 && Array.from({ length: Math.min(levelCounts[0], 8) }).map((_, i) => {
          const angle = ((i * 360 / Math.max(levelCounts[0], 1)) - 90) * Math.PI / 180;
          const x = cx + Math.cos(angle) * ringRadii[0];
          const y = cy + Math.sin(angle) * ringRadii[0];
          return (
            <motion.circle
              key={`node-l1-${i}`}
              cx={x} cy={y} r="7"
              fill="rgba(212,175,55,0.2)"
              stroke="rgba(212,175,55,0.5)"
              strokeWidth="1.5"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 1.0 + i * 0.05, type: 'spring', stiffness: 200 }}
              style={{ transformOrigin: `${x}px ${y}px` }}
            />
          );
        })}

        {/* Level 2-5 nodes (distributed around their rings) */}
        {[1, 2, 3, 4].map((li) => {
          const count = Math.min(levelCounts[li], 10);
          return Array.from({ length: count }).map((_, i) => {
            const angle = ((i * 360 / Math.max(count, 1)) + li * 20 - 90) * Math.PI / 180;
            const x = cx + Math.cos(angle) * ringRadii[li];
            const y = cy + Math.sin(angle) * ringRadii[li];
            const opacity = 0.16 - li * 0.025;
            const strokeOpacity = 0.35 - li * 0.05;
            return (
              <motion.circle
                key={`node-l${li + 1}-${i}`}
                cx={x} cy={y} r={5.5 - li * 0.5}
                fill={`rgba(212,175,55,${opacity})`}
                stroke={`rgba(212,175,55,${strokeOpacity})`}
                strokeWidth="1"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 1.2 + li * 0.1 + i * 0.03, type: 'spring', stiffness: 180 }}
                style={{ transformOrigin: `${x}px ${y}px` }}
              />
            );
          });
        })}

        {/* Center glow */}
        <circle cx={cx} cy={cy} r={centerR + 14} fill="url(#glowGold)" />

        {/* Center circle outer */}
        <motion.circle
          cx={cx} cy={cy} r={centerR}
          fill="rgba(212,175,55,0.12)"
          stroke="rgba(212,175,55,0.6)"
          strokeWidth="2.5"
          filter="url(#glow)"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 150 }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />

        {/* Center circle inner */}
        <motion.circle
          cx={cx} cy={cy} r={centerR - 6}
          fill="url(#centerGold)"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 150 }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />

        {/* Crown icon in center */}
        <motion.text
          x={cx} y={cy + 4}
          textAnchor="middle"
          fill="#070B14"
          fontSize="14"
          fontWeight="bold"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          👑
        </motion.text>

        {/* Level member count labels */}
        {ringRadii.map((r, i) => {
          const angle = (-90 + 10) * Math.PI / 180;
          const x = cx + Math.cos(angle) * (r - 10);
          const y = cy + Math.sin(angle) * (r - 10);
          return levelCounts[i] > 0 ? (
            <motion.g
              key={`count-${i}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.4 + i * 0.1 }}
            >
              <rect x={x - 12} y={y - 7} width="24" height="14" rx="4"
                fill="rgba(7,11,20,0.85)" stroke={`rgba(212,175,55,${0.3 - i * 0.04})`} strokeWidth="0.8" />
              <text x={x} y={y + 3} textAnchor="middle"
                fill={`rgba(212,175,55,${0.8 - i * 0.1})`}
                fontSize="7" fontWeight="bold">
                {levelCounts[i]}
              </text>
            </motion.g>
          ) : null;
        })}
      </svg>

      {/* Legend below SVG */}
      <div className="flex items-center justify-center gap-3 sm:gap-4 mt-4 flex-wrap">
        {[1, 2, 3, 4, 5].map((l) => (
          <div key={l} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full bg-[#D4AF37]/${30 - (l - 1) * 4} border border-[#D4AF37]/${50 - (l - 1) * 6}`} />
            <span className="text-muted-foreground text-[10px]">L{l}</span>
            <span className="text-foreground text-[10px] font-medium">
              {levelCounts[l - 1]} orang
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────── Level Detail Card ───────── */
function LevelDetailCard({
  level,
  data,
  sponsorRate,
  levelRate,
  index,
}: {
  level: number;
  data: LevelData;
  sponsorRate: number;
  levelRate: number;
  index: number;
}) {
  const sponsorBonus = data.levelOmzet * (sponsorRate / 100);
  const levelBonus = data.levelOmzet * (levelRate / 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.08, duration: 0.4 }}
      className="glass-strong rounded-2xl p-4 sm:p-5 relative overflow-hidden hover:glow-gold hover:border-[#D4AF37]/20 transition-all duration-300"
    >
      {/* Level badge */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center">
            <span className="text-[#D4AF37] text-sm font-bold">L{level}</span>
          </div>
          <div>
            <h3 className="text-foreground font-semibold text-sm">Level {level}</h3>
            <p className="text-muted-foreground text-[10px]">{data.count} anggota</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground text-[10px]">Omzet Grup</p>
          <p className="text-gold-gradient text-sm font-bold">{formatRupiah(data.levelOmzet)}</p>
        </div>
      </div>

      {/* Bonus breakdown */}
      <div className="space-y-2">
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-[#D4AF37]/8 flex items-center justify-center">
              <Users className="w-3 h-3 text-[#D4AF37]/70" />
            </div>
            <div>
              <p className="text-muted-foreground text-[10px]">Bonus Sponsor</p>
              <p className="text-foreground/60 text-[10px]">Rate {sponsorRate}%</p>
            </div>
          </div>
          <span className="text-[#D4AF37] text-xs font-bold">{formatRupiah(sponsorBonus)}</span>
        </div>
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-emerald-400/8 flex items-center justify-center">
              <TrendingUp className="w-3 h-3 text-emerald-400/70" />
            </div>
            <div>
              <p className="text-muted-foreground text-[10px]">Bonus Level</p>
              <p className="text-foreground/60 text-[10px]">Rate {levelRate}%</p>
            </div>
          </div>
          <span className="text-emerald-400 text-xs font-bold">{formatRupiah(levelBonus)}</span>
        </div>
      </div>
    </motion.div>
  );
}

/* ───────── Bonus Stat Card ───────── */
function BonusStatCard({
  title,
  amount,
  icon: Icon,
  subtitle,
  delay,
}: {
  title: string;
  amount: number;
  icon: React.ElementType;
  subtitle: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="glass-strong rounded-2xl p-4 sm:p-5 text-center relative overflow-hidden hover:glow-gold hover:border-[#D4AF37]/20 transition-all duration-300"
    >
      <div className="absolute top-0 right-0 w-16 h-16 rounded-full bg-[#D4AF37]/3 blur-2xl" />
      <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center mx-auto mb-3">
        <Icon className="w-5 h-5 text-[#D4AF37]" />
      </div>
      <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-1">{title}</p>
      <p className="text-gold-gradient text-xl sm:text-2xl font-bold mb-1">{formatRupiah(amount)}</p>
      <p className="text-muted-foreground text-[10px]">{subtitle}</p>
    </motion.div>
  );
}

/* ───────── Milestone Progress Card ───────── */
function MilestoneProgress({
  milestone,
  currentOmzet,
  index,
}: {
  milestone: MilestoneData;
  currentOmzet: number;
  index: number;
}) {
  const isAchieved = milestone.achieved;
  const progressPercent = Math.min(milestone.progress, 100);

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.1 + index * 0.08, duration: 0.4 }}
      className="glass-strong rounded-xl p-3.5 sm:p-4"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isAchieved ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <div className="w-4 h-4 rounded-full border-2 border-[#D4AF37]/30" />
          )}
          <span className="text-foreground text-xs font-medium">Level {milestone.level}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-[10px]">
            Omzet {formatRupiah(milestone.omzet)}
          </span>
          <span className="text-[#D4AF37] text-[10px] font-bold">
            → {formatRupiah(milestone.reward)}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative h-2 rounded-full bg-white/5 overflow-hidden">
        <motion.div
          className={`absolute left-0 top-0 h-full rounded-full ${
            isAchieved
              ? 'bg-emerald-400'
              : 'bg-gradient-to-r from-[#D4AF37] to-[#F0D060]'
          }`}
          initial={{ width: 0 }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ delay: 0.3 + index * 0.1, duration: 0.8, ease: 'easeOut' }}
        />
      </div>

      <div className="flex items-center justify-between mt-1.5">
        <span className="text-muted-foreground text-[10px]">
          {isAchieved ? 'Tercapai!' : `${progressPercent.toFixed(0)}%`}
        </span>
        {isAchieved && (
          <span className="text-emerald-400 text-[10px] font-medium flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Bonus diterima
          </span>
        )}
      </div>
    </motion.div>
  );
}

/* ───────── Level Referral List ───────── */
function LevelReferralList({
  level,
  data,
}: {
  level: number;
  data: LevelData;
}) {
  const [open, setOpen] = useState(false);

  if (data.count === 0) return null;

  return (
    <div className="glass-strong rounded-2xl overflow-hidden">
      {/* Header / Trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 sm:p-5 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center">
            <span className="text-[#D4AF37] text-sm font-bold">L{level}</span>
          </div>
          <div className="text-left">
            <h3 className="text-foreground font-semibold text-sm">Level {level}</h3>
            <p className="text-muted-foreground text-[10px]">
              {data.count} anggota · Omzet {formatRupiah(data.levelOmzet)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[#D4AF37] text-xs font-semibold">{data.count}</span>
          <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </motion.div>
        </div>
      </button>

      {/* Member List */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 sm:px-5 sm:pb-5 space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
              {data.members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center text-xs font-bold text-[#D4AF37]">
                      {member.name?.charAt(0) || '?'}
                    </div>
                    <div>
                      <p className="text-foreground text-sm font-medium">{member.name}</p>
                      <p className="text-muted-foreground text-[10px]">ID: {member.userId}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[#D4AF37] text-xs font-semibold">
                      {formatRupiah(member.totalDeposit)}
                    </p>
                    <p className="text-muted-foreground text-[10px]">
                      {member.directCount} referral
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ───────── Main NetworkPage ───────── */
export default function NetworkPage() {
  const { token, user } = useAuthStore();
  const { navigate } = useAppStore();
  const t = useT();
  const [networkData, setNetworkData] = useState<NetworkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNetwork = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/network', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setNetworkData(data.data);
      } else {
        setError(data.error || t('common.error'));
      }
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchNetwork();
  }, [fetchNetwork]);

  const copyReferralCode = async () => {
    if (!networkData?.referralCode) return;
    try {
      await navigator.clipboard.writeText(networkData.referralCode);
      toast({
        title: t('network.codeCopied'),
        description: `Kode ${networkData.referralCode} telah disalin ke clipboard`,
      });
    } catch {
      toast({
        title: t('network.copyFailed'),
        description: t('network.copyFailed'),
        variant: 'destructive',
      });
    }
  };

  const retry = () => {
    setError(null);
    setLoading(true);
    fetchNetwork();
  };

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="animate-pulse space-y-6">
          <div className="glass rounded-2xl p-8 h-36" />
          <div className="glass rounded-2xl p-8 h-80" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="glass rounded-2xl p-6 h-32" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ── Error state ── */
  if (error || !networkData) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="glass glow-gold rounded-2xl p-8 sm:p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-red-400" />
          </div>
          <h3 className="text-foreground font-semibold mb-1">{t('dashboard.loadFailed')}</h3>
          <p className="text-muted-foreground text-sm mb-6">{error || t('network.networkUnavailable')}</p>
          <Button
            onClick={retry}
            className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Coba Lagi
          </Button>
        </div>
      </div>
    );
  }

  const bonusStats = networkData.bonusStats;
  const milestones = bonusStats.reward.milestones || [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      {/* ═══════════ 1. Header Section ═══════════ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-strong rounded-2xl p-5 sm:p-8 relative overflow-hidden"
      >
        {/* Background decoration */}
        <div className="absolute top-0 left-0 w-40 h-40 rounded-full bg-[#D4AF37]/5 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-32 h-32 rounded-full bg-[#D4AF37]/3 blur-3xl" />

        <div className="relative z-10">
          {/* Title */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <Sun className="w-6 h-6 text-[#D4AF37]" />
            <h1 className="text-gold-gradient text-2xl sm:text-3xl lg:text-4xl font-bold">
              {t('network.solarNetwork')}</h1>
          </div>
          <p className="text-center text-muted-foreground text-xs sm:text-sm mb-5">
            {t('network.atCenter')}
          </p>

          {/* Referral code */}
          <div className="flex items-center justify-center mb-6">
            <div className="glass rounded-xl px-4 py-2.5 flex items-center gap-3">
              <Crown className="w-4 h-4 text-[#D4AF37]" />
              <span className="text-muted-foreground text-xs">{t('referral.yourCode')}:</span>
              <span className="text-[#D4AF37] text-lg font-bold tracking-wider">
                {networkData.referralCode}
              </span>
              <button
                onClick={copyReferralCode}
                className="p-1.5 rounded-lg hover:bg-[#D4AF37]/10 transition-colors"
                title="Salin kode"
              >
                <Copy className="w-4 h-4 text-[#D4AF37]/70 hover:text-[#D4AF37]" />
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 max-w-md mx-auto">
            <div className="glass rounded-xl p-3 text-center">
              <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-1">
                {t('network.groupOmzet')}</p>
              <p className="text-gold-gradient text-base sm:text-lg font-bold">
                {formatRupiah(networkData.myGroupOmzet)}
              </p>
            </div>
            <div className="glass rounded-xl p-3 text-center">
              <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-1">
                {t('network.directReferrals')}</p>
              <p className="text-gold-gradient text-base sm:text-lg font-bold">
                {networkData.directReferralCount}
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ═══════════ 2. Solar Network Visualization ═══════════ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass-strong rounded-2xl p-5 sm:p-8"
      >
        <div className="text-center mb-2">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Sun className="w-5 h-5 text-[#D4AF37]" />
            <h2 className="text-foreground font-semibold text-base sm:text-lg">{t('network.networkVisualization')}</h2>
          </div>
          <p className="text-muted-foreground text-xs">
            {t('network.atCenter')} · {networkData.totalNetworkCount} total anggota jaringan
          </p>
        </div>

        <SolarNetworkVisualization
          levels={networkData.levels}
          directReferralCount={networkData.directReferralCount}
          totalNetworkCount={networkData.totalNetworkCount}
        />
      </motion.div>

      {/* ═══════════ 3. Level Detail Cards ═══════════ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="text-center mb-5">
          <h2 className="text-gold-gradient text-xl sm:text-2xl font-bold mb-1">{t('network.levelDetail')}</h2>
          <p className="text-muted-foreground text-xs sm:text-sm">
            {t('network.infoOmzetBonus')}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5].map((level) => {
            const levelData = networkData.levels[String(level)] || {
              members: [],
              count: 0,
              levelOmzet: 0,
            };
            return (
              <LevelDetailCard
                key={level}
                level={level}
                data={levelData}
                sponsorRate={SPONSOR_RATES[level]}
                levelRate={LEVEL_RATES[level]}
                index={level - 1}
              />
            );
          })}
        </div>
      </motion.div>

      {/* ═══════════ 4. Bonus Summary Section ═══════════ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <div className="text-center mb-5">
          <h2 className="text-gold-gradient text-xl sm:text-2xl font-bold mb-1">{t('network.bonusSummary')}</h2>
          <p className="text-muted-foreground text-xs sm:text-sm">
            {t('network.bonusSummaryDesc')}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <BonusStatCard
            title={t('network.totalSponsorBonus')}
            amount={bonusStats.sponsor.totalAmount}
            icon={TrendingUp}
            subtitle={t('network.fromInvestmentReferral')}
            delay={0.5}
          />
          <BonusStatCard
            title={t('network.totalLevelBonus')}
            amount={bonusStats.level.totalAmount}
            icon={Users}
            subtitle={t('network.basedOnOmzet')}
            delay={0.6}
          />
          <BonusStatCard
            title={t('network.totalRewardBonus')}
            amount={bonusStats.reward.totalAmount}
            icon={Gift}
            subtitle={t('network.milestoneAchievement')}
            delay={0.7}
          />
        </div>
      </motion.div>

      {/* ═══════════ 5. Reward Milestones Progress ═══════════ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <div className="text-center mb-5">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Gift className="w-5 h-5 text-[#D4AF37]" />
            <h2 className="text-gold-gradient text-xl sm:text-2xl font-bold">Reward Milestone</h2>
          </div>
          <p className="text-muted-foreground text-xs sm:text-sm">
            {t('network.achieveTarget')}
          </p>
        </div>

        <div className="space-y-3">
          {milestones.map((milestone, index) => (
            <MilestoneProgress
              key={milestone.level}
              milestone={milestone}
              currentOmzet={networkData.myGroupOmzet}
              index={index}
            />
          ))}
          {milestones.length === 0 && (
            <div className="glass-strong rounded-2xl p-8 text-center">
              <Gift className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">{t('network.noMilestone')}</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* ═══════════ 6. Referral List (Expandable per Level) ═══════════ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <div className="text-center mb-5">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Users className="w-5 h-5 text-[#D4AF37]" />
            <h2 className="text-gold-gradient text-xl sm:text-2xl font-bold">{t('network.referralList')}</h2>
          </div>
          <p className="text-muted-foreground text-xs sm:text-sm">
            {t('network.clickToView')}
          </p>
        </div>

        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((level) => {
            const levelData = networkData.levels[String(level)];
            if (!levelData || levelData.count === 0) return null;
            return (
              <LevelReferralList
                key={level}
                level={level}
                data={levelData}
              />
            );
          })}
          {networkData.totalNetworkCount === 0 && (
            <div className="glass-strong rounded-2xl p-8 text-center">
              <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">{t('network.noMembers')}</p>
              <Button
                onClick={() => navigate('referral')}
                variant="outline"
                className="mt-4 border-[#D4AF37]/20 text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-xl"
              >
                <ChevronRight className="w-4 h-4 mr-1" />
                {t('network.inviteFriendsNow')}</Button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
