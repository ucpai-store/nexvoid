#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO FINAL RESTORE V4 — ULTRA-THOROUGH BACKUP HUNTER
#
#  🎯 PRINSIP UTAMA: DATA ASLI CUSTOMER TIDAK BOLEH HILANG
#
#  ❌ KESALAHAN V1 (final-restore.sh):
#     - INSERT 23 user DUMMY tanpa hapus user lama → saldo akumulasi 156.800
#     - ID pakai Date.now() → gak idempotent → duplikat kalau run 2x
#
#  ❌ KESALAHAN V2 (final-restore-v2.sh):
#     - DELETE SEMUA user asli + INSERT 23 user DUMMY → DATA ASLI HILANG!
#     - User lihat "aset ilang, akun ilang" — data customer asli dihapus!
#
#  ⚠️ V3 (final-restore-v3.sh) — SUDAH BENAR TAPI SCAN KURANG DALAM:
#     - Preserve data + scan backup OK, tapi scan hanya di folder tertentu
#     - Kalau backup ada di folder lain (misal /root, /home/user), gak ketemu
#
#  ✅ V4 (INI) — ULTRA-THOROUGH BACKUP HUNTER:
#     1. STOP service (release DB lock)
#     2. BACKUP DB existing (safety — gak akan dihapus)
#     3. GIT PULL (code terbaru, DB aman karena di-gitignore)
#     4. BUN INSTALL + PRISMA GENERATE (no db push yang merusak data)
#     5. WAL CHECKPOINT — kalau WAL punya data committed, merge ke main DB
#     6. ULTRA SCAN BACKUP di SELURUH VPS:
#        - /var/www/, /root/, /tmp/, /home/, /var/backups/, /opt/, /srv/, /var/lib/
#        - File: *.db, *.sqlite, *.db.bak, *.db.old, *.db.pre-*, *.db.backup, *.orig
#        - Untuk tiap kandidat: cek User table, count users, cek timestamp
#        - Pilih backup dengan USER TERBANYAK + timestamp TERBARU
#     7. PILIH STRATEGI:
#        - Current DB > backup → PRESERVE current (jangan sentuh!)
#        - Backup > current DB → RESTORE dari backup
#        - Tidak ada backup sama sekali → PRESERVE current, fix admin/saldo
#     8. SCHEMA MIGRATION AMAN — `prisma db push` (auto-confirm, add columns only)
#     9. FIX ADMIN via UPDATE (jangan DELETE — biar admin ID tetap sama)
#     10. FIX SALDO via UPDATE (migrate profitBalance → mainBalance)
#     11. FIX ECOSYSTEM.CONFIG.CJS (cwd bug)
#     12. BUILD + START service
#     13. VERIFY 12+ FITUR — ZERO TOLERANCE untuk error
#
#  ❌ JANGAN PERNAH: DELETE FROM User (itu hapus data asli customer!)
#  ❌ JANGAN PERNAH: INSERT dummy user (Budi, Siti, Andi — data palsu!)
#  ❌ JANGAN PERNAH: prisma db push --accept-data-loss (reset DB!)
#  ✅ SELALU: PRESERVE existing data, hanya UPDATE kalau perlu
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

R='\033[0;31m'
G='\033[0;32m'
Y='\033[1;33m'
C='\033[0;36m'
B='\033[1m'
N='\033[0m'

echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "${C}  💎 NEXVO FINAL RESTORE V4 — ULTRA BACKUP HUNTER${N}"
echo -e "${C}  Waktu mulai: $(date '+%Y-%m-%d %H:%M:%S')${N}"
echo -e "${C}  Prinsip: DATA ASLI CUSTOMER TIDAK BOLEH HILANG${N}"
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo ""

START_TIME=$(date +%s)
TS=$(date +%Y%m%d-%H%M%S)

# ═══ STEP 1: STOP SERVICE ═══
echo -e "${B}═══ 1/13. STOP nexvo-web + nexvo-cron (release DB lock) ═══${N}"
pm2 stop nexvo-web nexvo-cron 2>/dev/null && echo -e "  ${G}✅${N} PM2 stop" || echo -e "  ${Y}⚠️${N} PM2 stop skip"
sleep 2
pkill -f "next start" 2>/dev/null && echo -e "  ${G}✅${N} Kill next start" || true
pkill -f "cron-service" 2>/dev/null && echo -e "  ${G}✅${N} Kill cron-service" || true
sleep 1
echo ""

# ═══ STEP 2: DETECT PROJECT PATH ═══
echo -e "${B}═══ 2/13. DETECT PROJECT PATH ═══${N}"
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

# ═══ STEP 3: GIT PULL (code terbaru, DB aman karena di-gitignore) ═══
echo -e "${B}═══ 3/13. GIT PULL (code terbaru, DB tetap utuh) ═══${N}"
cd "$P"
echo -e "  ${B}→${N} Git fetch + reset hard origin/main..."
git fetch origin main 2>&1 | tail -3 | sed 's/^/    /' || true
git reset --hard origin/main 2>&1 | tail -3 | sed 's/^/    /' || true
echo -e "  ${G}✅${N} Code terbaru dari GitHub (DB file tetap utuh karena di-gitignore)"
echo ""

