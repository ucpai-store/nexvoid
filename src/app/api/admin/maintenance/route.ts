import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest, logAdminAction } from '@/lib/auth';

/**
 * Maintenance Mode API
 * =====================
 * GET  — check current maintenance status (admin only)
 *   Returns: { success, data: { enabled: boolean, message: string, updatedAt?: string } }
 *
 * POST — toggle maintenance mode / update message (admin only)
 *   Body: { enabled?: boolean, message?: string }
 *   - If `enabled` provided → toggles maintenance on/off
 *   - If `message` provided → updates the message shown to users
 *   - Both can be set in one request
 *
 * Maintenance state is stored in SystemSettings:
 *   - maintenance_mode: 'true' | 'false'
 *   - maintenance_message: <custom user-facing message>
 *
 * Public reads maintenance state via /api/site-settings (no auth needed).
 */

const DEFAULT_MESSAGE =
  'Situs sedang dalam perbaikan. Semua data Anda aman. Silakan kembali beberapa saat lagi.';

export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Tidak terautentikasi' },
        { status: 401 }
      );
    }

    const modeSetting = await db.systemSettings.findUnique({
      where: { key: 'maintenance_mode' },
    });
    const msgSetting = await db.systemSettings.findUnique({
      where: { key: 'maintenance_message' },
    });

    return NextResponse.json({
      success: true,
      data: {
        enabled: modeSetting?.value === 'true',
        message: msgSetting?.value || DEFAULT_MESSAGE,
        updatedAt: modeSetting?.updatedAt?.toISOString() || null,
      },
    });
  } catch (error) {
    console.error('Get maintenance status error:', error);
    return NextResponse.json(
      { success: false, error: 'Terjadi kesalahan server' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Tidak terautentikasi' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { enabled, message } = body as {
      enabled?: boolean;
      message?: string;
    };

    // Nothing to update
    if (enabled === undefined && message === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: 'Berikan field `enabled` atau `message` untuk update',
        },
        { status: 400 }
      );
    }

    const updates: { key: string; value: string }[] = [];

    if (enabled !== undefined) {
      updates.push({
        key: 'maintenance_mode',
        value: enabled ? 'true' : 'false',
      });
    }

    if (message !== undefined) {
      const trimmed = String(message).trim();
      // Allow empty message → fallback to default so users always see something
      updates.push({
        key: 'maintenance_message',
        value: trimmed || DEFAULT_MESSAGE,
      });
    }

    for (const { key, value } of updates) {
      await db.systemSettings.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }

    // Re-read final state
    const modeSetting = await db.systemSettings.findUnique({
      where: { key: 'maintenance_mode' },
    });
    const msgSetting = await db.systemSettings.findUnique({
      where: { key: 'maintenance_message' },
    });

    const finalEnabled = modeSetting?.value === 'true';
    const finalMessage = msgSetting?.value || DEFAULT_MESSAGE;

    await logAdminAction(
      admin.id,
      'TOGGLE_MAINTENANCE',
      `Maintenance mode ${finalEnabled ? 'DIAKTIFKAN' : 'dinonaktifkan'}. Pesan: "${finalMessage.slice(0, 120)}"`
    );

    return NextResponse.json({
      success: true,
      data: {
        enabled: finalEnabled,
        message: finalMessage,
      },
    });
  } catch (error) {
    console.error('Update maintenance status error:', error);
    return NextResponse.json(
      { success: false, error: 'Terjadi kesalahan server' },
      { status: 500 }
    );
  }
}
