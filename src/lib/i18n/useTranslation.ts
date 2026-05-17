/**
 * Convenience hook for using translations in components
 * Re-exports the language store with a simpler API
 */
import { useLanguageStore } from '@/stores/language-store';

export function useTranslation() {
  const { t, language, setLanguage, translations } = useLanguageStore();
  return { t, language, setLanguage, translations };
}

export default useTranslation;
