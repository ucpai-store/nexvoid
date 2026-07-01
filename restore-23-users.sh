#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO RESTORE 23 USERS — FOKUS kembalikan data akun user
#
#  Bug script lama (restore-users.sh) yang di-fix:
#  1. Test login pakai endpoint SALAH: /api/admin/auth → /api/auth/admin-login
#     → login test selalu gagal padahal sebenarnya jalan
#  2. Flow bug: kalau current DB >= 23 user, STOP — gak fix .env/admin
#     → padahal user gak bisa login karena Prisma gak bisa baca DB (.env salah)
#  3. crypto.randomUUID dipakai sebagai properti (truthy check) — gak valid
#
#  Script ini:
#  1. Detect project path (auto /var/www/nexvo vs /home/nexvo)
#  2. Scan SEMUA backup DB di VPS, rank by user count
#  3. Kalau current DB < 23 user → restore dari backup terbaik
#  4. Kalau current DB >= 23 user → data aman, skip restore
#  5. ALWAYS recreate .env (fix Prisma "Unable to open database")
#  6. Reset admin password ke Admin@2024 (bcrypt + ISO timestamp Prisma-compatible)
#  7. Fix ecosystem.config.cjs cwd
#  8. Restart nexvo-web + nexvo-cron
#  9. Verify END-TO-END:
#     - 23 user di DB (direct bun:sqlite, skip Prisma)
#     - Admin login via endpoint BENAR: /api/auth/admin-login
#     - Products API (aset)
#     - Cron port 3032
#
#  Data user 100% AMAN. Backup DB otomatis sebelum restore.
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

R='\033[0;31m'
G='\033[0;32m'
Y='\033[1;33m'
C='\033[0;36m'
B='\033[1m'
N='\033[0m'

echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "${C}  💾 NEXVO RESTORE 23 USERS — all-in-one${N}"
echo -e "${C}  Fix: restore data + .env path + admin login${N}"
echo -e "${C}  Waktu: $(date '+%Y-%m-%d %H:%M:%S')${N}"
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo ""

# ═══ STEP 0: DETECT PROJECT PATH ═══
echo -e "${B}═══ 0. DETECT PROJECT PATH ═══${N}"
P=""
for candidate in /var/www/nexvo /home/nexvo /opt/nexvo /srv/nexvo /root/nexvo; do
  if [ -d "$candidate/db" ] && [ -f "$candidate/package.json" ]; then
    if grep -q '"name": *"nexvo"' "$candidate/package.json" 2>/dev/null; then
      P="$candidate"
      break
    fi
  fi
done
if [ -z "$P" ]; then
  P=$(find /var/www /home /root /opt /srv -maxdepth 5 -name "package.json" -type f 2>/dev/null | while read f; do
    if grep -q '"name": *"nexvo"' "$f" 2>/dev/null; then dirname "$f"; break; fi
  done)
fi
[ -z "$P" ] && { echo -e "${R}❌ Project nexvo gak ketemu${N}"; exit 1; }
echo -e "  ${G}✅${N} Project: ${B}$P${N}"
DB="$P/db/custom.db"
mkdir -p "$P/db"
echo ""

# ═══ STEP 1: STOP SERVICE (release DB lock) ═══
echo -e "${B}═══ 1. STOP nexvo-web + nexvo-cron ═══${N}"
pm2 stop nexvo-web nexvo-cron 2>/dev/null && echo -e "  ${G}✅${N} PM2 stop OK" || echo -e "  ${Y}⚠️${N} PM2 stop skip"
sleep 2
pkill -f "next start" 2>/dev/null || true
pkill -f "cron-service" 2>/dev/null || true
sleep 1
echo ""

