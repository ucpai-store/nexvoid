import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const settings = await db.systemSettings.findMany({
      where: {
        key: { in: ['site_logo', 'site_favicon', 'site_name', 'deposit_fee', 'min_withdraw', 'withdraw_fee'] },
      },
    });

    const data: Record<string, string> = {};
    for (const s of settings) {
      data[s.key] = s.value;
    }

    // Provide defaults
    if (!data.deposit_fee) data.deposit_fee = '500';
    if (!data.site_logo) data.site_logo = '/api/files/nexvo-logo.png';
    if (!data.site_favicon) data.site_favicon = data.site_logo || '/api/files/nexvo-logo.png';

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Get site settings error:', error);
    return NextResponse.json({
      success: true,
      data: {
        site_logo: '/api/files/nexvo-logo.png',
        site_name: 'NEXVO',
        deposit_fee: '500',
      },
    });
  }
}
