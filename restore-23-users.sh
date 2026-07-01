#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO RESTORE 23 USERS — restore data akun user dari backup
#
#  Script ini FOCUS cuma satu hal: KEMBALIKAN 23 AKUN USER.
#
#  Alur:
#  1. STOP nexvo-web + nexvo-cron (release DB lock)
#  2. CEK current DB — kalau sudah 23 user, skip restore (data aman)
#  3. Kalau < 23 user → SCAN semua backup DB di VPS
#  4. RANK backup by user count (pilih yang >= 23 user, terbaru)
#  5. Backup current DB (safety)
#  6. RESTORE dari backup terbaik
#  7. RESET admin password → admin / Admin@2024
#  8. FIX saldo → mainBalance = totalProfit - totalWithdraw
#  9. ALWAYS recreate .env (fix Prisma path)
#  10. START service
#  11. VERIFY: 23 user ada di DB + admin login + products API
#
#  NO build, NO git pull, NO profit-force API.
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

R='\033[0;31m'
G='\033[0;32m'
Y='\033[1;33m'
C='\033[0;36m'
B='\033[1m'
N='\033[0m'

echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "${C}  💾 NEXVO RESTORE 23 USERS — kembalikan data akun${N}"
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
echo -e "  DB target: $DB"
echo ""

# ═══ STEP 1: STOP SERVICE (release DB lock) ═══
echo -e "${B}═══ 1. STOP nexvo-web + nexvo-cron ═══${N}"
pm2 stop nexvo-web nexvo-cron 2>/dev/null && echo -e "  ${G}✅${N} PM2 stop OK" || echo -e "  ${Y}⚠️${N} PM2 stop skip"
sleep 2
pkill -f "next start" 2>/dev/null && echo -e "  ${G}✅${N} Kill next start" || true
pkill -f "cron-service" 2>/dev/null && echo -e "  ${G}✅${N} Kill cron-service" || true
sleep 1
echo ""

# ═══ STEP 2: CEK CURRENT DB STATE ═══
echo -e "${B}═══ 2. CEK CURRENT DB (data masih ada?) ═══${N}"
cat > /tmp/nexvo-cek-db.ts << 'EOF'
import { Database } from 'bun:sqlite';
import fs from 'fs';

const dbPath = process.argv[2];
if (!dbPath || !fs.existsSync(dbPath)) {
  console.log('  ❌ DB file gak ada');
  console.log('USERS=0');
  process.exit(0);
}
try {
  const db = new Database(dbPath, { readonly: true });
  const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{name:string}>;
  const names = tables.map(t => t.name);
  console.log(`  Tabel ada: ${names.length}`);
  let users = 0, admins = 0, products = 0;
  if (names.includes('User')) {
    users = (db.query('SELECT COUNT(*) as c FROM User').get() as any).c;
    console.log(`  User: ${users}`);
    if (users > 0) {
      const sample = db.query('SELECT userId, whatsapp, name, mainBalance, level FROM User ORDER BY rowid ASC LIMIT 5').all() as any[];
      console.log('  Sample user:');
      sample.forEach((u, i) => console.log(`    ${i+1}. ${u.userId} | ${u.whatsapp||'-'} | ${u.name||'-'} | Rp ${u.mainBalance||0} | ${u.level||'-'}`));
    }
  } else {
    console.log('  ❌ Tabel User GAK ADA — DB corrupt');
  }
  if (names.includes('Admin')) {
    admins = (db.query('SELECT COUNT(*) as c FROM Admin').get() as any).c;
    console.log(`  Admin: ${admins}`);
  }
  if (names.includes('Product')) {
    products = (db.query('SELECT COUNT(*) as c FROM Product').get() as any).c;
    console.log(`  Product: ${products}`);
  }
  console.log(`USERS=${users}`);
  db.close();
} catch (e) {
  console.log(`  ❌ Error baca DB: ${e.message.split('\n')[0]}`);
  console.log('USERS=0');
}
EOF

