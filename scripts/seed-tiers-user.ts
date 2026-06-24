// One-off seed script: creates VIP tiers + a verified test user.
// Run with: bun run scripts/seed-tiers-user.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();

const TIERS = [
  { name: 'VIP 1', amount: 100000, profitRate: 10, contractDays: 90, order: 1 },
  { name: 'VIP 2', amount: 500000, profitRate: 10, contractDays: 90, order: 2 },
  { name: 'VIP 3', amount: 1000000, profitRate: 12, contractDays: 90, order: 3 },
  { name: 'VIP 4', amount: 2500000, profitRate: 12, contractDays: 90, order: 4 },
  { name: 'VIP 5', amount: 5000000, profitRate: 15, contractDays: 90, order: 5 },
  { name: 'VIP 6', amount: 10000000, profitRate: 15, contractDays: 90, order: 6 },
];

async function main() {
  // 1) Seed VIP tiers (skip if any exist)
  const existing = await db.investmentPackage.count();
  if (existing === 0) {
    for (const t of TIERS) {
      await db.investmentPackage.create({
        data: { ...t, isActive: true },
      });
    }
    console.log(`[seed] Created ${TIERS.length} VIP tiers`);
  } else {
    console.log(`[seed] ${existing} tiers already exist — skipping tier seed`);
  }

  // 2) Seed a verified test user (skip if exists)
  const email = 'tier-test@nexvo.test';
  const whatsapp = '89900000001';
  const existingUser = await db.user.findFirst({
    where: { OR: [{ email }, { whatsapp }] },
  });
  if (existingUser) {
    console.log(`[seed] Test user already exists: ${email}`);
    await db.$disconnect();
    return;
  }
  const hashed = await bcrypt.hash('Test1234!', 8);
  const user = await db.user.create({
    data: {
      userId: 'TIERT' + Math.floor(Math.random() * 1e6),
      whatsapp,
      email,
      password: hashed,
      name: 'Tier Test User',
      referralCode: 'TIER' + Math.floor(Math.random() * 1e6),
      isVerified: true,
      isSuspended: false,
      mainBalance: 15_000_000, // enough to buy several tiers
      depositBalance: 0,
    },
  });
  console.log(`[seed] Created test user: ${email} / Test1234! (id=${user.id})`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error('[seed] ERROR:', e);
  process.exit(1);
});