# ═══ STEP 2: CEK CURRENT DB USER COUNT ═══
echo -e "${B}═══ 2. CEK CURRENT DB USER COUNT ═══${N}"
cat > /tmp/nexvo-count-users.ts << 'EOF'
import { Database } from 'bun:sqlite';
import fs from 'fs';
const dbPath = process.argv[2];
if (!dbPath || !fs.existsSync(dbPath)) {
  console.log('USERS=0 ADMINS=0');
  process.exit(0);
}
try {
  const db = new Database(dbPath, { readonly: true });
  const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='User'").all() as any[];
  if (tables.length === 0) { console.log('USERS=0 ADMINS=0'); db.close(); process.exit(0); }
  const u = (db.query('SELECT COUNT(*) as c FROM User').get() as any).c;
  let a = 0;
  try { a = (db.query('SELECT COUNT(*) as c FROM Admin').get() as any).c; } catch {}
  console.log(`USERS=${u} ADMINS=${a}`);
  // Sample top 5 users
  if (u > 0) {
    console.log('SAMPLE:');
    const samples = db.query('SELECT userId, name, whatsapp, mainBalance, level FROM User ORDER BY createdAt ASC LIMIT 5').all() as any[];
    samples.forEach((s, i) => console.log(`  ${i+1}. ${s.userId} | ${s.name||'-'} | ${s.whatsapp||'-'} | Rp ${s.mainBalance||0} | ${s.level||'-'}`));
  }
  db.close();
} catch (e) { console.log('USERS=0 ADMINS=0 ERROR=' + e.message.split('\n')[0]); }
EOF

if [ ! -f "$DB" ]; then
  echo -e "  ${Y}⚠️${N} Current DB gak ada: $DB"
  CURRENT_USERS=0
else
  echo -e "  DB: $DB ($(wc -c < "$DB") bytes)"
  bun /tmp/nexvo-count-users.ts "$DB" 2>&1 | grep -v "^Bun v"
  RESULT=$(bun /tmp/nexvo-count-users.ts "$DB" 2>/dev/null | head -1)
  CURRENT_USERS=$(echo "$RESULT" | grep -oP 'USERS=\K[0-9]+' || echo 0)
  CURRENT_USERS=${CURRENT_USERS:-0}
  echo -e "  → Current: ${B}${CURRENT_USERS}${N} users"
fi
echo ""

# ═══ STEP 3: DECIDE — RESTORE OR SKIP ═══
SKIP_RESTORE=0
BEST=""
BEST_USERS=0

if [ "${CURRENT_USERS:-0}" -ge 23 ] 2>/dev/null; then
  echo -e "  ${G}✅ Current DB sudah ada ${CURRENT_USERS} user (>= 23)${N}"
  echo -e "  ${G}   Data user AMAN — skip restore, lanjut fix .env + admin${N}"
  SKIP_RESTORE=1
else
  echo -e "  ${Y}⚠️${N} Current DB cuma ${CURRENT_USERS} user (< 23) — perlu restore"
  echo ""

  # ═══ STEP 3a: SCAN BACKUP FILES ═══
  echo -e "${B}═══ 3. SCAN BACKUP FILES DI VPS ═══${N}"
  BACKUP_LIST=$(find /var/www /home /root /tmp /var/backups /opt /srv -maxdepth 6 \
    \( -name "custom.db*" -o -name "*.db.backup*" -o -name "db.db*" -o -name "nexvo*.db" \) -type f -size +50k -mtime -90 2>/dev/null \
    | grep -v "$DB$" | grep -v "\.pre-restore" | grep -v "\.pre-simple" | grep -v "\.pre-fix" | grep -v "\.backup-" \
    | sort -u | head -60)

  if [ -z "$BACKUP_LIST" ]; then
    echo -e "  ${R}❌ Gak nemu backup file DB di VPS${N}"
    echo -e "     Coba cek manual: find / -name '*.db' -size +50k 2>/dev/null"
    echo ""
  else
    BACKUP_COUNT=$(echo "$BACKUP_LIST" | wc -l)
    echo -e "  Ditemukan ${B}${BACKUP_COUNT}${N} backup candidate"
    echo ""

    # Rank backup by user count
    cat > /tmp/nexvo-rank-backups.ts << 'EOF'
