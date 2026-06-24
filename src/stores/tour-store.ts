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
}

interface TourState {
  isActive: boolean;
  currentStep: number;
  hasCompleted: boolean;
  start: () => void;
  next: () => void;
  prev: () => void;
  skip: () => void;
  goTo: (step: number) => void;
  complete: () => void;
}

const STORAGE_KEY = 'nexvo-tour-completed';

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    page: 'login',
    title: '👋 Selamat Datang di NEXVO!',
    description:
      'Panduan ini akan menuntun Anda langkah demi langkah: REGISTRASI → LOGIN → DEPOSIT → INVESTASI → WITHDRAW. Klik "Lanjut" untuk mengikuti. Anda bisa mengikuti sambil merekam video. Klik "Lewati" kapan saja untuk berhenti.',
    placement: 'center',
  },
  {
    id: 'register-link',
    page: 'login',
    selector: 'register-link',
    title: 'Langkah 1: Daftar Akun Baru',
    description:
      'Klik tombol "Daftar Sekarang" untuk membuat akun NEXVO Anda. Jika sudah punya akun, langsung login saja.',
    placement: 'bottom',
  },
  {
    id: 'register-form',
    page: 'register',
    selector: 'register-submit',
    title: 'Langkah 2: Isi Data Registrasi',
    description:
      'Isi form: Nama lengkap, Nomor WhatsApp (format +62), Email aktif, Password, dan Kode Referral (jika ada). Setelah lengkap, klik tombol "Daftar Sekarang" di bawah.',
    placement: 'top',
  },
  {
    id: 'otp-verify',
    page: 'otp',
    selector: 'otp-input',
    title: 'Langkah 3: Verifikasi OTP',
    description:
      'Cek email/WhatsApp Anda untuk kode OTP. Masukkan kode 6 digit di kolom ini. Setelah verifikasi, akun Anda aktif dan bisa login.',
    placement: 'bottom',
  },
  {
    id: 'login-form',
    page: 'login',
    selector: 'login-submit',
    title: 'Langkah 4: Login ke Akun',
    description:
      'Masukkan Email/WhatsApp + Password yang tadi dibuat, lalu klik "Masuk". Anda akan masuk ke Dashboard.',
    placement: 'top',
  },
  {
    id: 'dashboard-deposit',
    page: 'dashboard',
    selector: 'deposit-btn',
    title: 'Langkah 5: Deposit Saldo',
    description:
      'Setelah login, di Dashboard klik tombol "Deposit" untuk top-up saldo pertama Anda. Saldo ini dipakai untuk beli paket investasi.',
    placement: 'bottom',
  },
  {
    id: 'deposit-form',
    page: 'deposit',
    selector: 'deposit-submit',
    title: 'Langkah 6: Isi Form Deposit',
    description:
      '1) Masukkan nominal (min Rp100.000). 2) Pilih metode: QRIS / USDT / Bank. 3) Upload bukti transfer. 4) Klik tombol "Deposit RpX". Admin akan verifikasi, saldo masuk otomatis setelah disetujui.',
    placement: 'top',
  },
  {
    id: 'dashboard-paket',
    page: 'dashboard',
    selector: 'paket-btn',
    title: 'Langkah 7: Pilih Paket Investasi',
    description:
      'Setelah saldo masuk, kembali ke Dashboard lalu klik "Paket" untuk melihat daftar paket investasi yang tersedia.',
    placement: 'bottom',
  },
  {
    id: 'paket-invest',
    page: 'paket',
    selector: 'paket-invest',
    title: 'Langkah 8: Beli Paket Investasi',
    description:
      'Pilih paket yang sesuai budget Anda, lalu klik "Invest Sekarang". Konfirmasi pembelian — saldo akan terpotong otomatis dan paket langsung AKTIF. Profit harian masuk jam 00:00 WIB setiap hari kerja.',
    placement: 'bottom',
  },
  {
    id: 'dashboard-withdraw',
    page: 'dashboard',
    selector: 'withdraw-btn',
    title: 'Langkah 9: Tarik Profit (Withdraw)',
    description:
      'Untuk mencairkan profit/saldo, klik tombol "Withdraw" di Dashboard. Withdraw hanya bisa dilakukan di hari kerja (Senin-Jumat) jam 09:00-16:00 WIB.',
    placement: 'bottom',
  },
  {
    id: 'withdraw-form',
    page: 'withdraw',
    selector: 'withdraw-submit',
    title: 'Langkah 10: Isi Form Withdraw',
    description:
      '1) Pilih kategori: Bank / E-Wallet / USDT. 2) Pilih rekening tujuan. 3) Masukkan nominal (max = nilai paket terakhir). 4) Klik "Withdraw RpX". Ada potongan fee 10%. Dana masuk 1×24 jam kerja.',
    placement: 'top',
  },
  {
    id: 'done',
    page: 'dashboard',
    title: '🎉 Panduan Selesai!',
    description:
      'Selamat! Anda sudah tahu alur lengkap NEXVO: Registrasi → Deposit → Investasi → Withdraw. Untuk memulai panduan lagi, klik tombol "Panduan" di pojok kanan bawah. Selamat berinvestasi! 🚀',
    placement: 'center',
  },
];

export const useTourStore = create<TourState>((set, get) => ({
  isActive: false,
  currentStep: 0,
  hasCompleted: false,

  start: () => {
    set({ isActive: true, currentStep: 0 });
  },
  next: () => {
    const { currentStep } = get();
    if (currentStep >= TOUR_STEPS.length - 1) {
      set({ isActive: false, hasCompleted: true, currentStep: 0 });
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
    set({ isActive: false, currentStep: 0 });
  },
  goTo: (step: number) => {
    set({ currentStep: step });
  },
  complete: () => {
    set({ isActive: false, hasCompleted: true, currentStep: 0 });
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {}
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
