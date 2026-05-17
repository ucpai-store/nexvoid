'use client';

import { motion } from 'framer-motion';
import { Mail, Globe2, MapPin, ChevronRight, Heart } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { useSiteStore } from '@/stores/site-store';
import { getFileUrl } from '@/lib/file-url';

export default function Footer() {
  const { navigate } = useAppStore();
  const { logoUrl } = useSiteStore();

  const quickLinks = [
    { label: 'Home', section: 'hero' },
    { label: 'Products', section: 'products' },
    { label: 'How It Works', section: 'how-it-works' },
    { label: 'Testimonials', section: 'testimonials' },
  ];

  const handleLinkClick = (section: string) => {
    const el = document.getElementById(section);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      navigate('home', { scrollTo: section });
    }
  };

  return (
    <footer className="relative bg-[#040711] border-t border-border">
      {/* Top decorative line */}
      <div className="h-px bg-gold-gradient w-full" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-8">
          {/* Brand */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="sm:col-span-2 lg:col-span-1"
          >
            <div className="flex items-center gap-2 mb-4">
              <img src={logoUrl} alt="NEXVO" className="h-10 sm:h-14 w-auto object-contain" onError={(e) => { (e.target as HTMLImageElement).src = '/api/files/nexvo-logo.png'; }} />
            </div>
            <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed mb-4 sm:mb-6 max-w-xs">
              A trusted commodity-based digital asset management platform. Build Value, Grow Future.
            </p>
            <div className="flex items-center gap-3">
              {['M', 'T', 'I', 'Y'].map((letter, i) => (
                <div
                  key={i}
                  className="w-9 h-9 rounded-xl glass flex items-center justify-center text-xs font-bold text-gold-gradient cursor-pointer hover:glow-gold transition-all"
                >
                  {letter}
                </div>
              ))}
            </div>
          </motion.div>

          {/* Quick Links */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            <h4 className="text-foreground font-semibold mb-4 text-sm uppercase tracking-wider">
              Navigation
            </h4>
            <ul className="space-y-2.5">
              {quickLinks.map((link) => (
                <li key={link.label}>
                  <button
                    onClick={() => handleLinkClick(link.section)}
                    className="flex items-center gap-1.5 text-muted-foreground hover:text-[#D4AF37] transition-colors text-sm group"
                  >
                    <ChevronRight className="w-3 h-3 opacity-0 -ml-4 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Services */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <h4 className="text-foreground font-semibold mb-4 text-sm uppercase tracking-wider">
              Services
            </h4>
            <ul className="space-y-2.5">
              {['Asset Management', 'Commodity Investment', 'Daily Profit', 'Referral Program'].map(
                (item) => (
                  <li key={item}>
                    <button
                      onClick={() => navigate('products')}
                      className="flex items-center gap-1.5 text-muted-foreground hover:text-[#D4AF37] transition-colors text-sm group"
                    >
                      <ChevronRight className="w-3 h-3 opacity-0 -ml-4 group-hover:opacity-100 group-hover:ml-0 transition-all" />
                      {item}
                    </button>
                  </li>
                )
              )}
            </ul>
          </motion.div>

          {/* Contact */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
          >
            <h4 className="text-foreground font-semibold mb-4 text-sm uppercase tracking-wider">
              Contact
            </h4>
            <ul className="space-y-3">
              <li className="flex items-start gap-3 text-muted-foreground text-sm">
                <Mail className="w-4 h-4 mt-0.5 text-[#D4AF37] shrink-0" />
                <span>support@nexvo.id</span>
              </li>
              <li className="flex items-start gap-3 text-muted-foreground text-sm">
                <Globe2 className="w-4 h-4 mt-0.5 text-[#D4AF37] shrink-0" />
                <span>www.nexvo.id</span>
              </li>
              <li className="flex items-start gap-3 text-muted-foreground text-sm">
                <MapPin className="w-4 h-4 mt-0.5 text-[#D4AF37] shrink-0" />
                <span>Singapore</span>
              </li>
            </ul>
          </motion.div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-8 sm:mt-12 pt-6 sm:pt-8 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
          <p className="text-muted-foreground text-xs">
            &copy; {new Date().getFullYear()} NEXVO. All rights reserved.
          </p>
          <p className="text-muted-foreground text-xs flex items-center gap-1">
            Made with <Heart className="w-3 h-3 text-red-500 fill-red-500" /> Worldwide
          </p>
        </div>
      </div>
    </footer>
  );
}
