'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, LayoutDashboard, ShoppingBag, Wallet,
  ArrowDownCircle, ArrowUpCircle, History, Users,
  Settings, LogOut, X, Menu, ChevronRight, Crown,
  Home, Receipt, User, TrendingUp, Package,
  Banknote, GitCompare, Sparkles, Bell, BellOff
} from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { useAuthStore } from '@/stores/auth-store';
import { useSiteStore } from '@/stores/site-store';
import { getFileUrl } from '@/lib/file-url';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';
import LanguageSwitcher from '@/components/nexvo/shared/LanguageSwitcher';
import ThemeToggle from '@/components/nexvo/shared/ThemeToggle';
import type { Page } from '@/stores/app-store';

/* ───────── Nav items ───────── */
const desktopNavKeys: { key: string; page: Page; icon: React.ElementType }[] = [
  { key: 'nav.home', page: 'home', icon: Home },
  { key: 'nav.dashboard', page: 'dashboard', icon: LayoutDashboard },
  { key: 'nav.profit', page: 'profit', icon: TrendingUp },
  { key: 'nav.products', page: 'products', icon: ShoppingBag },
  { key: 'nav.paket', page: 'paket', icon: Receipt },
  { key: 'nav.assets', page: 'assets', icon: Package },
  { key: 'nav.live', page: 'live', icon: Sparkles },
  { key: 'nav.deposit', page: 'deposit', icon: ArrowDownCircle },
  { key: 'nav.withdraw', page: 'withdraw', icon: ArrowUpCircle },
  { key: 'nav.history', page: 'history', icon: History },
  { key: 'nav.referral', page: 'referral', icon: Users },
  { key: 'nav.salaryBonus', page: 'salary-bonus', icon: Banknote },
  { key: 'nav.matchingBonus', page: 'matching-bonus', icon: GitCompare },
];

const mobileBottomKeys: { key: string; page: Page; icon: React.ElementType }[] = [
  { key: 'nav.home', page: 'home', icon: Home },
  { key: 'nav.assets', page: 'assets', icon: Package },
  { key: 'nav.products', page: 'products', icon: ShoppingBag },
  { key: 'nav.wallet', page: 'deposit', icon: Wallet },
  { key: 'nav.profile', page: 'settings', icon: User },
];


