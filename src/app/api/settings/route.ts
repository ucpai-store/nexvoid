import { NextResponse } from 'next/server';
import { getAllSettings } from '@/lib/settings';

export async function GET() {
  try {
    const allSettings = await getAllSettings();
    const publicSettings = {
      deposit_fee: allSettings.deposit_fee || '0',
      min_withdraw: allSettings.min_withdraw || '50000',
      withdraw_fee: allSettings.withdraw_fee || '10',
      work_start: allSettings.work_start || '09:00',
      work_end: allSettings.work_end || '16:00',
    };
    return NextResponse.json({ success: true, data: publicSettings });
  } catch (error) {
    console.error('Get public settings error:', error);
    return NextResponse.json({
      success: true,
      data: { deposit_fee: '0', min_withdraw: '50000', withdraw_fee: '10', work_start: '09:00', work_end: '16:00' },
    });
  }
}
