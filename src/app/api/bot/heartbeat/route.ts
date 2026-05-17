import { NextRequest, NextResponse } from 'next/server';
import { authenticateBotRequest, markBotConnected } from '@/lib/bot-auth';

/**
 * POST /api/bot/heartbeat
 * Bot sends periodic heartbeat to indicate it's still connected and alive.
 * Accepts both API Key and admin JWT (from pairing code).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateBotRequest(request);
    if (!auth.authenticated) return auth.error;

    const now = new Date().toISOString();

    // Update heartbeat timestamp
    const { db } = await import('@/lib/db');
    await db.systemSettings.upsert({
      where: { key: 'bot_last_heartbeat' },
      update: { value: now },
      create: { key: 'bot_last_heartbeat', value: now },
    });

    // Also mark as connected (in case status was reset)
    await markBotConnected();

    // Optionally accept botNumber update
    try {
      const body = await request.json();
      if (body.botNumber) {
        await db.systemSettings.upsert({
          where: { key: 'bot_number' },
          update: { value: body.botNumber },
          create: { key: 'bot_number', value: body.botNumber },
        });
      }
    } catch {
      // Body is optional for heartbeat
    }

    return NextResponse.json({
      success: true,
      data: { heartbeat: now, message: 'Heartbeat received' },
    });
  } catch (error) {
    console.error('Bot heartbeat error:', error);
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
