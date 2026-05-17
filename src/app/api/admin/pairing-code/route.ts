import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest, logAdminAction } from '@/lib/auth';
import { getBotConnectionStatus } from '@/lib/bot-auth';
import crypto from 'crypto';

/**
 * GET  — Retrieve current pairing code status + bot connection status
 * POST — Generate a new pairing code
 * DELETE — Revoke the current pairing code
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const adminData = await db.admin.findUnique({
      where: { id: admin.id },
      select: { pairingCode: true, pairingCodeExpiry: true },
    });

    const isActive = adminData?.pairingCode &&
      adminData?.pairingCodeExpiry &&
      new Date() < adminData.pairingCodeExpiry;

    // Also get bot connection status
    const connectionStatus = await getBotConnectionStatus();

    return NextResponse.json({
      success: true,
      data: {
        pairingCode: isActive ? adminData!.pairingCode : null,
        expiresAt: isActive ? adminData!.pairingCodeExpiry : null,
        isActive: !!isActive,
        botConnected: connectionStatus.connected,
        botNumber: connectionStatus.botNumber,
        adminNumber: connectionStatus.adminNumber,
        lastHeartbeat: connectionStatus.lastHeartbeat,
        pairedAt: connectionStatus.pairedAt,
      },
    });
  } catch (error) {
    console.error('Get pairing code error:', error);
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Check role - only super_admin can generate pairing codes
    if (admin.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Only super admin can generate pairing codes' }, { status: 403 });
    }

    // Generate a 8-character alphanumeric pairing code
    const pairingCode = crypto.randomBytes(4).toString('hex').toUpperCase();
    // Expires in 24 hours
    const pairingCodeExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.admin.update({
      where: { id: admin.id },
      data: { pairingCode, pairingCodeExpiry },
    });

    await logAdminAction(admin.id, 'PAIRING_CODE_GENERATED', 'New pairing code generated');

    return NextResponse.json({
      success: true,
      data: {
        pairingCode,
        expiresAt: pairingCodeExpiry,
        message: 'Pairing code generated. Bot can use this code to connect.',
      },
    });
  } catch (error) {
    console.error('Generate pairing code error:', error);
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    await db.admin.update({
      where: { id: admin.id },
      data: { pairingCode: null, pairingCodeExpiry: null },
    });

    await logAdminAction(admin.id, 'PAIRING_CODE_REVOKED', 'Pairing code revoked');

    return NextResponse.json({
      success: true,
      data: { message: 'Pairing code revoked successfully' },
    });
  } catch (error) {
    console.error('Revoke pairing code error:', error);
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
