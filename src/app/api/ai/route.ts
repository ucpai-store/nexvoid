import { NextRequest, NextResponse } from 'next/server';

// Predefined FAQ knowledge base for instant responses + AI fallback
const FAQ_KB: { keywords: string[]; answer: string }[] = [
  {
    keywords: ['cara daftar', 'registrasi', 'sign up', 'buat akun', 'gabung'],
    answer: 'Cara daftar di NEXVO sangat mudah! Klik tombol "Daftar" di halaman utama, masukkan nomor WhatsApp dan password, lalu verifikasi OTP. Setelah itu Anda bisa langsung deposit dan mulai investasi! 🚀',
  },
  {
    keywords: ['deposit', 'top up', 'isi saldo', 'bayar', 'qris'],
    answer: 'Untuk deposit, masuk ke menu Deposit di dashboard. Pilih jumlah yang ingin Anda depositkan, lalu scan QRIS yang tersedia. Setelah pembayaran berhasil, saldo akan masuk dalam 1-5 menit. Minimal deposit Rp50.000.',
  },
  {
    keywords: ['withdraw', 'tarik', 'penarikan', 'pencairan', 'cairkan'],
    answer: 'Untuk withdraw, masuk ke menu Withdraw di dashboard. Pastikan Anda sudah menambahkan rekening bank. Minimal withdraw Rp50.000 dengan fee 10%. Proses withdraw 1x24 jam pada hari kerja (Senin-Jumat 08:00-17:00).',
  },
  {
    keywords: ['profit', 'keuntungan', 'hasil', 'return'],
    answer: 'Profit NEXVO bervariasi sesuai paket: Emas Starter 8%, Silver Mining 11%, Gold Premium 15%, dan Diamond Elite 20% per periode. Profit dihitung harian dan bisa dilihat di dashboard Anda.',
  },
  {
    keywords: ['referral', 'ajak teman', 'bonus referral', 'kode referral', 'refren'],
    answer: 'Dapatkan bonus Rp10.000 untuk setiap teman yang mendaftar menggunakan kode referral Anda! Kode referral bisa ditemukan di menu Referral di dashboard. Bagikan kode tersebut dan raih bonus tanpa batas! 🎉',
  },
  {
    keywords: ['bank', 'rekening', 'akun bank', 'nomor rekening'],
    answer: 'Untuk menambah rekening bank, masuk ke menu Bank di dashboard. Klik "Tambah Rekening" dan isi data bank Anda (nama bank, nomor rekening, nama pemilik). Rekening ini akan digunakan untuk penarikan dana.',
  },
  {
    keywords: ['produk', 'paket', 'investasi', 'emas', 'perak', 'berlian', 'diamond', 'gold', 'silver'],
    answer: 'NEXVO menyediakan 4 paket investasi komoditas:\n1. 🥉 Emas Starter Pack - Rp100.000 (Profit 8%)\n2. 🥈 Silver Mining Portfolio - Rp500.000 (Profit 11%)\n3. 🥇 Gold Premium Asset - Rp1.000.000 (Profit 15%)\n4. 💎 Diamond Elite Investment - Rp5.000.000 (Profit 20%)\n\nPilih sesuai kemampuan dan tujuan investasi Anda!',
  },
  {
    keywords: ['aman', 'keamanan', 'scam', 'penipuan', 'terpercaya', 'legit'],
    answer: 'NEXVO adalah platform manajemen aset digital yang terpercaya. Kami menggunakan enkripsi data, sistem keamanan berlapis, dan proses transaksi yang transparan. Semua aktivitas bisa dipantau secara real-time di dashboard Anda.',
  },
  {
    keywords: ['jam kerja', 'kapan', 'waktu', 'schedule', 'jadwal'],
    answer: 'Jam operasional NEXVO untuk withdraw adalah Senin-Jumat pukul 08:00-17:00 WIB. Deposit bisa dilakukan 24/7. Customer service tersedia setiap hari untuk membantu Anda.',
  },
  {
    keywords: ['fee', 'biaya', 'potongan', 'charge'],
    answer: 'Fee withdraw NEXVO adalah 10% dari jumlah penarikan. Tidak ada biaya deposit, biaya registrasi, atau biaya tersembunyi lainnya. Semua biaya transparan dan bisa dilihat sebelum konfirmasi transaksi.',
  },
  {
    keywords: ['minimum', 'minimal', 'terendah', 'paling kecil'],
    answer: 'Minimal deposit Rp100.000 dan minimal withdraw Rp50.000. Anda bisa mulai investasi dari paket Emas Starter Pack seharga Rp100.000.',
  },
  {
    keywords: ['suspend', 'blokir', 'diblokir', 'banned'],
    answer: 'Akun bisa disuspend jika terdeteksi aktivitas mencurigakan atau pelanggaran Terms of Service. Jika akun Anda disuspend, silakan hubungi customer service untuk penyelesaian.',
  },
];

function findFaqAnswer(message: string): string | null {
  const lower = message.toLowerCase();
  for (const faq of FAQ_KB) {
    if (faq.keywords.some(kw => lower.includes(kw))) {
      return faq.answer;
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message } = body;

    if (!message || message.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Pesan tidak boleh kosong' }, { status: 400 });
    }

    // First check FAQ knowledge base for instant response
    const faqAnswer = findFaqAnswer(message);
    if (faqAnswer) {
      return NextResponse.json({
        success: true,
        data: { message: faqAnswer },
      });
    }

    // Fall back to AI if no FAQ match
    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default;
      const zai = await ZAI.create();

      const response = await zai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `Kamu adalah asisten AI NEXVO, platform manajemen aset digital berbasis komoditas (emas, perak, berlian, mineral). 

Tentang NEXVO:
- Platform manajemen aset digital modern
- Investasi komoditas: emas, perak, berlian, mineral
- Profit hingga 20% per periode
- Deposit via QRIS, withdraw ke rekening bank
- Sistem referral dengan bonus Rp10.000
- Minimal deposit Rp50.000
- Minimal withdraw Rp50.000
- Fee withdraw 10%
- Jam kerja withdraw: Senin-Jumat 08:00-17:00
- Produk: Emas Starter Pack (Rp100K, profit 8%), Silver Mining Portfolio (Rp500K, profit 11%), Gold Premium Asset (Rp1M, profit 15%), Diamond Elite Investment (Rp5M, profit 20%)

Jawab dalam Bahasa Indonesia dengan ramah, profesional, dan informatif. Jika ditanya di luar topik NEXVO, arahkan kembali ke platform.`,
          },
          {
            role: 'user',
            content: message,
          },
        ],
        thinking: { type: 'disabled' },
      });

      const reply = response.choices?.[0]?.message?.content || 'Maaf, saya tidak dapat memproses permintaan Anda saat ini. Silakan hubungi customer service kami untuk bantuan lebih lanjut.';

      return NextResponse.json({
        success: true,
        data: { message: reply },
      });
    } catch (aiError) {
      console.error('AI SDK error, using fallback:', aiError);
      // Fallback response when AI service is unavailable
      return NextResponse.json({
        success: true,
        data: {
          message: 'Terima kasih atas pertanyaan Anda! Saat ini saya sedang mengalami gangguan teknis. Untuk pertanyaan seputar deposit, withdraw, produk, dan referral, silakan cek menu di dashboard Anda. Jika butuh bantuan lebih lanjut, hubungi customer service kami. 🙏',
        },
      });
    }
  } catch (error) {
    console.error('AI chat error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
