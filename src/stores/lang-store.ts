import { create } from 'zustand';

// ─── Full language registry (English = primary/default) ───
export type Language =
  | 'en' | 'id' | 'zh' | 'ja' | 'ko' | 'ar' | 'hi' | 'th' | 'vi' | 'ms'
  | 'fil' | 'pt' | 'es' | 'fr' | 'de' | 'ru' | 'tr' | 'it' | 'nl' | 'uk';

export interface LanguageOption {
  code: Language;
  name: string;          // Native name
  englishName: string;   // English name
  flag: string;          // Emoji flag
  dir?: 'ltr' | 'rtl';
}

// English first (primary), then alphabetical by English name
export const LANGUAGES: LanguageOption[] = [
  { code: 'en',  name: 'English',          englishName: 'English',            flag: '🇬🇧' },
  { code: 'id',  name: 'Bahasa Indonesia', englishName: 'Indonesian',         flag: '🇮🇩' },
  { code: 'ar',  name: 'العربية',          englishName: 'Arabic',             flag: '🇸🇦', dir: 'rtl' },
  { code: 'zh',  name: '简体中文',          englishName: 'Chinese (Simplified)', flag: '🇨🇳' },
  { code: 'nl',  name: 'Nederlands',       englishName: 'Dutch',              flag: '🇳🇱' },
  { code: 'fil', name: 'Filipino',         englishName: 'Filipino',           flag: '🇵🇭' },
  { code: 'fr',  name: 'Français',         englishName: 'French',             flag: '🇫🇷' },
  { code: 'de',  name: 'Deutsch',          englishName: 'German',             flag: '🇩🇪' },
  { code: 'hi',  name: 'हिन्दी',            englishName: 'Hindi',              flag: '🇮🇳' },
  { code: 'it',  name: 'Italiano',         englishName: 'Italian',            flag: '🇮🇹' },
  { code: 'ja',  name: '日本語',           englishName: 'Japanese',           flag: '🇯🇵' },
  { code: 'ko',  name: '한국어',            englishName: 'Korean',             flag: '🇰🇷' },
  { code: 'ms',  name: 'Bahasa Melayu',    englishName: 'Malay',              flag: '🇲🇾' },
  { code: 'pt',  name: 'Português',        englishName: 'Portuguese',         flag: '🇧🇷' },
  { code: 'ru',  name: 'Русский',          englishName: 'Russian',            flag: '🇷🇺' },
  { code: 'es',  name: 'Español',          englishName: 'Spanish',            flag: '🇪🇸' },
  { code: 'th',  name: 'ไทย',             englishName: 'Thai',               flag: '🇹🇭' },
  { code: 'tr',  name: 'Türkçe',           englishName: 'Turkish',            flag: '🇹🇷' },
  { code: 'uk',  name: 'Українська',       englishName: 'Ukrainian',          flag: '🇺🇦' },
  { code: 'vi',  name: 'Tiếng Việt',       englishName: 'Vietnamese',         flag: '🇻🇳' },
];

export const DEFAULT_LANGUAGE: Language = 'en';

const STORAGE_KEY = 'nexvo-lang';
const VALID_LANGS = new Set<string>(LANGUAGES.map((l) => l.code));

function getInitialLanguage(): Language {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && VALID_LANGS.has(stored)) return stored as Language;
  } catch {}
  return DEFAULT_LANGUAGE;
}

function applyDocumentLang(lang: Language) {
  if (typeof document === 'undefined') return;
  const opt = LANGUAGES.find((l) => l.code === lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = opt?.dir === 'rtl' ? 'rtl' : 'ltr';
}

interface LangState {
  language: Language;
  setLanguage: (lang: Language) => void;
}

export const useLangStore = create<LangState>((set) => ({
  language: getInitialLanguage(),
  setLanguage: (lang) => {
    set({ language: lang });
    if (typeof window !== 'undefined') {
      try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
    }
    applyDocumentLang(lang);
  },
}));

// Apply initial language direction on module load (client-side)
if (typeof window !== 'undefined') {
  applyDocumentLang(getInitialLanguage());
}