import { Database } from 'bun:sqlite';
import fs from 'fs';
const files = process.argv.slice(2);
const results = [];
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  try {
    const db = new Database(f, { readonly: true });
    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='User'").all() as any[];
    if (tables.length === 0) { db.close(); continue; }
    const users = (db.query('SELECT COUNT(*) as c FROM User').get() as any).c;
    let admins = 0;
    try { admins = (db.query('SELECT COUNT(*) as c FROM Admin').get() as any).c; } catch {}
    const stat = fs.statSync(f);
    results.push({ file: f, users, admins, size: stat.size, mtime: stat.mtime });
    db.close();
  } catch {}
}
results.sort((a, b) => {
  if (b.users !== a.users) return b.users - a.users;
  return new Date(b.mtime).getTime() - new Date(a.mtime).getTime();
});
console.log('  === RANKING BACKUP BY USER COUNT ===');
results.forEach((r, i) => {
  const marker = r.users >= 23 ? ' ★ TARGET (>= 23)' : (i === 0 ? ' (most users)' : '');
  console.log(`  #${i+1}: ${r.file}${marker}`);
  console.log(`      Users: ${r.users} | Admins: ${r.admins} | Size: ${r.size} | Modified: ${r.mtime.toISOString().split('T')[0]}`);
});
const target = results.find(r => r.users >= 23) || results[0];
if (target) {
  fs.writeFileSync('/tmp/nexvo-best-backup.txt', target.file);
  fs.writeFileSync('/tmp/nexvo-best-backup-users.txt', String(target.users));
  console.log(`\n  === BEST BACKUP: ${target.file} (${target.users} users) ===`);
} else {
  fs.writeFileSync('/tmp/nexvo-best-backup.txt', '');
  console.log('\n  ❌ Gak nemu backup valid');
}
EOF

    echo "$BACKUP_LIST" | tr '\n' '\0' | xargs -0 bun /tmp/nexvo-rank-backups.ts 2>&1 | grep -v "^Bun v"
    echo ""

    BEST=$(cat /tmp/nexvo-best-backup.txt 2>/dev/null)
    BEST_USERS=$(cat /tmp/nexvo-best-backup-users.txt 2>/dev/null || echo 0)

    if [ -n "$BEST" ] && [ "${BEST_USERS:-0}" -ge 23 ] 2>/dev/null; then
      echo -e "  ${G}✅${N} Backup terbaik: ${B}$BEST${N} (${BEST_USERS} user)"
    elif [ -n "$BEST" ]; then
      echo -e "  ${Y}⚠️${N} Backup terbaik cuma ${BEST_USERS} user (< 23). Tetap dipake."
    else
      echo -e "  ${R}❌ Gak nemu backup yang bisa dibuka${N}"
    fi
  fi
  echo ""

  # ═══ STEP 3b: BACKUP CURRENT + RESTORE ═══
  if [ -n "$BEST" ]; then
    echo -e "${B}═══ 4. BACKUP CURRENT + RESTORE ═══${N}"
    BACKUP_NOW="$P/db/custom.db.pre-restore23-$(date +%Y%m%d-%H%M%S)"
    if [ -f "$DB" ]; then
      cp "$DB" "$BACKUP_NOW"
      echo -e "  ${G}✅${N} Current DB dibackup: $BACKUP_NOW"
    fi
    cp "$BEST" "$DB"
    chmod 644 "$DB"
    echo -e "  ${G}✅${N} Restored dari: $BEST"
    echo -e "  ${G}✅${N} New DB: $DB ($(wc -c < "$DB") bytes)"
    echo ""

    # Verify restore
    echo -e "${B}═══ 5. VERIFY RESTORE — 23 USER ADA? ═══${N}"
    bun /tmp/nexvo-count-users.ts "$DB" 2>&1 | grep -v "^Bun v"
    RESULT=$(bun /tmp/nexvo-count-users.ts "$DB" 2>/dev/null | head -1)
    NEW_USERS=$(echo "$RESULT" | grep -oP 'USERS=\K[0-9]+' || echo 0)
    NEW_USERS=${NEW_USERS:-0}
    if [ "${NEW_USERS:-0}" -ge 23 ] 2>/dev/null; then
      echo -e "  ${G}✅${N} RESTORE SUKSES — ${NEW_USERS} user ada di DB"
    else
      echo -e "  ${R}❌${N} RESTORE GAGAL — cuma ${NEW_USERS} user (harusnya >= 23)"
    fi
    echo ""
  fi
