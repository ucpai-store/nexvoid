'use client';

import { Shield, TrendingUp } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useAppStore } from '@/stores/app-store';
import { useAuthStore } from '@/stores/auth-store';
import AdminHeader from '@/components/nexvo/AdminHeader';
import UserHeader from '@/components/nexvo/UserHeader';

/* ───────── Dynamic imports for all pages (reduces bundle size) ───────── */
const LoginPage = dynamic(() => import('@/components/nexvo/pages/LoginPage'), { ssr: false });
const RegisterPage = dynamic(() => import('@/components/nexvo/pages/RegisterPage'), { ssr: false });
const OTPPage = dynamic(() => import('@/components/nexvo/pages/OTPPage'), { ssr: false });
const ForgotPasswordPage = dynamic(() => import('@/components/nexvo/pages/ForgotPasswordPage'), { ssr: false });
const AdminLoginPage = dynamic(() => import('@/components/nexvo/pages/AdminLoginPage'), { ssr: false });
const HomePage = dynamic(() => import('@/components/nexvo/pages/HomePage'), { ssr: false });
const UserDashboard = dynamic(() => import('@/components/nexvo/pages/UserDashboard'), { ssr: false });
const BankPage = dynamic(() => import('@/components/nexvo/pages/BankPage'), { ssr: false });
const DepositPage = dynamic(() => import('@/components/nexvo/pages/DepositPage'), { ssr: false });
const WithdrawPage = dynamic(() => import('@/components/nexvo/pages/WithdrawPage'), { ssr: false });
const HistoryPage = dynamic(() => import('@/components/nexvo/pages/HistoryPage'), { ssr: false });
const SettingsPage = dynamic(() => import('@/components/nexvo/pages/SettingsPage'), { ssr: false });
const ReferralPage = dynamic(() => import('@/components/nexvo/pages/ReferralPage'), { ssr: false });
const DownloadPage = dynamic(() => import('@/components/nexvo/pages/DownloadPage'), { ssr: false });
const ProductsPage = dynamic(() => import('@/components/nexvo/pages/ProductsPage'), { ssr: false });
const ProductDetailPage = dynamic(() => import('@/components/nexvo/pages/ProductDetailPage'), { ssr: false });
const PaketPage = dynamic(() => import('@/components/nexvo/pages/PaketPage'), { ssr: false });
const AssetPage = dynamic(() => import('@/components/nexvo/pages/AssetPage'), { ssr: false });
const SalaryBonusPage = dynamic(() => import('@/components/nexvo/pages/SalaryBonusPage'), { ssr: false });
const MatchingBonusPage = dynamic(() => import('@/components/nexvo/pages/MatchingBonusPage'), { ssr: false });
const ProfitPage = dynamic(() => import('@/components/nexvo/pages/ProfitPage'), { ssr: false });
const LiveActivePage = dynamic(() => import('@/components/nexvo/pages/LiveActivePage'), { ssr: false });
const NetworkPage = dynamic(() => import('@/components/nexvo/pages/NetworkPage'), { ssr: false });
const AdminDashboardPage = dynamic(() => import('@/components/nexvo/pages/AdminDashboardPage'), { ssr: false });
const AdminUsersPage = dynamic(() => import('@/components/nexvo/pages/AdminUsersPage'), { ssr: false });
const AdminProductsPage = dynamic(() => import('@/components/nexvo/pages/AdminProductsPage'), { ssr: false });
const AdminDepositsPage = dynamic(() => import('@/components/nexvo/pages/AdminDepositsPage'), { ssr: false });
const AdminWithdrawalsPage = dynamic(() => import('@/components/nexvo/pages/AdminWithdrawalsPage'), { ssr: false });
const AdminAssetPage = dynamic(() => import('@/components/nexvo/pages/AdminAssetPage'), { ssr: false });
const AdminPaymentPage = dynamic(() => import('@/components/nexvo/pages/AdminPaymentPage'), { ssr: false });
const AdminAppPage = dynamic(() => import('@/components/nexvo/pages/AdminAppPage'), { ssr: false });
const AdminBannersPage = dynamic(() => import('@/components/nexvo/pages/AdminBannersPage'), { ssr: false });
const AdminSettingsPage = dynamic(() => import('@/components/nexvo/pages/AdminSettingsPage'), { ssr: false });
const AdminApiKeyPage = dynamic(() => import('@/components/nexvo/pages/AdminApiKeyPage'), { ssr: false });
const AdminLivePage = dynamic(() => import('@/components/nexvo/pages/AdminLivePage'), { ssr: false });
const AdminAppearancePage = dynamic(() => import('@/components/nexvo/pages/AdminAppearancePage'), { ssr: false });
const AdminPackagesPage = dynamic(() => import('@/components/nexvo/pages/AdminPackagesPage'), { ssr: false });
const AdminWhatsAppPage = dynamic(() => import('@/components/nexvo/pages/AdminWhatsAppPage'), { ssr: false });

