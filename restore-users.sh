#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO RESTORE 23 USERS — AMAN, TIDAK BISA HILANGKAN DATA
#
#  Cara kerja (DEFENSIVE — tidak pernah destroy data tanpa backup):
#  1. Auto-detect project path (nexvo.id VPS)
#  2. Cek CURRENT DB — kalau user count >= 23 → data AMAN, cuma perlu fix login
#  3. Kalau current DB < 23 user → scan backup di seluruh VPS:
#       - /home /root /tmp /var/backups /opt /srv
#       - Filter size >50KB (DB SQLite valid minimal segitu)
#       - Filter modified dalam 60 hari
#  4. Cek user count di tiap backup via Prisma (pakai field schema yang BENAR)
#  5. Pilih backup dengan user count TERBANYAK (prefer >= 23)
#  6. BACKUP current DB dulu (safety, namanya custom.db.pre-restore-<ts>)
#  7. Stop PM2, copy backup → current DB
#  8. JANGAN db:push (bisa drop data kalau schema beda)
#  9. Restart PM2, verify 23 user ada
#  10. Pastikan admin bisa login (create default kalau 0 admin)
#  11. Test login API jalan
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

echo "═══════════════════════════════════════════════════════════"
echo "  💾 NEXVO RESTORE 23 USERS — DEFENSIVE MODE"
echo "  Waktu: $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ═══ STEP 0: DETECT PROJECT PATH ═══
P=""
for candidate in /home/nexvo /var/www/nexvo /opt/nexvo /srv/nexvo /root/nexvo; do
  if [ -d "$candidate/db" ] && [ -f "$candidate/package.json" ]; then
    if grep -q '"nexvo"' "$candidate/package.json" 2>/dev/null; then
      P="$candidate"
      break
    fi
  fi
done

if [ -z "$P" ]; then
  P=$(find /home /root /opt /srv /var/www -maxdepth 5 -name "package.json" -type f 2>/dev/null \
      | head -20 \
      | while read f; do
          if grep -l '"nexvo"' "$f" 2>/dev/null > /dev/null; then
            dirname "$f"
            break
          fi
        done)
fi

[ -z "$P" ] && { echo "❌ Project nexvo gak ketemu di VPS."; exit 1; }
echo "  Project path: $P"
cd "$P"
echo ""

# ═══ STEP 1: CEK CURRENT DB DULU ═══
echo "═══ 1. CEK CURRENT DB (mungkin data masih ada, cuma session expired) ═══"
CURRENT_DB="$P/db/custom.db"
if [ ! -f "$CURRENT_DB" ]; then
  echo "  ❌ Current DB gak ada: $CURRENT_DB"
  echo "  Lanjut cari backup..."
  CURRENT_USERS=0
else
  DB_SIZE=$(wc -c < "$CURRENT_DB" 2>/dev/null || echo 0)
  echo "  DB file: $CURRENT_DB ($DB_SIZE bytes)"

  cat > /tmp/nexvo-check-current.mjs << 'EOF'
import { PrismaClient } from '@prisma/client';
import path from 'path';
const f = process.argv[2];
if (!f) { console.log('NO_FILE'); process.exit(1); }
try {
  const prisma = new PrismaClient({
    datasources: { db: { url: `file:${path.resolve(f)}` } },
  });
  const users = await prisma.user.count().catch(() => 0);
  const admins = await prisma.admin.count().catch(() => 0);
  const deposits = await prisma.deposit.count().catch(() => 0);
  console.log(`USERS=${users}`);
  console.log(`ADMINS=${admins}`);
  console.log(`DEPOSITS=${deposits}`);
  if (users > 0) {
    const samples = await prisma.user.findMany({
      take: 3,
      orderBy: { createdAt: 'asc' },
      select: { userId: true, whatsapp: true, email: true, name: true, mainBalance: true, createdAt: true }
    });
    console.log('SAMPLE:');
    for (const u of samples) {
      console.log(`  - ${u.userId} | ${u.whatsapp || '-'} | ${u.email || '-'} | ${u.name || '-'} | Rp${u.mainBalance || 0} | ${u.createdAt?.toISOString?.() || '?'}`);
    }
  }
  await prisma.$disconnect();
} catch (e) {
  console.log(`ERROR: ${e.message.split('\n')[0]}`);
}
EOF

  echo "  Querying current DB..."
  bun /tmp/nexvo-check-current.mjs "$CURRENT_DB" 2>&1 | grep -v "^Bun v"
  echo ""
  CURRENT_USERS=$(bun /tmp/nexvo-check-current.mjs "$CURRENT_DB" 2>/dev/null | grep "^USERS=" | cut -d= -f2 || echo 0)
  CURRENT_USERS=${CURRENT_USERS:-0}
  echo "  Current user count: $CURRENT_USERS"
fi
echo ""

