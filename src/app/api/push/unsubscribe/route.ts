import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { endpoint } = body;

    if (!endpoint) {
      return NextResponse.json({ success: false, error: 'Endpoint is required' }, { status: 400 });
    }

    const subscription = await db.pushSubscription.findFirst({
      where: { endpoint },
    });

    if (subscription) {
      await db.pushSubscription.delete({
        where: { id: subscription.id },
      });
      console.log(`[Push] Subscription removed for endpoint ${endpoint.substring(0, 50)}...`);
    }

    return NextResponse.json({ success: true, message: 'Subscription removed' });
  } catch (error) {
    console.error('Push unsubscribe error:', error);
    return NextResponse.json({ success: false, error: 'Failed to remove subscription' }, { status: 500 });
  }
}

