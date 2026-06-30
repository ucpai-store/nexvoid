import { db } from './src/lib/db';
import bcrypt from 'bcryptjs';

async function main() {
  const u = await db.user.findFirst({ where: { whatsapp: '81234567890' } });
  if (!u) { console.log('no user'); return; }
  console.log('email:', u.email, 'verified:', u.isVerified, 'suspended:', u.isSuspended);
  console.log('pass hash preview:', u.password.slice(0, 20));
  // cek common passwords
  for (const p of ['password', '123456', 'test123', 'admin123', 'password123', 'Test1234']) {
    const ok = bcrypt.compareSync(p, u.password);
    if (ok) { console.log('PASSWORD FOUND:', p); break; }
  }
  
  // Cek packages aktif
  const pkgs = await db.package.findMany({ where: { isActive: true }, take: 3 });
  console.log('\nActive packages:', pkgs.length);
  for (const p of pkgs) console.log(`- ${p.name} | price: ${p.price} | profitRate: ${p.profitRate}% | contractDays: ${p.contractDays}`);
}
main().catch(e => { console.error(e.message); process.exit(1); }).finally(() => process.exit(0));