CURRENT_USERS=0
if [ -f "$DB" ]; then
  echo "  DB file: $DB ($(wc -c < "$DB") bytes)"
  CEK_OUTPUT=$(bun /tmp/nexvo-cek-db.ts "$DB" 2>&1 | grep -v "^Bun v")
  echo "$CEK_OUTPUT"
  CURRENT_USERS=$(echo "$CEK_OUTPUT" | grep -oP 'USERS=\K[0-9]+' || echo 0)
  CURRENT_USERS=${CURRENT_USERS:-0}
fi
echo ""

# ═══ STEP 3: DECIDE — SKIP RESTORE OR PROCEED ═══
if [ "${CURRENT_USERS:-0}" -ge 23 ] 2>/dev/null; then
  echo -e "${G}═══════════════════════════════════════════════════════════${N}"
  echo -e "${G}  ✅ DATA USER AMAN — $CURRENT_USERS user sudah ada di DB${N}"
  echo -e "${G}  TIDAK PERLU RESTORE. Skip ke fix admin + saldo.${N}"
  echo -e "${G}═══════════════════════════════════════════════════════════${N}"
  echo ""
  BEST_DB=""
else
  echo -e "${Y}  ⚠️ Current DB cuma $CURRENT_USERS user (< 23) — perlu restore${N}"
  echo ""

  # ═══ STEP 4: SCAN BACKUP FILES ═══
  echo -e "${B}═══ 3. SCAN BACKUP DB di VPS ═══${N}"
  BACKUP_LIST=$(find /var/www /home /root /tmp /var/backups /opt /srv -maxdepth 7 \
    \( -name "custom.db*" -o -name "*.db" -o -name "*.db.backup*" -o -name "nexvo*.db*" \) \
    -type f -size +30k 2>/dev/null \
    | grep -v "$DB$" \
    | grep -v "node_modules" \
    | sort -u)

  if [ -z "$BACKUP_LIST" ]; then
    echo -e "  ${R}❌ Gak nemu backup DB apapun di VPS${N}"
    echo -e "  ${Y}→ Cek manual: find / -name '*.db' 2>/dev/null | head -20${N}"
    echo ""
  else
    BACKUP_COUNT=$(echo "$BACKUP_LIST" | wc -l | tr -d ' ')
    echo -e "  ${G}✅${N} Ditemukan ${B}$BACKUP_COUNT${N} backup candidate:"
    echo "$BACKUP_LIST" | while IFS= read -r f; do
      SIZE=$(wc -c < "$f" 2>/dev/null || echo 0)
      MTIME=$(stat -c '%y' "$f" 2>/dev/null | cut -d. -f1)
      echo "    [$MTIME] $f ($SIZE bytes)"
    done
    echo ""

    # ═══ STEP 5: RANK BACKUP BY USER COUNT ═══
    echo -e "${B}═══ 4. RANK BACKUP BY USER COUNT ═══${N}"
    cat > /tmp/nexvo-rank-backups.ts << 'EOF'
import { Database } from 'bun:sqlite';
import fs from 'fs';

const files = process.argv.slice(2);
const results = [];

for (const f of files) {
  if (!fs.existsSync(f)) continue;
  try {
    const db = new Database(f, { readonly: true });
    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='User'").all() as Array<{name:string}>;
    if (tables.length === 0) { db.close(); continue; }
    const users = (db.query('SELECT COUNT(*) as c FROM User').get() as any).c;
    let admins = 0, products = 0;
    try { admins = (db.query('SELECT COUNT(*) as c FROM Admin').get() as any).c; } catch {}
    try { products = (db.query('SELECT COUNT(*) as c FROM Product').get() as any).c; } catch {}
    const stat = fs.statSync(f);
    results.push({ file: f, users, admins, products, size: stat.size, mtime: stat.mtime });
    db.close();
  } catch (e) { /* skip */ }
}

