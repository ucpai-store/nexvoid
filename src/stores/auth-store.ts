import { create } from 'zustand';

interface User {
  id: string;
  userId: string;
  whatsapp: string;
  email: string;
  name: string;
  avatar: string;
  referralCode: string;
  level: string;
  mainBalance: number;
  depositBalance: number;
  profitBalance: number;
  totalDeposit: number;
  totalWithdraw: number;
  totalProfit: number;
  isSuspended: boolean;
  isVerified: boolean;
  createdAt: string;
}

interface Admin {
  id: string;
  username: string;
  email: string;
  name: string;
  role: string;
  lastLogin: string | null;
}

interface AuthState {
  user: User | null;
  admin: Admin | null;
  token: string | null;
  adminToken: string | null;
  isLoading: boolean;

  setUser: (user: User | null) => void;
  setAdmin: (admin: Admin | null) => void;
  setToken: (token: string | null) => void;
  setAdminToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
  adminLogout: () => void;
  loadFromStorage: () => void;
  hydrateAdmin: () => Promise<void>;
  hydrateUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  admin: null,
  token: null,
  adminToken: null,
  isLoading: true,

  setUser: (user) => {
    if (typeof window !== 'undefined') {
      if (user) localStorage.setItem('nexvo_user', JSON.stringify(user));
      else localStorage.removeItem('nexvo_user');
    }
    set({ user });
  },
  setAdmin: (admin) => {
    if (typeof window !== 'undefined') {
      if (admin) localStorage.setItem('nexvo_admin', JSON.stringify(admin));
      else localStorage.removeItem('nexvo_admin');
    }
    set({ admin });
  },
  setToken: (token) => {
    if (typeof window !== 'undefined') {
      if (token) localStorage.setItem('nexvo_token', token);
      else localStorage.removeItem('nexvo_token');
    }
    set({ token });
  },
  setAdminToken: (token) => {
    if (typeof window !== 'undefined') {
      if (token) localStorage.setItem('nexvo_admin_token', token);
      else localStorage.removeItem('nexvo_admin_token');
    }
    set({ adminToken: token });
  },
  setLoading: (isLoading) => set({ isLoading }),
  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('nexvo_token');
      localStorage.removeItem('nexvo_user');
    }
    set({ user: null, token: null });
  },
  adminLogout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('nexvo_admin_token');
      localStorage.removeItem('nexvo_admin');
    }
    set({ admin: null, adminToken: null });
  },
  loadFromStorage: () => {
    if (typeof window === 'undefined') {
      set({ isLoading: false });
      return;
    }
    const token = localStorage.getItem('nexvo_token');
    const adminToken = localStorage.getItem('nexvo_admin_token');
    let user: User | null = null;
    let admin: Admin | null = null;

    try {
      const userData = localStorage.getItem('nexvo_user');
      if (userData) user = JSON.parse(userData);
    } catch { /* ignore */ }

    try {
      const adminData = localStorage.getItem('nexvo_admin');
      if (adminData) admin = JSON.parse(adminData);
    } catch { /* ignore */ }

    set({ token, adminToken, user, admin, isLoading: false });
  },
  hydrateAdmin: async () => {
    const { adminToken } = get();
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/auth/me', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.status === 401) {
        get().adminLogout();
        return;
      }
      const data = await res.json();
      if (data.success && data.data?.currentAdmin) {
        get().setAdmin(data.data.currentAdmin);
      }
    } catch {
      // Network error, keep existing data
    }
  },
  hydrateUser: async () => {
    const { token } = get();
    if (!token) return;
    try {
      const res = await fetch('/api/user/profile', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        get().logout();
        return;
      }
      const data = await res.json();
      if (data.success && data.data) {
        get().setUser(data.data);
      }
    } catch {
      // Network error, keep existing data
    }
  },
}));
