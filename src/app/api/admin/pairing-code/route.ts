import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, logAdminAction } from '@/lib/auth';
import { getBotConnectionStatus } from '@/lib/bot-auth';

const BOT_PORT = 3040;
const BOT_BASE = `http://localhost:${BOT_PORT}`;

async function proxyToBot(path: string, options: RequestInit = {}) {
  try {
    const res = await fetch(`${BOT_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    return await res.json();
  } catch {
    return { success: false, error: 'Bot service tidak tersedia' };
  }
}

export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const botStatus = await proxyToBot('/');
    const connectionStatus = await getBotConnectionStatus();

    return NextResponse.json({
      success: true,
      data: {
        pairingCode: botStatus.pairingCode || null,
        expiresAt: null,
        isActive: !!(botStatus.pairingCode),
        botConnected: botStatus.status === 'connected' || connectionStatus.connected,
        botNumber: botStatus.phoneNumber || connectionStatus.botNumber,
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

    if (admin.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Only super admin can generate pairing codes' }, { status: 403 });
    }

    const body = await request.json();
    const phoneNumber = body.phoneNumber?.replace(/[^0-9]/g, '');

    if (!phoneNumber) {
      return NextResponse.json({ success: false, error: 'Nomor WhatsApp wajib diisi' }, { status: 400 });
    }

    let fPhone = phoneNumber;
    if (fPhone.startsWith('0')) fPhone = '62' + fPhone.substring(1);
    if (!fPhone.startsWith('62')) fPhone = '62' + fPhone;

    await logAdminAction(admin.id, 'PAIRING_CODE_REQUESTED', `Requesting pairing code for ${fPhone}`);

    const result = await proxyToBot('/api/connect', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: fPhone }),
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        data: {
          pairingCode: result.pairingCode || null,
          phoneNumber: result.phoneNumber || fPhone,
          connected: result.connected || false,
          message: result.connected
            ? 'Bot sudah terkoneksi!'
            : result.pairingCode
              ? 'Kode pairing dari WhatsApp siap. Masukkan kode di HP Anda.'
              : 'Menunggu kode pairing dari WhatsApp...',
        },
      });
    } else {
      return NextResponse.json({ success: false, error: result.error || 'Gagal mendapatkan pairing code' }, { status: 500 });
    }
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

    const result = await proxyToBot('/api/disconnect', { method: 'POST' });

    await logAdminAction(admin.id, 'BOT_DISCONNECTED', 'Bot disconnected from admin panel');

    return NextResponse.json({
      success: true,
      data: { message: 'Bot disconnected, session cleared' },
    });
  } catch (error) {
    console.error('Disconnect bot error:', error);
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}

