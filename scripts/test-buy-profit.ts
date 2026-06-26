import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const users = await db.user.findMany();
  console.log(`Users: ${users.length}`);
  users.slice(0, 3).forEach(u => console.log(`  ${u.userId} | ${u.name} | main=${u.mainBalance}`));
  const invs = await db.investment.findMany({ include: { package: true }});
  console.log(`\nInvestments: ${invs.length}`);
  invs.forEach(i => console.log(`  ${i.id} | status=${i.status} | amount=${i.amount} | dailyProfit=${i.dailyProfit} | pkgRate=${i.package?.profitRate}% | pkgName=${i.package?.name} | lastProfit=${i.lastProfitDate?.toISOString() || 'null'}`));
}
main().catch(console.error).finally(()=>db.$disconnect());
