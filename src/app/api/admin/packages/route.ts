import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    // Return ALL packages including inactive ones, ordered by `order` field
    const packages = await db.investmentPackage.findMany({
      orderBy: { order: 'asc' },
    });

    // Compute dailyProfit and totalProfit for each package
    // Formula: dailyProfit = amount × (profitRate / 100)
    // totalProfit = dailyProfit × contractDays
    const packagesWithProfits = packages.map((pkg) => ({
      ...pkg,
      dailyProfit: pkg.amount * (pkg.profitRate / 100),
      totalProfit: pkg.amount * (pkg.profitRate / 100) * pkg.contractDays,
    }));

    return NextResponse.json({ success: true, data: packagesWithProfits });
  } catch (error) {
    console.error('Get admin packages error:', error);
    return NextResponse.json({ success: true, data: [] });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const body = await request.json();
    const { name, amount, profitRate, contractDays, order, isActive } = body;

    if (!name || amount === undefined || amount === null) {
      return NextResponse.json(
        { success: false, error: 'Field wajib: name, amount' },
        { status: 400 }
      );
    }

    const investmentPackage = await db.investmentPackage.create({
      data: {
        name,
        amount: parseFloat(String(amount)),
        profitRate: profitRate !== undefined ? parseFloat(String(profitRate)) : 10,
        contractDays: contractDays !== undefined ? parseInt(String(contractDays)) : 90,
        order: order !== undefined ? parseInt(String(order)) : 0,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      },
    });

    return NextResponse.json({ success: true, data: investmentPackage });
  } catch (error) {
    console.error('Create package error:', error);
    return NextResponse.json(
      { success: false, error: 'Database belum tersedia. Silakan hubungi admin.' },
      { status: 503 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const body = await request.json();
    const { id, name, amount, profitRate, contractDays, order, isActive } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID paket wajib diisi' },
        { status: 400 }
      );
    }

    const existingPackage = await db.investmentPackage.findUnique({ where: { id } });
    if (!existingPackage) {
      return NextResponse.json(
        { success: false, error: 'Paket investasi tidak ditemukan' },
        { status: 404 }
      );
    }

    const data: {
      name?: string;
      amount?: number;
      profitRate?: number;
      contractDays?: number;
      order?: number;
      isActive?: boolean;
    } = {};

    if (name !== undefined) data.name = name;
    if (amount !== undefined) data.amount = parseFloat(String(amount));
    if (profitRate !== undefined) data.profitRate = parseFloat(String(profitRate));
    if (contractDays !== undefined) data.contractDays = parseInt(String(contractDays));
    if (order !== undefined) data.order = parseInt(String(order));
    if (isActive !== undefined) data.isActive = Boolean(isActive);

    const updatedPackage = await db.investmentPackage.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true, data: updatedPackage });
  } catch (error) {
    console.error('Update package error:', error);
    return NextResponse.json(
      { success: false, error: 'Database belum tersedia. Silakan hubungi admin.' },
      { status: 503 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    // Try to get ID from body first, then from searchParams
    let id: string | null = null;
    try {
      const body = await request.json();
      id = body.id || null;
    } catch {
      // Body is not JSON, try searchParams
    }
    if (!id) {
      const { searchParams } = new URL(request.url);
      id = searchParams.get('id');
    }

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID paket wajib diisi' },
        { status: 400 }
      );
    }

    const existingPackage = await db.investmentPackage.findUnique({
      where: { id },
    });

    if (!existingPackage) {
      return NextResponse.json(
        { success: false, error: 'Paket investasi tidak ditemukan' },
        { status: 404 }
      );
    }

    // Admin full control: delete package and all related investments (cascade)
    await db.$transaction(async (tx) => {
      // Delete all investments for this package first
      await tx.investment.deleteMany({
        where: { packageId: id },
      });

      // Now delete the package itself
      await tx.investmentPackage.delete({ where: { id } });
    });

    return NextResponse.json({
      success: true,
      data: { message: 'Paket investasi berhasil dihapus' },
    });
  } catch (error) {
    console.error('Delete package error:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal menghapus paket. Coba lagi.' },
      { status: 500 }
    );
  }
}