// ───────── User Notification Bell Component ─────────
function UserNotificationBell() {
  const [pushStatus, setPushStatus] = useState<'checking' | 'active' | 'inactive' | 'denied'>('checking');
  const [showPanel, setShowPanel] = useState(false);
  const { token } = useAuthStore();

  useEffect(() => {
    checkPushStatus();
  }, []);

  const checkPushStatus = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPushStatus('inactive');
      return;
    }
    const perm = Notification.permission;
    if (perm === 'granted') {
      try {
        const reg = await navigator.serviceWorker?.ready;
        const sub = await reg.pushManager.getSubscription();
        setPushStatus(sub ? 'active' : 'inactive');
      } catch {
        setPushStatus('inactive');
      }
    } else if (perm === 'denied') {
      setPushStatus('denied');
    } else {
      setPushStatus('inactive');
    }
  };

  const enableNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        setPushStatus('active');
        setTimeout(checkPushStatus, 2000);
      } else if (perm === 'denied') {
        setPushStatus('denied');
      }
    } catch (e) {
      console.error('[UserNotifBell] Error:', e);
    }
  };

  const statusColor = pushStatus === 'active' ? 'text-emerald-400' : pushStatus === 'denied' ? 'text-red-400' : 'text-yellow-400';
  const dotColor = pushStatus === 'active' ? 'bg-cardmerald-400' : pushStatus === 'denied' ? 'bg-red-400' : 'bg-yellow-400';

  return (
    <div className="relative">
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="p-2 rounded-xl hover:bg-foreground/5 relative"
        title={pushStatus === 'active' ? 'Notifikasi Aktif' : 'Aktifkan Notifikasi'}
      >
        <Bell className={`w-5 h-5 ${statusColor}`} />
        <span className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${dotColor} ${pushStatus === 'active' ? 'animate-pulse' : ''}`} />
      </button>

      {showPanel && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setShowPanel(false)} />
          <div className="absolute right-0 top-full mt-2 w-72 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Bell className={`w-4 h-4 ${statusColor}`} />
                <span className="text-sm font-semibold text-white">Notifikasi</span>
                <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full ${
                  pushStatus === 'active' ? 'bg-cardmerald-500/20 text-emerald-400' : 
                  pushStatus === 'denied' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {pushStatus === 'active' ? 'Aktif' : pushStatus === 'denied' ? 'Diblokir' : 'Nonaktif'}
                </span>
              </div>
              
              <p className="text-xs text-muted-foreground mb-4">
                {pushStatus === 'active' 
                  ? 'Notifikasi aktif. Anda akan menerima update deposit, profit, dan withdrawal.'
                  : pushStatus === 'denied'
                  ? 'Notifikasi diblokir. Aktifkan di pengaturan browser/HP Anda.'
                  : 'Aktifkan notifikasi untuk mendapat update langsung di HP.'}
              </p>

              {pushStatus !== 'active' && pushStatus !== 'denied' && (
                <button
                  onClick={enableNotifications}
                  className="w-full px-3 py-2 bg-cardmerald-500 hover:bg-cardmerald-600 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  Aktifkan Notifikasi
                </button>
              )}

              {pushStatus === 'denied' && (
                <p className="text-[10px] text-muted-foreground">
                  Buka Settings → Site Settings → Notifications → Allow
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function UserHeader() {
  const { currentPage, navigate, sidebarOpen, setSidebarOpen } = useAppStore();
  const { user, logout } = useAuthStore();
  const { logoUrl } = useSiteStore();
  const t = useT();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('login');
  };

  const isActive = (page: Page) => currentPage === page;

  return (
    <>
      {/* Desktop / Top Header */}
      <motion.header
        initial={{ y: -80 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 hidden md:block ${
          scrolled ? 'glass-strong shadow-lg shadow-black/20' : 'bg-background/95'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-[72px]">
            {/* Logo */}
            <div
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => navigate('home')}
            >
              <img src={logoUrl} alt="NEXVO" className="h-10 w-auto object-contain invert dark:invert-0" onError={(e) => { (e.target as HTMLImageElement).src = '/api/files/nexvo-logo.png'; }} />
            </div>

            {/* Desktop Nav */}
            <nav className="flex items-center gap-1">
              {desktopNavKeys.map((item) => (
                <button
                  key={item.page}
                  onClick={() => navigate(item.page)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all ${
                    isActive(item.page)
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground/70 hover:text-foreground hover:bg-foreground/5'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {t(item.key)}
                </button>
              ))}
            </nav>

            {/* User Actions */}
            <div className="flex items-center gap-3">
              {/* Theme Toggle */}
              <ThemeToggle />
              {/* Notification Bell */}
              <UserNotificationBell />
              {/* Language Switcher */}
              <LanguageSwitcher />

              {/* User Info */}
              <div className="flex items-center gap-3 glass rounded-xl px-3 py-2">
                <div className="w-8 h-8 rounded-lg overflow-hidden bg-gold-gradient flex items-center justify-center text-xs font-bold text-primary-foreground">
                  {user?.avatar ? <img src={getFileUrl(user.avatar)} alt={user.name || 'User'} className="w-full h-full object-cover" /> : (user?.name?.charAt(0) || 'U')}
                </div>
                <div className="text-left">
                  <p className="text-foreground text-xs font-medium leading-tight">
                    {user?.name || 'User'}
                  </p>
                  <div className="flex items-center gap-1">
                    <Crown className="w-3 h-3 text-primary" />
                    <span className="text-primary text-[10px] font-medium">
                      {user?.level || 'Bronze'}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => navigate('settings')}
                className="p-2 rounded-xl hover:bg-foreground/5 text-foreground/70 hover:text-foreground transition-colors"
              >
                <Settings className="w-5 h-5" />
              </button>

              <button
                onClick={handleLogout}
                className="p-2 rounded-xl hover:bg-red-500/10 text-foreground/70 hover:text-red-400 transition-colors"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Mobile Top Bar */}
      <motion.header
        initial={{ y: -60 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className={`fixed top-0 left-0 right-0 z-40 md:hidden transition-all duration-300 ${
          scrolled ? 'glass-strong shadow-lg shadow-black/20' : 'bg-background/95'
        }`}
      >
        <div className="flex items-center justify-between h-14 px-4">
          {/* Logo */}
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => navigate('home')}
          >
            <img src={logoUrl} alt="NEXVO" className="h-9 w-auto object-contain invert dark:invert-0" onError={(e) => { (e.target as HTMLImageElement).src = '/api/files/nexvo-logo.png'; }} />
          </div>

          <div className="flex items-center gap-2">
            {/* User Level Badge */}
            <div className="flex items-center gap-1 glass-gold rounded-lg px-2.5 py-1">
              <Crown className="w-3 h-3 text-primary" />
              <span className="text-[10px] font-semibold text-primary">{user?.level || 'Bronze'}</span>
            </div>

            <ThemeToggle />
            {/* Sidebar Toggle */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-xl hover:bg-foreground/5"
            >
              <Menu className="w-5 h-5 text-foreground" />
            </button>
          </div>
        </div>
      </motion.header>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-[280px] z-50 md:hidden glass-strong"
            >
              <div className="flex flex-col h-full">
                {/* Sidebar Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-gold-gradient flex items-center justify-center text-sm font-bold text-primary-foreground">
                      {user?.avatar ? <img src={getFileUrl(user.avatar)} alt={user.name || 'User'} className="w-full h-full object-cover" /> : (user?.name?.charAt(0) || 'U')}
                    </div>
                    <div>
                      <p className="text-foreground font-medium text-sm">{user?.name || 'User'}</p>
                      <div className="flex items-center gap-1">
                        <Crown className="w-3 h-3 text-primary" />
                        <span className="text-primary text-xs">{user?.level || 'Bronze'}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="p-2 rounded-xl hover:bg-foreground/5"
                  >
                    <X className="w-5 h-5 text-foreground" />
                  </button>
                </div>

                {/* Sidebar Navigation */}
                <div className="flex-1 p-3 space-y-1 overflow-y-auto">
                  {desktopNavKeys.map((item, i) => (
                    <motion.button
                      key={item.page}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      onClick={() => {
                        navigate(item.page);
                        setSidebarOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                        isActive(item.page)
                          ? 'bg-primary/10 text-primary'
                          : 'text-foreground/70 hover:text-foreground hover:bg-foreground/5'
                      }`}
                    >
                      <item.icon className="w-5 h-5" />
                      <span className="flex-1 text-left">{t(item.key)}</span>
                      {isActive(item.page) && (
                        <ChevronRight className="w-4 h-4 text-primary" />
                      )}
                    </motion.button>
                  ))}
                </div>

                {/* Language Switcher in Sidebar */}
                <div className="px-4 py-3 border-t border-border">
                  <LanguageSwitcher />
                </div>

                {/* Sidebar Footer */}
                <div className="p-4 space-y-2 border-t border-border">
                  <button
                    onClick={() => {
                      navigate('settings');
                      setSidebarOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-foreground/70 hover:text-foreground hover:bg-foreground/5 transition-all"
                  >
                    <Settings className="w-5 h-5" />
                    {t('nav.settings')}
                  </button>
                  <button
                    onClick={() => {
                      handleLogout();
                      setSidebarOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-500/70 hover:text-red-400 hover:bg-red-500/5 transition-all"
                  >
                    <LogOut className="w-5 h-5" />
                    {t('nav.logout')}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40">
        <div className="max-w-lg mx-auto">
          <div className="mx-2 mb-2 rounded-2xl glass-strong border border-border/30 shadow-lg shadow-black/30 overflow-hidden">
            <div className="flex items-center justify-around h-[60px] sm:h-[64px] px-1">
              {mobileBottomKeys.map((item, idx) => {
                const active = isActive(item.page);
                const isCenter = idx === 2; // Products is the center item
                return (
                  <button
                    key={item.page}
                    onClick={() => navigate(item.page)}
                    className={`flex flex-col items-center justify-center gap-0.5 py-1 rounded-xl transition-all ${
                      isCenter ? 'min-w-[60px]' : 'min-w-[48px]'
                    } ${
                      active
                        ? 'text-primary'
                        : 'text-foreground/40 hover:text-foreground/60'
                    }`}
                  >
                    <div className={`relative transition-transform ${active ? 'scale-110' : ''}`}>
                      {active && !isCenter && (
                        <div className="absolute -inset-2 rounded-xl bg-primary/10" />
                      )}
                      {isCenter ? (
                        <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center transition-all ${
                          active
                            ? 'bg-gold-gradient shadow-lg shadow-[#D4AF37]/30'
                            : 'bg-primary/15 border border-primary/30'
                        }`}>
                          <item.icon className={`w-5 h-5 sm:w-5.5 sm:h-5.5 ${active ? 'text-primary-foreground' : 'text-primary'}`} />
                        </div>
                      ) : (
                        <item.icon className="w-5 h-5 relative" />
                      )}
                    </div>
                    <span className={`text-[9px] sm:text-[10px] font-medium leading-tight ${
                      active ? 'text-primary' : ''
                    } ${isCenter && active ? 'font-semibold' : ''}`}>
                      {t(item.key)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        {/* Safe area spacer for iOS */}
        <div className="bg-transparent" style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
      </div>

      {/* Content spacer */}
      <div className="h-[80px] sm:h-16 lg:h-16" />
    </>
  );
}



