#!/bin/bash
# ============================================================================
#  NEXVO - FIX ADMIN LOGIN
# ----------------------------------------------------------------------------
#  Script ini akan:
#  1. Cek & pastikan tabel Admin ada di database
#  2. Reset password admin ke Admin@2024
#  3. Unlock account (hapus lockedUntil, reset loginAttempts)
#  4. Test login via API
#  5. Tampilkan kredensial yang benar
# ============================================================================
set +e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }
step() { echo -e "\n${CYAN}${BOLD}══════ $1 ══════${NC}"; }

PROJECT_DIR="/home/nexvo"

echo -e "${CYAN}${BOLD}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║        NEXVO - FIX ADMIN LOGIN                              ║"
echo "║        $(date '+%Y-%m-%d %H:%M:%S UTC')                            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

if [ "$EUID" -ne 0 ]; then
  err "Harus jalan sebagai root: sudo bash fix-admin-login.sh"
  exit 1
fi

export BUN_INSTALL="/root/.bun"
export PATH="$BUN_INSTALL/bin:/usr/local/bin:/usr/bin:/usr/local/sbin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" 2>/dev/null

cd "$PROJECT_DIR" 2>/dev/null || { err "Directory $PROJECT_DIR tidak ada! Run restore-nexvo.sh dulu."; exit 1; }

# ============================================================================
# STEP 1: Cek database
# ============================================================================
step "1/6  Cek database"

# Find database file
DB_PATHS=(
  "/home/nexvo/db/custom.db"
  "/home/nexvo/prisma/custom.db"
  "/home/nexvo/prisma/dev.db"
  "/home/nexvo/db/dev.db"
)

DB_FOUND=""
for p in "${DB_PATHS[@]}"; do
  if [ -f "$p" ]; then
    DB_FOUND="$p"
    break
  fi
done

if [ -z "$DB_FOUND" ]; then
  err "Database file tidak ditemukan!"
  echo "  Cari manual:"
  find /home/nexvo -name "*.db" -type f 2>/dev/null
  echo ""
  warn "Menjalankan prisma db push untuk buat database..."
  bunx prisma db push --accept-data-loss 2>&1 | tail -10
  
  # Re-check
  for p in "${DB_PATHS[@]}"; do
    if [ -f "$p" ]; then
      DB_FOUND="$p"
      break
    fi
  done
  
  if [ -z "$DB_FOUND" ]; then
    # Cari lagi
    DB_FOUND=$(find /home/nexvo -name "*.db" -type f 2>/dev/null | head -1)
  fi
  
  [ -n "$DB_FOUND" ] && log "Database ditemukan: $DB_FOUND" || { err "Database masih tidak ada"; exit 1; }
else
  log "Database: $DB_FOUND"
  DB_SIZE=$(du -h "$DB_FOUND" | cut -f1)
  echo "  Size: $DB_SIZE"
fi

# ============================================================================
# STEP 2: Cek tabel Admin
# ============================================================================
step "2/6  Cek tabel Admin"

ADMIN_TABLE=$(sqlite3 "$DB_FOUND" "SELECT name FROM sqlite_master WHERE type='table' AND name='Admin';" 2>/dev/null)

if [ -z "$ADMIN_TABLE" ]; then
  err "Tabel Admin TIDAK ADA di database!"
  warn "Running prisma db push untuk buat semua tabel..."
  bunx prisma db push --accept-data-loss 2>&1 | tail -10
  
  ADMIN_TABLE=$(sqlite3 "$DB_FOUND" "SELECT name FROM sqlite_master WHERE type='table' AND name='Admin';" 2>/dev/null)
  [ -n "$ADMIN_TABLE" ] && log "Tabel Admin berhasil dibuat" || { err "Gagal buat tabel Admin"; exit 1; }
else
  log "Tabel Admin ada"
fi

# Show all tables
echo ""
echo "  Tabel yang ada di database:"
sqlite3 "$DB_FOUND" "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;" 2>/dev/null | sed 's/^/    - /'

# ============================================================================
# STEP 3: Cek admin account
# ============================================================================
step "3/6  Cek admin account"

ADMIN_COUNT=$(sqlite3 "$DB_FOUND" "SELECT COUNT(*) FROM Admin;" 2>/dev/null)
echo "  Jumlah admin: $ADMIN_COUNT"

if [ "$ADMIN_COUNT" = "0" ]; then
  err "Tidak ada admin account!"
  warn "Running seed..."
  bunx prisma db seed 2>&1 | tail -10
  ADMIN_COUNT=$(sqlite3 "$DB_FOUND" "SELECT COUNT(*) FROM Admin;" 2>/dev/null)
  [ "$ADMIN_COUNT" != "0" ] && log "Admin account dibuat via seed" || err "Seed gagal"
else
  log "Admin account ada"
fi

# Show admin info (without password)
echo ""
echo "  Admin accounts:"
sqlite3 -header -column "$DB_FOUND" \
  "SELECT id, username, email, name, role, loginAttempts, lockedUntil, lastLogin FROM Admin;" 2>/dev/null

# ============================================================================
# STEP 4: Generate fresh password hash & reset admin
# ============================================================================
step "4/6  Reset password admin ke Admin@2024"

# Generate bcrypt hash using node
echo "  Generate bcrypt hash untuk password 'Admin@2024'..."

