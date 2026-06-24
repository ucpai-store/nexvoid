'use client';

import PaketPage from '@/components/nexvo/pages/PaketPage';

/**
 * ProductsPage — "Paket & Produk itu sama"
 *
 * Per permintaan pemilik produk: paket dan produk adalah hal yang sama.
 * Halaman Produk menampilkan daftar produk yang persis sama dengan halaman
 * Paket, dengan banner produk (sesuai yang dikonfigurasi admin di #admin-products).
 *
 * Aturan pembelian:
 *   - Setiap produk hanya bisa dibeli SEKALI (no-duplicates).
 *   - Pembelian TIDAK harus berurutan — boleh pilih produk mana saja yang belum dimiliki.
 *   - Hanya 1 produk aktif saja per user — beli produk baru menggantikan produk aktif lama.
 *   - Profit masuk otomatis setiap hari jam 00:00 WIB sesuai produk aktif hari ini.
 *
 * Halaman ini cukup membungkus PaketPage agar kedua menu menampilkan sumber
 * data yang identik (Product model dengan banner).
 */
export default function ProductsPage() {
  // Paket & Produk sama — render the unified product grid.
  return <PaketPage />;
}
