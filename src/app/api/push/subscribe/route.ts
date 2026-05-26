import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();
    const { userId, userType, subscription } = body;

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ success: false, error: 'Invalid subscription data' }, { status: 400 });
    }

    // Determine user type from JWT token type and body
    const effectiveUserType = userType || payload.type;
    const effectiveUserId = userId || payload.userId;

    // Verify the authenticated user matches (or is admin)
    if (payload.type === 'user' && effectiveUserId !== payload.userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    // Admin can register their own subscription
    if (payload.type === 'admin' && effectiveUserType === 'admin') {
      // Admin registering their own push subscription - allowed
    }

    // Check if subscription already exists (by endpoint)
    const existing = await db.pushSubscription.findFirst({
      where: { endpoint: subscription.endpoint },
    });

    if (existing) {
      // Update existing subscription
      await db.pushSubscription.update({
        where: { id: existing.id },
        data: {
          userId: effectiveUserId,
          userType: effectiveUserType,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          userAgent: request.headers.get('user-agent') || '',
        },
      });
      console.log(`[Push] Subscription updated for ${effectiveUserType} ${effectiveUserId}`);
      return NextResponse.json({ success: true, message: 'Subscription updated' });
    }

    // Create new subscription
    await db.pushSubscription.create({
      data: {
        userId: effectiveUserId,
        userType: effectiveUserType,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: request.headers.get('user-agent') || '',
      },
    });

    console.log(`[Push] New subscription registered for ${effectiveUserType} ${effectiveUserId}`);
    return NextResponse.json({ success: true, message: 'Subscription registered' });
  } catch (error) {
    console.error('Push subscribe error:', error);
    return NextResponse.json({ success: false, error: 'Failed to register subscription' }, { status: 500 });
  }
}

