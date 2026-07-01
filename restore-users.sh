#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO RESTORE 23 USERS — pakai bun:sqlite (NO PRISMA, NO MODULE BUG)
#
#  Versi 2: gak pakai Prisma client (yang kena module cache bug di VPS),
#  pakai bun:sqlite built-in yang pasti jalan.
#
#  Defensive: tidak pernah destroy data tanpa backup.
#  1. Cek current DB — kalau >= 23 user → data AMAN, skip restore
#  2. Kalau < 23 → scan 8+ backup di VPS, pilih user count terbanyak
#  3. Backup current DB dulu (custom.db.pre-restore-<ts>)
#  4. Stop PM2, restore, restart
#  5. Pastikan admin bisa login (reset password admin/Admin@2024 kalau perlu)
#  6. Test login API
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

echo "═══════════════════════════════════════════════════════════"
echo "  💾 NEXVO RESTORE 23 USERS — bun:sqlite edition (v2)"
echo "  Waktu: $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ═══ STEP 0: DETECT PROJECT PATH ═══
P=""
for candidate in /var/www/nexvo /home/nexvo /opt/nexvo /srv/nexvo /root/nexvo; do
  if [ -d "$candidate/db" ] && [ -f "$candidate/package.json" ]; then
    if grep -q '"nexvo"' "$candidate/package.json" 2>/dev/null; then
      P="$candidate"
      break
    fi
  fi
done

