'use client';

import { useEffect } from 'react';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { Button } from '@/components/ui/button';

/**
 * ProductDetailPage — "Paket & Produk itu sama"
 *
 * Karena paket dan produk kini disatukan, halaman detail produk lama tidak
 * lagi dipakai. Pengguna diarahkan ke halaman Paket (daftar VIP tier) di mana
 * pembelian berurutan diberlakukan. Profit masuk otomatis jam 00:00 sesuai
 * paket aktif.
 */
export default function ProductDetailPage() {
  const { navigate } = useAppStore();

  useEffect(() => {
    // Paket = Produk → arahkan ke daftar tier terpadu.
    navigate('paket');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-4 text-center">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
      <p className="text-muted-foreground text-sm">
        Paket &amp; Produk kini disatukan. Mengarahkan ke daftar paket…
      </p>
      <Button
        variant="outline"
        onClick={() => navigate('paket')}
        className="border-border/50 text-foreground rounded-xl"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Buka Daftar Paket
      </Button>
    </div>
  );
}
