import { NextRequest, NextResponse } from 'next/server';
import { sendPushNotification, sendPushToAdmins } from '@/lib/push-notification';
import { getAdminFromRequest } from '@/lib/auth';

// POST /api/push/test - Send a test push notification
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Admin authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { target, userId, userType } = body;

    let result;

    if (target === 'admins') {
      // Send test notification to all admins
      result = await sendPushToAdmins(
        "🔔 Test Notifikasi",
        `Ini adalah test notifikasi dari admin ${admin.name || admin.username} pada ${new Date().toLocaleString("id-ID")}`,
        { type: "test", timestamp: Date.now() }
      );
    } else if (target === 'user' && userId) {
      // Send test notification to specific user
      result = await sendPushNotification(
        userId,
        userType || 'user',
        "🔔 Test Notifikasi",
        `Test notifikasi dari admin pada ${new Date().toLocaleString("id-ID")}`,
        { type: "test", timestamp: Date.now() }
      );
    } else {
      // Default: send to all admins
      result = await sendPushToAdmins(
        "🔔 Test Notifikasi",
        `Test notifikasi dari ${admin.name || admin.username} pada ${new Date().toLocaleString("id-ID")}`,
        { type: "test", timestamp: Date.now() }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Test notification sent: ${result.sent} delivered, ${result.failed} failed`,
      data: result,
    });
  } catch (error) {
    console.error('Push test error:', error);
    return NextResponse.json({ success: false, error: 'Failed to send test notification' }, { status: 500 });
  }
}

