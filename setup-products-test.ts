import { db } from './src/lib/db';

async function main() {
  // Cek existing products
  const existing = await db.product.findMany({ orderBy: { price: 'asc' } });
  console.log(`Existing products: ${existing.length}`);
  
  if (existing.length < 6) {
    // Buat 6 products, 4-6 inactive
    const products = [
      { name: 'Gold Premium Aset 1', price: 160000, profitRate: 2.0, isActive: true, isStopped: false },
      { name: 'Gold Premium Aset 2', price: 320000, profitRate: 2.5, isActive: true, isStopped: false },
      { name: 'Gold Premium Aset 3', price: 640000, profitRate: 3.0, isActive: true, isStopped: false },
      { name: 'Gold Premium Aset 4', price: 1920000, profitRate: 3.5, isActive: false, isStopped: false },
      { name: 'Gold Premium Aset 5', price: 5760000, profitRate: 4.0, isActive: false, isStopped: false },
      { name: 'Gold Premium Aset 6', price: 17280000, profitRate: 5.0, isActive: false, isStopped: false },
    ];
    
    for (const p of products) {
      await db.product.create({
        data: {
          ...p,
          duration: 180,
          estimatedProfit: Math.floor(p.price * (p.profitRate / 100)) * 180,
          quota: 9999,
          quotaUsed: 100,
          description: `${p.name} - Rp ${p.price}. Profit ${p.profitRate}%/hari. Modal TIDAK dikembalikan.`,
          banner: '',
        },
      });
      console.log(`✓ Created ${p.name} (isActive: ${p.isActive})`);
    }
  } else {
    // Set 4,5,6 inactive
    const toUpdate = existing.filter((_, i) => i >= 3);
    for (const p of toUpdate) {
      await db.product.update({ where: { id: p.id }, data: { isActive: false } });
      console.log(`✓ Set ${p.name} isActive=false`);
    }
  }
  
  const final = await db.product.findMany({ orderBy: { price: 'asc' } });
  console.log(`\nFinal products: ${final.length}`);
  for (const p of final) {
    console.log(`- ${p.name} | price: ${p.price} | isActive: ${p.isActive}`);
  }
}
main().catch(e => { console.error(e.message); process.exit(1); }).finally(() => process.exit(0));
