import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest } from '@/lib/auth';

const FALLBACK_PACKAGES = [
  { id: '1', name: 'Paket 100K', amount: 100000, profitRate: 10, contractDays: 90, isActive: true, order: 1, totalInvestments: 0, dailyProfit: 10000, totalProfit: 900000 },
  { id: '2', name: 'Paket 500K', amount: 500000, profitRate: 10, contractDays: 90, isActive: true, order: 2, totalInvestments: 0, dailyProfit: 50000, totalProfit: 4500000 },
  { id: '3', name: 'Paket 1JT', amount: 1000000, profitRate: 10, contractDays: 90, isActive: true, order: 3, totalInvestments: 0, dailyProfit: 100000, totalProfit: 9000000 },
  { id: '4', name: 'Paket 2.5JT', amount: 2500000, profitRate: 10, contractDays: 90, isActive: true, order: 4, totalInvestments: 0, dailyProfit: 250000, totalProfit: 22500000 },
  { id: '5', name: 'Paket 5JT', amount: 5000000, profitRate: 10, contractDays: 90, isActive: true, order: 5, totalInvestments: 0, dailyProfit: 500000, totalProfit: 45000000 },
  { id: '6', name: 'Paket 10JT', amount: 10000000, profitRate: 10, contractDays: 90, isActive: true, order: 6, totalInvestments: 0, dailyProfit: 1000000, totalProfit: 90000000 },
];

// GET: List all active packages (ordered by amount ascending: 100K → 500K → 1JT → 2.5JT → 5JT → 10JT)
export async function GET() {
  try {
    const packages_ = await db.investmentPackage.findMany({
      where: { isActive: true },
      orderBy: { amount: 'asc' },
      include: {
        _count: {
          select: { investments: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: packages_.map((pkg) => ({
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
      })),
    });
  } catch (error) {
    console.error('Get packages error:', error);
    // Return fallback data when database is not available
    return NextResponse.json({ success: true, data: FALLBACK_PACKAGES });
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