/* ───────── Page Component Map ───────── */
// Maps page key to its component — only the matched component gets rendered
const PAGE_COMPONENTS: Record<string, React.ComponentType> = {
  // Auth
  login: LoginPage,
  register: RegisterPage,
  otp: OTPPage,
  'forgot-password': ForgotPasswordPage,
  'admin-login': AdminLoginPage,
  // User
  home: HomePage,
  dashboard: UserDashboard,
  products: ProductsPage,
  'product-detail': ProductDetailPage,
  deposit: DepositPage,
  withdraw: WithdrawPage,
  paket: PaketPage,
  bank: BankPage,
  history: HistoryPage,
  settings: SettingsPage,
  referral: ReferralPage,
  assets: AssetPage,
  'salary-bonus': SalaryBonusPage,
  'matching-bonus': MatchingBonusPage,
  profit: ProfitPage,
  live: LiveActivePage,
  network: NetworkPage,
  download: DownloadPage,
  // Admin
  'admin-dashboard': AdminDashboardPage,
  'admin-users': AdminUsersPage,
  'admin-products': AdminProductsPage,
  'admin-deposits': AdminDepositsPage,
  'admin-withdrawals': AdminWithdrawalsPage,
  'admin-asset': AdminAssetPage,
  'admin-payment': AdminPaymentPage,
  'admin-app': AdminAppPage,
  'admin-banners': AdminBannersPage,
  'admin-settings': AdminSettingsPage,
  'admin-api-key': AdminApiKeyPage,
  'admin-api-keys': AdminApiKeyPage,
  'admin-system': AdminSettingsPage,
  'admin-live': AdminLivePage,
  'admin-appearance': AdminAppearancePage,
  'admin-packages': AdminPackagesPage,
  'admin-whatsapp': AdminWhatsAppPage,
};

/* ───────── Placeholder Page ───────── */
function PlaceholderPage({ title, icon: Icon }: { title: string; icon: React.ElementType }) {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[60vh]">
      <div className="glass rounded-3xl p-8 sm:p-12 text-center max-w-md mx-auto glow-gold animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-[#D4AF37]/10 flex items-center justify-center mx-auto mb-4">
          <Icon className="w-8 h-8 text-[#D4AF37]" />
        </div>
        <h2 className="text-foreground text-xl font-semibold mb-2">{title}</h2>
        <p className="text-muted-foreground text-sm">This page is under development</p>
      </div>
    </div>
  );
}

/* ───────── Render a page component safely ───────── */
function renderPage(pageKey: string): React.ReactNode {
  const Component = PAGE_COMPONENTS[pageKey];
  if (Component) {
    return <Component />;
  }
  return <PlaceholderPage title="404" icon={Shield} />;
}

