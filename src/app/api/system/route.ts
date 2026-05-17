import { NextResponse } from 'next/server';
import { getAllSettings } from '@/lib/settings';

const FALLBACK_SYSTEM_SETTINGS = {
  min_withdraw: '50000',
  withdraw_fee: '10',
  deposit_fee: '500',
  work_start: '08:00',
  work_end: '17:00',
  total_members: '15247',
  total_transactions: '89432',
  uptime: '99.9',
  satisfaction: '98',
};

export async function GET() {
  try {
    const allSettings = await getAllSettings();

    // Only return public settings
    const publicSettings = {
      min_withdraw: allSettings.min_withdraw,
      withdraw_fee: allSettings.withdraw_fee,
      deposit_fee: allSettings.deposit_fee,
      work_start: allSettings.work_start,
      work_end: allSettings.work_end,
      total_members: allSettings.total_members,
      total_transactions: allSettings.total_transactions,
      uptime: allSettings.uptime,
      satisfaction: allSettings.satisfaction,
    };

    return NextResponse.json({ success: true, data: publicSettings });
  } catch (error) {
    console.error('Get system settings error:', error);
    // Return fallback data when database is not available
    return NextResponse.json({ success: true, data: FALLBACK_SYSTEM_SETTINGS });
  }
}
