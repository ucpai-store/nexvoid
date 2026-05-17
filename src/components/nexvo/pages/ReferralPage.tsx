'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Users, Copy, Share2, Gift, Crown, ChevronRight,
  CheckCircle2, UserPlus, TrendingUp, Award, AlertTriangle, RefreshCw, MessageCircle
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { formatRupiah, maskWhatsApp } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/lib/i18n';

interface ReferralData {
  referralCode: string;
  referrals: {
    id: string;
    name: string;
    whatsapp: string;
    level: number;
    bonus: number;
    createdAt: string;
  }[];
  totalBonus: number;
}

export default function ReferralPage() {
  const { user, token } = useAuthStore();
  const t = useT();
  const [referralData, setReferralData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchReferral = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/user/referral', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setReferralData(data.data);
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchReferral();
  }, [fetchReferral]);

  const referralCode = referralData?.referralCode || user?.referralCode || '';
  const referralLink = typeof window !== 'undefined' ? `${window.location.origin}?ref=${referralCode}` : '';

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast({ title: 'Berhasil', description: t('referral.copied') });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Gagal', description: t('referral.copyFailed'), variant: 'destructive' });
    }
  };

  const handleShare = async () => {
    const shareText = `Bergabung dengan NEXVO dan mulai investasi digital! Daftar sekarang: ${referralLink}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'NEXVO - Digital Asset Management',
          text: shareText,
          url: referralLink,
        });
      } catch {
        // User cancelled
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareText);
        toast({ title: 'Berhasil', description: t('referral.copied') });
      } catch {
        toast({ title: 'Gagal', description: 'Gagal menyalin', variant: 'destructive' });
      }
    }
  };

  const handleWhatsAppShare = () => {
    const text = encodeURIComponent(`Halo! 💎 Bergabung dengan NEXVO - Platform Manajemen Aset Digital!\n\nDapatkan profit harian hingga 20% dari investasi komoditas (emas, perak, berlian).\n\nDaftar sekarang menggunakan kode referral saya: *${referralCode}*\n\n${referralLink}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  // Referral level info - Percentage display matching screenshot
  const referralLevels = [
    { level: 1, label: 'Level 1', desc: 'Undangan langsung', bonus: '10%', color: 'text-[#D4AF37]', bg: 'bg-[#D4AF37]/10' },
    { level: 2, label: 'Level 2', desc: 'Undangan dari Level 1', bonus: '5%', color: 'text-blue-400', bg: 'bg-blue-400/10' },
    { level: 3, label: 'Level 3', desc: 'Undangan dari Level 2', bonus: '4%', color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    { level: 4, label: 'Level 4', desc: 'Undangan dari Level 3', bonus: '3%', color: 'text-purple-400', bg: 'bg-purple-400/10' },
    { level: 5, label: 'Level 5', desc: 'Undangan dari Level 4', bonus: '2%', color: 'text-rose-400', bg: 'bg-rose-400/10' },
  ];

  // Count total referrals (all levels)
  const totalReferrals = (referralData?.referrals || []).length;
  const directReferrals = (referralData?.referrals || []).filter(r => r.level === 1);

  const retry = () => {
    setError(null);
    setLoading(true);
    fetchReferral();
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6">
        <div className="animate-pulse space-y-4">
          <div className="glass rounded-2xl p-4 sm:p-6 h-48" />
          <div className="glass rounded-2xl p-4 sm:p-6 h-32" />
          <div className="glass rounded-2xl p-4 sm:p-6 h-32" />
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
            Coba Lagi
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6 space-y-4 sm:space-y-6 pb-4 sm:pb-6">
      {/* Header */}
      <div>
        <h1 className="text-foreground text-xl font-bold">{t('referral.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('referral.inviteFriends')}</p>
      </div>

      {/* Bonus Info Banner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-4 flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20"
      >
        <Gift className="w-5 h-5 text-emerald-400 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-emerald-400">
            Bonus Referral dari Investasi Pertama
          </p>
          <p className="text-muted-foreground text-xs mt-0.5">
            Bonus diberikan saat referral pertama kali berinvestasi. Persentase dari jumlah investasi, langsung masuk ke saldo utama Anda dan semua upline hingga Level 5
          </p>
        </div>
      </motion.div>

      {/* Referral Code Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-gold glow-gold-strong rounded-2xl p-4 sm:p-6 lg:p-8 text-center relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-[#D4AF37]/5 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-40 h-40 rounded-full bg-[#1E3A5F]/10 blur-3xl" />

        <div className="relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-gold-gradient flex items-center justify-center mx-auto mb-4 glow-gold animate-float">
            <Gift className="w-7 h-7 text-[#070B14]" />
          </div>

          <p className="text-muted-foreground text-sm mb-2">{t('referral.yourCode')}</p>

          <div className="glass rounded-xl p-4 inline-flex items-center gap-3 mb-4">
            <span className="text-2xl sm:text-3xl font-bold text-gold-gradient tracking-wider font-mono">
              {referralCode || user?.referralCode || '-'}
            </span>
          </div>

          {/* Referral Link Field */}
          <div className="max-w-md mx-auto w-full mb-4">
            <p className="text-muted-foreground text-xs mb-2">{t('referral.yourLink')}</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 glass rounded-xl px-3 py-2.5 text-left truncate">
                <span className="text-sm text-foreground/80 font-mono break-all">{referralLink}</span>
              </div>
              <Button
                onClick={handleCopyLink}
                variant="outline"
                className="border-[#D4AF37]/30 text-foreground hover:bg-[#D4AF37]/10 rounded-xl shrink-0"
              >
                {copied ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4 text-[#D4AF37]" />
                )}
                <span className="ml-1.5 text-xs">Salin Link</span>
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3">
            <Button
              onClick={handleWhatsAppShare}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors"
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              {t('referral.shareViaWhatsApp')}
            </Button>
            <Button
              onClick={handleShare}
              className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold"
            >
              <Share2 className="w-4 h-4 mr-2" />
              {t('referral.shareVia')}
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass glow-gold rounded-2xl p-4 text-center"
        >
          <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center mx-auto mb-2">
            <Users className="w-5 h-5 text-[#D4AF37]" />
          </div>
          <p className="text-2xl font-bold text-foreground">
            {totalReferrals}
          </p>
          <p className="text-muted-foreground text-xs">{t('referral.totalReferrals')}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass glow-gold rounded-2xl p-4 text-center"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-400/10 flex items-center justify-center mx-auto mb-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-400">
            {formatRupiah(referralData?.totalBonus || 0)}
          </p>
          <p className="text-muted-foreground text-xs">{t('referral.bonusEarned')}</p>
        </motion.div>
      </div>

      {/* Referral Levels - Flat amounts */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="glass rounded-2xl p-3 sm:p-5 lg:p-6"
      >
        <h3 className="text-foreground font-semibold text-sm mb-4 flex items-center gap-2">
          <Award className="w-4 h-4 text-[#D4AF37]" />
          {t('referral.referralLevel')}
        </h3>
        <div className="space-y-3">
          {referralLevels.map((lvl) => (
            <div key={lvl.level} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02]">
              <div className={`w-9 h-9 rounded-xl ${lvl.bg} flex items-center justify-center shrink-0`}>
                <Crown className={`w-4 h-4 ${lvl.color}`} />
              </div>
              <div className="flex-1">
                <p className="text-foreground text-sm font-medium">{lvl.label}</p>
                <p className="text-muted-foreground text-xs">{lvl.desc}</p>
              </div>
              <Badge className={`${lvl.bg} ${lvl.color} border-0 text-xs font-bold`}>
                {lvl.bonus}
              </Badge>
            </div>
          ))}
        </div>
        <p className="text-muted-foreground/60 text-[10px] mt-3 text-center">
          Bonus berlaku 1 kali saat referral pertama kali berinvestasi • % dari jumlah investasi • Langsung masuk ke Saldo Utama
        </p>
      </motion.div>

      {/* Team List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass rounded-2xl p-3 sm:p-5 lg:p-6"
      >
        <h3 className="text-foreground font-semibold text-sm mb-4 flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-[#D4AF37]" />
          {t('referral.teamList')}
        </h3>

        {referralData?.referrals && referralData.referrals.length > 0 ? (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {referralData.referrals.map((ref, i) => (
              <div key={ref.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition-colors">
                <div className="w-9 h-9 rounded-xl bg-gold-gradient flex items-center justify-center text-sm font-bold text-[#070B14] shrink-0">
                  {ref.name?.charAt(0) || 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-foreground text-sm font-medium truncate">{ref.name || 'User'}</p>
                  <p className="text-muted-foreground text-xs">{maskWhatsApp(ref.whatsapp)}</p>
                </div>
                <div className="text-right shrink-0">
                  <Badge className="bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 text-[10px]">
                    Level {ref.level}
                  </Badge>
                  {ref.bonus > 0 && (
                    <p className="text-emerald-400 text-[10px] mt-1 font-medium">
                      +{formatRupiah(ref.bonus)}
                    </p>
                  )}
                  <p className="text-muted-foreground text-[10px] mt-0.5">
                    {new Date(ref.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">{t('referral.noTeam')}</p>
            <p className="text-muted-foreground text-xs mt-1">{t('referral.shareCode')}</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
