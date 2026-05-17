'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, LayoutDashboard, Users, ShoppingBag,
  ArrowDownCircle, ArrowUpCircle, CreditCard, Smartphone,
  Image, Settings, Radio, X, Menu, ChevronRight, LogOut,
  Database, Key, Settings2, Palette, Package
} from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { useAuthStore } from '@/stores/auth-store';
import { useSiteStore } from '@/stores/site-store';
import { getFileUrl } from '@/lib/file-url';
import { Badge } from '@/components/ui/badge';
import { useT } from '@/lib/i18n';
import LanguageSwitcher from '@/components/nexvo/shared/LanguageSwitcher';
import type { Page } from '@/stores/app-store';

/* ───────── Admin Nav Items ───────── */
const adminNavItems: { label: string; page: Page; icon: React.ElementType; groupKey?: string }[] = [
  { label: 'Dashboard', page: 'admin-dashboard', icon: LayoutDashboard, groupKey: 'admin.mainGroup' },
  { label: 'Users', page: 'admin-users', icon: Users, groupKey: 'admin.managementGroup' },
  { label: 'Products', page: 'admin-products', icon: ShoppingBag, groupKey: 'admin.managementGroup' },
  { label: 'Packages', page: 'admin-packages', icon: Package, groupKey: 'admin.managementGroup' },
  { label: 'Deposits', page: 'admin-deposits', icon: ArrowDownCircle, groupKey: 'admin.transactionGroup' },
  { label: 'Withdrawals', page: 'admin-withdrawals', icon: ArrowUpCircle, groupKey: 'admin.transactionGroup' },
  { label: 'Asset', page: 'admin-asset', icon: Database, groupKey: 'admin.systemGroup' },
  { label: 'Payment', page: 'admin-payment', icon: CreditCard, groupKey: 'admin.systemGroup' },
  { label: 'App', page: 'admin-app', icon: Smartphone, groupKey: 'admin.systemGroup' },
  { label: 'Tampilan', page: 'admin-appearance', icon: Palette, groupKey: 'admin.contentGroup' },
  { label: 'Banners', page: 'admin-banners', icon: Image, groupKey: 'admin.contentGroup' },
  { label: 'Settings', page: 'admin-settings', icon: Settings, groupKey: 'admin.contentGroup' },
  { label: 'API Keys', page: 'admin-api-keys', icon: Key, groupKey: 'admin.securityGroup' },
  { label: 'Live', page: 'admin-live', icon: Radio, groupKey: 'admin.contentGroup' },
  { label: 'System', page: 'admin-settings', icon: Settings2, groupKey: 'admin.systemGroup' },
];

