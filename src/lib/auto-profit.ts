/**
 * Auto-Profit Rate System
 * 
 * Automatically adjusts daily profit rates within admin-defined min/max range.
 * - Uses a smart algorithm that prevents wild jumps
 * - New rate = previous rate + random delta (clamped to min/max)
 * - Tracks history in ProfitRateLog
 * - Lazy-update: rates update when packages are fetched (if a new day has started)
 */

import { db } from '@/lib/db';

/**
 * Check if a date is "today" (same calendar day in local timezone)
 */
function isToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

/**
 * Generate a new profit rate based on previous rate and min/max bounds.
 * 
 * Algorithm:
 * - Random walk: delta in range [-2, +2] with slight upward bias
 * - Clamped to [minRate, maxRate]
 * - Rounded to 1 decimal place
 */
function generateNewRate(
  currentRate: number,
  minRate: number,
  maxRate: number
): number {
  // Random delta between -2 and +2, with slight upward bias
  const delta = (Math.random() - 0.45) * 4; // slight upward bias (0.45 instead of 0.5)
  
  let newRate = currentRate + delta;
  
  // Clamp to bounds
  newRate = Math.max(minRate, Math.min(maxRate, newRate));
  
  // Round to 1 decimal place
  newRate = Math.round(newRate * 10) / 10;
  
  // Ensure at least minRate
  if (newRate < minRate) newRate = minRate;
  if (newRate > maxRate) newRate = maxRate;
  
  return newRate;
}

/**
 * Auto-update profit rates for all packages with autoProfit enabled.
 * This is a lazy-update: only updates if the rate hasn't been updated today.
 * 
 * @returns Array of updated packages with their new rates
 */
export async function autoUpdateProfitRates(): Promise<
  Array<{ packageId: string; name: string; oldRate: number; newRate: number }>
> {
  const results: Array<{ packageId: string; name: string; oldRate: number; newRate: number }> = [];

  // Find all active packages with autoProfit enabled
  const packages = await db.investmentPackage.findMany({
    where: {
      isActive: true,
      autoProfit: true,
    },
  });

  for (const pkg of packages) {
    // Check if already updated today
    if (pkg.lastProfitUpdate && isToday(pkg.lastProfitUpdate)) {
      continue; // Already updated today, skip
    }

    const oldRate = pkg.profitRate;
    const newRate = generateNewRate(oldRate, pkg.minProfitRate, pkg.maxProfitRate);

    if (newRate === oldRate && pkg.lastProfitUpdate) {
      // Rate didn't change, just update the timestamp
      await db.investmentPackage.update({
        where: { id: pkg.id },
        data: { lastProfitUpdate: new Date() },
      });
      continue;
    }

    // Update the package with new rate
    await db.investmentPackage.update({
      where: { id: pkg.id },
      data: {
        profitRate: newRate,
        lastProfitUpdate: new Date(),
      },
    });

    // Log the rate change
    await db.profitRateLog.create({
      data: {
        packageId: pkg.id,
        date: new Date(),
        rate: newRate,
        previousRate: oldRate,
        changeType: 'auto',
      },
    });

    results.push({
      packageId: pkg.id,
      name: pkg.name,
      oldRate,
      newRate,
    });
  }

  return results;
}

/**
 * Manually set a package's profit rate (admin action).
 * Logs the change in ProfitRateLog.
 */
export async function manualSetProfitRate(
  packageId: string,
  newRate: number
): Promise<{ oldRate: number; newRate: number }> {
  const pkg = await db.investmentPackage.findUnique({
    where: { id: packageId },
  });

  if (!pkg) {
    throw new Error('Paket tidak ditemukan');
  }

  // Clamp to min/max
  const clampedRate = Math.max(pkg.minProfitRate, Math.min(pkg.maxProfitRate, newRate));
  const oldRate = pkg.profitRate;

  await db.$transaction(async (tx) => {
    await tx.investmentPackage.update({
      where: { id: packageId },
      data: {
        profitRate: clampedRate,
        lastProfitUpdate: new Date(),
      },
    });

    await tx.profitRateLog.create({
      data: {
        packageId,
        date: new Date(),
        rate: clampedRate,
        previousRate: oldRate,
        changeType: 'manual',
      },
    });
  });

  return { oldRate, newRate: clampedRate };
}

/**
 * Get profit rate history for a package.
 */
export async function getProfitRateHistory(
  packageId: string,
  days: number = 30
) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const logs = await db.profitRateLog.findMany({
    where: {
      packageId,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return logs;
}

/**
 * Create default durations for a package.
 * These are the standard time options users can choose when investing.
 */
export async function createDefaultDurations(packageId: string, baseProfitRate: number) {
  const defaultDurations = [
    { durationDays: 1, durationLabel: '24 Jam', profitRate: Math.round(baseProfitRate * 0.3 * 10) / 10, order: 1 },
    { durationDays: 7, durationLabel: '7 Hari', profitRate: Math.round(baseProfitRate * 0.6 * 10) / 10, order: 2 },
    { durationDays: 30, durationLabel: '30 Hari', profitRate: Math.round(baseProfitRate * 0.8 * 10) / 10, order: 3 },
    { durationDays: 90, durationLabel: '90 Hari', profitRate: baseProfitRate, order: 4 },
    { durationDays: 365, durationLabel: '365 Hari', profitRate: Math.round(baseProfitRate * 1.2 * 10) / 10, order: 5 },
  ];

  for (const dur of defaultDurations) {
    await db.packageDuration.create({
      data: {
        packageId,
        ...dur,
        isActive: true,
      },
    });
  }

  return defaultDurations;
}

/**
 * Get the profit rate for a specific duration.
 * Falls back to the package's current profitRate if duration not found.
 */
export async function getDurationRate(
  packageId: string,
  durationId?: string
): Promise<{ rate: number; durationDays: number; durationLabel: string }> {
  if (!durationId) {
    const pkg = await db.investmentPackage.findUnique({
      where: { id: packageId },
    });
    return {
      rate: pkg?.profitRate || 10,
      durationDays: pkg?.contractDays || 90,
      durationLabel: `${pkg?.contractDays || 90} Hari`,
    };
  }

  const duration = await db.packageDuration.findUnique({
    where: { id: durationId },
  });

  if (!duration || !duration.isActive) {
    const pkg = await db.investmentPackage.findUnique({
      where: { id: packageId },
    });
    return {
      rate: pkg?.profitRate || 10,
      durationDays: pkg?.contractDays || 90,
      durationLabel: `${pkg?.contractDays || 90} Hari`,
    };
  }

  return {
    rate: duration.profitRate,
    durationDays: duration.durationDays,
    durationLabel: duration.durationLabel,
  };
}
