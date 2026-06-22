import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest } from '@/lib/auth';

const BOT_PORT = 3040;
const BOT_BASE = `http://localhost:${BOT_PORT}`;

async function proxyToBot(path: string, options: RequestInit = {}, timeout = 10000) {
  try {
    const res = await fetch(`${BOT_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(timeout),
    });
    return await res.json();
  } catch {
    return { success: false, error: 'Bot service unavailable' };
  }
}

export async function GET(request: NextRequest) {
  const admin = await getAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
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
    case 'qr-image':
      return NextResponse.json(await proxyToBot('/api/qr-image'));
    case 'config':
      return NextResponse.json(await proxyToBot('/api/config'));
    default:
      return NextResponse.json({ success: false, error: 'Invalid action' });
  }
}

export async function POST(request: NextRequest) {
  const admin = await getAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { action } = body;

  switch (action) {
    case 'connect': {
      const result = await proxyToBot('/api/connect', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: body.phoneNumber, mode: body.mode || 'pairing' }),
      }, 60000);
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
          ownerNumber: body.ownerNumber,
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
    case 'broadcast': {
      const result = await proxyToBot('/api/broadcast', {
        method: 'POST',
        body: JSON.stringify({ message: body.message, phones: body.phones }),
      }, 120000);
      return NextResponse.json(result);
    }
    case 'notify': {
      const result = await proxyToBot('/api/notify', {
        method: 'POST',
        body: JSON.stringify({ event: body.event, data: body.data }),
      });
      return NextResponse.json(result);
    }
    default:
      return NextResponse.json({ success: false, error: 'Invalid action' });
  }
}
