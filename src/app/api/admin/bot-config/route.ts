import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest } from '@/lib/auth';

// PUT - Update bot configuration (admin only)
export async function PUT(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const body = await request.json();
    const {
      bot_whatsapp_number,
      bot_admin_number,
      bot_notify_deposit,
      bot_notify_withdraw,
      bot_notify_register,
      bot_custom_api_key,
    } = body;

    // Upsert each setting
    const settingsToUpsert: Array<{ key: string; value: string }> = [];

    if (bot_whatsapp_number !== undefined) {
      settingsToUpsert.push({ key: 'bot_whatsapp_number', value: bot_whatsapp_number });
    }
    if (bot_admin_number !== undefined) {
      settingsToUpsert.push({ key: 'bot_admin_number', value: bot_admin_number });
    }
    if (bot_notify_deposit !== undefined) {
      settingsToUpsert.push({ key: 'bot_notify_deposit', value: String(bot_notify_deposit) });
    }
    if (bot_notify_withdraw !== undefined) {
      settingsToUpsert.push({ key: 'bot_notify_withdraw', value: String(bot_notify_withdraw) });
    }
    if (bot_notify_register !== undefined) {
      settingsToUpsert.push({ key: 'bot_notify_register', value: String(bot_notify_register) });
    }
    if (bot_custom_api_key !== undefined) {
      settingsToUpsert.push({ key: 'bot_custom_api_key', value: bot_custom_api_key });
    }

    // Perform upserts
    for (const setting of settingsToUpsert) {
      await db.systemSettings.upsert({
        where: { key: setting.key },
        update: { value: setting.value },
        create: { key: setting.key, value: setting.value },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        bot_whatsapp_number: bot_whatsapp_number ?? '',
        bot_admin_number: bot_admin_number ?? '',
        bot_notify_deposit: bot_notify_deposit ?? true,
        bot_notify_withdraw: bot_notify_withdraw ?? true,
        bot_notify_register: bot_notify_register ?? true,
        bot_custom_api_key: bot_custom_api_key ?? '',
      },
    });
  } catch (error) {
    console.error('Update bot config error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// GET - Get bot configuration (admin only)
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const settings = await db.systemSettings.findMany({
      where: {
        key: {
          in: [
            'bot_whatsapp_number',
            'bot_admin_number',
            'bot_notify_deposit',
            'bot_notify_withdraw',
            'bot_notify_register',
            'bot_custom_api_key',
          ],
        },
      },
    });

    const map = new Map(settings.map((s) => [s.key, s.value]));

    const getStr = (key: string, def: string): string => map.get(key) ?? def;
    const getBool = (key: string, def: string): boolean => {
      const raw = map.get(key);
      if (raw === undefined) return def === 'true';
      return raw.toLowerCase() === 'true';
    };

    return NextResponse.json({
      success: true,
      data: {
        botWhatsappNumber: getStr('bot_whatsapp_number', ''),
        botAdminNumber: getStr('bot_admin_number', ''),
        botNotifyDeposit: getBool('bot_notify_deposit', 'true'),
        botNotifyWithdraw: getBool('bot_notify_withdraw', 'true'),
        botNotifyRegister: getBool('bot_notify_register', 'true'),
        botCustomApiKey: getStr('bot_custom_api_key', ''),
      },
    });
  } catch (error) {
    console.error('Get bot config error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
