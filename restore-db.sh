#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO DB RESTORE — cari backup dengan 23 users + restore
#
#  Cara kerja:
#  1. Scan SEMUA file backup di /home/nexvo/db/ + /tmp/ + /root/
#  2. Cek user count di tiap backup
#  3. Tampilkan list + pilih yang paling banyak users
#  4. Backup DB current dulu (safety)
#  5. Restore backup yang dipilih
#  6. Verify user count sesudah restore
#  7. Restart PM2
# ═══════════════════════════════════════════════════════════════

echo "═══════════════════════════════════════════════════════════"
echo "  💾 NEXVO DB RESTORE — Cari backup 23 users"
echo "  Waktu: $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════════════════════"

P="/home/nexvo"
[ ! -d "$P" ] && P=$(find / -maxdepth 5 -name "package.json" -type f 2>/dev/null | xargs grep -l '"nexvo"' 2>/dev/null | head -1 | xargs dirname)
[ -z "$P" ] && { echo "❌ Project gak ketemu"; exit 1; }

echo "  Project: $P"
cd "$P"
echo ""

# ═══ STEP 1: SCAN SEMUA BACKUP FILES ═══
echo "═══ 1. SCAN SEMUA BACKUP FILES ═══"
BACKUP_FILES=$(find /home/nexvo /tmp /root /var/backups -name "custom.db*" -type f 2>/dev/null | head -30)
CURRENT_DB="$P/db/custom.db"

if [ -z "$BACKUP_FILES" ]; then
  echo "  ❌ Gak nemu backup file apapun!"
  echo "  Cek manual: find / -name 'custom.db*' 2>/dev/null"
  exit 1
fi

echo "  Ditemukan backup files:"
echo "$BACKUP_FILES" | while read f; do
  SIZE=$(wc -c < "$f" 2>/dev/null)
  echo "    $f ($SIZE bytes)"
done
echo ""

# ═══ STEP 2: CEK USER COUNT DI TIAP BACKUP ═══
echo "═══ 2. CEK USER COUNT DI TIAP BACKUP ═══"
echo ""

# Bikin script Prisma untuk cek user count
cat > /tmp/check-users.mjs << 'EOF'
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';

const files = process.argv.slice(2);
const results = [];

for (const f of files) {
  if (!fs.existsSync(f)) continue;
  try {
    const prisma = new PrismaClient({
      datasources: { db: { url: `file:${path.resolve(f)}` } },
    });
    const users = await prisma.user.count().catch(() => 0);
    const admins = await prisma.admin.count().catch(() => 0);
    const deposits = await prisma.deposit.count().catch(() => 0);
    const withdrawals = await prisma.withdrawal.count().catch(() => 0);
    const investments = await prisma.investment.count().catch(() => 0);
    const stat = fs.statSync(f);
    results.push({
      file: f,
      size: stat.size,
      modified: stat.mtime.toISOString().split('T')[0],
      users, admins, deposits, withdrawals, investments,
      total: users + admins + deposits + withdrawals + investments,
    });
    await prisma.$disconnect();
  } catch (e) {
    console.log(`  ${f}: ERROR — ${e.message.split('\n')[0]}`);
  }
}

// Sort by user count descending
results.sort((a, b) => b.users - a.users);

console.log('\n=== RANKING BACKUP BY USER COUNT ===\n');
results.forEach((r, i) => {
  const marker = r.users >= 23 ? ' ★ (TARGET!)' : (i === 0 ? ' (most users)' : '');
  console.log(`#${i + 1}: ${r.file}${marker}`);
  console.log(`    Users: ${r.users}, Admins: ${r.admins}, Deposits: ${r.deposits}, Withdrawals: ${r.withdrawals}, Investments: ${r.investments}`);
  console.log(`    Size: ${r.size} bytes, Modified: ${r.modified}`);
  console.log('');
});

// Output best backup to file for shell to read
const best = results.find(r => r.users >= 23) || results[0];
if (best) {
  fs.writeFileSync('/tmp/best-backup.txt', best.file);
  console.log(`\n=== BEST BACKUP: ${best.file} (${best.users} users) ===\n`);
} else {
  console.log('\n❌ Gak nemu backup dengan users > 0');
}
EOF