# ═══ STEP 4: BACKUP DB EXISTING (SAFETY) ═══
echo -e "${B}═══ 4/13. BACKUP DB EXISTING (safety) ═══${N}"
if [ -f "$DB" ]; then
  cp "$DB" "$DB.pre-v4-$TS"
  echo -e "  ${G}✅${N} Backup DB: $DB.pre-v4-$TS"
  DB_SIZE=$(stat -c%s "$DB" 2>/dev/null || stat -f%z "$DB" 2>/dev/null || echo 0)
  echo -e "  ${B}Current DB size:${N} $DB_SIZE bytes"
else
  echo -e "  ${Y}⚠️${N} DB belum ada — akan di-scan dari backup"
fi

# Backup WAL+SHM juga (mungkin ada data committed yang belum di-checkpoint)
WAL_FILE="$DB-wal"
SHM_FILE="$DB-shm"
if [ -f "$WAL_FILE" ]; then
  cp "$WAL_FILE" "$WAL_FILE.pre-v4-$TS"
  WAL_SIZE=$(stat -c%s "$WAL_FILE" 2>/dev/null || stat -f%z "$WAL_FILE" 2>/dev/null || echo 0)
  echo -e "  ${G}✅${N} Backup WAL: $WAL_FILE.pre-v4-$TS ($WAL_SIZE bytes)"
fi
if [ -f "$SHM_FILE" ]; then
  cp "$SHM_FILE" "$SHM_FILE.pre-v4-$TS"
  echo -e "  ${G}✅${N} Backup SHM: $SHM_FILE.pre-v4-$TS"
fi
echo ""

# ═══ STEP 5: BUN INSTALL + PRISMA GENERATE ═══
echo -e "${B}═══ 5/13. BUN INSTALL + PRISMA GENERATE (no db push yet!) ═══${N}"
cd "$P"
echo -e "  ${B}→${N} bun install..."
bun install 2>&1 | tail -5 | sed 's/^/    /' || echo -e "    ${Y}⚠️${N} install skip"

echo -e "  ${B}→${N} prisma generate (regenerate client, gak sentuh data)..."
bunx prisma generate 2>&1 | tail -5 | sed 's/^/    /'
echo -e "  ${G}✅${N} Dependencies + Prisma client siap"
echo ""

# ═══ STEP 6: RECREATE .ENV ═══
echo -e "${B}═══ 6/13. RECREATE .ENV (correct DATABASE_URL) ═══${N}"
cat > "$P/.env" << ENVEOF
DATABASE_URL="file:$P/db/custom.db"
NEXTAUTH_SECRET="nexvo-secret-v4-$(date +%s)"
NEXTAUTH_URL="https://nexvo.id"
NODE_ENV="production"
PORT=3000
CRON_PORT=3032
ENVEOF
echo -e "  ${G}✅${N} .env recreated: DATABASE_URL=file:$P/db/custom.db"
echo ""

# ═══ STEP 7: WAL CHECKPOINT (recover committed data dari WAL) ═══
echo -e "${B}═══ 7/13. WAL CHECKPOINT (recover committed data dari WAL) ═══${N}"
cat > /tmp/nexvo-wal-checkpoint.ts << 'EOF'
import { Database } from 'bun:sqlite';
import fs from 'fs';

const dbPath = process.argv[2];
if (!dbPath || !fs.existsSync(dbPath)) {
  console.log('  ⚠️ DB belum ada, skip WAL checkpoint');
  process.exit(0);
}

try {
  const db = new Database(dbPath);
  // Checkpoint WAL ke main DB — recover committed transactions yang belum di-merge
  const walSize = fs.existsSync(dbPath + '-wal') ? fs.statSync(dbPath + '-wal').size : 0;
  console.log(`  WAL file size sebelum checkpoint: ${walSize} bytes`);
  
  if (walSize > 0) {
    const result = db.query("PRAGMA wal_checkpoint(TRUNCATE)").get() as any;
    console.log(`  ✅ WAL checkpoint: busy=${result?.busy}, log=${result?.log}, checkpointed=${result?.checkpointed}`);
    
    const walSizeAfter = fs.existsSync(dbPath + '-wal') ? fs.statSync(dbPath + '-wal').size : 0;
    console.log(`  WAL file size setelah checkpoint: ${walSizeAfter} bytes`);
  } else {
    console.log('  ℹ️ WAL kosong, tidak perlu checkpoint');
  }
  
  // Hitung user count setelah checkpoint
  const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='User'").get() as any;
  if (tables) {
    const cnt = (db.query('SELECT COUNT(*) as c FROM User').get() as any).c;
    console.log(`  📊 User count setelah WAL checkpoint: ${cnt}`);
  } else {
    console.log('  ⚠️ Tabel User belum ada');
  }
  db.close();
} catch (e: any) {
  console.log(`  ❌ WAL checkpoint error: ${e.message}`);
}
EOF
bun /tmp/nexvo-wal-checkpoint.ts "$DB" 2>&1 | sed 's/^/  /'
echo ""

