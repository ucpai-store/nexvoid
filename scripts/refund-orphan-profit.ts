/**
 * ════════════════════════════════════════════════════════════════
 *  NEXVO — Refund Orphan Profit (v20.1) ★★★
 * ════════════════════════════════════════════════════════════════
 *
 *  THE FIX for: "tadi aku dah hapus yang duplikat tapi profitnya lo"
 *  (User hapus Investment duplicate via admin LAMA — cuma hapus
 *   record, TIDAK refund profit. Profit dobel masih nangkring di
 *   balance user.)
 *
 *  Logic:
 *    - credited_investments = sum(BonusLog.amount where type='profit')
 *      (semua profit yg pernah dikredit dari cron — setiap cron
 *       credit jg create BonusLog type='profit')
 *    - refunded_already = -sum(BonusLog.amount where type='refund')
 *      (positive value — refund yg sudah dilakukan)
 *    - expected_now = sum(Investment.totalProfitEarned for ALL user's
 *      Investments — active + completed)
 *    - phantom = (credited_investments - refunded_already) - expected_now
 *    - Kalau phantom > 0 → ada profit yg masuk tapi Investment udah gak
 *      ada (atau duplicate yg dihapus manual) → REFUND phantom
 *
 *  Run on VPS:
 *    # DRY-RUN (preview):
 *    cd /var/www/nexvo && bun run scripts/refund-orphan-profit.ts
 *
 *    # EKSEKUSI (refund phantom profit):
 *    cd /var/www/nexvo && bun run scripts/refund-orphan-profit.ts --apply
 *
 *    # Per-user specific:
 *    cd /var/www/nexvo && bun run scripts/refund-orphan-profit.ts --user=62812xxxx
 *    cd /var/www/nexvo && bun run scripts/refund-orphan-profit.ts --user=62812xxxx --apply
 *
 *  Default = DRY-RUN (read-only). Add --apply to actually refund.
 * ════════════════════════════════════════════════════════════════
 */
import { db } from '../src/lib/db';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const USER_FILTER = args.find((a) => a.startsWith('--user='))?.split('=')[1];

function formatRp(n: number): string {
  return 'Rp' + Math.floor(Math.max(0, n)).toLocaleString('id-ID');
}

async function processUser(userId: string, userName: string): Promise<{ phantom: number; refunded: number }> {
  // 1. Sum all BonusLog amount where type='profit' (semua cron credit)
  const profitAgg = await db.bonusLog.aggregate({
    where: { userId, type: 'profit' },
    _sum: { amount: true },
  });
  const creditedInvestments = profitAgg._sum.amount || 0;

  // 2. Sum all BonusLog amount where type='refund' (sudah negative)
  const refundAgg = await db.bonusLog.aggregate({
    where: { userId, type: 'refund' },
    _sum: { amount: true },
  });
  const refundedAlready = -(refundAgg._sum.amount || 0); // make positive

  // 3. Sum all Investment.totalProfitEarned (active + completed)
  const invAgg = await db.investment.aggregate({
    where: { userId },
    _sum: { totalProfitEarned: true },
  });
  const expectedNow = invAgg._sum.totalProfitEarned || 0;

  // 4. Phantom = credited - refunded - expected
  const phantom = (creditedInvestments - refundedAlready) - expectedNow;

  if (phantom <= 0) {
    return { phantom: 0, refunded: 0 };
  }

  console.log(`    ⚠️  PHANTOM: credited=${formatRp(creditedInvestments)} - refunded=${formatRp(refundedAlready)} - expected=${formatRp(expectedNow)} = ${formatRp(phantom)}`);

  if (!APPLY) {
    return { phantom, refunded: 0 };
  }

  // APPLY: refund phantom from User.mainBalance + totalProfit
  try {
    await db.$transaction(async (tx) => {
      const u = await tx.user.findUnique({
        where: { id: userId },
        select: { mainBalance: true, totalProfit: true, userId: true },
      });
      if (!u) return;

      const newMain = Math.max(0, u.mainBalance - phantom);
      const newTotalProfit = Math.max(0, u.totalProfit - phantom);
      const actualRefund = Math.min(u.mainBalance - newMain, u.totalProfit - newTotalProfit);

      if (actualRefund <= 0) return;

      await tx.user.update({
        where: { id: userId },
        data: { mainBalance: newMain, totalProfit: newTotalProfit },
      });

      await tx.bonusLog.create({
        data: {
          userId,
          fromUserId: userId,
          type: 'refund',
          level: 0,
          amount: -actualRefund,
          description: `Refund PHANTOM profit (Investment udah dihapus manual tapi profit masih ada di balance). Rp${Math.floor(actualRefund).toLocaleString('id-ID')} dikembalikan.`,
        },
      });

      console.log(`    ✅ REFUNDED ${formatRp(actualRefund)} ke user ${u.userId} (${userName})`);
    });
    return { phantom, refunded: phantom };
  } catch (e: any) {
    console.error(`    ❌ Failed: ${e.message}`);
    return { phantom, refunded: 0 };
  }
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  NEXVO — Refund Phantom Profit (v20.1)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Mode  : ${APPLY ? '⚡ APPLY (execute refund)' : '🔍 DRY-RUN (preview only)'}`);
  console.log(`  Scope : ${USER_FILTER ? `User: ${USER_FILTER}` : '🌐 ALL users'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const where = USER_FILTER
    ? {
        OR: [
          { userId: { contains: USER_FILTER } },
          { whatsapp: { contains: USER_FILTER } },
          { email: { contains: USER_FILTER } },
          { name: { contains: USER_FILTER } },
        ],
      }
    : {};

  const users = await db.user.findMany({
    where,
    select: { id: true, userId: true, name: true, mainBalance: true, totalProfit: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`  Users scanned: ${users.length}\n`);

  let usersRefunded = 0;
  let totalRefunded = 0;

  for (const u of users) {
    if (USER_FILTER) {
      console.log(`\n  ── ${u.userId} | ${u.name || '-'} ──`);
      console.log(`    mainBalance: ${formatRp(u.mainBalance)} | totalProfit: ${formatRp(u.totalProfit)}`);
    }
    const result = await processUser(u.id, u.name || '-');
    if (result.phantom > 0) {
      usersRefunded++;
      totalRefunded += result.refunded;
      if (!USER_FILTER) {
        console.log(`    ⚠️  ${u.userId} | ${u.name || '-'} | phantom=${formatRp(result.phantom)}${APPLY && result.refunded > 0 ? ' → REFUNDED ' + formatRp(result.refunded) : ''}`);
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  ${APPLY ? '✅ REFUND DONE' : '🔍 DRY-RUN PREVIEW'}`);
  console.log(`  - Users with phantom profit: ${usersRefunded}`);
  console.log(`  - Total phantom: ${formatRp(totalRefunded)}`);
  if (APPLY) {
    console.log(`  - Total refunded: ${formatRp(totalRefunded)}`);
    console.log(`  - BonusLog 'refund' entries dibuat buat audit trail.`);
  } else {
    console.log('\n  💡 Run dengan --apply untuk eksekusi refund:');
    console.log('     bun run scripts/refund-orphan-profit.ts --apply');
  }
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('Fatal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