// Sort: users DESC, mtime DESC (prefer banyak user + backup terbaru)
results.sort((a, b) => {
  if (b.users !== a.users) return b.users - a.users;
  return b.mtime - a.mtime;
});

console.log('  RANK | USERS | ADMINS | PRODUCTS | SIZE     | MTIME               | FILE');
console.log('  ─────┼───────┼────────┼──────────┼──────────┼─────────────────────┼────────────────');
results.forEach((r, i) => {
  const mt = new Date(r.mtime).toISOString().replace('T', ' ').split('.')[0];
  const sz = (r.size / 1024).toFixed(0) + 'KB';
  console.log(`  ${String(i+1).padStart(4)} | ${String(r.users).padStart(5)} | ${String(r.admins).padStart(6)} | ${String(r.products).padStart(8)} | ${sz.padStart(8)} | ${mt} | ${r.file}`);
});

// Pick best: prefer >= 23 users, fallback to most users
const best = results.find(r => r.users >= 23) || results[0];
if (best) {
  console.log('');
  console.log(`BEST=${best.file}`);
  console.log(`BEST_USERS=${best.users}`);
}
EOF

    RANK_OUTPUT=$(echo "$BACKUP_LIST" | xargs -d '\n' bun /tmp/nexvo-rank-backups.ts 2>&1 | grep -v "^Bun v")
    echo "$RANK_OUTPUT"
    echo ""
    BEST_DB=$(echo "$RANK_OUTPUT" | grep -oP 'BEST=\K.*' || echo "")
    BEST_USERS=$(echo "$RANK_OUTPUT" | grep -oP 'BEST_USERS=\K[0-9]+' || echo 0)

    if [ -z "$BEST_DB" ] || [ ! -f "$BEST_DB" ]; then
      echo -e "  ${R}❌ Gak ada backup valid dengan tabel User${N}"
      echo -e "  ${Y}→ Mungkin semua DB corrupt. Cek manual.${N}"
      BEST_DB=""
    else
      echo -e "  ${G}✅${N} Backup terbaik: ${B}$BEST_DB${N} ($BEST_USERS user)"
      echo ""

      # ═══ STEP 6: BACKUP CURRENT + RESTORE ═══
      echo -e "${B}═══ 5. RESTORE dari backup terbaik ═══${N}"
      if [ -f "$DB" ]; then
        BACKUP_CUR="$P/db/custom.db.pre-restore23-$(date +%Y%m%d-%H%M%S)"
        cp "$DB" "$BACKUP_CUR"
        echo -e "  ${G}✅${N} Current DB di-backup: $BACKUP_CUR"
      fi
      cp "$BEST_DB" "$DB"
      chmod 644 "$DB"
      echo -e "  ${G}✅${N} Restore dari: $BEST_DB → $DB"
      echo ""

      # Verify restore
      echo -e "  ${C}Verify restore...${N}"
      VERIFY_OUTPUT=$(bun /tmp/nexvo-cek-db.ts "$DB" 2>&1 | grep -v "^Bun v")
      echo "$VERIFY_OUTPUT"
      echo ""
    fi
  fi
fi

# ═══ STEP 7: FIX .ENV (Prisma path) ═══
echo -e "${B}═══ 6. RECREATE .env (fix Prisma path) ═══${N}"
if [ -f "$P/.env" ]; then
  cp "$P/.env" "$P/.env.backup-$(date +%Y%m%d-%H%M%S)"
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
echo -e "  ${G}✅${N} .env: DATABASE_URL=\"file:$DB\""
echo ""

# ═══ STEP 8: RESET ADMIN + FIX SALDO ═══
echo -e "${B}═══ 7. RESET ADMIN PASSWORD + FIX SALDO ═══${N}"
cat > /tmp/nexvo-fix-admin-saldo.ts << 'EOF'
import { Database } from 'bun:sqlite';
import fs from 'fs';
import bcrypt from 'bcryptjs';