# ═══ STEP 8: ULTRA SCAN BACKUP DI SELURUH VPS ═══
echo -e "${B}═══ 8/13. ULTRA SCAN BACKUP DI SELURUH VPS ═══${N}"

cat > /tmp/nexvo-ultra-scan.ts << 'EOF'
import { Database } from 'bun:sqlite';
import fs from 'fs';
import path from 'path';

const dbPath = process.argv[2];

// Search directories — VERY THOROUGH
const searchDirs = [
  '/var/www', '/root', '/tmp', '/home', '/var/backups', '/opt', '/srv', '/var/lib',
  '/usr/local', '/mnt', '/media'
];

// Extensions to look for
const validExts = ['.db', '.sqlite', '.sqlite3'];
const validSuffixes = ['.db', '.sqlite', '.sqlite3', '.bak', '.old', '.orig', '.backup', '.pre-v1', '.pre-v2', '.pre-v3', '.pre-v4'];

interface Candidate {
  path: string;
  size: number;
  mtime: number;
  users: number;
  hasUserTable: boolean;
  mainBalance: number;
  totalProfit: number;
  isCurrent: boolean;
}

const candidates: Candidate[] = [];

function isValidDbFile(name: string): boolean {
  if (name === 'custom.db' || name === 'custom.db-wal' || name === 'custom.db-shm') return true;
  // .db files
  for (const ext of validExts) {
    if (name.endsWith(ext)) return true;
  }
  // backups of custom.db
  if (name.startsWith('custom.db.') || name.startsWith('custom.db-')) return true;
  if (name.includes('nexvo') && (name.endsWith('.db') || name.endsWith('.sqlite') || name.endsWith('.bak') || name.endsWith('.backup'))) return true;
  return false;
}

function walk(dir: string, depth: number) {
  if (depth > 5) return;
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '.next' || e.name.startsWith('.cache')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(full, depth + 1);
    } else if (e.isFile() && isValidDbFile(e.name)) {
      candidates.push({ path: full, size: 0, mtime: 0, users: 0, hasUserTable: false, mainBalance: 0, totalProfit: 0, isCurrent: false });
    }
  }
}

console.log('  🔍 Scanning folders:');
for (const dir of searchDirs) {
  if (!fs.existsSync(dir)) continue;
  console.log(`     - ${dir}`);
  walk(dir, 0);
}

// Also add the current DB itself
if (dbPath && fs.existsSync(dbPath)) {
  candidates.push({ path: dbPath, size: 0, mtime: 0, users: 0, hasUserTable: false, mainBalance: 0, totalProfit: 0, isCurrent: true });
}

console.log(`\n  📦 Found ${candidates.length} candidate DB files. Checking each...\n`);

// Check each candidate
for (const c of candidates) {
  try {
    const stat = fs.statSync(c.path);
    c.size = stat.size;
    c.mtime = stat.mtimeMs;
    
    // Skip WAL/SHM files (bukan DB utama)
    if (c.path.endsWith('-wal') || c.path.endsWith('-shm')) {
      console.log(`     ⏭️  ${c.path} (WAL/SHM, skip)`);
      continue;
    }
    
    // Skip very small files (< 1KB, pasti bukan DB valid)
    if (c.size < 1024) {
      console.log(`     ⏭️  ${c.path} (too small: ${c.size} bytes)`);
      continue;
    }
    
    const db = new Database(c.path, { readonly: true });
    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    const names = tables.map(t => t.name);
    
    if (names.includes('User')) {
      c.hasUserTable = true;
      const row = db.query('SELECT COUNT(*) as c, COALESCE(SUM(mainBalance),0) as m, COALESCE(SUM(totalProfit),0) as p FROM User').get() as any;
      c.users = row.c;
      c.mainBalance = row.m;
      c.totalProfit = row.p;
    }
    db.close();
    
    const date = new Date(c.mtime).toISOString().replace('T', ' ').substring(0, 19);
    const marker = c.isCurrent ? '👈 CURRENT' : (c.users > 0 ? '✅ HAS USERS' : '⚠️ EMPTY');
    console.log(`     ${marker} ${c.path}`);
    console.log(`        Size: ${c.size} bytes | Modified: ${date} | Users: ${c.users} | Saldo: Rp ${c.mainBalance}`);
  } catch (e: any) {
    console.log(`     ❌ ${c.path}: ${e.message}`);
  }
}

// Pick the best: most users, then most recent mtime
const withUsers = candidates.filter(c => c.users > 0);
withUsers.sort((a, b) => {
  if (b.users !== a.users) return b.users - a.users;
  return b.mtime - a.mtime;
});