# Run check
echo "$BACKUP_FILES" | tr '\n' ' ' | xargs bun /tmp/check-users.mjs 2>&1 | grep -v "^Bun v"

BEST=$(cat /tmp/best-backup.txt 2>/dev/null)
if [ -z "$BEST" ]; then
  echo "❌ Gak nemu backup valid!"
  exit 1
fi
echo ""

# ═══ STEP 3: BACKUP CURRENT DB (SAFETY) ═══
echo "═══ 3. BACKUP CURRENT DB (SAFETY) ═══"
CURRENT_BACKUP="$P/db/custom.db.pre-restore-$(date +%Y%m%d-%H%M%S)"
if [ -f "$CURRENT_DB" ]; then
  cp "$CURRENT_DB" "$CURRENT_BACKUP"
  echo "  ✅ Current DB backed up: $CURRENT_BACKUP"
else
  echo "  ℹ️  Current DB gak ada (OK, gak ada yg di-backup)"
fi
echo ""

# ═══ STEP 4: RESTORE ═══
echo "═══ 4. RESTORE BACKUP ═══"
echo "  Source: $BEST"
echo "  Target: $CURRENT_DB"

# Stop PM2 dulu biar gak conflict
pm2 stop nexvo-web 2>/dev/null
sleep 2

# Copy backup ke current DB
mkdir -p "$P/db"
cp "$BEST" "$CURRENT_DB"
echo "  ✅ Restored: $(wc -c < "$CURRENT_DB") bytes"
echo ""

# ═══ STEP 5: DB PUSH (pastikan schema sinkron) ═══
echo "═══ 5. DB PUSH (sinkron schema, KEEP DATA) ═══"
bun run db:push 2>&1 | tail -10
echo ""

# ═══ STEP 6: VERIFY USER COUNT AFTER RESTORE ═══
echo "═══ 6. VERIFY USER COUNT AFTER RESTORE ═══"
cat > /tmp/verify-users.mjs << 'EOF'
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
try {
  const users = await prisma.user.count();
  const admins = await prisma.admin.count();
  const deposits = await prisma.deposit.count();
  const withdrawals = await prisma.withdrawal.count();
  const investments = await prisma.investment.count();
  console.log(`  Users: ${users}`);
  console.log(`  Admins: ${admins}`);
  console.log(`  Deposits: ${deposits}`);
  console.log(`  Withdrawals: ${withdrawals}`);
  console.log(`  Investments: ${investments}`);

  // Tampilkan sample users (5 pertama)
  if (users > 0) {
    console.log('\n  Sample users (5 pertama):');
    const samples = await prisma.user.findMany({
      take: 5,
      select: { id: true, phone: true, email: true, name: true, mainBalance: true }
    });
    samples.forEach(u => {
      console.log(`    - ${u.phone || u.email || u.id} | ${u.name || ''} | Balance: ${u.mainBalance}`);
    });
  }
} catch (e) {
  console.log(`  ERROR: ${e.message}`);
} finally {
  await prisma.$disconnect();
}
EOF
bun /tmp/verify-users.mjs 2>&1 | grep -v "^Bun v"
echo ""

# ═══ STEP 7: RESTART PM2 ═══
echo "═══ 7. RESTART PM2 ═══"
pm2 restart nexvo-web 2>&1 | tail -2
sleep 5
echo "  PM2 status:"
pm2 list 2>&1 | grep -E "nexvo" | head -3
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  ✅ RESTORE SELESAI"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  Backup yang dipake: $BEST"
echo "  Current DB backup (pre-restore): $CURRENT_BACKUP"
echo ""
echo "  🌐 Test login di: https://nexvo.id"
echo "     - User biasa: login pakai phone/email + OTP"
echo "     - Admin: https://nexvo.id/id/admin"
echo ""
echo "  Kalau masih gak bisa login, kirim output verify-users ke saya."
echo "═══════════════════════════════════════════════════════════"