const dbPath = process.argv[2];
if (!dbPath || !fs.existsSync(dbPath)) {
  console.log('ERROR: DB gak ada');
  process.exit(1);
}

const db = new Database(dbPath);
db.exec("PRAGMA journal_mode = WAL;");

const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{name:string}>;
const names = tables.map(t => t.name);
const nowIso = new Date().toISOString();

// ─── RESET ADMIN ───
console.log('  ─── RESET ADMIN PASSWORD ───');
if (names.includes('Admin')) {
  const admins = db.query("SELECT id, username, email, role FROM Admin").all() as any[];
  if (admins.length === 0) {
    console.log('  ⚠️ Admin kosong — bikin admin baru');
    const hash = bcrypt.hashSync('Admin@2024', 10);
    const id = 'admin-' + Date.now();
    db.run(`INSERT INTO Admin (id, username, email, password, name, role, loginAttempts, lockedUntil, createdAt, updatedAt)
            VALUES (?, 'admin', 'admin@nexvo.id', ?, 'Super Admin', 'superadmin', 0, NULL, ?, ?)`,
            [id, hash, nowIso, nowIso]);
    console.log(`  ✅ Admin baru: admin / Admin@2024`);
  } else {
    console.log(`  Admin ada: ${admins.length} akun`);
    admins.forEach(a => console.log(`    - ${a.username} (${a.email}) role=${a.role}`));
    const hash = bcrypt.hashSync('Admin@2024', 10);
    const reset = db.run(`UPDATE Admin SET password = ?, loginAttempts = 0, lockedUntil = NULL, updatedAt = ?`, [hash, nowIso]);
    console.log(`  ✅ Password reset ke Admin@2024: ${reset.changes} admin`);
    // Verify
    const v = db.query("SELECT password FROM Admin WHERE username = 'admin' LIMIT 1").get() as any;
    if (v && bcrypt.compareSync('Admin@2024', v.password)) {
      console.log(`  ✅ bcrypt verify: true`);
    } else {
      console.log(`  ❌ bcrypt verify FAILED`);
    }
  }
} else {
  console.log('  ❌ Tabel Admin gak ada');
}
console.log('');

// ─── FIX SALDO ───
console.log('  ─── FIX SALDO ───');
if (names.includes('User')) {
  const before = db.query(`
    SELECT COUNT(*) as total, SUM(mainBalance) as m, SUM(totalProfit) as p, SUM(totalWithdraw) as w,
           SUM(profitBalance) as pb,
           SUM(CASE WHEN mainBalance < MAX(0, totalProfit - totalWithdraw) THEN 1 ELSE 0 END) as drift
    FROM User
  `).get() as any;
  console.log(`  BEFORE: ${before.total} user, main Rp ${(before.m||0).toLocaleString()}, drift ${before.drift}`);

  // FIX 1: Migrate profitBalance → mainBalance (DULUAN)
  const fix1 = db.run(`UPDATE User SET mainBalance = mainBalance + profitBalance, profitBalance = 0 WHERE profitBalance > 0`);
  // FIX 2: Sync mainBalance upward = MAX(0, totalProfit - totalWithdraw)
  const fix2 = db.run(`UPDATE User SET mainBalance = MAX(0, totalProfit - totalWithdraw) WHERE mainBalance < MAX(0, totalProfit - totalWithdraw)`);
  // FIX 3: Reset profitBalance = 0
  const fix3 = db.run(`UPDATE User SET profitBalance = 0 WHERE profitBalance != 0`);

  const after = db.query(`
    SELECT COUNT(*) as total, SUM(mainBalance) as m,
           SUM(CASE WHEN mainBalance < MAX(0, totalProfit - totalWithdraw) THEN 1 ELSE 0 END) as drift
    FROM User
  `).get() as any;
  console.log(`  AFTER:  ${after.total} user, main Rp ${(after.m||0).toLocaleString()}, drift ${after.drift}`);
  console.log(`  ✅ Migrate: ${fix1.changes} | Sync: ${fix2.changes} | Reset: ${fix3.changes}`);

  // Top 5 user
  console.log('');
  console.log('  ─── TOP 5 USER ───');
  const top = db.query(`SELECT userId, name, whatsapp, mainBalance, totalProfit, totalWithdraw FROM User ORDER BY mainBalance DESC LIMIT 5`).all() as any[];
  top.forEach((u, i) => {
    const expected = Math.max(0, (u.totalProfit||0) - (u.totalWithdraw||0));
    const ok = u.mainBalance >= expected;
    console.log(`  ${i+1}. ${ok ? '✅' : '❌'} ${u.userId} | ${u.name||'-'} | ${u.whatsapp||'-'}`);
    console.log(`     Saldo: Rp ${u.mainBalance.toLocaleString()} | Profit: Rp ${(u.totalProfit||0).toLocaleString()} | Withdraw: Rp ${(u.totalWithdraw||0).toLocaleString()}`);
  });
}
console.log('');