# ═══ STEP 2: KALAU CURRENT DB UDAH 23 USER, SKIP RESTORE ═══
if [ "${CURRENT_USERS:-0}" -ge 23 ] 2>/dev/null; then
  echo "═══════════════════════════════════════════════════════════"
  echo "  ✅ DATA USER AMAN — Current DB sudah ada $CURRENT_USERS user (>= 23)"
  echo "  TIDAK PERLU RESTORE. Masalah bukan data hilang,"
  echo "  kemungkinan session expired atau PM2/Web bermasalah."
  echo "═══════════════════════════════════════════════════════════"
  echo ""
  echo "  Lanjut STEP 4: fix admin + restart service..."
  BEST=""
  CURRENT_BACKUP=""
  SKIP_RESTORE=1
else
  SKIP_RESTORE=0

  # ═══ STEP 3: SCAN BACKUP FILES DI SELURUH VPS ═══
  echo "═══ 2. SCAN BACKUP FILES (size >50KB, modified 60 hari) ═══"
  BACKUP_LIST=$(find /home /root /tmp /var/backups /opt /srv -maxdepth 6 \
    -name "custom.db*" -type f -size +50k -mtime -60 2>/dev/null \
    | grep -v "$CURRENT_DB$" \
    | head -50)

  if [ -z "$BACKUP_LIST" ]; then
    echo "  ❌ Gak nemu backup file DB apapun di VPS!"
    echo ""
    echo "  Lokasi yang sudah discan:"
    echo "    /home /root /tmp /var/backups /opt /srv"
    echo ""
    echo "  Coba cek manual:"
    echo "    find / -name 'custom.db*' -type f 2>/dev/null"
    echo "    find / -name '*.db' -size +100k 2>/dev/null | head -20"
    echo ""
    echo "  Kalau memang gak ada backup, data 23 user tidak bisa di-restore."
    echo "  Solusi: user harus register ulang."
    exit 2
  fi

  BACKUP_COUNT=$(echo "$BACKUP_LIST" | wc -l)
  echo "  Ditemukan $BACKUP_COUNT backup candidate:"
  echo "$BACKUP_LIST" | while read f; do
    SIZE=$(wc -c < "$f" 2>/dev/null || echo 0)
    MTIME=$(stat -c '%y' "$f" 2>/dev/null | cut -d. -f1)
    echo "    [$MTIME] $f ($SIZE bytes)"
  done
  echo ""

  # ═══ STEP 4: CEK USER COUNT DI TIAP BACKUP ═══
  echo "═══ 3. CEK USER COUNT DI TIAP BACKUP ═══"
  echo ""

  cat > /tmp/nexvo-rank-backups.mjs << 'EOF'
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
    });
    await prisma.$disconnect();
  } catch (e) {
    console.log(`  SKIP ${f}: ${e.message.split('\n')[0]}`);
  }
}

// Sort by user count desc, then by modified desc
results.sort((a, b) => {
  if (b.users !== a.users) return b.users - a.users;
  return new Date(b.modified) - new Date(a.modified);
});

console.log('\n=== RANKING BACKUP BY USER COUNT ===\n');
results.forEach((r, i) => {
  const marker = r.users >= 23 ? ' ★ TARGET' : (i === 0 ? ' (most users)' : '');
  console.log(`#${i + 1}: ${r.file}${marker}`);
  console.log(`    Users: ${r.users} | Admins: ${r.admins} | Deposits: ${r.deposits} | WD: ${r.withdrawals} | Invest: ${r.investments}`);
  console.log(`    Size: ${r.size} bytes | Modified: ${r.modified}`);
});

// Pilih: prefer yang >=23 user, kalau gak ada, ambil yang paling banyak
const target = results.find(r => r.users >= 23) || results[0];
if (target) {
  fs.writeFileSync('/tmp/nexvo-best-backup.txt', target.file);
  fs.writeFileSync('/tmp/nexvo-best-backup-users.txt', String(target.users));
  console.log(`\n=== BEST BACKUP: ${target.file} (${target.users} users) ===\n`);
} else {
  console.log('\n❌ Gak nemu backup valid');
  fs.writeFileSync('/tmp/nexvo-best-backup.txt', '');
}
EOF

  # Pass backup list as args
  echo "$BACKUP_LIST" | tr '\n' ' ' | xargs bun /tmp/nexvo-rank-backups.mjs 2>&1 | grep -v "^Bun v"
  echo ""

  BEST=$(cat /tmp/nexvo-best-backup.txt 2>/dev/null)
  BEST_USERS=$(cat /tmp/nexvo-best-backup-users.txt 2>/dev/null || echo 0)

  if [ -z "$BEST" ]; then
    echo "❌ Gak nemu backup yang bisa dibuka!"
    exit 3
  fi

  if [ "${BEST_USERS:-0}" -lt 23 ] 2>/dev/null; then
    echo "⚠️  Backup terbaik cuma punya $BEST_USERS user (< 23)."
    echo "    Mungkin backup ini dari versi awal sebelum semua user register."
    echo "    Tetap restore (lebih baik $BEST_USERS user daripada 0)?"
    echo ""
    echo "    Backup terpilih: $BEST"
    echo "    Lanjut restore dalam 5 detik... (Ctrl+C untuk cancel)"
    sleep 5
  fi

  # ═══ STEP 5: BACKUP CURRENT DB (SAFETY) ═══
  echo "═══ 4. BACKUP CURRENT DB (SAFETY — jangan overwrite tanpa backup) ═══"
  CURRENT_BACKUP="$P/db/custom.db.pre-restore-$(date +%Y%m%d-%H%M%S)"
  if [ -f "$CURRENT_DB" ]; then
    cp "$CURRENT_DB" "$CURRENT_BACKUP"
    echo "  ✅ Current DB dibackup: $CURRENT_BACKUP ($(wc -c < "$CURRENT_BACKUP") bytes)"
  else
    echo "  ℹ️  Current DB gak ada, skip backup"
  fi
  echo ""

  # ═══ STEP 6: STOP PM2 + RESTORE ═══
  echo "═══ 5. STOP PM2 + RESTORE DB ═══"
  echo "  Source: $BEST ($BEST_USERS users)"
  echo "  Target: $CURRENT_DB"

  pm2 stop nexvo-web 2>/dev/null
  sleep 2

  mkdir -p "$P/db"
  cp "$BEST" "$CURRENT_DB"
  chmod 644 "$CURRENT_DB"
  echo "  ✅ Restored: $(wc -c < "$CURRENT_DB") bytes"
  echo ""
