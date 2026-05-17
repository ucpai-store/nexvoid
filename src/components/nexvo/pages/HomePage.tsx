'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import {
  Users, ArrowLeftRight, Clock, ThumbsUp,
  ArrowDown, ArrowUp, ShoppingBag, Star,
  ChevronRight, Shield, Smartphone, CreditCard,
  Eye, TrendingUp, UserPlus, Sparkles,
  Play, CheckCircle2, Globe, Lock, Zap,
  BarChart3, Wallet, BadgeCheck, Rocket,
  ShieldCheck, Layers, ArrowRight
} from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { useAuthStore } from '@/stores/auth-store';
import { useSiteStore } from '@/stores/site-store';
import { formatRupiah, formatNumber, timeAgo, maskWhatsApp } from '@/lib/auth';
import { getFileUrl } from '@/lib/file-url';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';
import { Progress } from '@/components/ui/progress';
import Footer from '@/components/nexvo/shared/Footer';
import LanguageSwitcher from '@/components/nexvo/shared/LanguageSwitcher';

/* ───────── Types ───────── */
interface Banner {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  ctaText: string;
  ctaLink: string;
  image: string;
  order: number;
}

interface Product {
  id: string;
  name: string;
  price: number;
  duration: number;
  estimatedProfit: number;
  quota: number;
  quotaUsed: number;
  description: string;
  profitRate: number;
  banner: string;
}

interface Activity {
  id: string;
  type: string;
  userName: string;
  amount: number;
  productName: string | null;
  isFake: boolean;
  createdAt: string;
}

interface Testimonial {
  id: string;
  name: string;
  rating: number;
  comment: string;
  avatar: string;
}

interface SystemSettings {
  total_members: string;
  total_transactions: string;
  uptime: string;
  satisfaction: string;
}

/* ───────── Animated Counter ───────── */
function AnimatedCounter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;
    let start = 0;
    const duration = 1500;
    const startTime = Date.now();

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      start = Math.floor(eased * target);
      setCount(start);
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [isInView, target]);

  return (
    <span ref={ref}>
      {formatNumber(count)}{suffix}
    </span>
  );
}

/* ═══════════════════════════════════════════
   HERO BANNER SLIDER
   ═══════════════════════════════════════════ */
