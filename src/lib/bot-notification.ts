/**
 * NEXVO WhatsApp Bot Notification Library
 *
 * This module handles creating "pending notification" records in the database
 * (SystemSettings table with key prefix `bot_notify_`) so that an external
 * WhatsApp bot can poll and retrieve them. It also provides utility functions
 * for formatting currency and phone numbers, as well as reading bot configuration.
 */

import { db } from './db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported bot notification event types */
export type BotEvent =
  | 'deposit_pending'
  | 'withdraw_pending'
  | 'register'
  | 'otp_requested';

/** Payload carried inside a pending notification record */
export interface BotNotificationPayload {
  event: BotEvent;
  data: Record<string, unknown>;
  createdAt: string; // ISO date string
  read: boolean;
}

/** Bot configuration read from SystemSettings */
export interface BotConfig {
  /** Bot's own WhatsApp number */
  botWhatsappNumber: string;
  /** Admin's WhatsApp number that receives notifications */
  botAdminNumber: string;
  /** Whether to send a notification when a new deposit is created */
  botNotifyDeposit: boolean;
  /** Whether to send a notification when a new withdrawal is created */
  botNotifyWithdraw: boolean;
  /** Whether to send a notification when a new user registers */
  botNotifyRegister: boolean;
}

// ---------------------------------------------------------------------------
// formatRupiah – Formats a number as Indonesian Rupiah
// ---------------------------------------------------------------------------

/**
 * Format a numeric amount as an Indonesian Rupiah string.
 *
 * Uses the Indonesian locale convention where the thousand separator is a
 * period (`.`) and no decimal digits are shown.
 *
 * @example
 *   formatRupiah(1500000) // => "Rp 1.500.000"
 *   formatRupiah(25500)   // => "Rp 25.500"
 *   formatRupiah(0)       // => "Rp 0"
 *
 * @param amount - The numeric amount to format.
 * @returns A string formatted as Indonesian Rupiah.
 */
export function formatRupiah(amount: number): string {
  // Round to avoid floating-point quirks, then format with period separators
  const rounded = Math.round(amount);
  const formatted = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `Rp ${formatted}`;
}

// ---------------------------------------------------------------------------
// formatPhoneNumber – Masks middle digits for display
// ---------------------------------------------------------------------------

/**
 * Format a phone number for display by masking the middle digits.
 *
 * Preserves the first 4 and last 3 visible digits, replacing everything
 * in between with asterisks. Non-digit characters are stripped before
 * processing so the mask is applied consistently regardless of input format.
 *
 * @example
 *   formatPhoneNumber('08123456789')  // => "0812****789"
 *   formatPhoneNumber('+628123456789') // => "6281****789"
 *   formatPhoneNumber('0812')          // => "0812" (too short to mask)
 *
 * @param phone - The phone number string to format.
 * @returns The phone number with middle digits masked by asterisks.
 */
export function formatPhoneNumber(phone: string): string {
  // Strip non-digit characters for consistent processing
  const digits = phone.replace(/\D/g, '');

  // If the number is too short to meaningfully mask, return it as-is
  if (digits.length <= 7) {
    return digits;
  }

  const prefix = digits.slice(0, 4);
  const suffix = digits.slice(-3);
  const maskedLength = digits.length - 4 - 3;
  const masked = '*'.repeat(maskedLength);

  return `${prefix}${masked}${suffix}`;
}

// ---------------------------------------------------------------------------
// getBotConfig – Reads bot configuration from SystemSettings
// ---------------------------------------------------------------------------

/**
 * Read the WhatsApp bot configuration from the SystemSettings table.
 *
 * Each setting is stored as a separate row keyed by a well-known name. If a
 * setting does not yet exist in the database, the provided default value is
 * used instead.
 *
 * Settings read:
 * - `bot_whatsapp_number` – Bot's WhatsApp number (default: '')
 * - `bot_admin_number`    – Admin WhatsApp number for notifications (default: '')
 * - `bot_notify_deposit`  – Notify on new deposits (default: 'true')
 * - `bot_notify_withdraw` – Notify on new withdrawals (default: 'true')
 * - `bot_notify_register` – Notify on new registrations (default: 'true')
 *
 * @returns A `BotConfig` object with all configuration values resolved.
 */