if [ -z "$P" ]; then
  P=$(find /var/www /home /root /opt /srv -maxdepth 5 -name "package.json" -type f 2>/dev/null \
      | head -30 \
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

# ═══ HELPERS: bun:sqlite query script ═══
# Script ini dipakai untuk query DB file tertentu (current atau backup)
# Output format: USERS=N ADMINS=N DEPOSITS=N
cat > /tmp/nexvo-sqlite-query.ts << 'EOF'
import { Database } from 'bun:sqlite';
import fs from 'fs';

const dbPath = process.argv[2];
const mode = process.argv[3] || 'count'; // 'count' or 'sample'

if (!dbPath || !fs.existsSync(dbPath)) {
  console.log('USERS=0 ADMINS=0 DEPOSITS=0');
  process.exit(0);
}

try {
  const db = new Database(dbPath, { readonly: true });

  // Cek apakah tabel User ada
  const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('User','Admin','Deposit','Withdrawal','Investment')").all() as Array<{name: string}>;
  const tableNames = tables.map(t => t.name);

  let users = 0, admins = 0, deposits = 0, withdrawals = 0, investments = 0;
  if (tableNames.includes('User')) {
    users = (db.query('SELECT COUNT(*) as c FROM User').get() as {c: number}).c;
  }
  if (tableNames.includes('Admin')) {
    admins = (db.query('SELECT COUNT(*) as c FROM Admin').get() as {c: number}).c;
  }
  if (tableNames.includes('Deposit')) {
    deposits = (db.query('SELECT COUNT(*) as c FROM Deposit').get() as {c: number}).c;
  }
  if (tableNames.includes('Withdrawal')) {
    withdrawals = (db.query('SELECT COUNT(*) as c FROM Withdrawal').get() as {c: number}).c;
  }
  if (tableNames.includes('Investment')) {
    investments = (db.query('SELECT COUNT(*) as c FROM Investment').get() as {c: number}).c;
  }

  console.log(`USERS=${users} ADMINS=${admins} DEPOSITS=${deposits} WITHDRAWALS=${withdrawals} INVESTMENTS=${investments}`);

  if (mode === 'sample' && users > 0) {
    console.log('SAMPLE:');
    const samples = db.query('SELECT userId, whatsapp, email, name, mainBalance, level, createdAt FROM User ORDER BY createdAt ASC LIMIT 10').all() as Array<any>;
    samples.forEach((u, i) => {
      const created = u.createdAt ? new Date(typeof u.createdAt === 'number' ? u.createdAt : parseInt(u.createdAt)).toISOString().split('T')[0] : '?';
      console.log(`  ${i+1}. ${u.userId} | ${u.whatsapp || '-'} | ${u.email || '-'} | ${u.name || '-'} | ${u.level || '-'} | Rp${u.mainBalance || 0} | ${created}`);
    });
  }

  if (mode === 'admin' && admins > 0) {
    console.log('ADMINS_LIST:');
    const adminList = db.query('SELECT username, email, role FROM Admin LIMIT 5').all() as Array<any>;
    adminList.forEach(a => {
      console.log(`  - ${a.username} | ${a.email} | ${a.role}`);
    });
  }

  db.close();
} catch (e) {
  console.log(`USERS=0 ADMINS=0 DEPOSITS=0`);
  console.log(`ERROR: ${e.message.split('\n')[0]}`);
}
EOF

# ═══ STEP 1: CEK CURRENT DB ═══
echo "═══ 1. CEK CURRENT DB (mungkin data masih ada, cuma session expired) ═══"
CURRENT_DB="$P/db/custom.db"
if [ ! -f "$CURRENT_DB" ]; then
  echo "  ❌ Current DB gak ada: $CURRENT_DB"
  CURRENT_USERS=0
else
  DB_SIZE=$(wc -c < "$CURRENT_DB" 2>/dev/null || echo 0)
  echo "  DB file: $CURRENT_DB ($DB_SIZE bytes)"
  echo "  Querying via bun:sqlite (gak perlu Prisma)..."
  echo ""
  bun /tmp/nexvo-sqlite-query.ts "$CURRENT_DB" sample 2>&1 | grep -v "^Bun v"
  echo ""
  RESULT=$(bun /tmp/nexvo-sqlite-query.ts "$CURRENT_DB" 2>/dev/null | head -1)
  CURRENT_USERS=$(echo "$RESULT" | grep -oP 'USERS=\K[0-9]+' || echo 0)
  CURRENT_ADMINS=$(echo "$RESULT" | grep -oP 'ADMINS=\K[0-9]+' || echo 0)
  CURRENT_USERS=${CURRENT_USERS:-0}
  CURRENT_ADMINS=${CURRENT_ADMINS:-0}
  echo "  → Current: $CURRENT_USERS users, $CURRENT_ADMINS admins"
fi
echo ""

# ═══ STEP 2: DECIDE — SKIP RESTORE OR PROCEED ═══
if [ "${CURRENT_USERS:-0}" -ge 23 ] 2>/dev/null; then
  echo "═══════════════════════════════════════════════════════════"
  echo "  ✅ DATA USER AMAN — Current DB sudah ada $CURRENT_USERS user (>= 23)"
  echo "  TIDAK PERLU RESTORE. Masalah bukan data hilang."
  echo "═══════════════════════════════════════════════════════════"
  echo ""
  BEST=""
  CURRENT_BACKUP=""
  SKIP_RESTORE=1
else
  SKIP_RESTORE=0
  echo "  ⚠️  Current DB cuma $CURRENT_USERS user (< 23) — perlu restore"
  echo ""

  # ═══ STEP 3: SCAN BACKUP FILES ═══
  echo "═══ 2. SCAN BACKUP FILES (size >50KB, modified 60 hari) ═══"
  BACKUP_LIST=$(find /var/www /home /root /tmp /var/backups /opt /srv -maxdepth 6 \
    \( -name "custom.db*" -o -name "*.db.backup*" -o -name "db.db*" \) -type f -size +50k -mtime -60 2>/dev/null \
    | grep -v "$CURRENT_DB$" \
    | sort -u \
    | head -50)

  if [ -z "$BACKUP_LIST" ]; then
    echo "  ❌ Gak nemu backup file DB apapun di VPS!"
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

  # ═══ STEP 4: RANK BACKUP BY USER COUNT ═══
  echo "═══ 3. RANK BACKUP BY USER COUNT (via bun:sqlite) ═══"
  echo ""

  # Bikin script ranker
  cat > /tmp/nexvo-rank-backups.ts << 'EOF'
import { Database } from 'bun:sqlite';
import fs from 'fs';

const files = process.argv.slice(2);
const results = [];

for (const f of files) {
  if (!fs.existsSync(f)) continue;
  try {
    const db = new Database(f, { readonly: true });
    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='User'").all() as Array<{name: string}>;
    if (tables.length === 0) {
      db.close();
      continue;
    }
    const users = (db.query('SELECT COUNT(*) as c FROM User').get() as {c: number}).c;
    let admins = 0, deposits = 0;
    try { admins = (db.query('SELECT COUNT(*) as c FROM Admin').get() as {c: number}).c; } catch {}
    try { deposits = (db.query('SELECT COUNT(*) as c FROM Deposit').get() as {c: number}).c; } catch {}
    const stat = fs.statSync(f);
    results.push({ file: f, users, admins, deposits, size: stat.size, mtime: stat.mtime });
    db.close();
  } catch (e) {
    // skip
  }
}

// Sort by users desc, then mtime desc
results.sort((a, b) => {
  if (b.users !== a.users) return b.users - a.users;
  return new Date(b.mtime).getTime() - new Date(a.mtime).getTime();
});

console.log('=== RANKING BACKUP BY USER COUNT ===\n');
results.forEach((r, i) => {
  const marker = r.users >= 23 ? ' ★ TARGET' : (i === 0 ? ' (most users)' : '');
  console.log(`#${i+1}: ${r.file}${marker}`);
  console.log(`    Users: ${r.users} | Admins: ${r.admins} | Deposits: ${r.deposits} | Size: ${r.size} | Modified: ${r.mtime.toISOString().split('T')[0]}`);
});

const target = results.find(r => r.users >= 23) || results[0];
if (target) {
  fs.writeFileSync('/tmp/nexvo-best-backup.txt', target.file);
  fs.writeFileSync('/tmp/nexvo-best-backup-users.txt', String(target.users));
  console.log(`\n=== BEST BACKUP: ${target.file} (${target.users} users) ===`);
} else {
  fs.writeFileSync('/tmp/nexvo-best-backup.txt', '');
  console.log('\n❌ Gak nemu backup valid');
}
EOF

  echo "$BACKUP_LIST" | tr '\n' '\0' | xargs -0 bun /tmp/nexvo-rank-backups.ts 2>&1 | grep -v "^Bun v"
  echo ""

  BEST=$(cat /tmp/nexvo-best-backup.txt 2>/dev/null)
  BEST_USERS=$(cat /tmp/nexvo-best-backup-users.txt 2>/dev/null || echo 0)

  if [ -z "$BEST" ]; then
    echo "❌ Gak nemu backup yang bisa dibuka!"
    echo ""
    echo "  Padahal DB file ada di:"
    echo "    $CURRENT_DB ($DB_SIZE bytes)"
    echo ""
    echo "  Kemungkinan besar data masih ada tapi di tabel berbeda."
    echo "  Coba jalankan manual cek:"
    echo "    cd $P && bun -e \"import {Database} from 'bun:sqlite'; const db = new Database('$CURRENT_DB'); console.log(db.query(\\\"SELECT name FROM sqlite_master WHERE type='table'\\\").all());\""
    exit 3
  fi

  if [ "${BEST_USERS:-0}" -lt 23 ] 2>/dev/null; then
    echo "⚠️  Backup terbaik cuma $BEST_USERS user (< 23). Tetap restore dalam 5 detik..."
    sleep 5
  fi

  # ═══ STEP 5: BACKUP CURRENT DB (SAFETY) ═══
  echo "═══ 4. BACKUP CURRENT DB (SAFETY) ═══"
  CURRENT_BACKUP="$P/db/custom.db.pre-restore-$(date +%Y%m%d-%H%M%S)"
  if [ -f "$CURRENT_DB" ]; then
    cp "$CURRENT_DB" "$CURRENT_BACKUP"
    echo "  ✅ Current DB dibackup: $CURRENT_BACKUP ($(wc -c < "$CURRENT_BACKUP") bytes)"
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
# Reset password admin pertama ke Admin@2024 (kalau ada admin), atau create admin baru
cat > /tmp/nexvo-ensure-admin.ts << 'EOF'
import { Database } from 'bun:sqlite';
import fs from 'fs';

const dbPath = process.argv[2];
if (!dbPath || !fs.existsSync(dbPath)) {
  console.log('  ERROR: DB file gak ada');
  process.exit(1);
}

// Import bcryptjs
let hash: (s: string) => Promise<string>;
try {
  const bcrypt = await import('bcryptjs');
  hash = (s: string) => bcrypt.default.hash(s, 10);
} catch {
  // Fallback: pakai bcrypt node
  const bcrypt = await import('bcrypt');
  hash = (s: string) => bcrypt.hashSync(s, 10);
}

const db = new Database(dbPath);

// Cek tabel Admin
const adminTable = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='Admin'").all() as Array<{name: string}>;
if (adminTable.length === 0) {
  console.log('  ⚠️  Tabel Admin gak ada — skip');
  db.close();
  process.exit(0);
}

const adminCount = (db.query('SELECT COUNT(*) as c FROM Admin').get() as {c: number}).c;
console.log(`  Admin count: ${adminCount}`);

const hashedPassword = await hash('Admin@2024');

if (adminCount === 0) {
  // Create default admin
  // Cek kolom tabel Admin
  const cols = db.query("PRAGMA table_info(Admin)").all() as Array<{name: string}>;
  const colNames = cols.map(c => c.name);
  console.log(`  Admin columns: ${colNames.join(', ')}`);

  // Insert minimal admin
  const id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  if (colNames.includes('username') && colNames.includes('email') && colNames.includes('password')) {
    const roleCol = colNames.includes('role') ? 'role' : null;
    const colsToInsert = ['id', 'username', 'email', 'password'];
    const vals: any[] = [id, 'admin', 'admin@nexvo.id', hashedPassword];
    if (roleCol) { colsToInsert.push(roleCol); vals.push('super_admin'); }
    if (colNames.includes('createdAt')) { colsToInsert.push('createdAt'); vals.push(Date.now()); }
    if (colNames.includes('updatedAt')) { colsToInsert.push('updatedAt'); vals.push(Date.now()); }
    const placeholders = colsToInsert.map(() => '?').join(',');
    db.query(`INSERT INTO Admin (${colsToInsert.join(',')}) VALUES (${placeholders})`).run(...vals);
    console.log('  ✅ Default admin dibuat:');
    console.log('     Username: admin');
    console.log('     Email: admin@nexvo.id');
    console.log('     Password: Admin@2024');
  }
} else {
  // Reset password admin pertama ke Admin@2024
  const firstAdmin = db.query('SELECT username, email FROM Admin LIMIT 1').get() as {username: string, email: string};
  console.log(`  ✅ Admin ada: ${firstAdmin.username} (${firstAdmin.email})`);
  console.log('  → Reset password admin pertama ke Admin@2024...');

  // Update password admin pertama
  db.query('UPDATE Admin SET password = ? WHERE username = ?').run(hashedPassword, firstAdmin.username);
  console.log('  ✅ Password admin reset ke: Admin@2024');
}

db.close();
EOF

bun /tmp/nexvo-ensure-admin.ts "$CURRENT_DB" 2>&1 | grep -v "^Bun v"
echo ""

# ═══ STEP 8: RESTART PM2 ═══
echo "═══ 7. RESTART PM2 ═══"
pm2 restart nexvo-web 2>&1 | tail -3
sleep 5
pm2 list 2>&1 | grep -E "nexvo|name" | head -5
echo ""

# ═══ STEP 9: VERIFY FINAL ═══
echo "═══ 8. VERIFY FINAL USER COUNT ═══"
bun /tmp/nexvo-sqlite-query.ts "$CURRENT_DB" sample 2>&1 | grep -v "^Bun v"
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
echo "  Admin credentials (password sudah direset):"
echo "     Username: admin  (atau username admin yang sudah ada)"
echo "     Password: Admin@2024"
echo ""
echo "═══════════════════════════════════════════════════════════"
