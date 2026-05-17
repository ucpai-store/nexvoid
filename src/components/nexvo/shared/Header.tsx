'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ChevronRight, Shield } from 'lucide-react';
import Image from 'next/image';
import { useAppStore } from '@/stores/app-store';
import { useAuthStore } from '@/stores/auth-store';
import { useSiteStore } from '@/stores/site-store';
import { getFileUrl } from '@/lib/file-url';
import { Button } from '@/components/ui/button';

export default function Header() {
  const { currentPage, navigate } = useAppStore();
  const { user, token } = useAuthStore();
  const { logoUrl } = useSiteStore();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: 'Home', page: 'home' as const, section: 'hero' },
    { label: 'Produk', page: 'home' as const, section: 'products' },
    { label: 'Tentang', page: 'home' as const, section: 'about' },
  ];

  const handleNavClick = (section: string) => {
    if (currentPage !== 'home') {
      navigate('home', { scrollTo: section });
    } else {
      const el = document.getElementById(section);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    setMobileMenuOpen(false);
  };

  return (
    <>
      <motion.header
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'glass-strong shadow-lg shadow-black/20'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20">
            {/* Logo */}
            <motion.div
              className="flex items-center gap-2 cursor-pointer"
              whileHover={{ scale: 1.02 }}
              onClick={() => navigate('home')}
            >
              <img src={logoUrl} alt="NEXVO" className="h-10 sm:h-12 w-auto object-contain" onError={(e) => { (e.target as HTMLImageElement).src = '/api/files/nexvo-logo.png'; }} />
            </motion.div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <button
                  key={link.label}
                  onClick={() => handleNavClick(link.section)}
                  className="px-4 py-2 text-sm font-medium text-foreground/80 hover:text-gold-gradient transition-colors rounded-xl hover:bg-white/5"
                >
                  {link.label}
                </button>
              ))}
            </nav>

            {/* Desktop Actions */}
            <div className="hidden md:flex items-center gap-3">
              {token && user ? (
                <Button
                  onClick={() => navigate('dashboard')}
                  className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 transition-opacity glow-gold"
                >
                  Dashboard
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <>
                  <button
                    onClick={() => navigate('admin-login')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[#D4AF37]/50 hover:text-[#D4AF37] hover:bg-[#D4AF37]/5 transition-all text-xs font-medium"
                    title="Admin Panel Login"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span className="hidden lg:inline">Admin</span>
                  </button>
                  <Button
                    variant="ghost"
                    onClick={() => navigate('login')}
                    className="text-foreground/80 hover:text-foreground rounded-xl"
                  >
                    Masuk
                  </Button>
                  <Button
                    onClick={() => navigate('register')}
                    className="bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 transition-opacity glow-gold"
                  >
                    Daftar
                  </Button>
                </>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2 rounded-xl hover:bg-white/5 transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6 text-foreground" />
              ) : (
                <Menu className="w-6 h-6 text-foreground" />
              )}
            </button>
          </div>
        </div>
      </motion.header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-[280px] z-50 md:hidden glass-strong"
            >
              <div className="flex flex-col h-full">
                {/* Mobile Menu Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <img src={logoUrl} alt="NEXVO" className="h-9 w-auto object-contain" onError={(e) => { (e.target as HTMLImageElement).src = '/api/files/nexvo-logo.png'; }} />
                  </div>
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-2 rounded-xl hover:bg-white/5"
                  >
                    <X className="w-5 h-5 text-foreground" />
                  </button>
                </div>

                {/* Mobile Nav Links */}
                <div className="flex-1 p-4 space-y-1">
                  {navLinks.map((link, i) => (
                    <motion.button
                      key={link.label}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => handleNavClick(link.section)}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-foreground/80 hover:text-foreground hover:bg-white/5 transition-colors"
                    >
                      <span className="font-medium">{link.label}</span>
                      <ChevronRight className="w-4 h-4 opacity-50" />
                    </motion.button>
                  ))}
                </div>

                {/* Mobile Actions */}
                <div className="p-4 space-y-3 border-t border-border">
                  {token && user ? (
                    <Button
                      onClick={() => {
                        navigate('dashboard');
                        setMobileMenuOpen(false);
                      }}
                      className="w-full bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold"
                    >
                      Dashboard
                    </Button>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          navigate('admin-login');
                          setMobileMenuOpen(false);
                        }}
                        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[#D4AF37]/60 hover:text-[#D4AF37] hover:bg-[#D4AF37]/5 transition-all text-xs font-medium"
                      >
                        <Shield className="w-3.5 h-3.5" />
                        Login Admin
                      </button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          navigate('login');
                          setMobileMenuOpen(false);
                        }}
                        className="w-full rounded-xl border-gold/30 text-foreground hover:bg-white/5"
                      >
                        Masuk
                      </Button>
                      <Button
                        onClick={() => {
                          navigate('register');
                          setMobileMenuOpen(false);
                        }}
                        className="w-full bg-gold-gradient text-[#070B14] font-semibold rounded-xl hover:opacity-90 glow-gold"
                      >
                        Daftar Sekarang
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