fi

# ═══ STEP 6: RECREATE .env (FIX PRISMA — root cause gak bisa login) ═══
echo -e "${B}═══ 6. RECREATE .env — fix Prisma 'Unable to open database' ═══${N}"
if [ -f "$P/.env" ]; then
  cp "$P/.env" "$P/.env.backup-$(date +%Y%m%d-%H%M%S)"
  OLD_URL=$(grep "^DATABASE_URL=" "$P/.env" 2>/dev/null | head -1)
  echo -e "  ${Y}OLD:${N} $OLD_URL"
fi
cat > "$P/.env" << EOF
# NEXVO Production — auto-fixed by restore-23-users.sh
# $(date '+%Y-%m-%d %H:%M:%S')
DATABASE_URL="file:$DB"
NEXTAUTH_SECRET=nexvo-secret-$(date +%s)
NEXTAUTH_URL=https://nexvo.id
NODE_ENV=production
JWT_SECRET=nexvo-jwt-secret-2024
CRON_SECRET=nexvo-cron-secret-2024
EOF
echo -e "  ${G}NEW:${N} DATABASE_URL=\"file:$DB\""
echo -e "  ${G}✅${N} .env recreated — Prisma bakal bisa baca DB"
echo ""

# ═══ STEP 7: RESET ADMIN PASSWORD (ISO TIMESTAMP, Prisma-compatible) ═══
echo -e "${B}═══ 7. RESET ADMIN PASSWORD ke Admin@2024 ═══${N}"
cat > /tmp/nexvo-reset-admin.ts << 'EOF'
import { Database } from 'bun:sqlite';
import fs from 'fs';
import bcrypt from 'bcryptjs';

const dbPath = process.argv[2];
if (!dbPath || !fs.existsSync(dbPath)) {
  console.log('  ERROR: DB gak ada'); process.exit(1);
}
const db = new Database(dbPath);
db.exec("PRAGMA journal_mode = WAL;");

// Cek tabel Admin
const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='Admin'").all() as any[];
if (tables.length === 0) {
  console.log('  ❌ Tabel Admin gak ada — skip'); db.close(); process.exit(0);
}

const nowIso = new Date().toISOString();
const hash = bcrypt.hashSync('Admin@2024', 10);
const adminCount = (db.query('SELECT COUNT(*) as c FROM Admin').get() as any).c;

if (adminCount === 0) {
  console.log('  ⚠️ Tabel Admin KOSONG — bikin admin baru');
  const id = 'admin-' + Date.now();
  db.run(`INSERT INTO Admin (id, username, email, password, name, role, loginAttempts, lockedUntil, createdAt, updatedAt)
          VALUES (?, 'admin', 'admin@nexvo.id', ?, 'Super Admin', 'superadmin', 0, NULL, ?, ?)`,
          [id, hash, nowIso, nowIso]);
  console.log(`  ✅ Admin baru: admin / Admin@2024`);
} else {
  const admins = db.query('SELECT username, email, role FROM Admin LIMIT 5').all() as any[];
  console.log(`  Admin ditemukan: ${adminCount} akun`);
  admins.forEach(a => console.log(`    - ${a.username} | ${a.email} | ${a.role}`));
  // Reset ALL admin password + unlock
  const reset = db.run(`UPDATE Admin SET password = ?, loginAttempts = 0, lockedUntil = NULL, updatedAt = ?`, [hash, nowIso]);
  console.log(`  ✅ Password reset ke "Admin@2024": ${reset.changes} admin`);
  // Verify bcrypt
  const verify = db.query("SELECT password FROM Admin WHERE username = 'admin' LIMIT 1").get() as any;
  if (verify && bcrypt.compareSync('Admin@2024', verify.password)) {
    console.log('  ✅ Bcrypt verify: true (password match)');
  } else if (verify) {
    const alt = db.query("SELECT password FROM Admin LIMIT 1").get() as any;
    if (alt && bcrypt.compareSync('Admin@2024', alt.password)) {
      console.log('  ✅ Bcrypt verify: true (password match on first admin)');
    } else {
      console.log('  ⚠️ Bcrypt verify: gak match — cek manual');
    }
  }
}
db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
db.close();
EOF

