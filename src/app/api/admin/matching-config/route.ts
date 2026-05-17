import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest, logAdminAction } from '@/lib/auth';

// GET: Return current MatchingConfig
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Tidak terautentikasi' },
        { status: 401 }
      );
    }

    let config = await db.matchingConfig.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    });

    // If no config exists, create default one
    if (!config) {
      config = await db.matchingConfig.create({
        data: {
          level1: 5,
          level2: 4,
          level3: 3,
          level4: 2,
          level5: 1,
          isActive: true,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: config.id,
        level1: config.level1,
        level2: config.level2,
        level3: config.level3,
        level4: config.level4,
        level5: config.level5,
        isActive: config.isActive,
        updatedAt: config.updatedAt,
      },
    });
  } catch (error) {
    console.error('Get matching config error:', error);
    return NextResponse.json(
      { success: false, error: 'Terjadi kesalahan server' },
      { status: 500 }
    );
  }
}

// PUT: Update MatchingConfig (admin only)
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
    const { level1, level2, level3, level4, level5, isActive } = body;

    // Validate rates
    const rates = { level1, level2, level3, level4, level5 };
    for (const [key, value] of Object.entries(rates)) {
      if (value !== undefined && value !== null) {
        const numValue = Number(value);
        if (isNaN(numValue) || numValue < 0 || numValue > 100) {
          return NextResponse.json(
            { success: false, error: `Rate ${key} harus antara 0-100%` },
            { status: 400 }
          );
        }
      }
    }

    // Find existing config or create one
    let config = await db.matchingConfig.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    });

    const updateData: {
      level1?: number;
      level2?: number;
      level3?: number;
      level4?: number;
      level5?: number;
      isActive?: boolean;
    } = {};

    if (level1 !== undefined && level1 !== null) updateData.level1 = Number(level1);
    if (level2 !== undefined && level2 !== null) updateData.level2 = Number(level2);
    if (level3 !== undefined && level3 !== null) updateData.level3 = Number(level3);
    if (level4 !== undefined && level4 !== null) updateData.level4 = Number(level4);
    if (level5 !== undefined && level5 !== null) updateData.level5 = Number(level5);
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    if (config) {
      config = await db.matchingConfig.update({
        where: { id: config.id },
        data: updateData,
      });
    } else {
      config = await db.matchingConfig.create({
        data: {
          level1: updateData.level1 ?? 5,
          level2: updateData.level2 ?? 4,
          level3: updateData.level3 ?? 3,
          level4: updateData.level4 ?? 2,
          level5: updateData.level5 ?? 1,
          isActive: updateData.isActive ?? true,
        },
      });
    }

    // Log admin action
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
    await logAdminAction(
      admin.id,
      'update_matching_config',
      `Update konfigurasi matching bonus: L1=${config.level1}%, L2=${config.level2}%, L3=${config.level3}%, L4=${config.level4}%, L5=${config.level5}%`,
      ip
    );

    return NextResponse.json({
      success: true,
      data: {
        id: config.id,
        level1: config.level1,
        level2: config.level2,
        level3: config.level3,
        level4: config.level4,
        level5: config.level5,
        isActive: config.isActive,
        updatedAt: config.updatedAt,
      },
    });
  } catch (error) {
    console.error('Update matching config error:', error);
    return NextResponse.json(
      { success: false, error: 'Terjadi kesalahan server' },
      { status: 500 }
    );
  }
}
