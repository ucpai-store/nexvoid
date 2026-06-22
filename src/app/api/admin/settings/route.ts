import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest } from '@/lib/auth';
import { getAllSettings } from '@/lib/settings';

export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }
    const allSettings = await getAllSettings();
    return NextResponse.json({ success: true, data: allSettings });
  } catch (error) {
    console.error('Get admin settings error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const body = await request.json();

    // Support two formats:
    // 1. Single: { key: "deposit_fee", value: "0" }
    // 2. Batch: { deposit_fee: "0", withdraw_fee: "10" }
    const updates = [];

    if (body.key !== undefined && body.value !== undefined) {
      updates.push({ key: String(body.key), value: String(body.value) });
    } else {
      const skipKeys = ['key', 'value'];
      for (const [k, v] of Object.entries(body)) {
        if (!skipKeys.includes(k) && v !== undefined && v !== null) {
          updates.push({ key: k, value: String(v) });
        }
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ success: false, error: 'Key dan value wajib diisi' }, { status: 400 });
    }

    const results = [];
    for (const { key, value } of updates) {
      const setting = await db.systemSettings.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
      results.push(setting);
    }

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error('Update admin settings error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