function HeroBanner() {
  const t = useT();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  useEffect(() => {
    fetch('/api/banners')
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data?.length) {
          setBanners(res.data);
        } else {
          // Fallback banners with the main hero banner image
          setBanners([
            {
              id: '1',
              title: t('landing.welcome'),
              subtitle: t('landing.subtitle'),
              description: 'Start your digital investment journey with NEXVO and earn attractive daily profits.',
              ctaText: t('landing.startNow'),
              ctaLink: '/products',
              image: '/banner-hero-main.jpeg',
              order: 1,
            },
          ]);
        }
      })
      .catch(() => {
        setBanners([
          {
            id: '1',
            title: t('landing.welcome'),
            subtitle: t('landing.subtitle'),
            description: 'Start your digital investment journey and earn attractive daily profits.',
            ctaText: t('landing.startNow'),
            ctaLink: '/products',
            image: '/banner-hero-main.jpeg',
            order: 1,
          },
        ]);
      })
      .finally(() => setLoading(false));
  }, []);

  // Auto-slide
  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [banners.length]);

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.changedTouches[0].screenX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    touchEndX.current = e.changedTouches[0].screenX;
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0) setCurrent((p) => (p + 1) % banners.length);
      else setCurrent((p) => (p - 1 + banners.length) % banners.length);
    }
  };

  if (loading) {
    return (
      <div className="relative h-[70vh] sm:h-[85vh] flex items-center justify-center bg-nexvo-gradient">
        <div className="animate-pulse space-y-4 text-center px-4">
          <div className="h-8 w-64 bg-white/10 rounded-2xl mx-auto" />
          <div className="h-6 w-48 bg-white/5 rounded-xl mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <section id="hero" className="relative h-[75vh] sm:h-[90vh] overflow-hidden">
      {/* Background image or gradient */}
      {banners[current]?.image ? (
        <div className="absolute inset-0">
          <img
            src={getFileUrl(banners[current].image, false)}
            alt={banners[current].title}
            className="w-full h-full object-cover"
          />
          {/* Dark overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#070B14]/90 via-[#070B14]/70 to-[#070B14]/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#070B14] via-transparent to-[#070B14]/30" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-nexvo-gradient">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-[#D4AF37] blur-[120px]" />
            <div className="absolute bottom-20 right-10 w-96 h-96 rounded-full bg-[#1E3A5F] blur-[150px]" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-[#D4AF37]/10" />
          </div>
        </div>
      )}

      {/* Slider Content */}
      <div
        className="relative h-full"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Language Switcher - Top Right of Hero */}
        <div className="absolute top-4 right-4 z-10 sm:top-6 sm:right-6">
          <LanguageSwitcher />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.6 }}
            className="absolute inset-0 flex items-center"
          >
            {banners[current] && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
                <div className="max-w-2xl">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="inline-flex items-center gap-2 glass-gold rounded-full px-4 py-1.5 text-xs font-medium text-[#D4AF37] mb-4 sm:mb-6"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {banners[current].subtitle}
                  </motion.div>
                  <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-2xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-4 sm:mb-6"
                  >
                    <span className="text-gold-gradient">{banners[current].title}</span>
                  </motion.h1>
                  <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="text-foreground/80 text-base sm:text-lg leading-relaxed mb-6 sm:mb-8 max-w-lg"
                  >
                    {banners[current].description}
                  </motion.p>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="flex flex-wrap gap-3"
                  >
                    <Button
                      onClick={() => {
                        const { navigate } = useAppStore.getState();
                        navigate('products');
                      }}
                      className="bg-gold-gradient text-[#070B14] font-semibold rounded-2xl hover:opacity-90 transition-all glow-gold-strong px-4 sm:px-8 h-11 sm:h-14 text-sm sm:text-base"
                    >
                      {banners[current].ctaText || t('landing.startNow')}
                      <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 ml-1" />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="rounded-2xl border-[#D4AF37]/30 text-foreground hover:bg-white/5 px-4 sm:px-8 h-11 sm:h-14 text-sm sm:text-base"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      {t('landing.viewProducts')}
                    </Button>
                  </motion.div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Dot indicators */}
        {banners.length > 1 && (
          <div className="absolute bottom-16 sm:bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-2">
            {banners.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`transition-all duration-300 rounded-full ${
                  i === current
                    ? 'w-8 h-2.5 bg-gold-gradient'
                    : 'w-2.5 h-2.5 bg-white/20 hover:bg-white/40'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#070B14] to-transparent pointer-events-none" />
    </section>
  );
}

/* ═══════════════════════════════════════════
   ABOUT NEXVO - Detailed Narrative Section
   ═══════════════════════════════════════════ */
function AboutNexvo() {
  const t = useT();
  const { navigate } = useAppStore();
  const { logoUrl } = useSiteStore();

  const features = [
    {
      icon: ShieldCheck,
      title: t('landing.security'),
      desc: 'Multi-layer security with SSL/TLS encryption, two-factor authentication, and 24/7 monitoring to protect your digital assets from cyber threats.',
    },
    {
      icon: BarChart3,
      title: t('landing.dailyProfit'),
      desc: 'Commodity-based investment system with transparent and measurable profit rates. Track your asset growth in real-time through an intuitive dashboard.',
    },
    {
      icon: Wallet,
      title: t('landing.fastTransaction'),
      desc: 'Fast deposit and withdrawal process through various payment methods. Instant verification and fund disbursement within minutes.',
    },
    {
      icon: Globe,
      title: t('landing.globalAccess'),
      desc: 'Cloud-based platform accessible from anywhere at any time. Your investment portfolio monitoring never stops.',
    },
    {
      icon: BadgeCheck,
      title: t('landing.trusted'),
      desc: 'Operating with official licensing and strict regulations. Every transaction is recorded and auditable, ensuring full transparency for all users.',
    },
    {
      icon: Rocket,
      title: t('landing.cuttingEdge'),
      desc: 'Built with modern technology infrastructure ensuring speed, stability, and platform scalability to support your investment growth.',
    },
  ];

  return (
    <section id="about" className="relative py-10 sm:py-24 overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-[0.03]">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-[#D4AF37] blur-[200px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-[#1E3A5F] blur-[180px]" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-8 sm:mb-16"
        >
          <span className="inline-flex items-center gap-2 glass-gold rounded-full px-4 py-1.5 text-xs font-medium text-[#D4AF37] mb-4">
            <Shield className="w-3.5 h-3.5" />
            {t('landing.aboutNexvo')}</span>
          <h2 className="text-2xl sm:text-4xl font-bold mb-4">
            <span className="text-gold-gradient">{t('landing.digitalPlatform')}</span>
            <br />
            <span className="text-foreground">{t('landing.trustedWorldwide')}</span>
          </h2>
        </motion.div>

        {/* About Banner Image */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.05 }}
          className="max-w-5xl mx-auto mb-10"
        >
          <div className="relative rounded-3xl overflow-hidden glow-gold group">
            <img
              src="/nexvo-about-banner.jpeg"
              alt="NEXVO - Next-Generation Digital Asset Management Platform"
              className="w-full h-auto object-cover rounded-3xl transition-transform duration-700 group-hover:scale-[1.02]"
            />
            {/* Subtle overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#070B14]/60 via-transparent to-transparent pointer-events-none" />
            {/* Bottom tagline */}
            <div className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6 flex items-center gap-2">
              <span className="glass-gold rounded-full px-3 py-1 text-xs font-medium text-[#D4AF37]">
                Next-Generation Digital Asset Management
              </span>
            </div>
          </div>
        </motion.div>

        {/* Main narrative */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="max-w-4xl mx-auto mb-16"
        >
          <div className="glass glow-gold rounded-3xl p-4 sm:p-10 relative overflow-hidden">
            {/* Decorative corner */}
            <div className="absolute top-0 right-0 w-40 h-40 bg-[#D4AF37]/[0.04] rounded-bl-full" />

            <div className="relative">
              {/* Logo */}
              <div className="flex items-center gap-3 mb-6">
                <img src={logoUrl} alt="NEXVO" className="h-12 w-auto object-contain" onError={(e) => { (e.target as HTMLImageElement).src = '/api/files/nexvo-logo.png'; }} />
                <div className="h-8 w-px bg-[#D4AF37]/20" />
                <span className="text-[#D4AF37] text-xs font-bold tracking-widest uppercase">Build Value, Grow Future</span>
              </div>

              {/* Narrative text */}
              <div className="space-y-4 text-foreground/80 text-sm sm:text-base leading-relaxed">
                <p>
                  <strong className="text-gold-gradient">NEXVO</strong> is a next-generation digital asset management platform built to deliver secure, transparent, and profitable investment opportunities to people around the world. Powered by commodity-backed portfolios and advanced fintech infrastructure, NEXVO makes wealth-building accessible to everyone — from first-time investors to seasoned professionals.
                </p>
                <p>
                  Our mission is simple: <strong className="text-foreground">democratize access to high-quality investments</strong>. Whether you're starting with a small amount or ready to scale, NEXVO provides the tools, security, and support you need to grow your digital assets with confidence. Every package is designed to generate consistent daily profits — up to 10% returns — with full transparency on every transaction.
                </p>
                <p>
                  Security is not optional — it's our foundation. All transactions are encrypted with <strong className="text-foreground">SSL/TLS 256-bit</strong> technology, and every account is protected by multi-layer authentication including OTP verification via WhatsApp and email. With 99.9% uptime and 24/7 monitoring, your investments are always safe and accessible.
                </p>
                <p>
                  Backed by a team of experienced fintech and asset management professionals, NEXVO is more than a platform — it's your partner in financial growth. We believe that <strong className="text-[#D4AF37]">everyone deserves the opportunity to build wealth safely, transparently, and profitably</strong>. Start your investment journey today and let your money work for you.
                </p>
              </div>

              {/* Key highlights */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-6 border-t border-[#D4AF37]/10">
                {[
                  { value: '99.9%', label: t('landing.serverUptime') },
                  { value: '24/7', label: t('landing.onlineSupport') },
                  { value: '256-bit', label: t('landing.sslEncryption') },
                  { value: '< 5min', label: t('landing.verificationProcess') },
                ].map((item) => (
                  <div key={item.label} className="text-center">
                    <div className="text-lg sm:text-xl font-bold text-gold-gradient">{item.value}</div>
                    <div className="text-muted-foreground text-xs mt-1">{item.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="glass glow-gold rounded-2xl p-4 sm:p-7 group hover:glow-gold-strong transition-all"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <feature.icon className="w-6 h-6 text-[#D4AF37]" />
                </div>
                <div>
                  <h3 className="text-foreground font-semibold text-sm sm:text-base mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed">{feature.desc}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mt-10 sm:mt-14"
        >
          <Button
            onClick={() => navigate('products')}
            className="bg-gold-gradient text-[#070B14] font-semibold rounded-2xl hover:opacity-90 transition-all glow-gold px-8 h-12 sm:h-14 text-sm sm:text-base"
          >
            {t('landing.startInvestNow')}
            <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 ml-2" />
          </Button>
        </motion.div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   STATISTICS SECTION
   ═══════════════════════════════════════════ */
function StatisticsSection() {
  const t = useT();
  const [settings, setSettings] = useState<SystemSettings | null>(null);

  useEffect(() => {
    fetch('/api/system')
      .then((r) => r.json())
      .then((res) => res.success && setSettings(res.data))
      .catch(() => {});
  }, []);

  const stats = [
    {
      icon: Users,
      label: t('landing.totalMembers'),
      value: settings ? parseInt(settings.total_members) || 1250 : 1250,
      suffix: '+',
      color: 'text-emerald-400',
      bg: 'bg-emerald-400/10',
    },
    {
      icon: ArrowLeftRight,
      label: t('landing.totalTransactions'),
      value: settings ? parseInt(settings.total_transactions) || 8500 : 8500,
      suffix: '+',
      color: 'text-blue-400',
      bg: 'bg-blue-400/10',
    },
    {
      icon: Clock,
      label: t('landing.uptime'),
      value: settings ? parseFloat(settings.uptime) || 99.9 : 99.9,
      suffix: '%',
      color: 'text-[#D4AF37]',
      bg: 'bg-[#D4AF37]/10',
    },
    {
      icon: ThumbsUp,
      label: t('landing.satisfaction'),
      value: settings ? parseFloat(settings.satisfaction) || 98 : 98,
      suffix: '%',
      color: 'text-purple-400',
      bg: 'bg-purple-400/10',
    },
  ];

  return (
    <section className="relative py-10 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="glass glow-gold rounded-2xl p-3 sm:p-6 text-center group hover:glow-gold-strong transition-all"
            >
              <div className={`inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-2xl ${stat.bg} mb-3 sm:mb-4 group-hover:scale-110 transition-transform`}>
                <stat.icon className={`w-6 h-6 sm:w-7 sm:h-7 ${stat.color}`} />
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-foreground mb-1">
                <AnimatedCounter target={stat.value} suffix={stat.suffix} />
              </div>
              <div className="text-muted-foreground text-xs sm:text-sm">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   HOW IT WORKS (Cara Kerja)
   ═══════════════════════════════════════════ */
function HowItWorks() {
  const t = useT();
  const steps = [
    { icon: UserPlus, title: t('landing.registerStep'), desc: 'Create a NEXVO account with your WhatsApp number and valid email. Quick and free registration process.' },
    { icon: Smartphone, title: t('landing.verifyStep'), desc: 'Verify your identity via WhatsApp and email OTP for maximum account security.' },
    { icon: CreditCard, title: t('landing.depositStep'), desc: 'Top up your balance via QRIS or USDT. Funds are credited to your account balance instantly.' },
    { icon: ShoppingBag, title: t('landing.selectProduct'), desc: 'Choose a commodity investment package that suits your financial capacity and goals.' },
    { icon: TrendingUp, title: t('landing.monitorProfit'), desc: 'Monitor your daily profit growth in real-time through an informative dashboard.' },
  ];

  return (
    <section id="how-it-works" className="relative py-10 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-8 sm:mb-16"
        >
          <span className="inline-flex items-center gap-2 glass-gold rounded-full px-4 py-1.5 text-xs font-medium text-[#D4AF37] mb-4">
            <Eye className="w-3.5 h-3.5" />
            {t('landing.howItWorks')}</span>
          <h2 className="text-2xl sm:text-4xl font-bold mb-3">
            <span className="text-gold-gradient">{t('landing.easySteps')}</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto">
            {t('landing.minutesToStart')}
          </p>
        </motion.div>

        {/* Steps */}
        <div className="relative">
          {/* Desktop connecting line */}
          <div className="hidden lg:block absolute top-[52px] left-[10%] right-[10%] h-0.5 bg-gradient-to-r from-transparent via-[#D4AF37]/30 to-transparent" />

          <div className="flex flex-col lg:flex-row items-center gap-6 lg:gap-4">
            {steps.map((step, i) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12 }}
                className="flex-1 w-full"
              >
                <div className="glass glow-gold rounded-2xl p-4 sm:p-8 text-center relative group hover:glow-gold-strong transition-all">
                  {/* Step number */}
                  <div className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-gold-gradient flex items-center justify-center text-xs font-bold text-[#070B14] glow-gold">
                    {i + 1}
                  </div>
                  {/* Icon */}
                  <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#D4AF37]/10 mb-4 group-hover:scale-110 transition-transform">
                    <step.icon className="w-7 h-7 sm:w-8 sm:h-8 text-[#D4AF37]" />
                  </div>
                  <h3 className="text-foreground font-semibold text-base sm:text-lg mb-2">{step.title}</h3>
                  <p className="text-muted-foreground text-xs sm:text-sm">{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   PRODUCT PREVIEW
   ═══════════════════════════════════════════ */
function ProductPreview() {
  const t = useT();
  const [products, setProducts] = useState<Product[]>([]);
  const { navigate } = useAppStore();

  useEffect(() => {
    fetch('/api/products')
      .then((r) => r.json())
      .then((res) => res.success && setProducts(res.data))
      .catch(() => {});
  }, []);

  const displayProducts = products.slice(0, 4);

  return (
    <section id="products" className="relative py-10 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-8 sm:mb-16"
        >
          <span className="inline-flex items-center gap-2 glass-gold rounded-full px-4 py-1.5 text-xs font-medium text-[#D4AF37] mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            {t('landing.featuredProducts')}</span>
          <h2 className="text-2xl sm:text-4xl font-bold mb-3">
            <span className="text-gold-gradient">{t('landing.choosePackage')}</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto">
            {t('landing.choosePackageDesc')}
          </p>
        </motion.div>

        {/* Products Grid / Horizontal Scroll */}
        {displayProducts.length > 0 ? (
          <>
            {/* Mobile: horizontal scroll */}
            <div className="flex lg:hidden gap-4 overflow-x-auto no-scrollbar pb-4 snap-x snap-mandatory -mx-4 px-4">
              {displayProducts.map((product, i) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="min-w-[260px] sm:min-w-[280px] max-w-[300px] snap-start"
                >
                  <ProductCard product={product} navigate={navigate} />
                </motion.div>
              ))}
            </div>

            {/* Desktop: grid */}
            <div className="hidden lg:grid grid-cols-2 xl:grid-cols-4 gap-6">
              {displayProducts.map((product, i) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                >
                  <ProductCard product={product} navigate={navigate} />
                </motion.div>
              ))}
            </div>

            {/* View all */}
            <div className="text-center mt-8 sm:mt-10">
              <Button
                variant="outline"
                onClick={() => navigate('products')}
                className="rounded-2xl border-[#D4AF37]/30 text-foreground hover:bg-white/5"
              >
                {t('landing.viewAllProducts')}
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </>
        ) : (
          <div className="glass rounded-2xl p-8 sm:p-12 text-center">
            <ShoppingBag className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">{t('landing.noProductsAvailable')}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function ProductCard({ product, navigate }: { product: Product; navigate: (page: any, data?: any) => void }) {
  const t = useT();
  const quotaPercent = product.quota > 0 ? Math.round((product.quotaUsed / product.quota) * 100) : 0;
  const remaining = product.quota - product.quotaUsed;

  return (
    <div className="glass glow-gold rounded-2xl overflow-hidden group hover:glow-gold-strong transition-all h-full flex flex-col">
      {/* Card header gradient */}
      <div className="bg-card-gradient p-3 sm:p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-[#D4AF37]/5 blur-2xl" />
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-foreground font-semibold text-base sm:text-lg">{product.name}</h3>
          <span className="text-xs font-medium text-[#D4AF37] bg-[#D4AF37]/10 px-2.5 py-1 rounded-full">
            {product.profitRate}% / {product.duration}h
          </span>
        </div>
        <div className="text-2xl sm:text-3xl font-bold text-gold-gradient mb-1">
          {formatRupiah(product.price)}
        </div>
        <div className="text-muted-foreground text-xs sm:text-sm">
          Est. profit: <span className="text-emerald-400 font-medium">{formatRupiah(product.estimatedProfit)}</span>
        </div>
      </div>

      {/* Card body */}
      <div className="p-3 sm:p-6 flex-1 flex flex-col">
        {/* Duration */}
        <div className="flex items-center justify-between text-sm mb-4">
          <span className="text-muted-foreground">{t('landing.duration')}</span>
          <span className="text-foreground font-medium">{product.duration} {t('landing.days')}</span>
        </div>

        {/* Quota bar */}
        <div className="mb-5">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-muted-foreground">{t('landing.quotaFilled')}</span>
            <span className="text-foreground font-medium">{quotaPercent}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              whileInView={{ width: `${quotaPercent}%` }}
              viewport={{ once: true }}
              transition={{ duration: 1, delay: 0.3 }}
              className="h-full rounded-full bg-gold-gradient"
            />
          </div>
          <div className="flex items-center justify-between text-xs mt-1.5">
            <span className="text-muted-foreground">{t('landing.remaining')}: {remaining}</span>
            <span className="text-muted-foreground">{product.quotaUsed}/{product.quota}</span>
          </div>
        </div>

        {/* CTA */}
        <Button
          onClick={() => navigate('product-detail', { productId: product.id })}
          className="w-full bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 transition-all mt-auto"
        >
          {t('landing.viewDetail')}
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
   LIVE ACTIVITY - Super busy with REAL products
   \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */

const REAL_PRODUCTS_HOME = [
  { name: 'Gold Premium Asset vip 1', price: 100000 },
  { name: 'Gold Premium Asset vip 2', price: 500000 },
  { name: 'Gold Premium Asset vip 3', price: 1000000 },
  { name: 'Gold Premium Asset vip 4', price: 2500000 },
  { name: 'Gold Premium Asset vip 5', price: 5000000 },
  { name: 'Gold Premium Asset vip 6', price: 10000000 },
];

const FAKE_NAMES_HOME = [
  'Ahmad R.', 'Siti N.', 'Budi S.', 'Dewi L.', 'Fajar P.',
  'Rina W.', 'Hendra K.', 'Maya T.', 'Andi M.', 'Putri D.',
  'Rudi H.', 'Lina S.', 'Doni A.', 'Yuli B.', 'Wawan G.',
  'Nita J.', 'Eko F.', 'Sari V.', 'Agus Z.', 'Wati C.',
  'Bambang Q.', 'Indah E.', 'Joko U.', 'Amel X.', 'Tono Y.',
  'Ratna I.', 'Dimas O.', 'Citra P.', 'Galang R.', 'Fitriani L.',
  'Bayu N.', 'Kartika M.', 'Surya D.', 'Nurul H.', 'Rizky A.',
  'Dian S.', 'Prasetyo B.', 'Lestari K.', 'Santoso G.', 'Hartono F.',
  'Suryani T.', 'Purnomo W.', 'Wulandari J.', 'Setiawan V.', 'Rahayu Z.',
  'Supriadi X.', 'Handayani C.', 'Wibowo Q.', 'Maharani E.', 'Saputra U.',
  'Yusuf M.', 'Aisyah K.', 'Ilham R.', 'Nadia F.', 'Teguh B.',
  'Lestari H.', 'Wijaya D.', 'Permata S.', 'Hakim A.', 'Safitri N.',
  'Kurniawan J.', 'Utami P.', 'Pratama G.', 'Anggraini T.', 'Wicaksono F.',
  'Harahap L.', 'Nasution R.', 'Siregar B.', 'Panggabean V.', 'Simanjuntak C.',
  'Muhammad A.', 'Fatimah Z.', 'Abdullah R.', 'Khadijah S.', 'Umar H.',
  'Susanto P.', 'Wibisono E.', 'Harjono K.', 'Mulyono G.', 'Sutanto L.',
  'Gunawan S.', 'Santika R.', 'Rahardjo T.', 'Suharto B.', 'Prabowo I.',
  'Suryadi O.', 'Moertini Z.', 'Kusumo F.', 'Respati D.', 'Wignyo R.',
  'Triyono V.', 'Suryo N.', 'Yudistira C.', 'Arjuna M.', 'Bima U.',
  'Haryanto J.', 'Sulistiowati E.', 'Purnama A.', 'Setiabudi W.', 'Hidayat N.',
  'Mulyadi H.', 'Wahyuni S.', 'Kurniawan T.', 'Astuti D.', 'Budiman G.',
];

const DEPOSIT_AMOUNTS_HOME = [
  100000, 500000, 1000000, 1000000, 2500000, 5000000, 5000000,
  10000000, 10000000, 15000000, 20000000, 25000000, 50000000, 100000000,
  200000000, 500000000,
];

const WITHDRAW_AMOUNTS_HOME = [
  50000, 100000, 200000, 500000, 1000000, 2000000, 5000000, 10000000, 20000000,
];

function randomItemHome<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateRandomActivityHome(index: number): Activity {
  const rand = Math.random();
  let type: string;
  if (rand < 0.50) type = 'purchase';
  else if (rand < 0.85) type = 'deposit';
  else if (rand < 0.93) type = 'withdraw';
  else type = 'register';

  let amount = 0;
  let productName: string | null = null;
  switch (type) {
    case 'purchase': {
      const product = randomItemHome(REAL_PRODUCTS_HOME);
      amount = product.price;
      productName = product.name;
      break;
    }
    case 'deposit':
      amount = randomItemHome(DEPOSIT_AMOUNTS_HOME);
      break;
    case 'withdraw':
      amount = randomItemHome(WITHDRAW_AMOUNTS_HOME);
      break;
    case 'register':
      amount = 0;
      break;
  }

  const secondsAgo = Math.floor(Math.random() * 60);
  const createdAt = new Date(Date.now() - secondsAgo * 1000);

  return {
    id: `home-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    userName: randomItemHome(FAKE_NAMES_HOME),
    amount,
    productName,
    isFake: true,
    createdAt: createdAt.toISOString(),
  };
}

function generateBatchHome(): Activity[] {
  const count = 20 + Math.floor(Math.random() * 20);
  const batch: Activity[] = [];
  for (let i = 0; i < count; i++) {
    batch.push(generateRandomActivityHome(i));
  }
  batch.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return batch;
}

function useRunningCounterHome(startValue: number, incrementMin: number, incrementMax: number, intervalMs: number) {
  const counterRef = useRef(startValue);
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      counterRef.current += incrementMin + Math.floor(Math.random() * (incrementMax - incrementMin));
      forceUpdate((p) => p + 1);
    }, intervalMs);
    return () => clearInterval(interval);
  }, [incrementMin, incrementMax, intervalMs]);
  return counterRef.current;
}