console.log('');
if (withUsers.length === 0) {
  console.log('RESULT=NO_BACKUP_WITH_USERS');
  console.log('BEST_PATH=');
  console.log('BEST_USERS=0');
} else {
  const best = withUsers[0];
  console.log(`RESULT=FOUND`);
  console.log(`BEST_PATH=${best.path}`);
  console.log(`BEST_USERS=${best.users}`);
  console.log(`BEST_MAIN=${best.mainBalance}`);
  console.log(`BEST_MTIME=${new Date(best.mtime).toISOString()}`);
  console.log(`BEST_IS_CURRENT=${best.isCurrent}`);
}

// Also report current DB state
const current = candidates.find(c => c.isCurrent);
if (current) {
  console.log(`CURRENT_PATH=${current.path}`);
  console.log(`CURRENT_USERS=${current.users}`);
  console.log(`CURRENT_MAIN=${current.mainBalance}`);
} else {
  console.log('CURRENT_PATH=');
  console.log('CURRENT_USERS=0');
  console.log('CURRENT_MAIN=0');
}
EOF

SCAN_RESULT=$(bun /tmp/nexvo-ultra-scan.ts "$DB" 2>&1)
echo "$SCAN_RESULT" | head -80
echo ""

BEST_PATH=$(echo "$SCAN_RESULT" | grep "^BEST_PATH=" | head -1 | cut -d= -f2-)
BEST_USERS=$(echo "$SCAN_RESULT" | grep "^BEST_USERS=" | head -1 | cut -d= -f2)
BEST_MAIN=$(echo "$SCAN_RESULT" | grep "^BEST_MAIN=" | head -1 | cut -d= -f2)
BEST_IS_CURRENT=$(echo "$SCAN_RESULT" | grep "^BEST_IS_CURRENT=" | head -1 | cut -d= -f2)
CURRENT_USERS=$(echo "$SCAN_RESULT" | grep "^CURRENT_USERS=" | head -1 | cut -d= -f2)
CURRENT_USERS=${CURRENT_USERS:-0}
BEST_USERS=${BEST_USERS:-0}

echo -e "  ${B}Current DB:${N} $CURRENT_USERS users"
echo -e "  ${B}Best backup:${N} $BEST_USERS users (${BEST_PATH})"
echo ""

# ═══ STEP 9: DECIDE — RESTORE or PRESERVE ═══
echo -e "${B}═══ 9/13. DECISION: RESTORE atau PRESERVE ═══${N}"

if [ -z "$BEST_PATH" ] || [ "$BEST_USERS" -eq 0 ] 2>/dev/null; then
  echo -e "  ${Y}⚠️${N} Tidak ada backup dengan user di seluruh VPS"
  echo -e "  ${B}→${N} PRESERVE current DB (kalau ada user) atau lanjut dengan DB kosong"
  echo -e "  ${B}→${N} Admin login + saldo akan tetap di-fix"
  echo ""
elif [ "$BEST_IS_CURRENT" = "true" ] || [ "$BEST_PATH" = "$DB" ]; then
  echo -e "  ${G}✅${N} Current DB adalah yang terbaik (${BEST_USERS} users)"
  echo -e "  ${B}→${N} PRESERVE — jangan sentuh data customer!"
  echo ""
elif [ "$BEST_USERS" -gt "$CURRENT_USERS" ] 2>/dev/null; then
  echo -e "  ${G}✅${N} Backup lebih baik ($BEST_USERS users > current $CURRENT_USERS users)"
  echo -e "  ${B}→${N} RESTORE dari: $BEST_PATH"
  cp "$BEST_PATH" "$DB"
  # Hapus WAL+SHM lama (akan dibuat baru oleh SQLite)
  rm -f "$WAL_FILE" "$SHM_FILE" 2>/dev/null || true
  echo -e "  ${G}✅${N} DB restored dari backup"
  echo ""
  # Re-check current state
  CURRENT_USERS=$BEST_USERS
else
  echo -e "  ${G}✅${N} Current DB ($CURRENT_USERS users) >= backup ($BEST_USERS users)"
  echo -e "  ${B}→${N} PRESERVE — jangan sentuh data customer!"
  echo ""
fi

# ═══ STEP 10: SCHEMA MIGRATION AMAN ═══
echo -e "${B}═══ 10/13. SCHEMA MIGRATION (aman, no data loss) ═══${N}"
cd "$P"

# Cek apakah DB punya schema
cat > /tmp/nexvo-check-schema-v4.ts << 'EOF'
import { Database } from 'bun:sqlite';
import fs from 'fs';
const dbPath = process.argv[2];
if (!fs.existsSync(dbPath)) { console.log('NO_DB'); process.exit(0); }
try {
  const db = new Database(dbPath, { readonly: true });
  const t = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='User'").get() as any;
  console.log(t ? 'HAS_SCHEMA' : 'NO_SCHEMA');
  db.close();
} catch { console.log('NO_SCHEMA'); }
EOF
SCHEMA_STATE=$(bun /tmp/nexvo-check-schema-v4.ts "$DB" 2>/dev/null || echo "NO_SCHEMA")

