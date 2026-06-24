'use client';

import { useEffect } from 'react';
import PaketPage from '@/components/nexvo/pages/PaketPage';

/**
 * ProductsPage — "Paket & Produk itu sama"
 *
 * Per permintaan pemilik produk: paket dan produk adalah hal yang sama.
 * Halaman Produk kini menampilkan daftar VIP tier yang persis sama dengan
 * halaman Paket, dengan aturan beli berurutan (1 paket aktif, naik level
 * satu per satu) dan profit masuk otomatis jam 00:00.
 *
 * Halaman ini cukup membungkus PaketPage agar kedua menu menampilkan sumber
 * data yang identik (InvestmentPackage).
 */
export default function ProductsPage() {
  // Paket & Produk sama — render the unified tier grid.
  return <PaketPage />;
}