export async function getBotConfig(): Promise<BotConfig> {
  // Fetch all bot-related settings in a single query for efficiency
  const settings = await db.systemSettings.findMany({
    where: {
      key: {
        in: [
          'bot_whatsapp_number',
          'bot_admin_number',
          'bot_notify_deposit',
          'bot_notify_withdraw',
          'bot_notify_register',
        ],
      },
    },
  });

  // Convert the array into a simple key→value map for easy lookup
  const map = new Map(settings.map((s) => [s.key, s.value]));

  /**
   * Helper: read a string value from the map, falling back to `defaultValue`.
   */
  const getString = (key: string, defaultValue: string): string =>
    map.get(key) ?? defaultValue;

  /**
   * Helper: read a boolean-ish string from the map.
   * Treats `'true'` (case-insensitive) as `true`, everything else as `false`.
   */
  const getBool = (key: string, defaultValue: string): boolean => {
    const raw = map.get(key);
    if (raw === undefined) return defaultValue === 'true';
    return raw.toLowerCase() === 'true';
  };

  return {
    botWhatsappNumber: getString('bot_whatsapp_number', ''),
    botAdminNumber: getString('bot_admin_number', ''),
    botNotifyDeposit: getBool('bot_notify_deposit', 'true'),
    botNotifyWithdraw: getBool('bot_notify_withdraw', 'true'),
    botNotifyRegister: getBool('bot_notify_register', 'true'),
  };
}

// ---------------------------------------------------------------------------
// notifyBot – Creates a pending notification for the WhatsApp bot
// ---------------------------------------------------------------------------

/**
 * Create a "pending notification" record in the database that the WhatsApp
 * bot can poll and retrieve.
 *
 * The notification is stored as a `SystemSettings` row with:
 * - **key**: `bot_notify_{timestamp}_{random}` – guaranteed unique
 * - **value**: A JSON string containing the event type, event-specific data,
 *   creation timestamp, and a `read: false` flag.
 *
 * Before creating the record, the function checks the bot configuration to
 * see if the given event type is enabled. If it is disabled, the function
 * returns silently without writing anything.
 *
 * ### Event data shapes
 *
 * | Event              | Data fields                                                                 |
 * |--------------------|-----------------------------------------------------------------------------|
 * | `deposit_pending`  | `depositId`, `userId`, `userName`, `whatsapp`, `amount`, `paymentMethod`, `status` |
 * | `withdraw_pending` | `withdrawalId`, `userId`, `userName`, `whatsapp`, `amount`, `fee`, `netAmount`, `bankName`, `accountNo`, `holderName`, `status` |
 * | `register`         | `userId`, `userName`, `whatsapp`, `email`                                   |
 * | `otp_requested`    | `whatsapp`, `otp`, `userName`                                               |
 *
 * @param event - The type of event to notify about.
 * @param data  - An object containing event-specific data (see table above).
 *
 * @example
 *   await notifyBot('deposit_pending', {
 *     depositId: 'clx...',
 *     userId: 'clx...',
 *     userName: 'Budi',
 *     whatsapp: '081234567890',
 *     amount: 500000,
 *     paymentMethod: 'BCA',
 *     status: 'pending',
 *   });
 */
export async function notifyBot(
  event: BotEvent,
  data: Record<string, unknown>
): Promise<void> {
  // ── Gate: check whether this event type is enabled ──────────────────────
  const config = await getBotConfig();

  const enabled =
    event === 'deposit_pending'
      ? config.botNotifyDeposit
      : event === 'withdraw_pending'
        ? config.botNotifyWithdraw
        : event === 'register'
          ? config.botNotifyRegister
          : // otp_requested is always sent (no dedicated toggle)
            true;

  if (!enabled) {
    return; // Notification type is disabled – skip silently
  }

  // ── Build the payload ───────────────────────────────────────────────────
  const payload: BotNotificationPayload = {
    event,
    data,
    createdAt: new Date().toISOString(),
    read: false,
  };

  // ── Generate a unique key ───────────────────────────────────────────────
  // Using timestamp + random suffix to avoid collisions even under high throughput
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8); // 6-char alphanumeric
  const key = `bot_notify_${timestamp}_${random}`;

  // ── Persist to SystemSettings ───────────────────────────────────────────
  await db.systemSettings.create({
    data: {
      key,
      value: JSON.stringify(payload),
    },
  });
}