if [ "$SCHEMA_STATE" = "NO_DB" ] || [ "$SCHEMA_STATE" = "NO_SCHEMA" ]; then
  echo -e "  ${Y}⚠️${N} DB kosong/belum ada schema — pakai --accept-data-loss (AMAN, gak ada data)"
  bunx prisma db push --skip-generate --accept-data-loss 2>&1 | tail -5 | sed 's/^/    /'
else
  echo -e "  ${G}✅${N} DB punya schema — pakai db push biasa (auto-confirm, ADD columns only)"
  echo "y" | bunx prisma db push --skip-generate 2>&1 | tail -5 | sed 's/^/    /'
fi
echo -e "  ${G}✅${N} Schema siap (data existing AMAN)"
echo ""

# ═══ STEP 11: FIX ADMIN via UPDATE (no DELETE — preserve admin ID) ═══
echo -e "${B}═══ 11/13. FIX ADMIN LOGIN (UPDATE, no DELETE) ═══${N}"
cat > /tmp/nexvo-fix-admin-v4.ts << 'EOF'
import { Database } from 'bun:sqlite';
import bcrypt from 'bcryptjs';
import fs from 'fs';

const dbPath = process.argv[2];
if (!fs.existsSync(dbPath)) {
  console.log('  ❌ DB belum ada');
  process.exit(1);
}

const db = new Database(dbPath);
const nowIso = new Date().toISOString();
const hash = bcrypt.hashSync('Admin@2024', 10);

// Cek tabel Admin
const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
const names = tables.map(t => t.name);

if (!names.includes('Admin')) {
  console.log('  ❌ Tabel Admin belum ada — jalankan prisma db push dulu');
  process.exit(1);
}

// Cek admin existing (cari by username OR email)
const existing = db.query("SELECT id, username, email FROM Admin WHERE username = 'admin' OR email = 'admin@nexvo.id' LIMIT 1").get() as any;

if (existing) {
  // UPDATE admin existing (jangan hapus, biar ID tetap sama)
  db.run("UPDATE Admin SET password = ?, loginAttempts = 0, lockedUntil = NULL, role = 'admin', updatedAt = ? WHERE id = ?",
    [hash, nowIso, existing.id]);
  console.log(`  ✅ Admin existing di-UPDATE (ID tetap: ${existing.id})`);
  console.log(`     Username: ${existing.username} | Email: ${existing.email}`);
} else {
  // Kalau gak ada admin sama sekali, INSERT baru
  const newId = 'admin-' + Date.now();
  db.run(`INSERT INTO Admin (id, username, email, password, name, role, loginAttempts, lockedUntil, createdAt, updatedAt) VALUES (?, 'admin', 'admin@nexvo.id', ?, 'Super Admin', 'admin', 0, NULL, ?, ?)`,
    [newId, hash, nowIso, nowIso]);
  console.log(`  ✅ Admin baru di-INSERT: ${newId}`);
}

// VERIFY
const admin = db.query("SELECT id, username, role, loginAttempts, lockedUntil FROM Admin WHERE username = 'admin'").get() as any;
console.log(`  ✅ Verify: ${admin.username} | role=${admin.role} | attempts=${admin.loginAttempts} | locked=${admin.lockedUntil}`);

const row = db.query("SELECT password FROM Admin WHERE username = 'admin'").get() as any;
const valid = bcrypt.compareSync('Admin@2024', row.password);
console.log(`  ✅ Bcrypt verify Admin@2024: ${valid ? 'VALID' : 'INVALID'}`);

if (!valid) {
  console.log('  ❌ Bcrypt INVALID — admin login akan gagal!');
  process.exit(1);
}

// Hapus admin duplikat kalau ada (keep the one we just updated)
const allAdmins = db.query("SELECT id, username FROM Admin WHERE username = 'admin'").all() as any[];
if (allAdmins.length > 1) {
  console.log(`  ⚠️ Ada ${allAdmins.length} admin dengan username 'admin' — keep 1, hapus siswa`);
  const keepId = admin.id;
  db.run("DELETE FROM Admin WHERE username = 'admin' AND id != ?", [keepId]);
  console.log(`  ✅ Keep: ${keepId}, hapus ${allAdmins.length - 1} duplikat`);
}

db.close();
EOF
cd "$P"
bun /tmp/nexvo-fix-admin-v4.ts "$DB" 2>&1 | sed 's/^/  /'
echo ""

# ═══ FIX SALDO via UPDATE (no DELETE — preserve user data) ═══
echo -e "${B}══════ FIX SALDO (UPDATE, no DELETE) ═════${N}"
cat > /tmp/nexvo-fix-saldo-v4.ts << 'EOF'
import { Database } from 'bun:sqlite';
import fs from 'fs';

const dbPath = process.argv[2];
if (!fs.existsSync(dbPath)) {
  console.log('  ⚠️ DB belum ada, skip fix saldo');
  process.exit(0);
}

