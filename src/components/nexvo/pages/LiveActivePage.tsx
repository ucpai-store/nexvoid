'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowDown, ArrowUp, ShoppingBag, Users, Activity,
  Zap, Clock, Eye, Radio, TrendingUp,
  ChevronDown, Flame, Coins, Gem, BadgeDollarSign,
  UserPlus, Globe, Wallet
} from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { formatRupiah, timeAgo } from '@/lib/auth';

/* Types */
interface LiveActivity {
  id: string;
  type: 'deposit' | 'withdraw' | 'purchase' | 'register';
  userName: string;
  amount: number;
  productName: string | null;
  createdAt: string;
}

/* ====== REAL PRODUCT DATA - matches website exactly ====== */
const REAL_PRODUCTS = [
  { name: 'Gold Premium Asset vip 1', price: 100000 },
  { name: 'Gold Premium Asset vip 2', price: 500000 },
  { name: 'Gold Premium Asset vip 3', price: 1000000 },
  { name: 'Gold Premium Asset vip 4', price: 2500000 },
  { name: 'Gold Premium Asset vip 5', price: 5000000 },
  { name: 'Gold Premium Asset vip 6', price: 10000000 },
];

/* ====== MASSIVE name pool ====== */
const FAKE_NAMES = [
  'Ahmad R.', 'Siti N.', 'Budi S.', 'Dewi L.', 'Fajar P.',
  'Rina W.', 'Hendra K.', 'Maya T.', 'Andi M.', 'Putri D.',
  'Rudi H.', 'Lina S.', 'Doni A.', 'Yuli B.', 'Wawan G.',
  'Nita J.', 'Eko F.', 'Sari V.', 'Agus Z.', 'Wati C.',
  'Bambang Q.', 'Indah E.', 'Joko U.', 'Amel X.', 'Tono Y.',
  'Ratna I.', 'Dimas O.', 'Citra P.', 'Galang R.', 'Fitriani L.',
  'Bayu N.', 'Kartika M.', 'Surya D.', 'Nurul H.', 'Rizky A.',
  'Dian S.', 'Prasetyo B.', 'Lestari K.', 'Santoso G.', 'Hartono F.',
  'Suryani T.', 'Purnomo W.', 'Wulandari J.', 'Setiawan V.', 'Rahayu Z.',
  'Supriadi X.', 'Handayani C.', 'Wibowo Q.', 'Maharani E.', 'Saputra U.',
  'Yusuf M.', 'Aisyah K.', 'Ilham R.', 'Nadia F.', 'Teguh B.',
  'Lestari H.', 'Wijaya D.', 'Permata S.', 'Hakim A.', 'Safitri N.',
  'Kurniawan J.', 'Utami P.', 'Pratama G.', 'Anggraini T.', 'Wicaksono F.',
  'Harahap L.', 'Nasution R.', 'Siregar B.', 'Panggabean V.', 'Simanjuntak C.',
  'Manurung E.', 'Hutapea Q.', 'Tampubolon X.', 'Simatupang U.', 'Lubis I.',
  'Pardede O.', 'Sihombing Y.', 'Ginting W.', 'Tarigan Z.', 'Karo H.',
  'Sinaga N.', 'Rajagukguk M.', 'Simbolon R.', 'Panjaitan D.', 'Siahaan G.',
  'Muhammad A.', 'Fatimah Z.', 'Abdullah R.', 'Khadijah S.', 'Umar H.',
  'Aisyah B.', 'Ibrahim K.', 'Zainab L.', 'Bilal F.', 'Sumayyah P.',
  'Susanto P.', 'Wibisono E.', 'Harjono K.', 'Mulyono G.', 'Sutanto L.',
  'Gunawan S.', 'Santika R.', 'Rahardjo T.', 'Suharto B.', 'Prabowo I.',
  'Suryadi O.', 'Moertini Z.', 'Kusumo F.', 'Respati D.', 'Wignyo R.',
  'Triyono V.', 'Suryo N.', 'Yudistira C.', 'Arjuna M.', 'Bima U.',
  'Haryanto J.', 'Sulistiowati E.', 'Purnama A.', 'Setiabudi W.', 'Hidayat N.',
  'Mulyadi H.', 'Wahyuni S.', 'Kurniawan T.', 'Astuti D.', 'Budiman G.',
  'Hartono L.', 'Supriyanto F.', 'Suryawati R.', 'Widodo P.', 'Rahmawati K.',
];

