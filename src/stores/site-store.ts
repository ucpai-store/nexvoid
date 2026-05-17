import { create } from 'zustand';
import { getFileUrlStatic } from '@/lib/file-url';

const DEFAULT_LOGO = '/api/files/nexvo-logo.png';

// Extend Window type for our custom favicon updater
declare global {
  interface Window {
    __updateNexvoFavicon?: (url: string) => void;
  }
}

interface SiteState {
  logoUrl: string;
  siteName: string;
  loaded: boolean;
  fetchSettings: () => Promise<void>;
  setLogoUrl: (url: string) => void;
  setSiteName: (name: string) => void;
  refreshLogo: () => void;
}

/**
 * Convert a logo path from the database to a URL that bypasses Next.js static caching.
 * All uploaded files (site-logo-xxx, upload-xxx) go through /api/files/ route.
 */
function logoPathToUrl(logoPath: string): string {
  return getFileUrlStatic(logoPath);
}

/**
 * Update the browser favicon to match the current logo.
 * Works by calling the global function injected in layout.tsx.
 */
function updateBrowserFavicon(logoUrl: string) {
  try {
    if (typeof window !== 'undefined' && window.__updateNexvoFavicon) {
      window.__updateNexvoFavicon(logoUrl);
    }
  } catch {
    // Non-critical - favicon update is best-effort
  }
}

export const useSiteStore = create<SiteState>((set, get) => ({
  logoUrl: DEFAULT_LOGO,
  siteName: 'NEXVO',
  loaded: false,

  fetchSettings: async () => {
    try {
      const res = await fetch('/api/site-settings');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const settings = data.data || {};
          const newLogoPath = settings.site_logo || DEFAULT_LOGO;
          const newLogoUrl = logoPathToUrl(newLogoPath);
          const base = newLogoUrl.split('?')[0];
          const finalUrl = base + '?t=' + Date.now();
          set({
            logoUrl: finalUrl,
            siteName: settings.site_name || 'NEXVO',
            loaded: true,
          });
          // Update browser favicon to match
          updateBrowserFavicon(finalUrl);
        }
      }
    } catch {
      set({ loaded: true });
    }
  },

  setLogoUrl: (url: string) => {
    // Always add cache buster when setting logo externally
    const fetchableUrl = logoPathToUrl(url);
    const base = fetchableUrl.split('?')[0];
    const finalUrl = base + '?t=' + Date.now();
    set({ logoUrl: finalUrl });
    // Update browser favicon to match
    updateBrowserFavicon(finalUrl);
  },

  refreshLogo: () => {
    // Re-fetch from API to get the latest logo path
    // This ensures we get the correct filename after an upload
    fetch('/api/site-settings')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          const settings = data.data || {};
          const newLogoPath = settings.site_logo || DEFAULT_LOGO;
          const newLogoUrl = logoPathToUrl(newLogoPath);
          const base = newLogoUrl.split('?')[0];
          const finalUrl = base + '?t=' + Date.now();
          set({
            logoUrl: finalUrl,
            siteName: settings.site_name || get().siteName,
          });
          // Update browser favicon to match
          updateBrowserFavicon(finalUrl);
        }
      })
      .catch(() => {
        // Fallback: just refresh cache buster on current URL
        const currentBase = get().logoUrl.split('?')[0];
        const finalUrl = currentBase + '?t=' + Date.now();
        set({ logoUrl: finalUrl });
        updateBrowserFavicon(finalUrl);
      });
  },

  setSiteName: (name: string) => set({ siteName: name }),
}));
