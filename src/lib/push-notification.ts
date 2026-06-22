import webpush from 'web-push';
import { db } from '@/lib/db';

// Configure web-push with VAPID keys
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:adminnexvo@nexvo.id',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
} else {
  console.warn('[Push] VAPID keys not configured. Push notifications will not work.');
}

interface PushPayload {
  title: string;
  body: string;
  data?: object;
}

/**
 * Send a push notification to all subscriptions for a specific user
 */
export async function sendPushNotification(
  userId: string,
  userType: string,
  title: string,
  body: string,
  data?: object
): Promise<{ sent: number; failed: number }> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.warn('[Push] VAPID keys not configured, skipping push notification');
    return { sent: 0, failed: 0 };
  }

  const subscriptions = await db.pushSubscription.findMany({
    where: { userId, userType },
  });

  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const payload: PushPayload = { title, body, data: data || {} };
  let sent = 0;
  let failed = 0;

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          JSON.stringify(payload),
          {
            TTL: 86400, // 24 hours
          }
        );
        sent++;
      } catch (error: unknown) {
        failed++;
        const statusCode = (error as any)?.statusCode;
        // If subscription is gone (410) or invalid (404), remove it from DB
        if (statusCode === 410 || statusCode === 404) {
          console.log(`[Push] Removing expired subscription: ${sub.endpoint.substring(0, 50)}...`);
          await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error(`[Push] Failed to send to ${sub.endpoint.substring(0, 50)}...:`, (error as Error)?.message);
        }
      }
    })
  );

  return { sent, failed };
}

/**
 * Send a push notification to all admin subscriptions
 */
export async function sendPushToAdmins(
  title: string,
  body: string,
  data?: object
): Promise<{ sent: number; failed: number }> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.warn('[Push] VAPID keys not configured, skipping push notification');
    return { sent: 0, failed: 0 };
  }

  const subscriptions = await db.pushSubscription.findMany({
    where: { userType: 'admin' },
  });

  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const payload: PushPayload = { title, body, data: data || {} };
  let sent = 0;
  let failed = 0;

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          JSON.stringify(payload),
          {
            TTL: 86400,
          }
        );
        sent++;
      } catch (error: unknown) {
        failed++;
        const statusCode = (error as any)?.statusCode;
        if (statusCode === 410 || statusCode === 404) {
          console.log(`[Push] Removing expired admin subscription: ${sub.endpoint.substring(0, 50)}...`);
          await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error(`[Push] Failed to send to admin ${sub.endpoint.substring(0, 50)}...:`, (error as Error)?.message);
        }
      }
    })
  );

  return { sent, failed };
}

/**
 * Send a push notification to all user subscriptions (broadcast)
 */
export async function sendPushToAllUsers(
  title: string,
  body: string,
  data?: object
): Promise<{ sent: number; failed: number }> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.warn('[Push] VAPID keys not configured, skipping push notification');
    return { sent: 0, failed: 0 };
  }

  const subscriptions = await db.pushSubscription.findMany({
    where: { userType: 'user' },
  });

  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const payload: PushPayload = { title, body, data: data || {} };
  let sent = 0;
  let failed = 0;

  // Process in batches of 50 to avoid overwhelming the server
  const BATCH_SIZE = 50;
  for (let i = 0; i < subscriptions.length; i += BATCH_SIZE) {
    const batch = subscriptions.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            JSON.stringify(payload),
            {
              TTL: 86400,
            }
          );
          sent++;
        } catch (error: unknown) {
          failed++;
          const statusCode = (error as any)?.statusCode;
          if (statusCode === 410 || statusCode === 404) {
            console.log(`[Push] Removing expired user subscription: ${sub.endpoint.substring(0, 50)}...`);
            await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          } else {
            console.error(`[Push] Failed to send to user ${sub.endpoint.substring(0, 50)}...:`, (error as Error)?.message);
          }
        }
      })
    );
  }

  return { sent, failed };
}

