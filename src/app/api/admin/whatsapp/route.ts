import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest } from '@/lib/auth';

const BOT_PORT = 3040;
const BOT_BASE = `http://localhost:${BOT_PORT}`;

async function proxyToBot(path: string, options: RequestInit = {}) {
  try {
    const res = await fetch(`${BOT_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    return await res.json();
  } catch {
    return { success: false, error: 'Bot service tidak tersedia' };
  }
}

export async function GET(request: NextRequest) {
  const admin = await getAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'status';

  switch (action) {
    case 'status':
      return NextResponse.json(await proxyToBot('/'));
    case 'pairing-code':
      return NextResponse.json(await proxyToBot('/api/pairing-code'));
    case 'qr':
      return NextResponse.json(await proxyToBot('/api/qr'));
    case 'config':
      return NextResponse.json(await proxyToBot('/api/config'));
    default:
      return NextResponse.json({ success: false, error: 'Action tidak valid' });
  }
}

export async function POST(request: NextRequest) {
  const admin = await getAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
  }

  const body = await request.json();
  const { action } = body;

  switch (action) {
    case 'connect': {
      const result = await proxyToBot('/api/connect', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: body.phoneNumber }),
      });
      return NextResponse.json(result);
    }
    case 'disconnect': {
      const result = await proxyToBot('/api/disconnect', { method: 'POST' });
      return NextResponse.json(result);
    }
    case 'config': {
      const result = await proxyToBot('/api/config', {
        method: 'POST',
        body: JSON.stringify({
          autoReply: body.autoReply,
          onlyRegistered: body.onlyRegistered,
          welcomeMessage: body.welcomeMessage,
          menuHeader: body.menuHeader,
          menuFooter: body.menuFooter,
        }),
      });
      return NextResponse.json(result);
    }
    case 'send': {
      const result = await proxyToBot('/api/send', {
        method: 'POST',
        body: JSON.stringify({ phone: body.phone, message: body.message }),
      });
      return NextResponse.json(result);
    }
    default:
      return NextResponse.json({ success: false, error: 'Action tidak valid' });
  }
}
