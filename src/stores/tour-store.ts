'use client';

import { create } from 'zustand';

export interface TourStep {
  id: string;
  page: string; // page identifier to navigate to
  selector?: string; // data-tour attribute value (omit = centered modal)
  title: string;
  description: string;
  placement?: 'bottom' | 'top' | 'left' | 'right' | 'center';
  waitForNavigation?: boolean; // if true, wait for page to load before showing
  /** Demo fields to auto-type in auto-play mode */
  demoFields?: { selector: string; value: string; label?: string }[];
  /** Auto-play delay (ms) after typing/arrival before advancing. Default 3500 */
  autoAdvanceDelay?: number;
  /** Page data to pass when navigating (e.g. email for OTP page) */
  pageData?: Record<string, unknown>;
  /** Optional demo OTP hint shown in tooltip (for the OTP step) */
  demoOtpHint?: string;
}

interface TourState {
  isActive: boolean;
  currentStep: number;
  hasCompleted: boolean;
  isAutoPlay: boolean;
  isPaused: boolean;
  start: () => void;
  startAutoPlay: () => void;
  next: () => void;
  prev: () => void;
  skip: () => void;
  goTo: (step: number) => void;
  complete: () => void;
  togglePause: () => void;
  setAutoPlay: (v: boolean) => void;
  stopAutoPlay: () => void;
}

const STORAGE_KEY = 'nexvo-tour-completed';

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    page: 'login',
    title: '👋 Selamat Datang di NEXVO!',
    description:
      'Panduan ini akan menuntun Anda langkah demi langkah: REGISTRASI → LOGIN → DEPOSIT → INVESTASI → WITHDRAW. Aktifkan "Mode Demo Otomatis" agar form terisi sendiri — tinggal rekam video!',
    placement: 'center',
    autoAdvanceDelay: 5000,
  },
  {
    id: 'register-link',
    page: 'login',
    selector: 'register-link',
    title: 'Langkah 1: Daftar Akun Baru',
    description:
      'Klik tombol "Daftar Sekarang" untuk membuat akun NEXVO Anda. Jika sudah punya akun, langsung login saja.',
    placement: 'bottom',
    autoAdvanceDelay: 3500,
  },
  {
    id: 'register-form',
    page: 'register',
    selector: 'register-submit',
    title: 'Langkah 2: Isi Data Registrasi',
    description:
      'Isi form: Nama lengkap, Nomor WhatsApp (format +62), Email aktif, Password, dan Kode Referral (jika ada). Setelah lengkap, klik tombol "Daftar Sekarang" di bawah.',
    placement: 'top',
    demoFields: [
      { selector: 'input[placeholder="Masukkan nama pengguna"]', value: 'Budi Santoso', label: 'Nama' },
      { selector: 'input[placeholder="8123456789"]', value: '8123456789', label: 'WhatsApp' },
      { selector: 'input[placeholder="your@email.com"]', value: 'budi@gmail.com', label: 'Email' },
      { selector: 'input[placeholder="Ketik password"]', value: 'Budi1234!', label: 'Password' },
      { selector: 'input[placeholder="Ulangi password"]', value: 'Budi1234!', label: 'Konfirmasi' },
    ],
    autoAdvanceDelay: 2500,
  },
  {
    id: 'otp-verify',
    page: 'otp',
    selector: 'otp-input',
    title: 'Langkah 3: Verifikasi OTP',
    description:
      'Cek email/WhatsApp Anda untuk kode OTP. Masukkan kode 6 digit di kolom ini. Setelah verifikasi, akun Anda aktif dan bisa login. (Demo: kode otomatis diketik)',
    placement: 'top',
    demoFields: [
      { selector: 'input[data-tour="otp-input"]', value: '123456', label: 'Kode OTP' },
    ],
    pageData: { email: 'budi@gmail.com', whatsapp: '8123456789', fromRegister: true },
    demoOtpHint: 'Demo OTP: 123456',
    autoAdvanceDelay: 4500,
  },
  {
    id: 'login-form',
    page: 'login',
    selector: 'login-submit',
    title: 'Langkah 4: Login ke Akun',
    description:
      'Masukkan Email/WhatsApp + Password yang tadi dibuat, lalu klik "Masuk". Anda akan masuk ke Dashboard.',
    placement: 'top',
    demoFields: [
      { selector: 'input[placeholder="your@email.com"]', value: 'budi@gmail.com', label: 'Email' },
      { selector: 'input[placeholder="8123456789"]', value: '8123456789', label: 'WhatsApp' },
      { selector: 'input[placeholder="Ketik password"]', value: 'Budi1234!', label: 'Password' },
    ],
    autoAdvanceDelay: 2500,
  },
  {
    id: 'dashboard-deposit',
    page: 'dashboard',
    selector: 'deposit-btn',
    title: 'Langkah 5: Deposit Saldo',
    description:
      'Setelah login, di Dashboard klik tombol "Deposit" untuk top-up saldo pertama Anda. Saldo ini dipakai untuk beli paket investasi.',
    placement: 'bottom',
    autoAdvanceDelay: 4000,
  },
  {
    id: 'deposit-form',
    page: 'deposit',
    selector: 'deposit-submit',
    title: 'Langkah 6: Isi Form Deposit',
    description:
      '1) Masukkan nominal (min Rp100.000). 2) Pilih metode: QRIS / USDT / Bank. 3) Upload bukti transfer. 4) Klik tombol "Deposit RpX". Admin akan verifikasi, saldo masuk otomatis setelah disetujui.',
    placement: 'top',
    demoFields: [
      { selector: 'input[placeholder="0"]', value: '500000', label: 'Nominal' },
    ],
    autoAdvanceDelay: 3000,
  },
  {
    id: 'dashboard-paket',
    page: 'dashboard',
    selector: 'paket-btn',
    title: 'Langkah 7: Pilih Paket Investasi',
    description:
      'Setelah saldo masuk, kembali ke Dashboard lalu klik "Paket" untuk melihat daftar paket investasi yang tersedia.',
    placement: 'bottom',
    autoAdvanceDelay: 4000,
  },
  {
    id: 'paket-invest',
    page: 'paket',
    selector: 'paket-invest',
    title: 'Langkah 8: Beli Paket Investasi',
    description:
      'Pilih paket yang sesuai budget Anda, lalu klik "Invest Sekarang". Konfirmasi pembelian — saldo akan terpotong otomatis dan paket langsung AKTIF. Profit harian masuk jam 00:00 WIB setiap hari kerja.',
    placement: 'bottom',
    autoAdvanceDelay: 4500,
  },
  {
    id: 'dashboard-withdraw',
    page: 'dashboard',
    selector: 'withdraw-btn',
    title: 'Langkah 9: Tarik Profit (Withdraw)',
    description:
      'Untuk mencairkan profit/saldo, klik tombol "Withdraw" di Dashboard. Withdraw hanya bisa dilakukan di hari kerja (Senin-Jumat) jam 09:00-16:00 WIB.',
    placement: 'bottom',
    autoAdvanceDelay: 4000,
  },
  {
    id: 'withdraw-form',
    page: 'withdraw',
    selector: 'withdraw-submit',
    title: 'Langkah 10: Isi Form Withdraw',
    description:
      '1) Pilih kategori: Bank / E-Wallet / USDT. 2) Pilih rekening tujuan. 3) Masukkan nominal (max = nilai paket terakhir). 4) Klik "Withdraw RpX". Ada potongan fee 10%. Dana masuk 1×24 jam kerja.',
    placement: 'top',
    demoFields: [
      { selector: 'input[placeholder="0"]', value: '100000', label: 'Nominal' },
    ],
    autoAdvanceDelay: 3000,
  },
  {
    id: 'done',
    page: 'dashboard',
    title: '🎉 Panduan Selesai!',
    description:
      'Selamat! Anda sudah tahu alur lengkap NEXVO: Registrasi → Deposit → Investasi → Withdraw. Untuk memulai panduan lagi, klik tombol "Panduan" di pojok kanan bawah. Selamat berinvestasi! 🚀',
    placement: 'center',
    autoAdvanceDelay: 6000,
  },
];

