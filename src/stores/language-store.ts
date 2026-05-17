import { create } from 'zustand';
import type { LanguageCode, LanguageOption } from '@/lib/i18n/types';
import { DEFAULT_LANGUAGE, LANGUAGES } from '@/lib/i18n/types';
import id from '@/lib/i18n/locales/id';
import en from '@/lib/i18n/locales/en';
import zh from '@/lib/i18n/locales/zh';
import ja from '@/lib/i18n/locales/ja';
import ko from '@/lib/i18n/locales/ko';
import ar from '@/lib/i18n/locales/ar';
import hi from '@/lib/i18n/locales/hi';
import th from '@/lib/i18n/locales/th';
import vi from '@/lib/i18n/locales/vi';
import ms from '@/lib/i18n/locales/ms';
import fil from '@/lib/i18n/locales/fil';
import pt from '@/lib/i18n/locales/pt';
import es from '@/lib/i18n/locales/es';
import fr from '@/lib/i18n/locales/fr';
import de from '@/lib/i18n/locales/de';
import ru from '@/lib/i18n/locales/ru';
import tr from '@/lib/i18n/locales/tr';
import it from '@/lib/i18n/locales/it';
import nl from '@/lib/i18n/locales/nl';
import uk from '@/lib/i18n/locales/uk';
import type { TranslationStrings } from '@/lib/i18n/types';

const STORAGE_KEY = 'nexvo-language';

const translations: Record<LanguageCode, TranslationStrings> = {
  id, en, zh, ja, ko, ar, hi, th, vi, ms, fil, pt, es, fr, de, ru, tr, it, nl, uk,
};

function getStoredLanguage(): LanguageCode {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored in translations) return stored as LanguageCode;
  } catch {}
  return DEFAULT_LANGUAGE;
}

interface LanguageState {
  language: LanguageCode;
  translations: TranslationStrings;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: string, fallback?: string) => string;
}

/**
 * Resolve a dot-separated key like "common.home" from a nested object
 */
function resolve(obj: Record<string, unknown>, path: string): string | undefined {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : undefined;
}

export const useLanguageStore = create<LanguageState>((set, get) => ({
  language: DEFAULT_LANGUAGE,
  translations: translations[DEFAULT_LANGUAGE],

  setLanguage: (lang: LanguageCode) => {
    if (translations[lang]) {
      set({ language: lang, translations: translations[lang] });
      try {
        localStorage.setItem(STORAGE_KEY, lang);
      } catch {}
    }
  },

  t: (key: string, fallback?: string) => {
    const { translations: tr } = get();
    const value = resolve(tr as unknown as Record<string, unknown>, key);
    if (value !== undefined) return value;
    // Fallback to Indonesian (base language)
    const baseValue = resolve(id as unknown as Record<string, unknown>, key);
    if (baseValue !== undefined) return baseValue;
    // Return the key itself or provided fallback
    return fallback || key;
  },
}));

/**
 * Initialize language from localStorage on client mount
 */
export function initLanguage() {
  const stored = getStoredLanguage();
  if (stored !== DEFAULT_LANGUAGE) {
    useLanguageStore.getState().setLanguage(stored);
  }
}

export { LANGUAGES, DEFAULT_LANGUAGE };
export type { LanguageCode, LanguageOption, TranslationStrings };
