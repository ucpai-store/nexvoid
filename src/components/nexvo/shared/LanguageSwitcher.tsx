'use client';

import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Check, Globe, X, ChevronDown } from 'lucide-react';
import { useLangStore, LANGUAGES } from '@/stores/lang-store';
import type { LanguageOption } from '@/stores/lang-store';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogPortal,
  DialogOverlay,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface Props {
  /** compact = flag + short code only (for tight headers). default = flag + native name. */
  compact?: boolean;
}

export default function LanguageSwitcher({ compact = false }: Props) {
  const { language, setLanguage } = useLangStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  // Find current language metadata
  const current = useMemo(
    () => LANGUAGES.find((l) => l.code === language) || LANGUAGES[0],
    [language],
  );

  // Filtered list (English always pinned first, rest alphabetical by englishName)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rest = LANGUAGES.filter(
      (l) => l.code !== 'en' &&
        (q === '' ||
          l.name.toLowerCase().includes(q) ||
          l.englishName.toLowerCase().includes(q) ||
          l.code.toLowerCase().includes(q)),
    );
    const en = LANGUAGES.find((l) => l.code === 'en')!;
    return q === '' ? [en, ...rest] : [en, ...rest].filter(
      (l) => l.code === 'en' ||
        l.name.toLowerCase().includes(q) ||
        l.englishName.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q),
    );
  }, [query]);

  // Reset search when dialog closes
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => setQuery(''), 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleSelect = (lang: LanguageOption) => {
    setLanguage(lang.code);
    setOpen(false);
  };

  const shortCode = current.code.toUpperCase();

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 glass rounded-lg px-2.5 py-1.5 text-[11px] sm:text-xs font-semibold text-foreground hover:bg-white/5 transition-all whitespace-nowrap"
        aria-label={`Language: ${current.englishName}. Click to change.`}
        title={current.englishName}
      >
        <Globe className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-base leading-none">{current.flag}</span>
        {compact ? (
          <span className="hidden sm:inline">{shortCode}</span>
        ) : (
          <span className="hidden sm:inline max-w-[80px] truncate">{current.name}</span>
        )}
        <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
      </button>

      {/* Searchable language dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPortal>
          <DialogOverlay className="bg-black/70 backdrop-blur-md" />
          <DialogContent aria-describedby={undefined} className="glass-strong border border-primary/20 rounded-3xl p-0 max-w-md w-[calc(100%-2rem)] sm:w-full overflow-hidden glow-gold-strong">
            <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/50">
              <DialogTitle className="text-foreground text-lg font-bold flex items-center gap-2">
                <Globe className="w-5 h-5 text-primary" />
                Select Language
              </DialogTitle>
              <p className="text-muted-foreground text-xs mt-0.5">
                Choose your preferred language · {LANGUAGES.length} available
              </p>
            </DialogHeader>

            {/* Search box */}
            <div className="px-5 py-3 border-b border-border/50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search language..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-10 pr-9 h-10 bg-input/50 border-border/50 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50"
                  autoFocus
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Language list */}
            <div className="max-h-[50vh] overflow-y-auto nexvo-scroll px-2 py-2">
              {filtered.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <Search className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-muted-foreground text-sm">No language found</p>
                </div>
              ) : (
                filtered.map((lang) => {
                  const isSelected = language === lang.code;
                  return (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => handleSelect(lang)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${
                        isSelected
                          ? 'glass-gold border border-primary/30'
                          : 'hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <span className="text-2xl leading-none shrink-0">{lang.flag}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                          {lang.name}
                        </p>
                        <p className="text-muted-foreground text-xs truncate">{lang.englishName}</p>
                      </div>
                      {isSelected && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                          className="w-6 h-6 rounded-full bg-gold-gradient flex items-center justify-center shrink-0"
                        >
                          <Check className="w-3.5 h-3.5 text-primary-foreground" />
                        </motion.div>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-border/50 flex items-center justify-between">
              <p className="text-muted-foreground text-[10px]">
                English is the default language
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted-foreground text-xs hover:text-foreground transition-colors"
              >
                Close
              </button>
            </div>
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </>
  );
}
