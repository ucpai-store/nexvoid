import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest, logAdminAction } from '@/lib/auth';

// GET: Return current SalaryConfig
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Tidak terautentikasi' },
        { status: 401 }
      );
    }

    let config = await db.salaryConfig.findFirst();

    // Create default config if none exists
    if (!config) {
      config = await db.salaryConfig.create({
        data: {
          minDirectRefs: 0,
          salaryRate: 2.5,
          maxWeeks: 12,
          requireActiveDeposit: true,
          isActive: true,
        },
      });
    }

    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error('Get salary config error:', error);
    return NextResponse.json(
      { success: false, error: 'Terjadi kesalahan server' },
      { status: 500 }
    );
  }
}

// PUT: Update SalaryConfig (admin only)
export async function PUT(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Tidak terautentikasi' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { minDirectRefs, salaryRate, maxWeeks, requireActiveDeposit, isActive } = body;

    // Validate inputs
    if (minDirectRefs !== undefined && (typeof minDirectRefs !== 'number' || minDirectRefs < 0)) {
      return NextResponse.json(
        { success: false, error: 'Minimal referral langsung harus berupa angka positif' },
        { status: 400 }
      );
    }

    if (salaryRate !== undefined && (typeof salaryRate !== 'number' || salaryRate < 0 || salaryRate > 100)) {
      return NextResponse.json(
        { success: false, error: 'Rate gaji harus antara 0-100%' },
        { status: 400 }
      );
    }

    if (maxWeeks !== undefined && (typeof maxWeeks !== 'number' || maxWeeks < 1 || maxWeeks > 52)) {
      return NextResponse.json(
        { success: false, error: 'Maksimal minggu harus antara 1-52' },
        { status: 400 }
      );
    }

    // Get or create config
    let config = await db.salaryConfig.findFirst();

    const updateData: {
      minDirectRefs?: number;
      salaryRate?: number;
      maxWeeks?: number;
      requireActiveDeposit?: boolean;
      isActive?: boolean;
    } = {};

    if (minDirectRefs !== undefined) updateData.minDirectRefs = minDirectRefs;
    if (salaryRate !== undefined) updateData.salaryRate = salaryRate;
    if (maxWeeks !== undefined) updateData.maxWeeks = maxWeeks;
    if (requireActiveDeposit !== undefined) updateData.requireActiveDeposit = requireActiveDeposit;
    if (isActive !== undefined) updateData.isActive = isActive;

    if (config) {
      config = await db.salaryConfig.update({
        where: { id: config.id },
        data: updateData,
      });
    } else {
      config = await db.salaryConfig.create({
        data: {
          minDirectRefs: minDirectRefs ?? 0,
          salaryRate: salaryRate ?? 2.5,
          maxWeeks: maxWeeks ?? 12,
          requireActiveDeposit: requireActiveDeposit ?? true,
          isActive: isActive ?? true,
        },
      });
    }

    // Log admin action
    await logAdminAction(
      admin.id,
      'UPDATE_SALARY_CONFIG',
      `Update konfigurasi gaji: minRef=${config.minDirectRefs}, rate=${config.salaryRate}%, maxWeeks=${config.maxWeeks}, requireActiveDeposit=${config.requireActiveDeposit}, active=${config.isActive}`
    );

    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error('Update salary config error:', error);
    return NextResponse.json(
      { success: false, error: 'Terjadi kesalahan server' },
      { status: 500 }
    );
  }
}