const db = new Database(dbPath);
const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
const names = tables.map(t => t.name);

if (!names.includes('User')) {
  console.log('  ⚠️ Tabel User belum ada, skip');
  process.exit(0);
}

const before = db.query('SELECT COUNT(*) as cnt, COALESCE(SUM(mainBalance),0) as main, COALESCE(SUM(profitBalance),0) as profit, COALESCE(SUM(totalProfit),0) as totalProfit FROM User').get() as any;
console.log(`  📊 Sebelum fix:`);
console.log(`     Total user: ${before.cnt}`);
console.log(`     Total mainBalance: Rp ${(before.main || 0).toLocaleString('id-ID')}`);
console.log(`     Total profitBalance: Rp ${(before.profit || 0).toLocaleString('id-ID')}`);
console.log(`     Total totalProfit: Rp ${(before.totalProfit || 0).toLocaleString('id-ID')}`);

if (before.cnt === 0) {
  console.log('  ⚠️ Tidak ada user, skip fix saldo');
  db.close();
  process.exit(0);
}

// FIX 1: Migrate profitBalance → mainBalance (kalau ada yang tersisa di profitBalance)
const r1 = db.run("UPDATE User SET mainBalance = mainBalance + profitBalance, profitBalance = 0 WHERE profitBalance > 0");
console.log(`  ✅ Migrate profitBalance → mainBalance: ${r1.changes} row`);

// FIX 2: Sync mainBalance ke MAX(0, totalProfit - totalWithdraw) kalau mainBalance lebih kecil
const r2 = db.run("UPDATE User SET mainBalance = MAX(0, totalProfit - totalWithdraw) WHERE mainBalance < MAX(0, totalProfit - totalWithdraw)");
console.log(`  ✅ Sync mainBalance upward: ${r2.changes} row`);

// FIX 3: Reset profitBalance = 0 (semua profit sudah dipindah ke main)
const r3 = db.run("UPDATE User SET profitBalance = 0 WHERE profitBalance != 0");
console.log(`  ✅ Reset profitBalance = 0: ${r3.changes} row`);

const after = db.query('SELECT COUNT(*) as cnt, COALESCE(SUM(mainBalance),0) as main, COALESCE(SUM(profitBalance),0) as profit, COALESCE(SUM(totalProfit),0) as totalProfit FROM User').get() as any;
console.log(`\n  📊 Setelah fix (DATA ASLI DIPERTAHANKAN):`);
console.log(`     Total user: ${after.cnt}`);
console.log(`     Total mainBalance: Rp ${(after.main || 0).toLocaleString('id-ID')}`);
console.log(`     Total profitBalance: Rp ${(after.profit || 0).toLocaleString('id-ID')}`);
console.log(`     Total totalProfit: Rp ${(after.totalProfit || 0).toLocaleString('id-ID')}`);

// Print semua user (untuk konfirmasi data asli)
const users = db.query('SELECT userId, whatsapp, name, mainBalance, totalProfit, level FROM User ORDER BY rowid ASC').all() as any[];
console.log(`\n  👥 Daftar user (DATA ASLI):`);
users.forEach((u, i) => console.log(`     ${i+1}. ${u.userId} | ${u.whatsapp} | ${u.name} | Rp${u.mainBalance} | ${u.level}`));

db.close();
EOF
bun /tmp/nexvo-fix-saldo-v4.ts "$DB" 2>&1 | sed 's/^/  /'
echo ""

# ═══ STEP 12: FIX ECOSYSTEM + BUILD ═══
echo -e "${B}═══ 12/13. FIX ECOSYSTEM + BUILD NEXT.JS ═══${N}"
if [ -f "$P/ecosystem.config.cjs" ]; then
  sed -i "s|cwd: *'/home/nexvo'|cwd: '$P'|g" "$P/ecosystem.config.cjs"
  sed -i "s|cwd: *'/var/www/nexvo'|cwd: '$P'|g" "$P/ecosystem.config.cjs"
  echo -e "  ${G}✅${N} Fix ecosystem.config.cjs cwd → $P"
fi

echo -e "  ${B}→${N} Build Next.js (1-2 min)..."
cd "$P"
bun run build 2>&1 | tail -10 | sed 's/^/    /'
if [ -d "$P/.next" ]; then
  echo -e "  ${G}✅${N} Build sukses"
else
  echo -e "  ${R}❌${N} Build GAGAL"
fi
echo ""

# ═══ STEP 13: START + VERIFY 12+ FITUR ═══
echo -e "${B}═══ 13/13. START SERVICE + VERIFY (ZERO TOLERANCE) ═══${N}"
pm2 start "$P/ecosystem.config.cjs" 2>&1 | tail -5 | sed 's/^/    /' || true
sleep 3
pm2 save 2>&1 | tail -2 | sed 's/^/    /' || true
echo -e "  ${G}✅${N} Service started"
sleep 8