/* ───────── Page Router ───────── */
export default function AppShell() {
  const { currentPage } = useAppStore();
  const { token, adminToken } = useAuthStore();

  // ────────────────────────────────────────────────
  // ADMIN PAGES
  // ────────────────────────────────────────────────
  const isAdminPage = currentPage.startsWith('admin');
  if (isAdminPage) {
    // If on admin-login AND already has token → redirect to dashboard
    if (currentPage === 'admin-login' && adminToken) {
      return (
        <div className="min-h-screen bg-[#070B14]">
          <AdminHeader />
          <main className="lg:ml-[260px]">
            <AdminDashboardPage />
          </main>
        </div>
      );
    }

    // If on admin-login AND no token → show login page
    if (currentPage === 'admin-login' && !adminToken) {
      return (
        <div className="min-h-screen bg-[#070B14]">
          <AdminLoginPage />
        </div>
      );
    }

    // If on any other admin page AND no token → redirect to admin login
    if (currentPage !== 'admin-login' && !adminToken) {
      return (
        <div className="min-h-screen bg-[#070B14]">
          <AdminLoginPage />
        </div>
      );
    }

    // Authenticated admin pages
    return (
      <div className="min-h-screen bg-[#070B14]">
        <AdminHeader />
        <main className="lg:ml-[260px]">
          {renderPage(currentPage)}
        </main>
      </div>
    );
  }

  // ────────────────────────────────────────────────
  // AUTHENTICATED USER PAGES
  // ────────────────────────────────────────────────
  if (token) {
    const user = useAuthStore.getState().user;
    const isVerified = user?.isVerified ?? false;

    // Unverified users must verify email first — redirect to OTP page
    if (!isVerified) {
      if (currentPage === 'otp') {
        return (
          <div className="min-h-screen bg-[#070B14]">
            <OTPPage />
          </div>
        );
      }
      if (currentPage === 'forgot-password') {
        return (
          <div className="min-h-screen bg-[#070B14]">
            <ForgotPasswordPage />
          </div>
        );
      }
      return (
        <div className="min-h-screen bg-[#070B14]">
          <OTPPage />
        </div>
      );
    }

    // If authenticated user on auth pages (login/register/otp/forgot-password) → redirect to home
    if (['login', 'register', 'otp', 'forgot-password'].includes(currentPage)) {
      return (
        <div className="min-h-screen bg-[#070B14] flex flex-col">
          <UserHeader />
          <main className="flex-1">
            <HomePage />
          </main>
          <div className="h-[80px] sm:h-20" />
        </div>
      );
    }

    // Render the matched user page
    const PageComponent = PAGE_COMPONENTS[currentPage];
    if (PageComponent) {
      return (
        <div className="min-h-screen bg-[#070B14] flex flex-col">
          <UserHeader />
          <main className="flex-1">
            <PageComponent />
          </main>
          <div className="h-[80px] sm:h-20" />
        </div>
      );
    }

    // Fallback for authenticated user → show home
    return (
      <div className="min-h-screen bg-[#070B14] flex flex-col">
        <UserHeader />
        <main className="flex-1">
          <HomePage />
        </main>
        <div className="h-[80px] sm:h-20" />
      </div>
    );
  }

  // ────────────────────────────────────────────────
  // UNAUTHENTICATED PAGES - Only login, register, OTP, forgot-password
  // ────────────────────────────────────────────────
  if (currentPage === 'register') {
    return (
      <div className="min-h-screen bg-[#070B14]">
        <RegisterPage />
      </div>
    );
  }

  if (currentPage === 'otp') {
    return (
      <div className="min-h-screen bg-[#070B14]">
        <OTPPage />
      </div>
    );
  }

  if (currentPage === 'forgot-password') {
    return (
      <div className="min-h-screen bg-[#070B14]">
        <ForgotPasswordPage />
      </div>
    );
  }

  // Default: show login page for all unauthenticated users
  return (
    <div className="min-h-screen bg-[#070B14]">
      <LoginPage />
    </div>
  );
}
