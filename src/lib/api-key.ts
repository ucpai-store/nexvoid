import { db } from './db';
import bcrypt from 'bcryptjs';

/**
 * Validate an API key by comparing it against all active hashed keys.
 * Supports both nxv_live_ prefixed keys and custom format keys.
 * Updates lastUsedAt on match.
 */
export async function validateApiKey(key: string): Promise<boolean> {
  if (!key || key.length < 8) return false;
  // Accept both nxv_live_ prefix and custom API keys (alphanumeric, 20+ chars)
  if (!key.startsWith('nxv_live_') && !/^[A-Za-z0-9]{20,}$/.test(key)) return false;

  const keys = await db.apiKey.findMany({ where: { isActive: true } });
  for (const k of keys) {
    const match = await bcrypt.compare(key, k.keyHash);
    if (match) {
      await db.apiKey.update({
        where: { id: k.id },
        data: { lastUsedAt: new Date() },
      });
      return true;
    }
  }
  return false;
}

/**
 * Generate a random API key with the nxv_live_ prefix.
 */
export function generateApiKeyRaw(): string {
  const chars = '0123456789abcdef';
  let random = '';
  for (let i = 0; i < 32; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `nxv_live_${random}`;
}
