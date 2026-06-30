import { db } from './src/lib/db';

async function main() {
  // Cek existing packages
  const existing = await db.investmentPackage.findMany({ orderBy: { amount: 'asc' } });
  console.log(`Existing packages: ${existing.length}`);
  for (const p of existing) {
    console.log(`- ${p.name} | amount: ${p.amount} | isActive: ${p.isActive}`);
  }
  
  // Kalau cuma 1 (Test Package V15), buat 5 lagi dengan beberapa inactive
  if (existing.length < 6) {
    // Set existing jadi paket 1 (active)
    await db.investmentPackage.update({
      where: { id: existing[0].id },
      data: { name: 'Gold Premium Aset 1', amount: 160000, profitRate: 2, contractDays: 180, isActive: true, order: 1 },
    });
    console.log('✓ Updated package 1');
    
    // Buat paket 2-6
    const pkgs = [
      { name: 'Gold Premium Aset 2', amount: 320000, profitRate: 2.5, isActive: true, order: 2 },
      { name: 'Gold Premium Aset 3', amount: 640000, profitRate: 3, isActive: true, order: 3 },
      { name: 'Gold Premium Aset 4', amount: 1920000, profitRate: 3.5, isActive: false, order: 4 }, // INACTIVE
      { name: 'Gold Premium Aset 5', amount: 5760000, profitRate: 4, isActive: false, order: 5 },   // INACTIVE
      { name: 'Gold Premium Aset 6', amount: 17280000, profitRate: 5, isActive: false, order: 6 },  // INACTIVE
    ];
    
    for (const p of pkgs) {
      await db.investmentPackage.create({
        data: { ...p, contractDays: 180 },
      });
      console.log(`✓ Created ${p.name} (isActive: ${p.isActive})`);
    }
  } else {
    // Set paket 4,5,6 jadi inactive untuk test
    const pkgsToUpdate = existing.filter(p => p.order >= 4);
    for (const p of pkgsToUpdate) {
      await db.investmentPackage.update({
        where: { id: p.id },
        data: { isActive: false },
      });
      console.log(`✓ Set ${p.name} isActive=false`);
    }
  }
  
  // Verify
  const finalPkgs = await db.investmentPackage.findMany({ orderBy: { amount: 'asc' } });
  console.log(`\nFinal packages: ${finalPkgs.length}`);
  for (const p of finalPkgs) {
    console.log(`- ${p.name} | amount: ${p.amount} | isActive: ${p.isActive}`);
  }
}
main().catch(e => { console.error(e.message); process.exit(1); }).finally(() => process.exit(0));