fi

# ═══ STEP 7: PASTIKAN ADMIN BISA LOGIN ═══
echo "═══ 6. PASTIKAN ADMIN BISA LOGIN ═══"
cat > /tmp/nexvo-ensure-admin.mjs << 'EOF'
import { PrismaClient } from '@prisma/client';
import path from 'path';
const f = process.argv[2];
const prisma = new PrismaClient({
  datasources: { db: { url: `file:${path.resolve(f)}` } },
});
try {
  const adminCount = await prisma.admin.count();
  console.log(`  Admin count: ${adminCount}`);
  if (adminCount === 0) {
    console.log('  ⚠️  Tidak ada admin — bikin default admin/Admin@2024...');
    const bcrypt = (await import('bcryptjs')).default;
    const hashedPassword = await bcrypt.hash('Admin@2024', 10);
    await prisma.admin.create({
      data: {
        username: 'admin',
        email: 'admin@nexvo.id',
        password: hashedPassword,
        role: 'super_admin',
      }
    });
    console.log('  ✅ Default admin dibuat:');
    console.log('     Username: admin');
    console.log('     Email: admin@nexvo.id');
    console.log('     Password: Admin@2024');
  } else {
    const admin = await prisma.admin.findFirst({ select: { username: true, email: true, role: true } });
    console.log(`  ✅ Admin ada: ${admin.username} (${admin.email}) — role: ${admin.role}`);
    console.log('     (Pakai password admin yang sudah ada, bukan default)');
  }
} catch (e) {
  console.log(`  ERROR: ${e.message.split('\n')[0]}`);
} finally {
  await prisma.$disconnect();
}
EOF
bun /tmp/nexvo-ensure-admin.mjs "$CURRENT_DB" 2>&1 | grep -v "^Bun v"
echo ""

# ═══ STEP 8: RESTART PM2 ═══
echo "═══ 7. RESTART PM2 ═══"
pm2 restart nexvo-web 2>&1 | tail -3
sleep 5
pm2 list 2>&1 | grep -E "nexvo|name" | head -5
echo ""

# ═══ STEP 9: VERIFY FINAL ═══
echo "═══ 8. VERIFY FINAL USER COUNT ═══"
bun /tmp/nexvo-check-current.mjs "$CURRENT_DB" 2>&1 | grep -v "^Bun v"
echo ""

# ═══ STEP 10: TEST LOGIN API ═══
echo "═══ 9. TEST LOGIN API (admin) ═══"
sleep 3
LOGIN_RES=$(curl -s --max-time 10 -X POST "http://localhost:3000/api/admin/auth" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@2024"}' 2>/dev/null)
if [ -n "$LOGIN_RES" ]; then
  echo "  Login API response (first 200 chars):"
  echo "$LOGIN_RES" | head -c 200
  echo ""
else
  echo "  (no response — PM2 mungkin masih booting, cek lagi dalam 10 detik)"
fi
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  ✅ RESTORE & VERIFY SELESAI"
echo "═══════════════════════════════════════════════════════════"
echo ""
if [ "${SKIP_RESTORE:-0}" = "1" ]; then
  echo "  Data user AMAN dari awal — gak perlu restore."
else
  echo "  Backup dipake:      $BEST ($BEST_USERS users)"
  echo "  Current DB backup:  $CURRENT_BACKUP"
  echo "  (Kalau ada masalah, restore balik: cp $CURRENT_BACKUP $CURRENT_DB)"
fi
echo ""
echo "  🌐 Test login:"
echo "     User:  https://nexvo.id  → login pakai WhatsApp/Email + OTP"
echo "     Admin: https://nexvo.id/id/admin"
echo ""
echo "  Default admin credentials (kalau admin baru dibuat):"
echo "     Username: admin"
echo "     Password: Admin@2024"
echo ""
echo "═══════════════════════════════════════════════════════════"
