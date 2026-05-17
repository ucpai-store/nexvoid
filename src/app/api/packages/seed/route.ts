import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest } from '@/lib/auth';

const DEFAULT_PACKAGES = [
  { name: 'Paket 100K', amount: 100000, profitRate: 10, contractDays: 90, order: 1 },
  { name: 'Paket 500K', amount: 500000, profitRate: 10, contractDays: 90, order: 2 },
  { name: 'Paket 1JT', amount: 1000000, profitRate: 10, contractDays: 90, order: 3 },
  { name: 'Paket 2.5JT', amount: 2500000, profitRate: 10, contractDays: 90, order: 4 },
  { name: 'Paket 5JT', amount: 5000000, profitRate: 10, contractDays: 90, order: 5 },
  { name: 'Paket 10JT', amount: 10000000, profitRate: 10, contractDays: 90, order: 6 },
];

// POST: Seed default packages (admin only)
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Akses ditolak. Hanya admin yang dapat seed paket.' },
        { status: 403 }
      );
    }

    // Check if packages already exist
    const existingCount = await db.investmentPackage.count();

    if (existingCount > 0) {
      return NextResponse.json({
        success: false,
        error: `Paket sudah ada (${existingCount} paket). Hapus paket yang ada terlebih dahulu jika ingin re-seed.`,
      }, { status: 400 });
    }

    // Create all default packages
    const packages = await db.$transaction(
      DEFAULT_PACKAGES.map((pkg) =>
        db.investmentPackage.create({
          data: {
            name: pkg.name,
            amount: pkg.amount,
            profitRate: pkg.profitRate,
            contractDays: pkg.contractDays,
            order: pkg.order,
            isActive: true,
          },
        })
      )
    );

    return NextResponse.json({
      success: true,
      data: packages,
      message: `${packages.length} paket investasi berhasil ditambahkan`,
    }, { status: 201 });
  } catch (error) {
    console.error('Seed packages error:', error);
    return NextResponse.json(
      { success: false, error: 'Terjadi kesalahan server' },
      { status: 500 }
    );
  }
}
