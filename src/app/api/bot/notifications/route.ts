import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateBotRequest } from '@/lib/bot-auth';

interface BotNotification {
  key: string;
  type: string;
  message: string;
  read: boolean;
  createdAt?: string;
  [key: string]: unknown;
}

// GET - Bot polls for unread notifications
export async function GET(request: NextRequest) {
  try {
    // Authenticate (API Key or admin JWT from pairing code)
    const auth = await authenticateBotRequest(request);
    if (!auth.authenticated) return auth.error;

    // Query SystemSettings where key starts with 'bot_notify_'
    const settings = await db.systemSettings.findMany({
      where: {
        key: { startsWith: 'bot_notify_' },
      },
    });

    // Parse JSON values and filter unread notifications
    const notifications: BotNotification[] = [];
    const markReadUpdates: Promise<unknown>[] = [];

    for (const setting of settings) {
      try {
        const parsed: BotNotification = JSON.parse(setting.value);
        if (!parsed.read) {
          parsed.key = setting.key;
          notifications.push(parsed);

          // Mark as read by updating the JSON value's read field to true
          const updatedValue = { ...parsed, read: true };
          markReadUpdates.push(
            db.systemSettings.update({
              where: { key: setting.key },
              data: { value: JSON.stringify(updatedValue) },
            })
          );
        }
      } catch {
        // Skip entries with invalid JSON
        console.warn(`Skipping invalid notification: ${setting.key}`);
      }
    }

    // Mark all unread notifications as read
    if (markReadUpdates.length > 0) {
      await Promise.all(markReadUpdates);
    }

    return NextResponse.json({
      success: true,
      data: {
        notifications,
        count: notifications.length,
      },
    });
  } catch (error) {
    console.error('Get bot notifications error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Clear old read notifications
export async function DELETE(request: NextRequest) {
  try {
    // Authenticate (API Key or admin JWT from pairing code)
    const auth = await authenticateBotRequest(request);
    if (!auth.authenticated) return auth.error;

    // Query SystemSettings where key starts with 'bot_notify_'
    const settings = await db.systemSettings.findMany({
      where: {
        key: { startsWith: 'bot_notify_' },
      },
    });

    // Find entries where parsed JSON read=true
    const keysToDelete: string[] = [];
    for (const setting of settings) {
      try {
        const parsed = JSON.parse(setting.value);
        if (parsed.read === true) {
          keysToDelete.push(setting.key);
        }
      } catch {
        // Skip entries with invalid JSON
      }
    }

    // Delete read notifications
    let deleted = 0;
    if (keysToDelete.length > 0) {
      const result = await db.systemSettings.deleteMany({
        where: {
          key: { in: keysToDelete },
        },
      });
      deleted = result.count;
    }

    return NextResponse.json({
      success: true,
      data: { deleted },
    });
  } catch (error) {
    console.error('Delete bot notifications error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