export const useTourStore = create<TourState>((set, get) => ({
  isActive: false,
  currentStep: 0,
  hasCompleted: false,
  isAutoPlay: false,
  isPaused: false,

  start: () => {
    set({ isActive: true, currentStep: 0, isAutoPlay: false, isPaused: false });
  },
  startAutoPlay: () => {
    set({ isActive: true, currentStep: 0, isAutoPlay: true, isPaused: false });
  },
  next: () => {
    const { currentStep } = get();
    if (currentStep >= TOUR_STEPS.length - 1) {
      set({ isActive: false, hasCompleted: true, currentStep: 0, isAutoPlay: false, isPaused: false });
      try {
        localStorage.setItem(STORAGE_KEY, '1');
      } catch {}
      return;
    }
    set({ currentStep: currentStep + 1 });
  },
  prev: () => {
    const { currentStep } = get();
    if (currentStep > 0) set({ currentStep: currentStep - 1 });
  },
  skip: () => {
    set({ isActive: false, currentStep: 0, isAutoPlay: false, isPaused: false });
  },
  goTo: (step: number) => {
    set({ currentStep: step });
  },
  complete: () => {
    set({ isActive: false, hasCompleted: true, currentStep: 0, isAutoPlay: false, isPaused: false });
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {}
  },
  togglePause: () => {
    set((s) => ({ isPaused: !s.isPaused }));
  },
  setAutoPlay: (v: boolean) => {
    set({ isAutoPlay: v });
  },
  stopAutoPlay: () => {
    set({ isAutoPlay: false, isPaused: false });
  },
}));

// Check if user has completed tour before
export function hasUserCompletedTour(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}
