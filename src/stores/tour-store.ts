'use client';

import { create } from 'zustand';

export interface TourStep {
  id: string;
  page: string; // page identifier to navigate to
  selector?: string; // data-tour attribute value (omit = centered modal)
  title: string;
  description: string;
  /** Short narration text spoken by TTS voice (Indonesian). Keep concise. */
  narration: string;
  placement?: 'bottom' | 'top' | 'left' | 'right' | 'center';
  waitForNavigation?: boolean;
  /** Demo fields to auto-type in auto-play mode */
  demoFields?: { selector: string; value: string; label?: string }[];
  /** Auto-play delay (ms) after typing/arrival before advancing. Default 6000 */
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
  isVoiceEnabled: boolean;
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
  toggleVoice: () => void;
  setVoiceEnabled: (v: boolean) => void;
}

const STORAGE_KEY = 'nexvo-tour-completed';

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    page: 'login',
    title: '👋 Selamat Datang di NEXVO!',
    description:
      'Halo! Selamat datang di NEXVO. Ikuti panduan ini untuk mendaftar akun. Klik "Mode Demo Otomatis" agar form terisi sendiri — tinggal rekam video!',
    narration:
      'Selamat datang di Nekvo. Ikuti panduan ini untuk mendaftar akun Anda. Pilih mode demo otomatis agar form terisi sendiri, dan Anda tinggal merekam video.',
    placement: 'center',
    autoAdvanceDelay: 8000,
  },
  {
    id: 'register-link',
    page: 'login',
    selector: 'register-link',
    title: 'Langkah 1: Klik Daftar',
    description:
      'Klik tombol "Daftar Sekarang" untuk mulai membuat akun NEXVO Anda.',
    narration:
      'Langkah pertama. Klik tombol daftar sekarang untuk mulai membuat akun Nekvo Anda.',
    placement: 'bottom',
    autoAdvanceDelay: 6000,
  },
  {
    id: 'register-form',
    page: 'register',
    selector: 'register-submit',
    title: 'Langkah 2: Isi Data Diri',
    description:
      'Isi data diri Anda: Nama lengkap, Nomor WhatsApp, Email aktif, Password, dan ulangi password. Setelah lengkap, klik tombol "Daftar Sekarang".',
    narration:
      'Langkah kedua. Isi data diri Anda. Nama lengkap. Nomor WhatsApp. Email aktif. Password, dan ulangi password. Setelah lengkap, klik tombol daftar sekarang.',
    placement: 'top',
    demoFields: [
      { selector: 'input[placeholder="Masukkan nama pengguna"]', value: 'Budi Santoso', label: 'Nama' },
      { selector: 'input[placeholder="8123456789"]', value: '8123456789', label: 'WhatsApp' },
      { selector: 'input[placeholder="your@email.com"]', value: 'budi@gmail.com', label: 'Email' },
      { selector: 'input[placeholder="Ketik password"]', value: 'Budi1234!', label: 'Password' },
      { selector: 'input[placeholder="Ulangi password"]', value: 'Budi1234!', label: 'Konfirmasi' },
    ],
    autoAdvanceDelay: 5000,
  },
  {
    id: 'otp-verify',
    page: 'otp',
    selector: 'otp-input',
    title: 'Langkah 3: Masukkan Kode OTP',
    description:
      'Cek email Anda untuk kode OTP. Masukkan kode 6 digit yang dikirim ke email di kolom ini. Setelah verifikasi, akun Anda aktif.',
    narration:
      'Langkah ketiga. Cek email Anda untuk kode O T P. Masukkan kode enam digit yang dikirim ke email, di kolom ini. Setelah verifikasi, akun Anda aktif.',
    placement: 'top',
    demoFields: [
      { selector: 'input[data-tour="otp-input"]', value: '123456', label: 'Kode OTP' },
    ],
    pageData: { email: 'budi@gmail.com', whatsapp: '8123456789', fromRegister: true },
    demoOtpHint: 'Demo OTP: 123456',
    autoAdvanceDelay: 7000,
  },
  {
    id: 'done',
    page: 'login',
    title: '🎉 Panduan Selesai!',
    description:
      'Selesai! Akun Anda sudah aktif. Untuk memulai panduan lagi, klik tombol "Panduan" di pojok kanan bawah. Selamat bergabung dengan NEXVO!',
    narration:
      'Panduan selesai. Akun Anda sudah aktif. Untuk memulai panduan lagi, klik tombol panduan di pojok kanan bawah. Selamat bergabung dengan Nekvo.',
    placement: 'center',
    autoAdvanceDelay: 8000,
  },
];

export const useTourStore = create<TourState>((set, get) => ({
  isActive: false,
  currentStep: 0,
  hasCompleted: false,
  isAutoPlay: false,
  isPaused: false,
  isVoiceEnabled: true,

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
  toggleVoice: () => {
    set((s) => {
      const next = !s.isVoiceEnabled;
      if (!next && typeof window !== 'undefined') {
        window.speechSynthesis?.cancel();
      }
      return { isVoiceEnabled: next };
    });
  },
  setVoiceEnabled: (v: boolean) => {
    set({ isVoiceEnabled: v });
    if (!v && typeof window !== 'undefined') {
      window.speechSynthesis?.cancel();
    }
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