HASH=$(node -e "
const bcrypt = require('bcryptjs');
const hash = bcrypt.hashSync('Admin@2024', 8);
console.log(hash);
" 2>/dev/null)

if [ -z "$HASH" ]; then
  warn "bcryptjs tidak tersedia, coba dengan bun..."
  HASH=$(bun -e "
import bcrypt from 'bcryptjs';
const hash = await bcrypt.hash('Admin@2024', 8);
console.log(hash);
" 2>/dev/null)
fi

if [ -z "$HASH" ]; then
  warn "Mencoba install bcryptjs..."
  bun add bcryptjs 2>/dev/null || npm install bcryptjs 2>/dev/null
  
  HASH=$(node -e "
const bcrypt = require('bcryptjs');
const hash = bcrypt.hashSync('Admin@2024', 8);
console.log(hash);
" 2>/dev/null)
fi

if [ -z "$HASH" ]; then
  err "Gagal generate password hash!"
  err "Coba manual: cd /home/nexvo && node -e \"console.log(require('bcryptjs').hashSync('Admin@2024',8))\""
  exit 1
fi

log "Hash di-generate: ${HASH:0:30}..."

# Update admin: set password baru, unlock account, reset attempts
sqlite3 "$DB_FOUND" "UPDATE Admin SET password='$HASH', loginAttempts=0, lockedUntil=NULL, role='super_admin' WHERE username='admin';" 2>/dev/null

# Verify update
UPDATED=$(sqlite3 "$DB_FOUND" "SELECT COUNT(*) FROM Admin WHERE username='admin';" 2>/dev/null)
if [ "$UPDATED" != "0" ]; then
  log "Admin password berhasil di-reset!"
  log "Account di-unlock (loginAttempts=0, lockedUntil=NULL)"
  log "Role diset ke: super_admin"
else
  err "Gagal update admin. Cek apakah admin ada..."
  echo "  Admin list:"
  sqlite3 -header -column "$DB_FOUND" "SELECT id, username, email FROM Admin;"
  exit 1
fi

# Show final state
echo ""
echo "  Status admin setelah fix:"
sqlite3 -header -column "$DB_FOUND" \
  "SELECT username, email, role, loginAttempts, lockedUntil FROM Admin WHERE username='admin';"

# ============================================================================
# STEP 5: Restart PM2 untuk clear cache
# ============================================================================
step "5/6  Restart PM2 nexvo-web"

pm2 restart nexvo-web --update-env 2>/dev/null
sleep 3

WEB_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
    procs = json.load(sys.stdin)
    for p in procs:
        if p.get('name') == 'nexvo-web':
            print(p.get('pm2_env', {}).get('status', ''))
            break
except:
    print('error')
" 2>/dev/null)

[ "$WEB_STATUS" = "online" ] && log "nexvo-web: ONLINE (sudah restart)" || warn "nexvo-web: $WEB_STATUS"

# ============================================================================
# STEP 6: Test login via API
# ============================================================================
step "6/6  Test login admin via API"

sleep 2

echo "  Test POST /api/auth/admin-login ..."
echo "  Body: { username: 'admin', password: 'Admin@2024' }"
echo ""

RESPONSE=$(curl -s -X POST http://127.0.0.1:3000/api/auth/admin-login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@2024"}' \
  --max-time 10 2>&1)

echo "  Response:"
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
echo ""

# Check if login successful
if echo "$RESPONSE" | grep -q '"success":true'; then
  log "✓ LOGIN BERHASIL!"
elif echo "$RESPONSE" | grep -q '"success":false'; then
  err "Login masih gagal!"
  ERROR=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error',''))" 2>/dev/null)
  [ -n "$ERROR" ] && echo "  Error: $ERROR"
  
  echo ""
  echo "  Kemungkinan penyebab:"
  echo "    1. nexvo-web belum siap (tunggu 10 detik lalu coba lagi)"
  echo "    2. Database path di .env salah"
  echo "    3. Prisma client belum di-generate"
  echo ""
  echo "  Debug:"
  echo "    pm2 logs nexvo-web --lines 30"
  echo "    cat /home/nexvo/.env | grep DATABASE_URL"
  echo "    bunx prisma generate"
else
  err "Tidak ada response dari server (nexvo-web mungkin belum jalan)"
  echo "  Cek: pm2 logs nexvo-web --lines 30"
fi

# ============================================================================
# SUMMARY
# ============================================================================
echo ""
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}${BOLD}✓ Admin login telah di-reset!${NC}"
echo ""
echo "  Kredensial admin:"
echo "    URL:      http://nexvo.id/login  (atau /admin/login)"
echo "    Username: admin"
echo "    Email:    admin@nexvo.id"
echo "    Password: Admin@2024"
echo "    Role:     super_admin"
echo ""
echo "  Jika masih tidak bisa login:"
echo "    1. Tunggu 30 detik lalu coba lagi (PM2 perlu warm up)"
echo "    2. Clear browser cache / pakai incognito"
echo "    3. Cek: pm2 logs nexvo-web --lines 50"
echo "    4. Test manual:"
echo "       curl -X POST http://nexvo.id/api/auth/admin-login \\"
echo "         -H 'Content-Type: application/json' \\"
echo "         -d '{\"username\":\"admin\",\"password\":\"Admin@2024\"}'"
echo ""
echo -e "${CYAN}Selesai: $(date '+%Y-%m-%d %H:%M:%S UTC')${NC}"
