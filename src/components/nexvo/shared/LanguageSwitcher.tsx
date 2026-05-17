'use client';

import { motion } from 'framer-motion';
import { useLangStore } from '@/stores/lang-store';
import type { Language } from '@/stores/lang-store';

export default function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage } = useLangStore();

  const langs: { key: Language; label: string; flag: string; name: string }[] = [
    { key: 'en', label: 'EN', flag: '🇺🇸', name: 'English' },
    { key: 'id', label: 'ID', flag: '🇮🇩', name: 'Bahasa' },
    { key: 'zh', label: '中文', flag: '🇨🇳', name: '中文' },
  ];

  return (
    <div className="flex items-center gap-0.5 glass rounded-lg p-0.5">
      {langs.map((lang) => (
        <motion.button
          key={lang.key}
          onClick={() => setLanguage(lang.key)}
          className={`relative px-2 py-1.5 rounded-md text-[10px] sm:text-xs font-semibold transition-colors whitespace-nowrap ${
            language === lang.key
              ? 'text-[#070B14]'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          whileTap={{ scale: 0.95 }}
          title={lang.name}
        >
          {language === lang.key && (
            <motion.div
              layoutId="lang-indicator"
              className="absolute inset-0 bg-gold-gradient rounded-md"
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-1">
            <span>{lang.flag}</span>
            {lang.label}
          </span>
        </motion.button>
      ))}
    </div>
  );
}
