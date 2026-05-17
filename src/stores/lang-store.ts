import { create } from 'zustand';

export type Language = 'id' | 'en' | 'zh';

interface LangState {
  language: Language;
  setLanguage: (lang: Language) => void;
}

export const useLangStore = create<LangState>((set) => ({
  language: (typeof window !== 'undefined' && localStorage.getItem('nexvo-lang') as Language) || 'en',
  setLanguage: (lang) => {
    set({ language: lang });
    if (typeof window !== 'undefined') localStorage.setItem('nexvo-lang', lang);
  },
}));
