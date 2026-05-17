import { NextRequest, NextResponse } from 'next/server';
import { authenticateBotRequest, markBotDisconnected } from '@/lib/bot-auth';
import { logAdminAction } from '@/lib/auth';

/**
 * POST /api/bot/disconnect
 * Bot calls this when it's shutting down or disconnecting.
 * Accepts both API Key and admin JWT (from pairing code).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateBotRequest(request);
    if (!auth.authenticated) return auth.error;

    await markBotDisconnected();

    // Log the disconnect
    if (auth.authenticated && auth.authType === 'admin_jwt' && auth.adminId) {
      await logAdminAction(auth.adminId, 'BOT_DISCONNECTED', 'Bot disconnected gracefully');
    }

    return NextResponse.json({
      success: true,
      data: { message: 'Bot disconnected successfully' },
    });
  } catch (error) {
    console.error('Bot disconnect error:', error);
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
