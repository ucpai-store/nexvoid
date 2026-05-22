import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

const REAL_PRODUCTS = [
  { name: 'Gold Premium Asset vip 1', price: 100000 },
  { name: 'Gold Premium Asset vip 2', price: 500000 },
  { name: 'Gold Premium Asset vip 3', price: 1000000 },
  { name: 'Gold Premium Asset vip 4', price: 2500000 },
  { name: 'Gold Premium Asset vip 5', price: 5000000 },
  { name: 'Gold Premium Asset vip 6', price: 10000000 },
];

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
  'Muhammad A.', 'Fatimah Z.', 'Abdullah R.', 'Khadijah S.', 'Umar H.',
  'Susanto P.', 'Wibisono E.', 'Harjono K.', 'Mulyono G.', 'Sutanto L.',
  'Gunawan S.', 'Santika R.', 'Rahardjo T.', 'Suharto B.', 'Prabowo I.',
  'Haryanto J.', 'Sulistiowati E.', 'Purnama A.', 'Setiabudi W.', 'Hidayat N.',
  'Mulyadi H.', 'Wahyuni S.', 'Kurniawan T.', 'Astuti D.', 'Budiman G.',
  'Hartono L.', 'Supriyanto F.', 'Suryawati R.', 'Widodo P.', 'Rahmawati K.',
];

const DEPOSIT_AMOUNTS = [
  100000, 200000, 500000, 1000000, 1000000, 2500000, 2500000, 5000000,
  5000000, 10000000, 15000000, 20000000, 25000000, 50000000,
];

const WITHDRAW_AMOUNTS = [
  50000, 100000, 200000, 300000, 500000, 750000, 1000000,
  2000000, 5000000, 10000000,
];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateFakeActivity() {
  const rand = Math.random();
  let type: string;
  let amount = 0;
  let productName: string | null = null;

  if (rand < 0.50) {
    type = 'purchase';
    const product = randomItem(REAL_PRODUCTS);
    amount = product.price;
    productName = product.name;
  } else if (rand < 0.80) {
    type = 'deposit';
    amount = randomItem(DEPOSIT_AMOUNTS);
  } else if (rand < 0.93) {
    type = 'withdraw';
    amount = randomItem(WITHDRAW_AMOUNTS);
  } else {
    type = 'register';
    amount = 0;
  }

  return {
    id: `live-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    userName: randomItem(FAKE_NAMES),
    amount,
    productName,
    isFake: true,
    createdAt: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    // Get real activities from database (most recent first)
    const dbActivities = await db.liveActivity.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Also get product quota info for nav.live display
    const products = await db.product.findMany({
      where: { isActive: true, isStopped: false },
      orderBy: { price: 'asc' },
      select: {
        id: true,
        name: true,
        price: true,
        quota: true,
        quotaUsed: true,
        profitRate: true,
        duration: true,
        estimatedProfit: true,
      },
    });

    // Supplement with generated fake activities if we don't have enough
    let activities = dbActivities;
    if (activities.length < 30) {
      const fakeCount = 30 - activities.length;
      const fakes = Array.from({ length: fakeCount }, () => generateFakeActivity());
      activities = [...activities, ...fakes];
    }

    // Calculate quota percentages for nav.live
    const quotaInfo = products.map(p => ({
      ...p,
      quotaPercent: p.quota > 0 ? Math.round((p.quotaUsed / p.quota) * 100) : 0,
      remaining: Math.max(p.quota - p.quotaUsed, 0),
    }));

    return NextResponse.json({
      success: true,
      data: activities,
      products: quotaInfo,
    });
  } catch (error) {
    console.error('Get live activities error:', error);
    // Return fallback data
    const fallbackActivities = Array.from({ length: 30 }, () => generateFakeActivity());
    return NextResponse.json({ success: true, data: fallbackActivities, products: [] });
  }
}
