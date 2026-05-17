import { create } from 'zustand';

export type Page = 
  | 'home' | 'login' | 'register' | 'otp' | 'forgot-password'
  | 'dashboard' | 'products' | 'product-detail' | 'deposit' | 'withdraw'
  | 'bank' | 'history' | 'settings' | 'referral' | 'download' | 'paket' | 'assets'
  | 'salary-bonus' | 'matching-bonus' | 'profit' | 'live'
  | 'admin-login' | 'admin-dashboard' | 'admin-users' | 'admin-products'
  | 'admin-deposits' | 'admin-withdrawals' | 'admin-asset' | 'admin-payment'
  | 'admin-app' | 'admin-banners' | 'admin-settings' | 'admin-live'
  | 'admin-api-keys' | 'admin-api-key' | 'admin-system' | 'admin-appearance'
  | 'admin-packages';

// Valid pages for hash routing
const VALID_PAGES: Set<string> = new Set([
  'home', 'login', 'register', 'otp', 'forgot-password',
  'dashboard', 'products', 'product-detail', 'deposit', 'withdraw',
  'bank', 'history', 'settings', 'referral', 'download', 'paket', 'assets',
  'salary-bonus', 'matching-bonus', 'profit', 'live',
  'admin-login', 'admin-dashboard', 'admin-users', 'admin-products',
  'admin-deposits', 'admin-withdrawals', 'admin-asset', 'admin-payment',
  'admin-app', 'admin-banners', 'admin-settings', 'admin-live',
  'admin-api-keys', 'admin-api-key', 'admin-system', 'admin-appearance',
  'admin-packages',
]);

// Read initial page from URL hash
function getPageFromHash(): Page {
  if (typeof window === 'undefined') return 'login';
  const hash = window.location.hash.replace('#', '');
  if (hash && VALID_PAGES.has(hash)) return hash as Page;
  return 'login';
}

interface AppState {
  currentPage: Page;
  pageData: Record<string, unknown>;
  sidebarOpen: boolean;
  adminSidebarOpen: boolean;
  
  navigate: (page: Page, data?: Record<string, unknown>) => void;
  setSidebarOpen: (open: boolean) => void;
  setAdminSidebarOpen: (open: boolean) => void;
  initHashListener: () => () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  currentPage: getPageFromHash(),
  pageData: {},
  sidebarOpen: false,
  adminSidebarOpen: false,
  
  navigate: (page, data = {}) => {
    set({ currentPage: page, pageData: data, sidebarOpen: false, adminSidebarOpen: false });
    if (typeof window !== 'undefined') {
      // Update URL hash for bookmarkability and back-button support
      window.location.hash = page;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  },
  
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setAdminSidebarOpen: (open) => set({ adminSidebarOpen: open }),

  // Listen for browser back/forward navigation via hash changes
  initHashListener: () => {
    if (typeof window === 'undefined') return () => {};

    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash && VALID_PAGES.has(hash)) {
        const current = get().currentPage;
        if (current !== hash) {
          set({ currentPage: hash as Page, sidebarOpen: false, adminSidebarOpen: false });
        }
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  },
}));