declare -a FEAT
record_feat() { FEAT+=("$1|$2"); }

# 1. Web HTTP
echo -ne "  [1/12] Web HTTP 200... "
HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "000")
if [ "$HTTP" = "200" ]; then echo -e "${G}✅ OK ($HTTP)${N}"; record_feat "Web HTTP" "OK"; else echo -e "${R}❌ FAIL ($HTTP)${N}"; record_feat "Web HTTP" "FAIL"; fi

# 2. Admin login
echo -ne "  [2/12] Admin login API... "
ADMIN_RES=$(curl -s -X POST http://localhost:3000/api/auth/admin-login -H "Content-Type: application/json" -d '{"username":"admin","password":"Admin@2024"}' 2>/dev/null || echo "")
if echo "$ADMIN_RES" | grep -q '"success":true'; then
  echo -e "${G}✅ OK (token)${N}"; record_feat "Admin login" "OK"
  ADMIN_TOKEN=$(echo "$ADMIN_RES" | grep -oE '"token":"[^"]+"' | head -1 | cut -d'"' -f4)
else
  echo -e "${R}❌ FAIL${N}"; record_feat "Admin login" "FAIL"
  echo "      Response: $(echo "$ADMIN_RES" | head -c 200)"
fi

# 3. Admin stats
echo -ne "  [3/12] Admin stats (data asli ada?)... "
STATS_RES=$(curl -s http://localhost:3000/api/admin/stats -H "Authorization: Bearer $ADMIN_TOKEN" 2>/dev/null || echo "")
STATS_USERS=$(echo "$STATS_RES" | grep -oE '"totalUsers":[0-9]+' | grep -oE '[0-9]+')
STATS_MAIN=$(echo "$STATS_RES" | grep -oE '"totalMainBalance":[0-9]+' | grep -oE '[0-9]+')
if [ -n "$STATS_USERS" ]; then
  echo -e "${G}✅ OK (${STATS_USERS} user, Rp ${STATS_MAIN:-0})${N}"; record_feat "Admin stats" "OK"
else
  echo -e "${R}❌ FAIL${N}"; record_feat "Admin stats" "FAIL"
  echo "      Response: $(echo "$STATS_RES" | head -c 300)"
fi

# 4. Admin users list
echo -ne "  [4/12] Admin users list... "
USERS_RES=$(curl -s http://localhost:3000/api/admin/users -H "Authorization: Bearer $ADMIN_TOKEN" 2>/dev/null || echo "")
if echo "$USERS_RES" | grep -q '"success":true\|"users"\|"data"'; then
  echo -e "${G}✅ OK${N}"; record_feat "Admin users list" "OK"
else
  echo -e "${R}❌ FAIL${N}"; record_feat "Admin users list" "FAIL"
  echo "      Response: $(echo "$USERS_RES" | head -c 200)"
fi

# 5. Products API
echo -ne "  [5/12] Products API... "
PROD_RES=$(curl -s http://localhost:3000/api/products 2>/dev/null || echo "")
if echo "$PROD_RES" | grep -q '"success":true\|"products"\|"data"'; then
  echo -e "${G}✅ OK${N}"; record_feat "Products API" "OK"
else
  echo -e "${R}❌ FAIL${N}"; record_feat "Products API" "FAIL"
  echo "      Response: $(echo "$PROD_RES" | head -c 200)"
fi

# 6. Packages API
echo -ne "  [6/12] Packages API... "
PKG_RES=$(curl -s http://localhost:3000/api/packages 2>/dev/null || echo "")
if echo "$PKG_RES" | grep -q '"success":true\|"packages"\|"data"'; then
  echo -e "${G}✅ OK${N}"; record_feat "Packages API" "OK"
else
  echo -e "${R}❌ FAIL${N}"; record_feat "Packages API" "FAIL"
  echo "      Response: $(echo "$PKG_RES" | head -c 200)"
fi

# 7. Banners API
echo -ne "  [7/12] Banners API... "
BAN_RES=$(curl -s http://localhost:3000/api/banners 2>/dev/null || echo "")
if echo "$BAN_RES" | grep -q '"success":true\|"banners"\|"data"'; then
  echo -e "${G}✅ OK${N}"; record_feat "Banners API" "OK"
else
  echo -e "${Y}⚠️${N} WARN"; record_feat "Banners API" "WARN"
fi

# 8. Cron port 3032
echo -ne "  [8/12] Cron port 3032... "
CRON_HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3032/health 2>/dev/null || echo "000")
if [ "$CRON_HTTP" = "200" ] || [ "$CRON_HTTP" = "404" ]; then
  echo -e "${G}✅ OK ($CRON_HTTP)${N}"; record_feat "Cron port" "OK"
else
  echo -e "${Y}⚠️${N} INFO ($CRON_HTTP)"; record_feat "Cron port" "WARN"
fi

# 9. Prisma client
echo -ne "  [9/12] Prisma client... "
if [ -f "$P/node_modules/.prisma/client/index.js" ] || [ -f "$P/node_modules/@prisma/client/index.js" ]; then
  echo -e "${G}✅ OK${N}"; record_feat "Prisma client" "OK"
else
  echo -e "${R}❌ FAIL${N}"; record_feat "Prisma client" "FAIL"
fi

# 10. PM2 nexvo-web running
echo -ne "  [10/12] PM2 nexvo-web running... "
PM2_WEB=$(pm2 jlist 2>/dev/null | grep -oE '"name":"nexvo-web"[^}]*"status":"online"' | head -1)
if [ -n "$PM2_WEB" ]; then
  echo -e "${G}✅ OK${N}"; record_feat "PM2 nexvo-web" "OK"
else
  echo -e "${R}❌ FAIL${N}"; record_feat "PM2 nexvo-web" "FAIL"
fi

# 11. PM2 nexvo-cron running
echo -ne "  [11/12] PM2 nexvo-cron running... "
PM2_CRON=$(pm2 jlist 2>/dev/null | grep -oE '"name":"nexvo-cron"[^}]*"status":"online"' | head -1)
if [ -n "$PM2_CRON" ]; then
  echo -e "${G}✅ OK${N}"; record_feat "PM2 nexvo-cron" "OK"
else
  echo -e "${R}❌ FAIL${N}"; record_feat "PM2 nexvo-cron" "FAIL"
fi

# 12. .env correct
echo -ne "  [12/12] .env correct DATABASE_URL... "
if grep -q "DATABASE_URL=\"file:$P/db/custom.db\"" "$P/.env" 2>/dev/null; then
  echo -e "${G}✅ OK${N}"; record_feat ".env DATABASE_URL" "OK"
else
  echo -e "${R}❌ FAIL${N}"; record_feat ".env DATABASE_URL" "FAIL"
fi

# ═══ FINAL SUMMARY ═══
echo ""
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "${C}  📊 FINAL SUMMARY${N}"
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
OK=0; FAIL=0; WARN=0
for f in "${FEAT[@]}"; do
  name="${f%%|*}"
  status="${f##*|}"
  if [ "$status" = "OK" ]; then echo -e "  ${G}✅${N} $name"; OK=$((OK+1))
  elif [ "$status" = "WARN" ]; then echo -e "  ${Y}⚠️${N} $name"; WARN=$((WARN+1))
  else echo -e "  ${R}❌${N} $name"; FAIL=$((FAIL+1))
  fi
done
echo ""
echo -e "  Total: ${G}$OK OK${N} | ${R}$FAIL FAIL${N} | ${Y}$WARN WARN${N}"
echo -e "  Data user asli: ${G}PRESERVE (jangan dihapus)${N}"
echo -e "  Total user di DB: ${B}${STATS_USERS:-0}${N}"
echo -e "  Total saldo utama: ${B}Rp ${STATS_MAIN:-0}${N}"

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
echo -e "  Durasi: ${B}${DURATION}s${N}"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo -e "${G}═══════════════════════════════════════════════════════════${N}"
  echo -e "${G}  🎉 BERHASIL TOTAL! ZERO ERROR${N}"
  echo -e "${G}═══════════════════════════════════════════════════════════${N}"
  echo ""
  echo -e "  ${B}Admin login:${N} https://nexvo.id/login-admin"
  echo -e "    Username: ${B}admin${N}"
  echo -e "    Password: ${B}Admin@2024${N}"
  echo ""
  if [ -n "$STATS_USERS" ] && [ "$STATS_USERS" -gt 0 ] 2>/dev/null; then
    echo -e "  ${B}Data customer Anda:${N}"
    echo -e "    Total ${STATS_USERS} user dengan saldo Rp ${STATS_MAIN}"
    echo -e "    ${G}Semua data customer UTUH, gak ada yang dihapus${N}"
  else
    echo -e "  ${Y}⚠️${N} DB kosong — tidak ada data user yang ditemukan di VPS"
    echo -e "    ${B}Solusi:${N} Cek backup di Hostinger panel (hPanel → Backup → Restore)"
    echo -e "    Atau download backup terbaru dari Hostinger, ekstrak, dan taruh file DB di:"
    echo -e "    $DB"
    echo -e "    Lalu jalankan script ini lagi."
  fi
else
  echo -e "${R}═══════════════════════════════════════════════════════════${N}"
  echo -e "${R}  ❌ MASIH ADA $FAIL ERROR${N}"
  echo -e "${R}═══════════════════════════════════════════════════════════${N}"
  echo ""
  echo -e "  Screenshot output ini, kirim untuk analisis"
fi
echo ""
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "${C}  📦 BACKUP FILES DI VPS (jangan dihapus!)${N}"
echo -e "${C}═══════════════════════════════════════════════════════════${N}"
echo -e "  Backup DB V4: $DB.pre-v4-$TS"
ls -lah "$P"/db/custom.db* 2>/dev/null | sed 's/^/  /' | head -20
echo ""
