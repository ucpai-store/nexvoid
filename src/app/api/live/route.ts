import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

function getFallbackActivities() {
  const now = new Date().toISOString();
  return [
    { id: '1', type: 'deposit', userName: 'Ahmad R.', amount: 500000, productName: null, isFake: true, createdAt: now },
    { id: '2', type: 'purchase', userName: 'Siti N.', amount: 1000000, productName: 'Gold Premium Asset', isFake: true, createdAt: now },
    { id: '3', type: 'withdraw', userName: 'Budi S.', amount: 150000, productName: null, isFake: true, createdAt: now },
    { id: '4', type: 'deposit', userName: 'Dewi L.', amount: 2500000, productName: null, isFake: true, createdAt: now },
    { id: '5', type: 'purchase', userName: 'Fajar P.', amount: 5000000, productName: 'Diamond Elite Investment', isFake: true, createdAt: now },
  ];
}

export async function GET() {
  try {
    const activities = await db.liveActivity.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({ success: true, data: activities });
  } catch (error) {
    console.error('Get live activities error:', error);
    // Return fallback data when database is not available
    return NextResponse.json({ success: true, data: getFallbackActivities() });
  }
}
