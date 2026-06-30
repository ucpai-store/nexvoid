import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest } from '@/lib/auth';

// FALLBACK = Gold Premium Aset 1-6 (sama dengan seed-all.js / restore-products.sh / deploy.sh)
// Kontrak 180 hari, modal TIDAK dikembalikan, profit harian dikredit cron 00:00 WIB.
const CONTRACT_DAYS = 180;
const FALLBACK_PACKAGES = [
  { id: 'fb-1', name: 'Gold Premium Aset 1', amount: 160000,    profitRate: 2,   contractDays: CONTRACT_DAYS, isActive: true, order: 1, totalInvestments: 0, dailyProfit: 3200,    totalProfit: 576000 },
  { id: 'fb-2', name: 'Gold Premium Aset 2', amount: 320000,    profitRate: 2.5, contractDays: CONTRACT_DAYS, isActive: true, order: 2, totalInvestments: 0, dailyProfit: 8000,    totalProfit: 1440000 },
  { id: 'fb-3', name: 'Gold Premium Aset 3', amount: 640000,    profitRate: 3,   contractDays: CONTRACT_DAYS, isActive: true, order: 3, totalInvestments: 0, dailyProfit: 19200,   totalProfit: 3456000 },
  { id: 'fb-4', name: 'Gold Premium Aset 4', amount: 1920000,   profitRate: 3.5, contractDays: CONTRACT_DAYS, isActive: true, order: 4, totalInvestments: 0, dailyProfit: 67200,   totalProfit: 12096000 },
  { id: 'fb-5', name: 'Gold Premium Aset 5', amount: 5760000,   profitRate: 4,   contractDays: CONTRACT_DAYS, isActive: true, order: 5, totalInvestments: 0, dailyProfit: 230400,  totalProfit: 41472000 },
  { id: 'fb-6', name: 'Gold Premium Aset 6', amount: 17280000,  profitRate: 5,   contractDays: CONTRACT_DAYS, isActive: true, order: 6, totalInvestments: 0, dailyProfit: 864000,  totalProfit: 155520000 },
];

// GET: List ALL packages (including isActive=false) — V16 fix (mirror V14 products).
//   Sebelumnya filter `isActive: true` → paket 4/5/6 yang admin set inactive
//   TIDAK muncul di web user. User complaint "kok gak muncul".
//   Sekarang: semua paket tampil, UI yang tentukan bisa beli atau tidak
//   berdasarkan field `isAvailable` (computed = isActive).
export async function GET() {
  try {
    const packages_ = await db.investmentPackage.findMany({
      orderBy: { amount: 'asc' },
      include: {
        _count: {
          select: { investments: true },
        },
      },
    });

    // ★ v16: Tambah isAvailable + availabilityReason (mirror V14 products)
    //   InvestmentPackage cuma punya isActive (gak ada isStopped/quota).
    //   Jadi isAvailable = isActive saja.
    const packagesWithAvailability = packages_.map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      amount: pkg.amount,
      profitRate: pkg.profitRate,
      contractDays: pkg.contractDays,
      isActive: pkg.isActive,
      order: pkg.order,
      totalInvestments: pkg._count.investments,
      dailyProfit: pkg.amount * (pkg.profitRate / 100),
      totalProfit: pkg.amount * (pkg.profitRate / 100) * pkg.contractDays,
      isAvailable: pkg.isActive,
      availabilityReason: !pkg.isActive ? 'tidak-tersedia' : null,
    }));

    return NextResponse.json({
      success: true,
      data: packagesWithAvailability,
    });
  } catch (error) {
    console.error('Get packages error:', error);
    // Return fallback data when database is not available
    const fallbackWithAvailability = FALLBACK_PACKAGES.map((p) => ({
      ...p,
      isAvailable: p.isActive,
      availabilityReason: null,
    }));
    return NextResponse.json({ success: true, data: fallbackWithAvailability });
  }
}

// POST: Seed default packages (admin only)
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Akses ditolak. Hanya admin yang dapat menambah paket.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, amount, profitRate, contractDays, order } = body;

    if (!name || !amount || amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Nama dan jumlah paket wajib diisi' },
        { status: 400 }
      );
    }

    const pkg = await db.investmentPackage.create({
      data: {
        name,
        amount,
        profitRate: profitRate || 10,
        contractDays: contractDays || 90,
        order: order || 0,
        isActive: true,
      },
    });

    return NextResponse.json({ success: true, data: pkg }, { status: 201 });
  } catch (error) {
    console.error('Create package error:', error);
    return NextResponse.json(
      { success: false, error: 'Database belum tersedia. Silakan hubungi admin.' },
      { status: 503 }
    );
  }
}