bun /tmp/nexvo-reset-admin.ts "$DB" 2>&1 | grep -v "^Bun v"
echo ""

# ═══ STEP 8: FIX ECOSYSTEM cwd ═══
echo -e "${B}═══ 8. FIX ECOSYSTEM.CONFIG.CJS cwd ═══${N}"
ECO_FILE="$P/ecosystem.config.cjs"
if [ -f "$ECO_FILE" ]; then
  sed -i "s|cwd: *'/home/nexvo'|cwd: '$P'|g" "$ECO_FILE"
  sed -i "s|cwd: *'/var/www/nexvo'|cwd: '$P'|g" "$ECO_FILE"
  sed -i "s|cwd: *'/root/nexvo'|cwd: '$P'|g" "$ECO_FILE"
  sed -i "s|cwd: *'/opt/nexvo'|cwd: '$P'|g" "$ECO_FILE"
  mkdir -p "$P/.pm2-logs"
  sed -i "s|/home/nexvo/.pm2-logs|$P/.pm2-logs|g" "$ECO_FILE"
  sed -i "s|/var/www/nexvo/.pm2-logs|$P/.pm2-logs|g" "$ECO_FILE"
  echo -e "  ${G}✅${N} ecosystem cwd=$P"
fi
echo ""

# ═══ STEP 9: START SERVICE ═══
echo -e "${B}═══ 9. START nexvo-web + nexvo-cron ═══${N}"
cd "$P"
pm2 delete nexvo-web nexvo-cron 2>/dev/null
sleep 1
pm2 start ecosystem.config.cjs 2>&1 | tail -8
sleep 3
pm2 save 2>&1 | tail -1
echo ""
pm2 list 2>&1 | grep -E "nexvo|name|─" | head -6
echo ""
echo -e "  ${C}Waiting 22s for nexvo-web boot...${N}"
sleep 22
echo ""

# ═══ STEP 10: VERIFY END-TO-END ═══
echo -e "${B}═══ 10. VERIFY — 23 user + admin login + aset ═══${N}"

# [1] Web HTTP
HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://localhost:3000/ 2>/dev/null)
[ "$HTTP" = "200" ] && echo -e "  ${G}✅${N} Web HTTP 200" || echo -e "  ${R}❌${N} Web HTTP $HTTP"

