/**
 * Diagnostic: find user "mulyono5" across ALL identifying fields.
 * Searches: userId, whatsapp, email, name (case-insensitive, contains).
 */
import { db } from '../src/lib/db';

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Cari user "mulyono5" di SEMUA field');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const queries = ['mulyono5', 'mulyono'];

  for (const q of queries) {
    console.log(`\n── Pencarian: "${q}" ──`);
    const byUserId   = await db.user.findMany({ where: { userId:   { contains: q } } });
    const byWhatsapp = await db.user.findMany({ where: { whatsapp: { contains: q } } });
    const byEmail    = await db.user.findMany({ where: { email:    { contains: q } } });
    const byName     = await db.user.findMany({ where: { name:     { contains: q } } });

    const all = new Map<string, typeof byUserId[number]>();
    for (const u of [...byUserId, ...byWhatsapp, ...byEmail, ...byName]) {
      all.set(u.id, u);
    }

    if (all.size === 0) {
      console.log('   ❌ Tidak ditemukan di field manapun.');
      continue;
    }

    console.log(`   ✅ Ditemukan ${all.size} user(s) yang cocok:\n`);
    for (const u of all.values()) {
      const matches: string[] = [];
      if (u.userId.toLowerCase().includes(q))   matches.push('userId');
      if (u.whatsapp.toLowerCase().includes(q)) matches.push('whatsapp');
      if (u.email.toLowerCase().includes(q))     matches.push('email');
      if ((u.name || '').toLowerCase().includes(q)) matches.push('name');
      console.log(`   • id=${u.id}`);
      console.log(`     userId    : ${u.userId}    ${matches.includes('userId') ? '◀ MATCH' : ''}`);
      console.log(`     whatsapp : ${u.whatsapp} ${matches.includes('whatsapp') ? '◀ MATCH' : ''}`);
      console.log(`     email    : ${u.email}    ${matches.includes('email') ? '◀ MATCH' : ''}`);
      console.log(`     name     : ${u.name || '-'}     ${matches.includes('name') ? '◀ MATCH' : ''}`);
      console.log(`     main     : Rp${Math.floor(u.mainBalance).toLocaleString('id-ID')}`);
      console.log(`     deposit  : Rp${Math.floor(u.depositBalance).toLocaleString('id-ID')}`);
      console.log(`     profit   : Rp${Math.floor(u.profitBalance).toLocaleString('id-ID')}`);
      console.log();
    }
  }

  // Show all users for context
  console.log('\n── SEMUA USER (untuk referensi) ──');
  const allUsers = await db.user.findMany({
    select: { id: true, userId: true, whatsapp: true, email: true, name: true, mainBalance: true, depositBalance: true, profitBalance: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`Total: ${allUsers.length} user(s)\n`);
  for (const u of allUsers) {
    console.log(`  ${u.userId} | wa=${u.whatsapp} | email=${u.email} | name=${u.name || '-'} | main=${u.mainBalance}`);
  }
}

main()
  .catch((e) => { console.error('Fatal:', e); process.exit(1); })
  .finally(async () => { await db.$disconnect(); });
