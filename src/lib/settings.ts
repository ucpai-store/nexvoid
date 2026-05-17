import { db } from './db';

const DEFAULT_SETTINGS: Record<string, string> = {
  min_withdraw: '50000',
  withdraw_fee: '10',
  deposit_fee: '500',
  work_start: '09:00',
  work_end: '16:00',
  referral_bonus: '10000',
  cashback: '0',
  total_members: '0',
  total_transactions: '0',
  uptime: '99.9',
  satisfaction: '98',
};

export async function getSetting(key: string): Promise<string> {
  const setting = await db.systemSettings.findUnique({ where: { key } });
  if (setting) return setting.value;
  const defaultValue = DEFAULT_SETTINGS[key];
  if (defaultValue) {
    await db.systemSettings.upsert({
      where: { key },
      update: {},
      create: { key, value: defaultValue },
    });
    return defaultValue;
  }
  return '';
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const settings = await db.systemSettings.findMany();
  const result: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const s of settings) {
    result[s.key] = s.value;
  }
  // Ensure defaults exist in DB
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (!settings.find(s => s.key === key)) {
      await db.systemSettings.upsert({
        where: { key },
        update: {},
        create: { key, value },
      });
    }
  }
  return result;
}

/**
 * Get current WIB (Western Indonesian Time, UTC+7) as a Date object.
 * Works regardless of server timezone.
 */
function getWibNow(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + 7 * 3600000); // UTC+7
}

/**
 * Check if current time is within working hours in WIB timezone.
 * Working hours: configured work_start to work_end (WIB).
 * Weekends (Saturday & Sunday) are NOT working hours.
 */
export function isWithinWorkingHours(settings: Record<string, string>): boolean {
  const wibNow = getWibNow();
  const day = wibNow.getDay(); // 0=Sunday, 6=Saturday

  // Weekend check: Saturday (6) and Sunday (0) are off
  if (day === 0 || day === 6) return false;

  const startParts = (settings.work_start || '09:00').split(':');
  const endParts = (settings.work_end || '16:00').split(':');
  const startHour = parseInt(startParts[0]);
  const startMin = parseInt(startParts[1] || '0');
  const endHour = parseInt(endParts[0]);
  const endMin = parseInt(endParts[1] || '0');

  const currentMinutes = wibNow.getHours() * 60 + wibNow.getMinutes();
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

/**
 * Get working hours info for display purposes.
 * Returns current WIB time, whether it's working hours, and a message.
 */
export function getWorkingHoursInfo(settings: Record<string, string>): {
  isWorking: boolean;
  message: string;
  wibTime: string;
} {
  const wibNow = getWibNow();
  const day = wibNow.getDay();
  const hours = wibNow.getHours();
  const minutes = wibNow.getMinutes();
  const currentTime = hours * 60 + minutes;

  const startStr = settings.work_start || '09:00';
  const endStr = settings.work_end || '16:00';

  if (day === 0 || day === 6) {
    return {
      isWorking: false,
      message: `Penarikan hanya bisa dilakukan pada hari kerja (Senin-Jumat), jam ${startStr}-${endStr} WIB`,
      wibTime: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} WIB`,
    };
  }

  const startParts = startStr.split(':');
  const endParts = endStr.split(':');
  const startMinutes = parseInt(startParts[0]) * 60 + parseInt(startParts[1] || '0');
  const endMinutes = parseInt(endParts[0]) * 60 + parseInt(endParts[1] || '0');

  if (currentTime < startMinutes || currentTime > endMinutes) {
    return {
      isWorking: false,
      message: `Penarikan hanya bisa dilakukan jam ${startStr}-${endStr} WIB (hari kerja)`,
      wibTime: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} WIB`,
    };
  }

  return {
    isWorking: true,
    message: '',
    wibTime: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} WIB`,
  };
}

