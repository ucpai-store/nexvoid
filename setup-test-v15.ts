import { db } from './src/lib/db';
import bcrypt from 'bcryptjs';

async function main() {
  const user = await db.user.findFirst({ where: { whatsapp: '81234567890' } });
  if (!user) { console.log('no user'); return; }
  const newPass = bcrypt.hashSync('test1234', 8);
  await db.user.update({ where: { id: user.id }, data: { password: newPass, isVerified: true, isSuspended: false } });
  console.log('✓ Password reset to test1234 for', user.email);
  
  // Buat atau ambil InvestmentPackage
  let pkg = await db.investmentPackage.findFirst({ where: { isActive: true } });
  if (!pkg) {
    pkg = await db.investmentPackage.create({
      data: { name: 'Test Package V15', amount: 1000000, profitRate: 2, contractDays: 30, isActive: true, order: 1 },
    });
    console.log('✓ Created package:', pkg.name);
  } else {
    console.log('✓ Using existing package:', pkg.name);
  }
  
  await db.investment.deleteMany({ where: { userId: user.id } });
  console.log('✓ Cleared old investments');
  
  const now = new Date();
  const dailyProfit = Math.floor(pkg.amount * (pkg.profitRate / 100));
  
  const scenarios = [
    { label: '3 hari kalender lalu', daysAgo: 3 },
    { label: '1 hari kalender lalu', daysAgo: 1 },
    { label: 'hari ini (same-day)', daysAgo: 0 },
  ];
  
  for (const s of scenarios) {
    const startDate = new Date(now.getTime() - s.daysAgo * 24 * 3600 * 1000);
    const endDate = new Date(startDate.getTime() + pkg.contractDays * 24 * 3600 * 1000);
    
    let credited = 0;
    let lastProfitDate: Date | null = null;
    const cur = new Date(startDate);
    while (cur <= now) {
      const day = cur.getDay();
      const isWeekday = day !== 0 && day !== 6;
      const isSameDay = Math.floor(cur.getTime()/(24*3600*1000)) === Math.floor(startDate.getTime()/(24*3600*1000));
      if (isWeekday && !isSameDay) {
        credited++;
        lastProfitDate = new Date(cur);
      }
      cur.setDate(cur.getDate() + 1);
    }
    
    const totalProfit = credited * dailyProfit;
    
    await db.investment.create({
      data: {
        userId: user.id,
        packageId: pkg.id,
        amount: pkg.amount,
        dailyProfit,
        totalProfitEarned: totalProfit,
        status: 'active',
        startDate,
        endDate,
        lastProfitDate,
      },
    });
    const calDays = Math.floor((now.getTime() - startDate.getTime())/(24*3600*1000));
    console.log(`✓ Investment: ${s.label} | ${startDate.toISOString().slice(0,10)} | cal=${calDays} | weekdays credited=${credited} | profit=${totalProfit} | lastProfit=${lastProfitDate?.toISOString().slice(0,10)||'null'}`);
  }
}
main().catch(e => { console.error(e.message); process.exit(1); }).finally(() => process.exit(0));