function LiveActivity() {
  const t = useT();
  const { navigate } = useAppStore();
  const [activities, setActivities] = useState<Activity[]>(() => generateBatchHome());
  const [cycleKey, setCycleKey] = useState(0);

  const totalDepositsToday = useRunningCounterHome(12847, 5, 25, 1500);
  const totalPurchasesToday = useRunningCounterHome(8934, 4, 18, 1800);
  const totalNewMembers = useRunningCounterHome(3256, 2, 8, 2500);
  const activeUsersNow = useRunningCounterHome(14892, 20, 80, 2000);
  const totalVolumeToday = useRunningCounterHome(287500000000, 500000000, 2000000000, 2500);

  useEffect(() => {
    const interval = setInterval(() => {
      setActivities(generateBatchHome());
      setCycleKey((prev) => prev + 1);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const getTypeConfig = (type: string) => {
    switch (type) {
      case 'deposit':
        return { icon: ArrowDown, color: 'text-emerald-400', bg: 'bg-emerald-400/10', label: 'Deposit' };
      case 'withdraw':
        return { icon: ArrowUp, color: 'text-blue-400', bg: 'bg-blue-400/10', label: 'Withdraw' };
      case 'purchase':
        return { icon: ShoppingBag, color: 'text-[#D4AF37]', bg: 'bg-[#D4AF37]/10', label: 'Investasi' };
      case 'register':
        return { icon: UserPlus, color: 'text-purple-400', bg: 'bg-purple-400/10', label: 'Daftar Baru' };
      default:
        return { icon: ArrowDown, color: 'text-emerald-400', bg: 'bg-emerald-400/10', label: type };
    }
  };

  return (
    <section id="live" className="relative py-10 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-8 sm:mb-12"
        >
          <span className="inline-flex items-center gap-2 glass-gold rounded-full px-4 py-1.5 text-xs font-medium text-[#D4AF37] mb-4">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
            </span>
            {t('landing.liveActivity')}
          </span>
          <h2 className="text-2xl sm:text-4xl font-bold mb-3">
            <span className="text-gold-gradient">{t('landing.recentTransactions')}</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto">{t('landing.monitorRealTime')}</p>
        </motion.div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
          {[
            { icon: ArrowDown, label: 'Deposit', value: totalDepositsToday.toLocaleString('id-ID'), color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
            { icon: ShoppingBag, label: 'Investasi', value: totalPurchasesToday.toLocaleString('id-ID'), color: 'text-[#D4AF37]', bg: 'bg-[#D4AF37]/10' },
            { icon: UserPlus, label: 'Member Baru', value: totalNewMembers.toLocaleString('id-ID'), color: 'text-purple-400', bg: 'bg-purple-400/10' },
            { icon: TrendingUp, label: 'Volume', value: formatRupiah(totalVolumeToday), color: 'text-orange-400', bg: 'bg-orange-400/10' },
            { icon: Users, label: 'Pengguna Aktif', value: activeUsersNow.toLocaleString('id-ID'), color: 'text-pink-400', bg: 'bg-pink-400/10' },
          ].map((stat) => (
            <motion.div key={stat.label} initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="glass glow-gold rounded-2xl p-3 sm:p-4 text-center group hover:glow-gold-strong transition-all">
              <div className={`inline-flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-xl ${stat.bg} mb-2 group-hover:scale-110 transition-transform`}>
                <stat.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${stat.color}`} />
              </div>
              <p className={`font-bold text-sm sm:text-base ${stat.color}`}>{stat.value}</p>
              <p className="text-muted-foreground text-[9px] sm:text-xs mt-0.5">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Live badge */}
        <div className="flex justify-center mb-6">
          <div className="glass-gold rounded-full px-4 py-1.5 flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
            </span>
            <span className="text-[#D4AF37] text-xs font-semibold">{activities.length} transaksi baru</span>
          </div>
        </div>

        {/* Feed */}
        <div className="max-w-2xl mx-auto space-y-2 max-h-[500px] overflow-y-auto pr-1">
          <AnimatePresence mode="popLayout">
            {activities.map((activity, i) => {
              const config = getTypeConfig(activity.type);
              return (
                <motion.div
                  key={`${cycleKey}-${activity.id}`}
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.015, duration: 0.25, ease: 'easeOut' }}
                  className="glass rounded-xl p-2.5 sm:p-3 flex items-center gap-2.5 hover:glow-gold transition-all"
                >
                  <div className={`w-7 h-7 sm:w-9 sm:h-9 rounded-lg ${config.bg} flex items-center justify-center shrink-0`}>
                    <config.icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${config.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-foreground font-medium text-[11px] sm:text-xs truncate">{activity.userName}</span>
                      <span className={`text-[8px] sm:text-[9px] font-medium ${config.color} px-1.5 py-0.5 rounded-full ${config.bg}`}>{config.label}</span>
                    </div>
                    {activity.productName && (
                      <p className="text-muted-foreground text-[9px] sm:text-[10px] truncate">{activity.productName}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {activity.amount > 0 && (
                      <div className={`font-semibold text-[11px] sm:text-xs ${config.color}`}>
                        {activity.type === 'withdraw' ? '-' : '+'}{formatRupiah(activity.amount)}
                      </div>
                    )}
                    <div className="text-muted-foreground text-[8px] sm:text-[9px]">{timeAgo(new Date(activity.createdAt))}</div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        <div className="text-center mt-6 sm:mt-8">
          <Button variant="outline" onClick={() => navigate('live')} className="rounded-2xl border-[#D4AF37]/30 text-foreground hover:bg-white/5">
            Lihat Semua Aktivitas <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   TESTIMONIALS
   ═══════════════════════════════════════════ */
function Testimonials() {
  const t = useT();
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);

  useEffect(() => {
    fetch('/api/testimonials')
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data?.length) {
          setTestimonials(res.data);
        } else {
          setTestimonials([
            { id: '1', name: 'James Wilson', rating: 5, comment: 'Very transparent and professional platform. Profits are always on time!', avatar: '' },
            { id: '2', name: 'Sarah Chen', rating: 5, comment: 'Been a member for 6 months and very satisfied with the results. Highly recommended!', avatar: '' },
            { id: '3', name: 'Michael Brown', rating: 4, comment: 'Customer service is very responsive. Fast deposit and withdrawal process.', avatar: '' },
            { id: '4', name: 'Lisa Wang', rating: 5, comment: 'Best digital investment platform I\'ve ever tried. Safe and trustworthy.', avatar: '' },
          ]);
        }
      })
      .catch(() => {
        setTestimonials([
          { id: '1', name: 'James Wilson', rating: 5, comment: 'Very transparent and professional platform!', avatar: '' },
          { id: '2', name: 'Sarah Chen', rating: 5, comment: 'Been a member for 6 months and very satisfied. Highly recommended!', avatar: '' },
          { id: '3', name: 'Michael Brown', rating: 4, comment: 'Customer service is responsive. Fast process.', avatar: '' },
        ]);
      });
  }, []);

  return (
    <section id="testimonials" className="relative py-10 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-8 sm:mb-16"
        >
          <span className="inline-flex items-center gap-2 glass-gold rounded-full px-4 py-1.5 text-xs font-medium text-[#D4AF37] mb-4">
            <Star className="w-3.5 h-3.5" />
            {t('landing.testimonials')}</span>
          <h2 className="text-2xl sm:text-4xl font-bold mb-3">
            <span className="text-gold-gradient">{t('landing.whatTheySay')}</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto">
            {t('landing.realTestimonials')}
          </p>
        </motion.div>

        {/* Testimonial cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {testimonials.slice(0, 4).map((t, i) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="glass glow-gold rounded-2xl p-3 sm:p-6 hover:glow-gold-strong transition-all"
            >
              {/* Stars */}
              <div className="flex items-center gap-1 mb-3">
                {Array.from({ length: 5 }).map((_, si) => (
                  <Star
                    key={si}
                    className={`w-4 h-4 ${
                      si < t.rating
                        ? 'text-[#D4AF37] fill-[#D4AF37]'
                        : 'text-white/10'
                    }`}
                  />
                ))}
              </div>
              {/* Comment */}
              <p className="text-foreground/80 text-sm leading-relaxed mb-4 line-clamp-3">
                &ldquo;{t.comment}&rdquo;
              </p>
              {/* User */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gold-gradient flex items-center justify-center text-sm font-bold text-[#070B14]">
                  {t.name.charAt(0)}
                </div>
                <div>
                  <p className="text-foreground font-medium text-sm">{t.name}</p>
                  <p className="text-muted-foreground text-xs">Member NEXVO</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   CTA SECTION
   ═══════════════════════════════════════════ */
function CtaSection() {
  const { navigate } = useAppStore();

  return (
    <section className="relative py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="relative overflow-hidden rounded-3xl"
        >
          {/* Background */}
          <div className="absolute inset-0 bg-gold-gradient opacity-90" />
          <div className="absolute inset-0 bg-[#070B14]/20" />
          {/* Decorative */}
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full bg-black/10 blur-3xl" />

          <div className="relative p-8 sm:p-12 lg:p-16 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              <h2 className="text-2xl sm:text-4xl lg:text-5xl font-bold text-[#070B14] mb-4 sm:mb-6">
                Start Investing Today
              </h2>
              <p className="text-[#070B14]/70 text-sm sm:text-lg max-w-xl mx-auto mb-6 sm:mb-8">
                Begin your digital investment journey with NEXVO. Register for free and start earning daily profits from commodity-backed packages!
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
                <Button
                  onClick={() => navigate('register')}
                  className="bg-[#070B14] text-[#D4AF37] font-semibold rounded-2xl hover:bg-[#0F172A] transition-colors px-8 h-12 sm:h-14 text-sm sm:text-base w-full sm:w-auto"
                >
                  Register Free
                  <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 ml-1" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('login')}
                  className="border-[#070B14]/30 text-[#070B14] hover:bg-[#070B14]/10 rounded-2xl px-8 h-12 sm:h-14 text-sm sm:text-base w-full sm:w-auto"
                >
                  Already Have an Account
                </Button>
              </div>
            </motion.div>

            {/* Trust badges */}
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 mt-8 sm:mt-10">
              {[
                { icon: Shield, text: 'Secure & Trusted' },
                { icon: CheckCircle2, text: 'Daily Profit' },
                { icon: Clock, text: '24/7 Support' },
              ].map((badge) => (
                <div key={badge.text} className="flex items-center gap-2 text-[#070B14]/70 text-xs sm:text-sm">
                  <badge.icon className="w-4 h-4" />
                  {badge.text}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   HOME PAGE (Main Component)
   ═══════════════════════════════════════════ */
export default function HomePage() {
  const { pageData } = useAppStore();

  // Handle scroll from navigation
  useEffect(() => {
    const scrollTo = pageData?.scrollTo as string;
    if (scrollTo) {
      setTimeout(() => {
        const el = document.getElementById(scrollTo as string);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
  }, [pageData]);

  return (
    <div className="min-h-screen flex flex-col">
      <HeroBanner />
      <AboutNexvo />
      <StatisticsSection />
      <ProductPreview />
      <HowItWorks />
      <CtaSection />
      <Footer />
    </div>
  );
}