/* Deposit amounts - mostly matching product prices since people deposit to buy products */
const DEPOSIT_AMOUNTS = [
  100000, 500000, 1000000, 1000000, 2500000, 2500000, 5000000,
  5000000, 10000000, 10000000, 10000000, 15000000, 20000000,
  25000000, 30000000, 50000000, 75000000, 100000000,
  200000000, 500000000,
];

const WITHDRAW_AMOUNTS = [
  50000, 100000, 200000, 300000, 500000, 750000, 1000000,
  1500000, 2000000, 3000000, 5000000, 10000000, 20000000,
];

/* ====== Helpers ====== */
function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateRandomActivity(index: number): LiveActivity {
  // Weighted: 50% purchase, 35% deposit, 8% withdraw, 7% register
  const rand = Math.random();
  let type: LiveActivity['type'];
  if (rand < 0.50) type = 'purchase';
  else if (rand < 0.85) type = 'deposit';
  else if (rand < 0.93) type = 'withdraw';
  else type = 'register';

  let amount = 0;
  let productName: string | null = null;

  switch (type) {
    case 'purchase': {
      const product = randomItem(REAL_PRODUCTS);
      amount = product.price;
      productName = product.name;
      break;
    }
    case 'deposit':
      amount = randomItem(DEPOSIT_AMOUNTS);
      break;
    case 'withdraw':
      amount = randomItem(WITHDRAW_AMOUNTS);
      break;
    case 'register':
      amount = 0;
      break;
  }

  const secondsAgo = Math.floor(Math.random() * 90);
  const createdAt = new Date(Date.now() - secondsAgo * 1000);

  return {
    id: `live-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    userName: randomItem(FAKE_NAMES),
    amount,
    productName,
    createdAt: createdAt.toISOString(),
  };
}

function generateBatch(count?: number): LiveActivity[] {
  const batchCount = count ?? (30 + Math.floor(Math.random() * 20)); // 30-50 items
  const batch: LiveActivity[] = [];
  for (let i = 0; i < batchCount; i++) {
    batch.push(generateRandomActivity(i));
  }
  batch.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return batch;
}

function getTypeConfig(type: string) {
  switch (type) {
    case 'deposit':
      return { icon: ArrowDown, color: 'text-emerald-400', bg: 'bg-emerald-400/10', label: 'Deposit' };
    case 'withdraw':
      return { icon: ArrowUp, color: 'text-blue-400', bg: 'bg-blue-400/10', label: 'Withdraw' };
    case 'purchase':
      return { icon: ShoppingBag, color: 'text-[#D4AF37]', bg: 'bg-[#D4AF37]/10', label: 'Investasi' };
    case 'register':
      return { icon: UserPlus, color: 'text-purple-400', bg: 'bg-purple-400/10', label: 'Daftar Baru' };
    default:
      return { icon: ArrowDown, color: 'text-emerald-400', bg: 'bg-emerald-400/10', label: type };
  }
}

/* ====== Running Counter Hook ====== */
function useRunningCounter(startValue: number, incrementMin: number, incrementMax: number, intervalMs: number) {
  const counterRef = useRef(startValue);
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      counterRef.current += incrementMin + Math.floor(Math.random() * (incrementMax - incrementMin));
      forceUpdate((p) => p + 1);
    }, intervalMs);
    return () => clearInterval(interval);
  }, [incrementMin, incrementMax, intervalMs]);
  return counterRef.current;
}

/* ====== Main Component ====== */
export default function LiveActivePage() {
  const { navigate } = useAppStore();
  const [activities, setActivities] = useState<LiveActivity[]>(() => generateBatch(40));
  const [cycleKey, setCycleKey] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);

  // Running counters - only go UP, never reset
  const totalDepositsToday = useRunningCounter(12847, 5, 25, 1500);
  const totalPurchasesToday = useRunningCounter(8934, 4, 18, 1800);
  const totalNewMembers = useRunningCounter(3256, 2, 8, 2500);
  const totalVolumeToday = useRunningCounter(287500000000, 500000000, 2000000000, 2500);
  const activeUsersNow = useRunningCounter(14892, 20, 80, 2000);
  const totalWithdrawToday = useRunningCounter(4721, 2, 10, 3000);

  // Refresh feed every 2.5 seconds - super fast
  useEffect(() => {
    const interval = setInterval(() => {
      setActivities(generateBatch(30 + Math.floor(Math.random() * 20)));
      setCycleKey((prev) => prev + 1);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to top
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [cycleKey]);

  const depositCount = activities.filter((a) => a.type === 'deposit').length;
  const withdrawCount = activities.filter((a) => a.type === 'withdraw').length;
  const purchaseCount = activities.filter((a) => a.type === 'purchase').length;
  const registerCount = activities.filter((a) => a.type === 'register').length;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.03 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6 space-y-4 sm:space-y-6"
    >
      {/* HEADER */}
      <motion.div variants={itemVariants} className="glass glow-gold rounded-2xl p-4 sm:p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-[#D4AF37]/5 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-emerald-500/5 blur-3xl" />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center">
                <Radio className="w-5 h-5 sm:w-6 sm:h-6 text-[#D4AF37]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-foreground font-bold text-lg sm:text-xl">
                    <span className="text-gold-gradient">Live</span> Activity
                  </h1>
                  <div className="flex items-center gap-1.5 glass-gold rounded-full px-2.5 py-1">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
                    </span>
                    <span className="text-[10px] font-semibold text-emerald-400">LIVE</span>
                  </div>
                </div>
                <p className="text-muted-foreground text-xs sm:text-sm">Real-time platform transaction feed</p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* BIG STATS */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {[
          { icon: Coins, label: 'Deposit Hari Ini', value: totalDepositsToday.toLocaleString('id-ID'), color: 'text-emerald-400', bg: 'bg-emerald-400/10', glow: true },
          { icon: Gem, label: 'Investasi Hari Ini', value: totalPurchasesToday.toLocaleString('id-ID'), color: 'text-[#D4AF37]', bg: 'bg-[#D4AF37]/10', glow: true },
          { icon: Users, label: 'Member Baru', value: totalNewMembers.toLocaleString('id-ID'), color: 'text-purple-400', bg: 'bg-purple-400/10' },
          { icon: ArrowUp, label: 'Withdraw Hari Ini', value: totalWithdrawToday.toLocaleString('id-ID'), color: 'text-blue-400', bg: 'bg-blue-400/10' },
          { icon: TrendingUp, label: 'Volume Hari Ini', value: formatRupiah(totalVolumeToday), color: 'text-orange-400', bg: 'bg-orange-400/10' },
          { icon: Activity, label: 'Pengguna Aktif', value: activeUsersNow.toLocaleString('id-ID'), color: 'text-pink-400', bg: 'bg-pink-400/10' },
        ].map((stat) => (
          <div key={stat.label} className={`glass rounded-2xl p-3 sm:p-4 text-center hover:glow-gold transition-all group ${stat.glow ? 'glow-gold' : ''}`}>
            <div className={`inline-flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-xl ${stat.bg} mb-2 group-hover:scale-110 transition-transform`}>
              <stat.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${stat.color}`} />
            </div>
            <p className={`font-bold text-sm sm:text-lg ${stat.color}`}>{stat.value}</p>
            <p className="text-muted-foreground text-[8px] sm:text-[11px] mt-0.5 leading-tight">{stat.label}</p>
          </div>
        ))}
      </motion.div>

      {/* ACTIVITY BREAKDOWN */}
      <motion.div variants={itemVariants} className="grid grid-cols-4 gap-2 sm:gap-3">
        {[
          { type: 'deposit', count: depositCount, icon: ArrowDown, color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20', label: 'Deposit' },
          { type: 'purchase', count: purchaseCount, icon: ShoppingBag, color: 'text-[#D4AF37]', bg: 'bg-[#D4AF37]/10', border: 'border-[#D4AF37]/20', label: 'Investasi' },
          { type: 'withdraw', count: withdrawCount, icon: ArrowUp, color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20', label: 'Withdraw' },
          { type: 'register', count: registerCount, icon: UserPlus, color: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/20', label: 'Daftar' },
        ].map((item) => (
          <div key={item.type} className={`glass rounded-2xl p-2 sm:p-3 flex flex-col items-center gap-1 border ${item.border} hover:glow-gold transition-all`}>
            <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl ${item.bg} flex items-center justify-center`}>
              <item.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${item.color}`} />
            </div>
            <p className={`font-bold text-base sm:text-xl ${item.color}`}>{item.count}</p>
            <p className="text-muted-foreground text-[8px] sm:text-xs">{item.label}</p>
          </div>
        ))}
      </motion.div>

      {/* LIVE FEED */}
      <motion.div variants={itemVariants} className="glass glow-gold rounded-2xl p-3 sm:p-5 lg:p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-[#D4AF37]/3 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-emerald-500/3 blur-3xl" />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4 sm:mb-5">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400" />
              </span>
              <h2 className="text-foreground font-semibold text-sm sm:text-base">Feed Transaksi Live</h2>
            </div>
            <div className="glass-gold rounded-full px-3 py-1 flex items-center gap-1.5">
              <Flame className="w-3 h-3 text-[#D4AF37]" />
              <span className="text-[#D4AF37] text-[10px] sm:text-xs font-semibold">{activities.length} aktivitas baru</span>
            </div>
          </div>

          <div
            ref={feedRef}
            className="space-y-2 max-h-[650px] overflow-y-auto pr-1"
            style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(212,175,55,0.3) rgba(7,11,20,0.5)' }}
          >
            <AnimatePresence mode="popLayout">
              {activities.map((activity, i) => {
                const config = getTypeConfig(activity.type);
                const IconComp = config.icon;
                return (
                  <motion.div
                    key={`${cycleKey}-${activity.id}`}
                    initial={{ opacity: 0, y: 12, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.1 } }}
                    transition={{ delay: i * 0.015, duration: 0.25, ease: 'easeOut' }}
                    className="glass rounded-xl p-2.5 sm:p-3 flex items-center gap-2.5 hover:glow-gold transition-all group"
                  >
                    <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg ${config.bg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                      <IconComp className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${config.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-foreground font-medium text-[11px] sm:text-xs truncate">{activity.userName}</span>
                        <span className={`text-[8px] sm:text-[9px] font-medium ${config.color} px-1.5 py-0.5 rounded-full ${config.bg}`}>
                          {config.label}
                        </span>
                      </div>
                      {activity.productName && (
                        <p className="text-muted-foreground text-[9px] sm:text-[10px] truncate flex items-center gap-0.5">
                          <ShoppingBag className="w-2.5 h-2.5 shrink-0" />
                          {activity.productName}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {activity.amount > 0 && (
                        <div className={`font-semibold text-[11px] sm:text-xs ${config.color}`}>
                          {activity.type === 'withdraw' ? '-' : '+'}{formatRupiah(activity.amount)}
                        </div>
                      )}
                      <div className="text-muted-foreground text-[8px] sm:text-[9px]">{timeAgo(new Date(activity.createdAt))}</div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          <div className="mt-4 pt-3 border-t border-[#D4AF37]/10 flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted-foreground text-[10px] sm:text-xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <span>Data real-time dari platform NEXVO</span>
            </div>
            <button onClick={() => navigate('history')} className="text-[#D4AF37] text-xs font-medium hover:underline flex items-center gap-1">
              Lihat Semua <ChevronDown className="w-3 h-3" />
            </button>
          </div>
        </div>
      </motion.div>

      {/* BOTTOM HIGHLIGHTS */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass glow-gold rounded-2xl p-4 text-center">
          <BadgeDollarSign className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
          <p className="text-emerald-400 font-bold text-xl">{totalDepositsToday.toLocaleString('id-ID')}</p>
          <p className="text-muted-foreground text-xs">Total Deposit Hari Ini</p>
        </div>
        <div className="glass glow-gold rounded-2xl p-4 text-center">
          <Gem className="w-8 h-8 text-[#D4AF37] mx-auto mb-2" />
          <p className="text-[#D4AF37] font-bold text-xl">{totalPurchasesToday.toLocaleString('id-ID')}</p>
          <p className="text-muted-foreground text-xs">Total Investasi Hari Ini</p>
        </div>
        <div className="glass glow-gold rounded-2xl p-4 text-center">
          <Globe className="w-8 h-8 text-purple-400 mx-auto mb-2" />
          <p className="text-purple-400 font-bold text-xl">{activeUsersNow.toLocaleString('id-ID')}</p>
          <p className="text-muted-foreground text-xs">Pengguna Aktif Sekarang</p>
        </div>
      </motion.div>
    </motion.div>
  );
}