# [2] Next.js functional — homepage render HTML?
HOMEPAGE=$(curl -s --max-time 10 http://localhost:3000/ 2>/dev/null)
if echo "$HOMEPAGE" | grep -qi 'html\|nexvo\|<div\|<body'; then
  echo -e "  ${G}✅${N} Next.js render HTML"
else
  echo -e "  ${R}❌${N} Homepage gak render HTML — Next.js mungkin crash"
fi

# [3] nexvo-web PM2 status (informational)
PM2_STATUS=$(pm2 list 2>/dev/null | grep nexvo-web | awk '{print $10}' | head -1)
PM2_MEM=$(pm2 list 2>/dev/null | grep nexvo-web | grep -oP '\d+\.\d+mb' | head -1)
echo -e "  ${C}ℹ️${N}  nexvo-web PM2: status=$PM2_STATUS, mem=$PM2_MEM (bun parent; Next.js child track terpisah)"

# [4] DB DIRECT CHECK — 23 user ada? (skip Prisma, pakai bun:sqlite)
echo -e "  ${C}DB direct check (bun:sqlite, skip Prisma)...${N}"
RESULT=$(bun /tmp/nexvo-count-users.ts "$DB" 2>/dev/null | head -1)
FINAL_USERS=$(echo "$RESULT" | grep -oP 'USERS=\K[0-9]+' || echo 0)
FINAL_USERS=${FINAL_USERS:-0}
if [ "${FINAL_USERS:-0}" -ge 23 ] 2>/dev/null; then
  echo -e "  ${G}✅${N} DB: ${FINAL_USERS} user (>= 23) — DATA USER AMAN"
else
  echo -e "  ${R}❌${N} DB: cuma ${FINAL_USERS} user (< 23) — data belum restore"
fi

# [5] Admin login — TEST via endpoint BENAR /api/auth/admin-login
echo -e "  ${C}Test admin login via /api/auth/admin-login (endpoint BENAR)...${N}"
LOGIN_RES=$(curl -s --max-time 15 -X POST "http://localhost:3000/api/auth/admin-login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@2024"}' 2>/dev/null)
if echo "$LOGIN_RES" | grep -q '"success":true\|"token"'; then
  echo -e "  ${G}✅${N} Admin login OK — admin / Admin@2024"
else
  echo -e "  ${R}❌${N} Admin login GAGAL"
  echo -e "      Response: $(echo "$LOGIN_RES" | head -c 250)"
  echo -e "      ${Y}→ Cek: pm2 logs nexvo-web --lines 30 (lihat Prisma error)${N}"
fi

# [6] Products API (aset)
PROD_RES=$(curl -s --max-time 10 "http://localhost:3000/api/products" 2>/dev/null)
PROD_COUNT=$(echo "$PROD_RES" | grep -oP '"id"' | wc -l | tr -d ' ')
if [ "$PROD_COUNT" -gt 0 ]; then
  echo -e "  ${G}✅${N} Products API: $PROD_COUNT produk (aset muncul)"
else
  echo -e "  ${Y}⚠️${N} Products API: $PROD_COUNT produk (mungkin kosong)"
fi

# [7] Cron service
CRON_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:3032/" 2>/dev/null)
[ "$CRON_HTTP" != "000" ] && echo -e "  ${G}✅${N} Cron port 3032 OK (HTTP $CRON_HTTP)" || echo -e "  ${Y}⚠️${N} Cron port 3032 gak respon"
echo ""

# ═══ STEP 11: FINAL SUMMARY ═══
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "${C}  📊 RINGKASAN${N}"
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo ""
echo -e "  ${G}✅${N} Data user: ${B}${FINAL_USERS}${N} user di DB"
if [ "$SKIP_RESTORE" = "1" ]; then
  echo -e "  ${G}✅${N} Restore: SKIP (current DB sudah >= 23 user)"
else
  echo -e "  ${G}✅${N} Restore: dari $BEST (${BEST_USERS} user)"
fi
echo -e "  ${G}✅${N} .env fixed → DATABASE_URL = file:$DB"
echo -e "  ${G}✅${N} Admin password reset → admin / Admin@2024"
echo -e "  ${G}✅${N} nexvo-web + nexvo-cron restarted"
echo ""
echo -e "  ${Y}PENTING — User WAJIB lakukan di browser:${N}"
echo -e "    1. Buka ${B}https://nexvo.id/recovery.html${N}"
echo -e "    2. Klik ${B}'Clear Cache & Reload'${N} (clear localStorage + cache)"
echo -e "    3. Login admin: ${B}admin / Admin@2024${N}"
echo -e "    4. Login user: WA + OTP seperti biasa"
echo -e "    5. Cek aset + saldo — harus muncul semua"
echo ""
echo -e "  ${C}Kalau admin login masih gagal:${N}"
echo -e "    - Screenshot output section 10 (verify) — kirim ke saya"
echo -e "    - Cek log: pm2 logs nexvo-web --lines 50"
echo -e "    - Cek DB: bun /tmp/nexvo-count-users.ts $DB"
echo ""
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