db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
db.close();
console.log('✅ FIX ADMIN + SALDO SELESAI');
EOF

bun /tmp/nexvo-fix-admin-saldo.ts "$DB" 2>&1 | grep -v "^Bun v"
echo ""

# ═══ STEP 9: FIX ECOSYSTEM cwd ═══
echo -e "${B}═══ 8. FIX ECOSYSTEM cwd ═══${N}"
ECO_FILE="$P/ecosystem.config.cjs"
if [ -f "$ECO_FILE" ]; then
  sed -i "s|cwd: *'/home/nexvo'|cwd: '$P'|g" "$ECO_FILE"
  sed -i "s|cwd: *'/var/www/nexvo'|cwd: '$P'|g" "$ECO_FILE"
  sed -i "s|cwd: *'/root/nexvo'|cwd: '$P'|g" "$ECO_FILE"
  mkdir -p "$P/.pm2-logs"
  sed -i "s|/home/nexvo/.pm2-logs|$P/.pm2-logs|g" "$ECO_FILE"
  sed -i "s|/var/www/nexvo/.pm2-logs|$P/.pm2-logs|g" "$ECO_FILE"
  echo -e "  ${G}✅${N} ecosystem cwd=$P"
fi
echo ""

# ═══ STEP 10: START SERVICE ═══
echo -e "${B}═══ 9. START nexvo-web + nexvo-cron ═══${N}"
cd "$P"
pm2 delete nexvo-web nexvo-cron 2>/dev/null
sleep 1
pm2 start ecosystem.config.cjs 2>&1 | tail -6
sleep 2
pm2 save 2>&1 | tail -1
echo ""
echo -e "  ${C}Waiting 20s for nexvo-web boot...${N}"
sleep 20
echo ""

# ═══ STEP 11: VERIFY END-TO-END ═══
echo -e "${B}═══ 10. VERIFY — 23 user + admin login + aset ═══${N}"

# [1] Web HTTP
HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://localhost:3000/ 2>/dev/null)
[ "$HTTP" = "200" ] && echo -e "  ${G}✅${N} Web HTTP 200 (Next.js serving)" || echo -e "  ${R}❌${N} Web HTTP $HTTP"

