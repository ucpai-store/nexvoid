import { 
  Shield, TrendingUp, Coins, BarChart3, Wallet, Users, 
  ArrowRight, CheckCircle, Lock, Smartphone, Globe, 
  ChevronDown, ChevronUp, Star, Zap, Award, BookOpen,
  CreditCard, Gift, RefreshCw, Eye
} from 'lucide-react';

interface LandingPageProps {
  onLogin?: () => void;
  onRegister?: () => void;
}

const FAQ_ITEM = ({ q, a }: { q: string; a: string }) => {
  return `<div class="border border-gray-200 dark:border-gray-700 rounded-xl p-5">
    <h3 class="font-semibold text-[#3C2415] dark:text-gray-100 text-sm mb-2">${q}</h3>
    <p class="text-[#6B5443] dark:text-gray-400 text-sm leading-relaxed">${a}</p>
  </div>`;
};

export default function LandingPage({ onLogin, onRegister }: LandingPageProps) {
  const investmentTypes = [
    {
      icon: 'saham',
      title: 'Saham (Stocks)',
      desc: 'Investasi saham dari perusahaan terpercaya dengan potensi dividen dan capital gain. Kelola portofolio saham Anda secara digital.',
      color: '#2563EB',
      features: ['Dividen Berkala', 'Capital Gain', 'Portofolio Digital'],
    },
    {
      icon: 'emas',
      title: 'Emas (Gold)',
      desc: 'Investasi emas mulai dari pecahan kecil. Lindungi aset Anda dari inflasi dengan instrumen yang paling stabil sepanjang masa.',
      color: '#D4AF37',
      features: ['Anti Inflasi', 'Pecahan Kecil', 'Stabil & Aman'],
    },
    {
      icon: 'komoditas',
      title: 'Komoditas (Commodities)',
      desc: 'Diversifikasi aset dengan investasi komoditas seperti minyak, perak, dan komoditas primadunya lainnya. Profit harian hingga 10%.',
      color: '#059669',
      features: ['Profit Harian', 'Diversifikasi', 'Multiple Asset'],
    },
    {
      icon: 'kripto',
      title: 'Kripto (Crypto)',
      desc: 'Akses pasar kripto global dengan aman. Trading Bitcoin, Ethereum, dan aset digital lainnya melalui platform terpercaya.',
      color: '#8B5CF6',
      features: ['Bitcoin & Ethereum', 'Aman & Terproteksi', 'Market Global'],
    },
  ];

  const steps = [
    { num: '01', title: 'Daftar Akun', desc: 'Buat akun NEXVO gratis hanya dalam 2 menit. Cukup email dan nomor HP.', icon: 'register' },
    { num: '02', title: 'Verifikasi OTP', desc: 'Konfirmasi identitas Anda melalui kode OTP yang dikirim ke email & WhatsApp.', icon: 'verify' },
    { num: '03', title: 'Deposit Saldo', desc: 'Top up saldo via QRIS, transfer bank, atau USDT. Proses instan & aman.', icon: 'deposit' },
    { num: '04', title: 'Pilih Paket Investasi', desc: 'Pilih paket sesuai budget & tujuan — saham, emas, komoditas, atau kripto.', icon: 'package' },
    { num: '05', title: 'Raih Profit Harian', desc: 'Nikmati profit harian otomatis hingga 10%. Monitor perkembangan real-time.', icon: 'profit' },
    { num: '06', title: 'Withdraw & Nikmati', desc: 'Tarik profit kapan saja ke rekening Anda. Proses cepat & transparan.', icon: 'withdraw' },
  ];

  const features = [
    { icon: 'shield', title: 'Keamanan SSL 256-bit', desc: 'Data & transaksi Anda dilindungi enkripsi setara perbankan digital.' },
    { icon: 'smartphone', title: 'Akses Mobile 24/7', desc: 'Kelola investasi kapan saja, di mana saja langsung dari smartphone Anda.' },
    { icon: 'zap', title: 'Profit Harian Otomatis', desc: 'Sistem profit otomatis setiap hari. Tidak perlu monitoring manual.' },
    { icon: 'creditcard', title: 'Deposit QRIS & USDT', desc: 'Metode pembayaran lengkap — QRIS instan, transfer bank, dan USDT.' },
    { icon: 'users', title: 'Bonus Referral', desc: 'Dapatkan bonus setiap kali mengajak teman bergabung. Semakin banyak, semakin besar bonus.' },
    { icon: 'refresh', title: 'Withdraw Cepat', desc: 'Penarikan profit diproses cepat ke rekening bank Anda. Transparan & tanpa biaya tersembunyi.' },
  ];

  const salarySystem = [
    { title: 'Profit Harian', desc: 'Dapatkan profit otomatis setiap hari dari paket investasi aktif Anda.', icon: 'trending', value: 'Hingga 10%' },
    { title: 'Bonus Referral', desc: 'Ajak teman bergabung dan dapatkan bonus langsung dari setiap referral aktif.', icon: 'gift', value: 'Multi Level' },
    { title: 'Salary Bonus', desc: 'Sistem gaji bulanan berdasarkan total investasi dan aktivitas jaringan.', icon: 'award', value: 'Bulanan' },
    { title: 'Matching Bonus', desc: 'Bonus pasangan dari pertumbuhan jaringan kiri dan kanan Anda.', icon: 'users', value: 'Infinity' },
  ];

  const faqs = [
    { q: 'Apa itu NEXVO?', a: 'NEXVO adalah platform investasi digital terpadu yang menyediakan layanan investasi saham, emas, komoditas, dan kripto dalam satu aplikasi. Kami membantu Anda membangun aset dengan sistem profit harian, bonus referral, dan manajemen portofolio yang cerdas.' },
    { q: 'Bagaimana cara mendaftar di NEXVO?', a: 'Cukup kunjungi nexvo.id, klik "Daftar", masukkan email dan nomor HP, verifikasi kode OTP, dan akun Anda langsung aktif. Seluruh proses hanya membutuhkan waktu 2 menit.' },
    { q: 'Berapa modal minimum untuk mulai investasi?', a: 'Anda bisa mulai investasi di NEXVO dengan modal yang sangat terjangkau. Tersedia berbagai paket investasi mulai dari nominal kecil hingga besar, sesuaikan dengan budget dan tujuan finansial Anda.' },
    { q: 'Apakah NEXVO aman?', a: 'Keamanan adalah prioritas utama kami. Platform NEXVO dilengkapi enkripsi SSL 256-bit, verifikasi dua langkah (2FA), dan sistem monitoring 24/7. Semua data dan transaksi Anda terlindungi dengan standar keamanan perbankan digital.' },
    { q: 'Bagaimana sistem profit harian bekerja?', a: 'Setiap paket investasi aktif menghasilkan profit harian secara otomatis. Profit dihitung berdasarkan jenis dan nominal paket yang Anda pilih. Anda bisa memantau perkembangan profit secara real-time di dashboard.' },
    { q: 'Bagaimana cara menarik (withdraw) profit?', a: 'Buka menu Withdraw, masukkan nominal yang ingin ditarik, pilih rekening bank tujuan, dan konfirmasi. Proses penarikan diproses cepat dan transparan tanpa biaya tersembunyi.' },
    { q: 'Apa itu Bonus Referral?', a: 'Bonus Referral adalah reward yang Anda dapatkan ketika mengajak orang lain bergabung di NEXVO menggunakan kode referral Anda. Semakin banyak referral aktif, semakin besar bonus yang Anda terima.' },
    { q: 'Apa perbedaan Salary Bonus dan Matching Bonus?', a: 'Salary Bonus adalah penghasilan tetap bulanan berdasarkan total investasi dan aktivitas jaringan Anda. Matching Bonus adalah bonus dari pertumbuhan jaringan kiri dan kanan Anda yang terus berlanjut tanpa batas level.' },
  ];

  const IconMap: Record<string, React.ReactNode> = {
    shield: <Shield className="w-6 h-6" />,
    smartphone: <Smartphone className="w-6 h-6" />,
    zap: <Zap className="w-6 h-6" />,
    creditcard: <CreditCard className="w-6 h-6" />,
    users: <Users className="w-6 h-6" />,
    refresh: <RefreshCw className="w-6 h-6" />,
    trending: <TrendingUp className="w-6 h-6" />,
    gift: <Gift className="w-6 h-6" />,
    award: <Award className="w-6 h-6" />,
    register: <BookOpen className="w-6 h-6" />,
    verify: <Shield className="w-6 h-6" />,
    deposit: <Wallet className="w-6 h-6" />,
    package: <BarChart3 className="w-6 h-6" />,
    profit: <TrendingUp className="w-6 h-6" />,
    withdraw: <CreditCard className="w-6 h-6" />,
    saham: <BarChart3 className="w-7 h-7" />,
    emas: <Coins className="w-7 h-7" />,
    komoditas: <Globe className="w-7 h-7" />,
    kripto: <Zap className="w-7 h-7" />,
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8] dark:bg-[#070B14]">
      {/* Hidden SEO content for crawlers */}
      <div className="sr-only">
        <h1>NEXVO - Platform Investasi Digital Terpadu | Saham, Emas, Komoditas, Kripto</h1>
        <p>NEXVO adalah platform investasi digital terpadu yang menyediakan layanan investasi saham, emas, komoditas, dan kripto. Raih profit harian hingga 10%, deposit via QRIS & USDT, keamanan SSL 256-bit. Build Value, Grow Future!</p>
        <p>Cara daftar NEXVO: 1) Buat akun gratis, 2) Verifikasi OTP, 3) Deposit saldo via QRIS/USDT, 4) Pilih paket investasi, 5) Raih profit harian otomatis, 6) Withdraw ke rekening bank.</p>
        <p>Keunggulan NEXVO: Profit harian otomatis hingga 10%, Bonus Referral multi level, Salary Bonus bulanan, Matching Bonus infinity, keamanan SSL 256-bit, deposit QRIS instan, withdraw cepat.</p>
        <p>Jenis investasi NEXVO: Saham dengan dividen dan capital gain, Emas anti inflasi, Komoditas diversified, Kripto Bitcoin Ethereum. Semua dalam satu platform.</p>
      </div>

      {/* ========== HERO ========== */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a0f06] via-[#3C2415] to-[#1a0f06] dark:from-[#070B14] dark:via-[#0f1729] dark:to-[#070B14]" />
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 25% 25%, #D4AF37 0%, transparent 50%), radial-gradient(circle at 75% 75%, #D4AF37 0%, transparent 50%)' }} />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
          <div className="inline-flex items-center gap-2 bg-[#D4AF37]/20 border border-[#D4AF37]/30 rounded-full px-4 py-1.5 mb-6">
            <Star className="w-4 h-4 text-[#D4AF37]" />
            <span className="text-[#D4AF37] text-sm font-medium">Platform Investasi Digital #1</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-4 leading-tight">
            Build Value,<br />
            <span className="text-[#D4AF37]">Grow Future</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-300 max-w-2xl mx-auto mb-4">
            Investasi cerdas di <strong className="text-white">Saham, Emas, Komoditas & Kripto</strong> dalam satu platform. 
            Profit harian hingga 10%.
          </p>
          <p className="text-sm text-gray-400 max-w-xl mx-auto mb-8">
            Deposito mudah via QRIS & USDT — Penarikan cepat — Keamanan SSL 256-bit
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <button 
              onClick={onRegister}
              className="w-full sm:w-auto px-8 py-3.5 bg-[#D4AF37] hover:bg-[#c4a030] text-black font-bold rounded-xl text-lg transition-all transform hover:scale-105 shadow-lg shadow-[#D4AF37]/25 flex items-center justify-center gap-2"
            >
              Mulai Investasi <ArrowRight className="w-5 h-5" />
            </button>
            <button 
              onClick={onLogin}
              className="w-full sm:w-auto px-8 py-3.5 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl text-lg transition-all border border-white/20 flex items-center justify-center gap-2"
            >
              Masuk Akun
            </button>
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-6 sm:gap-10 text-gray-400 text-sm">
            <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-[#D4AF37]" /> SSL 256-bit</div>
            <div className="flex items-center gap-2"><Zap className="w-4 h-4 text-[#D4AF37]" /> Profit Harian</div>
            <div className="flex items-center gap-2"><Users className="w-4 h-4 text-[#D4AF37]" /> 1000+ Investor</div>
            <div className="flex items-center gap-2"><CreditCard className="w-4 h-4 text-[#D4AF37]" /> QRIS & USDT</div>
          </div>
        </div>
      </section>

      {/* ========== INVESTMENT TYPES ========== */}
      <section className="py-16 sm:py-20 bg-white dark:bg-[#0c1220]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <span className="text-[#D4AF37] font-semibold text-sm uppercase tracking-wider">Jenis Investasi</span>
            <h2 className="text-3xl sm:text-4xl font-bold text-[#3C2415] dark:text-white mt-2 mb-3">
              Diversifikasi Aset dalam Satu Platform
            </h2>
            <p className="text-[#6B5443] dark:text-gray-400 max-w-2xl mx-auto">
              Pilih instrumen investasi sesuai tujuan dan profil risiko Anda. Semua dikelola dalam satu dashboard digital.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {investmentTypes.map((item) => (
              <div key={item.icon} className="group bg-[#FAFAF8] dark:bg-[#111827] rounded-2xl p-6 border border-gray-100 dark:border-gray-800 hover:border-[#D4AF37]/50 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                <div 
                  className="w-14 h-14 rounded-xl flex items-center justify-center mb-4 text-white"
                  style={{ backgroundColor: item.color }}
                >
                  {IconMap[item.icon]}
                </div>
                <h3 className="text-lg font-bold text-[#3C2415] dark:text-white mb-2">{item.title}</h3>
                <p className="text-sm text-[#6B5443] dark:text-gray-400 mb-4 leading-relaxed">{item.desc}</p>
                <div className="flex flex-wrap gap-1.5">
                  {item.features.map((f) => (
                    <span key={f} className="text-xs px-2.5 py-1 rounded-full bg-[#D4AF37]/10 text-[#B8960F] dark:text-[#D4AF37] font-medium">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== HOW IT WORKS ========== */}
      <section className="py-16 sm:py-20 bg-[#FAFAF8] dark:bg-[#070B14]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <span className="text-[#D4AF37] font-semibold text-sm uppercase tracking-wider">Panduan Lengkap</span>
            <h2 className="text-3xl sm:text-4xl font-bold text-[#3C2415] dark:text-white mt-2 mb-3">
              6 Langkah Mulai Investasi
            </h2>
            <p className="text-[#6B5443] dark:text-gray-400 max-w-2xl mx-auto">
              Proses investasi di NEXVO sangat mudah. Cukup 6 langkah sederhana untuk mulai meraih profit.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {steps.map((step) => (
              <div key={step.num} className="relative bg-white dark:bg-[#111827] rounded-2xl p-6 border border-gray-100 dark:border-gray-800 hover:shadow-lg transition-all group">
                <div className="flex items-center gap-4 mb-3">
                  <span className="text-3xl font-black text-[#D4AF37]/30 group-hover:text-[#D4AF37]/60 transition-colors">{step.num}</span>
                  <div className="w-10 h-10 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center text-[#D4AF37]">
                    {IconMap[step.icon]}
                  </div>
                </div>
                <h3 className="text-base font-bold text-[#3C2415] dark:text-white mb-1.5">{step.title}</h3>
                <p className="text-sm text-[#6B5443] dark:text-gray-400 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== SALARY & BONUS SYSTEM ========== */}
      <section className="py-16 sm:py-20 bg-gradient-to-br from-[#3C2415] via-[#2a180e] to-[#3C2415] dark:from-[#0c1220] dark:via-[#0f1729] dark:to-[#0c1220]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <span className="text-[#D4AF37] font-semibold text-sm uppercase tracking-wider">Sistem Penghasilan</span>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mt-2 mb-3">
              4 Sumber Penghasilan di NEXVO
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              Selain profit investasi, Anda juga bisa mendapatkan penghasilan tambahan melalui sistem bonus yang menguntungkan.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {salarySystem.map((item) => (
              <div key={item.title} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all group">
                <div className="w-12 h-12 rounded-xl bg-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37] mb-4">
                  {IconMap[item.icon]}
                </div>
                <div className="text-[#D4AF37] font-bold text-lg mb-1">{item.value}</div>
                <h3 className="text-white font-bold text-base mb-1.5">{item.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== FEATURES ========== */}
      <section className="py-16 sm:py-20 bg-white dark:bg-[#0c1220]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <span className="text-[#D4AF37] font-semibold text-sm uppercase tracking-wider">Keunggulan Platform</span>
            <h2 className="text-3xl sm:text-4xl font-bold text-[#3C2415] dark:text-white mt-2 mb-3">
              Kenapa Memilih NEXVO?
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((item) => (
              <div key={item.title} className="flex gap-4 p-5 bg-[#FAFAF8] dark:bg-[#111827] rounded-xl border border-gray-100 dark:border-gray-800 hover:shadow-md transition-all">
                <div className="w-12 h-12 rounded-xl bg-[#D4AF37]/10 flex-shrink-0 flex items-center justify-center text-[#D4AF37]">
                  {IconMap[item.icon]}
                </div>
                <div>
                  <h3 className="font-bold text-[#3C2415] dark:text-white text-sm mb-1">{item.title}</h3>
                  <p className="text-[#6B5443] dark:text-gray-400 text-sm leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== SECURITY ========== */}
      <section className="py-16 sm:py-20 bg-[#FAFAF8] dark:bg-[#070B14]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-[#D4AF37] font-semibold text-sm uppercase tracking-wider">Keamanan Terjamin</span>
              <h2 className="text-3xl sm:text-4xl font-bold text-[#3C2415] dark:text-white mt-2 mb-4">
                Data & Transaksi Anda<br />Dilindungi Sepenuhnya
              </h2>
              <p className="text-[#6B5443] dark:text-gray-400 mb-6 leading-relaxed">
                Kami menerapkan standar keamanan setara perbankan digital untuk memastikan setiap data dan transaksi Anda terlindungi dari ancaman siber.
              </p>
              <div className="space-y-4">
                {[
                  { title: 'Enkripsi SSL 256-bit', desc: 'Seluruh komunikasi data terenkripsi end-to-end' },
                  { title: 'Verifikasi 2 Langkah (2FA)', desc: 'Lapisan keamanan ekstra saat login' },
                  { title: 'Monitoring 24/7', desc: 'Sistem deteksi fraud real-time' },
                  { title: 'Data Tersimpan Aman', desc: 'Backup otomatis & disaster recovery' },
                ].map((s) => (
                  <div key={s.title} className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-[#D4AF37] mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-[#3C2415] dark:text-white text-sm">{s.title}</p>
                      <p className="text-[#6B5443] dark:text-gray-400 text-xs">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="bg-gradient-to-br from-[#3C2415] to-[#1a0f06] dark:from-[#111827] dark:to-[#0c1220] rounded-3xl p-8 text-center border border-[#D4AF37]/20">
                <div className="w-24 h-24 rounded-full bg-[#D4AF37]/20 flex items-center justify-center mx-auto mb-6">
                  <Lock className="w-12 h-12 text-[#D4AF37]" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Bank-Level Security</h3>
                <p className="text-gray-400 text-sm mb-6">Standar keamanan perbankan digital</p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-[#D4AF37] font-bold text-2xl">256</p>
                    <p className="text-gray-400 text-xs">Bit Encryption</p>
                  </div>
                  <div>
                    <p className="text-[#D4AF37] font-bold text-2xl">24/7</p>
                    <p className="text-gray-400 text-xs">Monitoring</p>
                  </div>
                  <div>
                    <p className="text-[#D4AF37] font-bold text-2xl">2FA</p>
                    <p className="text-gray-400 text-xs">Protection</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========== SALDO SYSTEM ========== */}
      <section className="py-16 sm:py-20 bg-white dark:bg-[#0c1220]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <span className="text-[#D4AF37] font-semibold text-sm uppercase tracking-wider">Manajemen Saldo</span>
            <h2 className="text-3xl sm:text-4xl font-bold text-[#3C2415] dark:text-white mt-2 mb-3">
              3 Jenis Saldo Terpisah
            </h2>
            <p className="text-[#6B5443] dark:text-gray-400 max-w-2xl mx-auto">
              Kelola keuangan dengan lebih terstruktur. Setiap jenis saldo memiliki fungsi yang jelas.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { title: 'Saldo Deposit', desc: 'Saldo utama untuk membeli paket investasi. Top up via QRIS, transfer bank, atau USDT.', color: '#2563EB', icon: <Wallet className="w-8 h-8" /> },
              { title: 'Saldo Profit', desc: 'Akumulasi profit harian dari paket investasi aktif. Bisa ditarik kapan saja ke rekening bank.', color: '#059669', icon: <TrendingUp className="w-8 h-8" /> },
              { title: 'Saldo Bonus', desc: 'Penghasilan dari bonus referral, salary bonus, dan matching bonus. Withdraw langsung tersedia.', color: '#D4AF37', icon: <Gift className="w-8 h-8" /> },
            ].map((item) => (
              <div key={item.title} className="bg-[#FAFAF8] dark:bg-[#111827] rounded-2xl p-6 border border-gray-100 dark:border-gray-800 text-center hover:shadow-lg transition-all">
                <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-white" style={{ backgroundColor: item.color }}>
                  {item.icon}
                </div>
                <h3 className="font-bold text-[#3C2415] dark:text-white text-lg mb-2">{item.title}</h3>
                <p className="text-[#6B5443] dark:text-gray-400 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== FAQ ========== */}
      <section className="py-16 sm:py-20 bg-[#FAFAF8] dark:bg-[#070B14]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <span className="text-[#D4AF37] font-semibold text-sm uppercase tracking-wider">FAQ</span>
            <h2 className="text-3xl sm:text-4xl font-bold text-[#3C2415] dark:text-white mt-2 mb-3">
              Pertanyaan yang Sering Diajukan
            </h2>
          </div>
          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <details key={idx} className="group bg-white dark:bg-[#111827] rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                <summary className="flex items-center justify-between cursor-pointer p-5 font-semibold text-[#3C2415] dark:text-white text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <span>{faq.q}</span>
                  <ChevronDown className="w-4 h-4 text-[#D4AF37] group-open:rotate-180 transition-transform flex-shrink-0 ml-3" />
                </summary>
                <div className="px-5 pb-5 text-[#6B5443] dark:text-gray-400 text-sm leading-relaxed border-t border-gray-100 dark:border-gray-800 pt-3">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ========== CTA ========== */}
      <section className="py-16 sm:py-20 bg-gradient-to-br from-[#3C2415] via-[#2a180e] to-[#3C2415] dark:from-[#0c1220] dark:via-[#0f1729] dark:to-[#0c1220]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-[#D4AF37]/20 flex items-center justify-center mx-auto mb-6">
            <Zap className="w-8 h-8 text-[#D4AF37]" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Mulai Investasi Cerdas Hari Ini
          </h2>
          <p className="text-gray-400 max-w-lg mx-auto mb-8">
            Jangan tunda lagi. Bergabung bersama ribuan investor yang sudah mempercayakan asetnya di NEXVO. Build Value, Grow Future!
          </p>
          <button 
            onClick={onRegister}
            className="px-10 py-4 bg-[#D4AF37] hover:bg-[#c4a030] text-black font-bold rounded-xl text-lg transition-all transform hover:scale-105 shadow-lg shadow-[#D4AF37]/25 inline-flex items-center gap-2"
          >
            Daftar Gratis Sekarang <ArrowRight className="w-5 h-5" />
          </button>
          <p className="text-gray-500 text-xs mt-4">Gratis • Tanpa kartu kredit • Mulai dari nominal kecil</p>
        </div>
      </section>

      {/* ========== FOOTER ========== */}
      <footer className="bg-[#1a0f06] dark:bg-[#050810] py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
            <div>
              <h3 className="text-[#D4AF37] font-bold text-xl mb-3">NEXVO</h3>
              <p className="text-gray-400 text-sm leading-relaxed">Platform investasi digital terpadu — saham, emas, komoditas, kripto. Build Value, Grow Future!</p>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-3">Investasi</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li>Saham (Stocks)</li>
                <li>Emas (Gold)</li>
                <li>Komoditas (Commodities)</li>
                <li>Kripto (Crypto)</li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-3">Panduan</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li>Cara Daftar</li>
                <li>Cara Deposit</li>
                <li>Cara Withdraw</li>
                <li>Sistem Bonus</li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-3">Keamanan</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li>SSL 256-bit</li>
                <li>Verifikasi 2FA</li>
                <li>Monitoring 24/7</li>
                <li>Data Protection</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-gray-500 text-xs">&copy; 2025 NEXVO Investment Platform. All rights reserved.</p>
            <p className="text-gray-500 text-xs">nexvo.id · Build Value, Grow Future</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
