import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateBotRequest } from '@/lib/bot-auth';

const CONFIG_KEYS = [
  'bot_whatsapp_number',
  'bot_admin_number',
  'bot_notify_deposit',
  'bot_notify_withdraw',
  'bot_notify_register',
] as const;

const CONFIG_DEFAULTS: Record<string, string> = {
  bot_whatsapp_number: '',
  bot_admin_number: '',
  bot_notify_deposit: 'true',
  bot_notify_withdraw: 'true',
  bot_notify_register: 'true',
};

// GET - Get bot configuration
export async function GET(request: NextRequest) {
  try {
    // Authenticate (API Key or admin JWT from pairing code)
    const auth = await authenticateBotRequest(request);
    if (!auth.authenticated) return auth.error;

    // Read all bot config settings
    const settings = await db.systemSettings.findMany({
      where: {
        key: { in: [...CONFIG_KEYS] },
      },
    });

    // Build config object with defaults
    const config: Record<string, string> = {};
    for (const key of CONFIG_KEYS) {
      const setting = settings.find((s) => s.key === key);
      config[key] = setting ? setting.value : CONFIG_DEFAULTS[key] || '';
    }

    return NextResponse.json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error('Get bot config error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update bot configuration
export async function PUT(request: NextRequest) {
  try {
    // Authenticate (API Key or admin JWT from pairing code)
    const auth = await authenticateBotRequest(request);
    if (!auth.authenticated) return auth.error;

    const body = await request.json();

    // Upsert each provided setting
    const upsertPromises: Promise<unknown>[] = [];

    for (const key of CONFIG_KEYS) {
      if (body[key] !== undefined) {
        const value = String(body[key]);
        upsertPromises.push(
          db.systemSettings.upsert({
            where: { key },
            update: { value },
            create: { key, value },
          })
        );
      }
    }

    if (upsertPromises.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid config fields provided' },
        { status: 400 }
      );
    }

    await Promise.all(upsertPromises);

    // Return updated config
    const settings = await db.systemSettings.findMany({
      where: {
        key: { in: [...CONFIG_KEYS] },
      },
    });

    const config: Record<string, string> = {};
    for (const key of CONFIG_KEYS) {
      const setting = settings.find((s) => s.key === key);
      config[key] = setting ? setting.value : CONFIG_DEFAULTS[key] || '';
    }

    return NextResponse.json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error('Update bot config error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