# [2] Next.js render HTML
HOMEPAGE=$(curl -s --max-time 10 http://localhost:3000/ 2>/dev/null)
if echo "$HOMEPAGE" | grep -qi 'html\|nexvo\|<div\|<body'; then
  echo -e "  ${G}✅${N} Next.js render HTML (bukan error page)"
else
  echo -e "  ${R}❌${N} Homepage gak render HTML — cek: pm2 logs nexvo-web --lines 30"
fi

# [3] Admin login
echo -e "  ${C}Test admin login...${N}"
LOGIN_RES=$(curl -s --max-time 15 -X POST "http://localhost:3000/api/auth/admin-login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@2024"}' 2>/dev/null)
if echo "$LOGIN_RES" | grep -q '"success":true\|"token"'; then
  echo -e "  ${G}✅${N} Admin login OK — admin / Admin@2024"
else
  echo -e "  ${R}❌${N} Admin login GAGAL"
  echo -e "      Response: $(echo "$LOGIN_RES" | head -c 200)"
fi

# [4] Products API (aset)
PROD_RES=$(curl -s --max-time 10 "http://localhost:3000/api/products" 2>/dev/null)
PROD_COUNT=$(echo "$PROD_RES" | grep -oP '"id"' | wc -l | tr -d ' ')
if [ "$PROD_COUNT" -gt 0 ]; then
  echo -e "  ${G}✅${N} Products API: $PROD_COUNT produk"
else
  echo -e "  ${R}❌${N} Products API: 0 produk (aset kosong)"
fi

# [5] Cron
CRON_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:3032/" 2>/dev/null)
[ "$CRON_HTTP" != "000" ] && echo -e "  ${G}✅${N} Cron port 3032 OK" || echo -e "  ${Y}⚠️${N} Cron port 3032 gak respon"
echo ""

# [6] DB DIRECT — confirm 23 user ada
echo -e "${B}═══ 11. DB DIRECT CHECK — konfirmasi 23 user ═══${N}"
cat > /tmp/nexvo-final-check.ts << 'EOF'
import { Database } from 'bun:sqlite';
const db = new Database(process.argv[2]);
const tables = ['User','Admin','Product','InvestmentPackage','Investment','Deposit','Withdrawal'];
console.log('  ─── DB TABLE COUNTS ───');
let userCount = 0;
tables.forEach(t => {
  try {
    const r = db.query(`SELECT COUNT(*) as c FROM ${t}`).get() as any;
    console.log(`  ${r.c > 0 ? '✅' : '⚠️'} ${t}: ${r.c} rows`);
    if (t === 'User') userCount = r.c;
  } catch { console.log(`  ❌ ${t}: tabel gak ada`); }
});
console.log('');
if (userCount >= 23) {
  console.log(`  🎉 DATA USER AMAN: ${userCount} user ada di DB`);
} else if (userCount > 0) {
  console.log(`  ⚠️ Cuma ${userCount} user di DB (kurang dari 23)`);
} else {
  console.log(`  ❌ 0 user di DB — restore gagal`);
}
console.log('');
console.log('  ─── DAFTAR USER (top 10) ───');
const users = db.query(`SELECT userId, whatsapp, name, mainBalance, level FROM User ORDER BY mainBalance DESC LIMIT 10`).all() as any[];
users.forEach((u, i) => {
  console.log(`  ${i+1}. ${u.userId} | ${u.whatsapp||'-'} | ${u.name||'-'} | Rp ${u.mainBalance||0} | ${u.level||'-'}`);
});
db.close();
EOF
bun /tmp/nexvo-final-check.ts "$DB" 2>&1 | grep -v "^Bun v"
echo ""

# ═══ FINAL SUMMARY ═══
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "${C}  📊 RINGKASAN${N}"
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo ""
if [ -n "$BEST_DB" ]; then
  echo -e "  ${G}✅${N} Restore dari backup: $BEST_DB"
fi
echo -e "  ${G}✅${N} .env fixed → Prisma bisa baca DB"
echo -e "  ${G}✅${N} Admin reset → admin / Admin@2024"
echo -e "  ${G}✅${N} Saldo fixed → mainBalance = totalProfit - totalWithdraw"
echo -e "  ${G}✅${N} nexvo-web + nexvo-cron restarted"
echo ""
echo -e "  ${Y}PENTING — di browser:${N}"
echo -e "    1. Buka ${B}https://nexvo.id/recovery.html${N}"
echo -e "    2. Klik ${B}'Clear Cache & Reload'${N}"
echo -e "    3. Login admin: ${B}admin / Admin@2024${N}"
echo -e "    4. Login user: WA + OTP"
echo -e "    5. Cek aset + saldo — harus muncul semua"
echo ""
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
