import { NextRequest, NextResponse } from 'next/server';
import { db } from './db';
import { validateApiKey } from './api-key';
import { verifyToken, getTokenFromRequest } from './auth';

/**
 * Unified bot authentication — accepts EITHER:
 *   1. X-API-Key header (nxv_live_xxx or custom key)  — API key
 *   2. Authorization: Bearer <token>                    — admin JWT from pairing code or admin login
 *
 * Returns { authenticated: true, authType: 'api_key' | 'admin_jwt', adminId?: string }
 * or { authenticated: false, error: NextResponse }
 */
export async function authenticateBotRequest(request: NextRequest): Promise<
  | { authenticated: true; authType: 'api_key' | 'admin_jwt'; adminId?: string }
  | { authenticated: false; error: NextResponse }
> {
  // Try API Key first
  const apiKey = request.headers.get('x-api-key');
  if (apiKey) {
    // 1. Check against hashed API keys in ApiKey table
    const isValid = await validateApiKey(apiKey);
    if (isValid) {
      return { authenticated: true, authType: 'api_key' };
    }

    // 2. Check against custom API key stored in SystemSettings
    const customKeySetting = await db.systemSettings.findUnique({
      where: { key: 'bot_custom_api_key' },
    });
    if (customKeySetting && customKeySetting.value === apiKey) {
      return { authenticated: true, authType: 'api_key' };
    }
    // API key was provided but invalid — try JWT next before rejecting
  }

  // Try admin JWT
  const token = getTokenFromRequest(request);
  if (token) {
    const payload = verifyToken(token);
    if (payload && payload.type === 'admin') {
      // Verify admin still exists in DB
      const admin = await db.admin.findUnique({
        where: { id: payload.userId },
        select: { id: true, role: true },
      });
      if (admin && (admin.role === 'admin' || admin.role === 'super_admin')) {
        return { authenticated: true, authType: 'admin_jwt', adminId: admin.id };
      }
    }
  }

  // Neither auth method worked
  return {
    authenticated: false,
    error: NextResponse.json(
      {
        success: false,
        error: 'Authentication required. Provide X-API-Key header or Authorization: Bearer <admin_token>',
      },
      { status: 401 }
    ),
  };
}

/**
 * Get bot connection status from SystemSettings
 */
export async function getBotConnectionStatus(): Promise<{
  connected: boolean;
  botNumber: string | null;
  adminNumber: string | null;
  lastHeartbeat: string | null;
  pairedAt: string | null;
}> {
  const keys = ['bot_connected', 'bot_number', 'bot_admin_number', 'bot_last_heartbeat', 'bot_paired_at'];
  const settings = await db.systemSettings.findMany({
    where: { key: { in: keys } },
  });

  const get = (key: string) => settings.find((s) => s.key === key)?.value || null;

  const lastHeartbeat = get('bot_last_heartbeat');
  const isConnected = get('bot_connected') === 'true';

  // If no heartbeat in 5 minutes, consider disconnected
  let connected = isConnected;
  if (connected && lastHeartbeat) {
    const lastHb = new Date(lastHeartbeat);
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (lastHb < fiveMinAgo) {
      connected = false;
    }
  }

  return {
    connected,
    botNumber: get('bot_number'),
    adminNumber: get('bot_admin_number'),
    lastHeartbeat,
    pairedAt: get('bot_paired_at'),
  };
}

/**
 * Mark bot as connected
 */
export async function markBotConnected(botNumber?: string): Promise<void> {
  const now = new Date().toISOString();
  const updates: Promise<unknown>[] = [];

  updates.push(
    db.systemSettings.upsert({
      where: { key: 'bot_connected' },
      update: { value: 'true' },
      create: { key: 'bot_connected', value: 'true' },
    })
  );

  updates.push(
    db.systemSettings.upsert({
      where: { key: 'bot_last_heartbeat' },
      update: { value: now },
      create: { key: 'bot_last_heartbeat', value: now },
    })
  );

  if (botNumber) {
    updates.push(
      db.systemSettings.upsert({
        where: { key: 'bot_number' },
        update: { value: botNumber },
        create: { key: 'bot_number', value: botNumber },
      })
    );
  }

  // Set paired_at only if not already set
  const existing = await db.systemSettings.findUnique({ where: { key: 'bot_paired_at' } });
  if (!existing) {
    updates.push(
      db.systemSettings.create({
        data: { key: 'bot_paired_at', value: now },
      })
    );
  }

  await Promise.all(updates);
}

/**
 * Mark bot as disconnected
 */
export async function markBotDisconnected(): Promise<void> {
  await db.systemSettings.upsert({
    where: { key: 'bot_connected' },
    update: { value: 'false' },
    create: { key: 'bot_connected', value: 'false' },
  });
}