export default function AdminHeader() {
  const { currentPage, navigate, adminSidebarOpen, setAdminSidebarOpen } = useAppStore();
  const { admin, adminLogout } = useAuthStore();
  const { logoUrl } = useSiteStore();
  const t = useT();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogout = () => {
    adminLogout();
    navigate('admin-login');
  };

  const isActive = (page: Page) => currentPage === page;

  // Group nav items for sidebar
  const groupedItems = adminNavItems.reduce<Record<string, typeof adminNavItems>>((acc, item) => {
    const group = item.groupKey ? t(item.groupKey) : t('admin.otherGroup');
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {});

  return (
    <>
      {/* Desktop Sidebar */}
      <motion.aside
        initial={{ x: -280 }}
        animate={{ x: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="fixed top-0 left-0 bottom-0 w-[260px] z-40 hidden lg:block"
      >
        <div className="h-full glass-strong border-r border-border flex flex-col">
          {/* Logo Area */}
          <div className="p-5 border-b border-border">
            <div
              className="flex items-center gap-2.5 cursor-pointer"
              onClick={() => navigate('admin-dashboard')}
            >
              <img src={logoUrl} alt="NEXVO" className="h-10 w-auto object-contain" onError={(e) => { (e.target as HTMLImageElement).src = '/api/files/nexvo-logo.png'; }} />
              <Badge className="bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/20 text-[10px] px-1.5 py-0 h-4">
                ADMIN
              </Badge>
            </div>
          </div>

          {/* Sidebar Navigation */}
          <div className="flex-1 overflow-y-auto p-3 space-y-5">
            {Object.entries(groupedItems).map(([group, items]) => (
              <div key={group}>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-1.5">
                  {group}
                </p>
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <button
                      key={item.page}
                      onClick={() => navigate(item.page)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        isActive(item.page)
                          ? 'bg-[#D4AF37]/10 text-[#D4AF37] glow-gold'
                          : 'text-foreground/60 hover:text-foreground hover:bg-white/5'
                      }`}
                    >
                      <item.icon className="w-4.5 h-4.5" />
                      <span className="flex-1 text-left">{item.label}</span>
                      {isActive(item.page) && (
                        <div className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Sidebar Footer */}
          <div className="p-4 border-t border-border">
            <div className="flex items-center gap-3 mb-3 px-2">
              <div className="w-8 h-8 rounded-lg bg-gold-gradient flex items-center justify-center text-xs font-bold text-[#070B14]">
                {admin?.name?.charAt(0) || 'A'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-foreground text-sm font-medium truncate">{admin?.name || 'Admin'}</p>
                <p className="text-muted-foreground text-xs truncate">{admin?.email || admin?.username || 'admin'}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-400/70 hover:text-red-400 hover:bg-red-500/5 transition-all"
            >
              <LogOut className="w-4 h-4" />
              {t('admin.logout')}
            </button>
          </div>
        </div>
      </motion.aside>

      {/* Desktop Top Bar */}
      <motion.header
        initial={{ y: -60 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className={`fixed top-0 left-[260px] right-0 z-30 hidden lg:block transition-all duration-300 ${
          scrolled ? 'glass-strong shadow-lg shadow-black/10' : 'bg-[#070B14]/80'
        }`}
      >
        <div className="flex items-center justify-between h-14 px-6">
          <div>
            <h2 className="text-foreground font-semibold text-sm">
              {adminNavItems.find((i) => i.page === currentPage)?.label || 'Dashboard'}
            </h2>
            <p className="text-muted-foreground text-xs">{t('admin.adminPanel')}</p>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Badge variant="outline" className="text-[10px] border-[#D4AF37]/30 text-[#D4AF37]">
              <Radio className="w-3 h-3 mr-1" />
              {t('admin.systemOnline')}
            </Badge>
            <Badge className={`text-[10px] border-0 ${admin?.role === 'super_admin' ? 'bg-[#D4AF37]/10 text-[#D4AF37]' : 'bg-blue-400/10 text-blue-400'}`}>
              <Shield className="w-3 h-3 mr-1" />
              {admin?.role === 'super_admin' ? 'Super Admin' : 'Admin'}
            </Badge>
          </div>
        </div>
      </motion.header>

      {/* Mobile Top Bar */}
      <motion.header
        initial={{ y: -60 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className={`fixed top-0 left-0 right-0 z-40 lg:hidden transition-all duration-300 ${
          scrolled ? 'glass-strong shadow-lg shadow-black/20' : 'bg-[#070B14]/95'
        }`}
      >
        <div className="flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-2.5">
            <img src={logoUrl} alt="NEXVO" className="h-9 w-auto object-contain" onError={(e) => { (e.target as HTMLImageElement).src = '/api/files/nexvo-logo.png'; }} />
            <span className="text-[9px] font-semibold text-[#D4AF37] bg-[#D4AF37]/10 px-1.5 py-0.5 rounded">
              ADMIN
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setAdminSidebarOpen(!adminSidebarOpen)}
              className="p-2 rounded-xl hover:bg-white/5"
            >
              <Menu className="w-5 h-5 text-foreground" />
            </button>
          </div>
        </div>
      </motion.header>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {adminSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 lg:hidden"
              onClick={() => setAdminSidebarOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-[280px] z-50 lg:hidden glass-strong"
            >
              <div className="flex flex-col h-full">
                {/* Sidebar Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <img src={logoUrl} alt="NEXVO" className="h-10 w-auto object-contain" onError={(e) => { (e.target as HTMLImageElement).src = '/api/files/nexvo-logo.png'; }} />
                    <Badge className="bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/20 text-[10px] px-1.5 py-0 h-4">
                      ADMIN
                    </Badge>
                  </div>
                  <button
                    onClick={() => setAdminSidebarOpen(false)}
                    className="p-2 rounded-xl hover:bg-white/5"
                  >
                    <X className="w-5 h-5 text-foreground" />
                  </button>
                </div>

                {/* Sidebar Navigation */}
                <div className="flex-1 overflow-y-auto p-3 space-y-5">
                  {Object.entries(groupedItems).map(([group, items]) => (
                    <div key={group}>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-1.5">
                        {group}
                      </p>
                      <div className="space-y-0.5">
                        {items.map((item, i) => (
                          <motion.button
                            key={item.page}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.03 }}
                            onClick={() => {
                              navigate(item.page);
                              setAdminSidebarOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                              isActive(item.page)
                                ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                                : 'text-foreground/60 hover:text-foreground hover:bg-white/5'
                            }`}
                          >
                            <item.icon className="w-4 h-4" />
                            <span className="flex-1 text-left">{item.label}</span>
                            {isActive(item.page) && (
                              <ChevronRight className="w-4 h-4 text-[#D4AF37]" />
                            )}
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Sidebar Footer */}
                <div className="p-4 border-t border-border">
                  <div className="flex items-center gap-3 mb-3 px-2">
                    <div className="w-8 h-8 rounded-lg bg-gold-gradient flex items-center justify-center text-xs font-bold text-[#070B14]">
                      {admin?.name?.charAt(0) || 'A'}
                    </div>
                    <div>
                      <p className="text-foreground text-sm font-medium">{admin?.name || 'Admin'}</p>
                      <p className="text-muted-foreground text-xs">{admin?.username || 'admin'}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      handleLogout();
                      setAdminSidebarOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-400/70 hover:text-red-400 hover:bg-red-500/5 transition-all"
                  >
                    <LogOut className="w-4 h-4" />
                    {t('admin.logout')}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Content spacer: left sidebar + top bar */}
      <div className="hidden lg:block lg:ml-[260px]">
        <div className="h-14" />
      </div>
      <div className="lg:hidden h-14" />
    </>
  );
}
