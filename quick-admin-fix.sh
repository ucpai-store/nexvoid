#!/bin/bash
# ============================================================================
#  NEXVO - QUICK FIX ADMIN (One-shot version)
# ----------------------------------------------------------------------------
#  Untuk error: "Akun admin tidak ditemukan"
#  Script ini akan: insert admin langsung ke database + restart PM2
# ============================================================================
set +e

PROJECT="/home/nexvo"

echo "=== NEXVO QUICK ADMIN FIX ==="

# Must be root
[ "$EUID" -ne 0 ] && { echo "Run as root: sudo bash $0"; exit 1; }

export PATH="/root/.bun/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" 2>/dev/null

cd "$PROJECT" 2>/dev/null || { echo "Directory $PROJECT tidak ada!"; exit 1; }

# ============================================================================
# 1. Find database file
# ============================================================================
echo ""
echo "=== 1. Cari database ==="
DB=$(find /home/nexvo -name "*.db" -type f 2>/dev/null | head -1)
if [ -z "$DB" ]; then
  echo "Database belum ada! Running prisma db push..."
  bunx prisma db push --accept-data-loss 2>&1 | tail -5
  DB=$(find /home/nexvo -name "*.db" -type f 2>/dev/null | head -1)
fi
[ -z "$DB" ] && { echo "GALGAL: Database tidak ditemukan"; exit 1; }
echo "✓ Database: $DB"

# ============================================================================
# 2. Cek tabel Admin
# ============================================================================
echo ""
echo "=== 2. Cek tabel Admin ==="
HAS_ADMIN=$(sqlite3 "$DB" "SELECT name FROM sqlite_master WHERE type='table' AND name='Admin';" 2>/dev/null)
if [ -z "$HAS_ADMIN" ]; then
  echo "Tabel Admin belum ada! Running prisma db push..."
  bunx prisma db push --accept-data-loss 2>&1 | tail -5
fi
HAS_ADMIN=$(sqlite3 "$DB" "SELECT name FROM sqlite_master WHERE type='table' AND name='Admin';" 2>/dev/null)
[ -z "$HAS_ADMIN" ] && { echo "GAGAL: Tabel Admin tidak bisa dibuat"; exit 1; }
echo "✓ Tabel Admin ada"

# ============================================================================
# 3. Generate password hash
# ============================================================================
echo ""
echo "=== 3. Generate password hash ==="
HASH=$(node -e "
const bcrypt = require('bcryptjs');
console.log(bcrypt.hashSync('Admin@2024', 8));
" 2>/dev/null)

if [ -z "$HASH" ]; then
  echo "bcryptjs belum terinstall, install..."
  bun add bcryptjs 2>/dev/null || npm install bcryptjs 2>/dev/null
  HASH=$(node -e "
const bcrypt = require('bcryptjs');
console.log(bcrypt.hashSync('Admin@2024', 8));
" 2>/dev/null)
fi

[ -z "$HASH" ] && { echo "GAGAL: Tidak bisa generate hash"; exit 1; }
echo "✓ Hash: ${HASH:0:25}..."

# ============================================================================
# 4. Insert/Update admin
# ============================================================================
echo ""
echo "=== 4. Insert/Update admin ==="

# Escape single quotes in hash
HASH_ESCAPED=$(echo "$HASH" | sed "s/'/''/g")

# Cek apakah admin sudah ada
EXISTING=$(sqlite3 "$DB" "SELECT id FROM Admin WHERE username='admin' LIMIT 1;" 2>/dev/null)

if [ -n "$EXISTING" ]; then
  # Update existing
  sqlite3 "$DB" "UPDATE Admin SET password='$HASH_ESCAPED', role='super_admin', loginAttempts=0, lockedUntil=NULL, email='admin@nexvo.id', name='Super Admin' WHERE username='admin';" 2>/dev/null
  echo "✓ Admin di-update"
else
  # Insert new admin dengan cuid-style ID
  ADMIN_ID="cmd$(date +%s)admin"
  sqlite3 "$DB" "INSERT INTO Admin (id, username, email, password, name, role, loginAttempts, lockedUntil, createdAt, updatedAt) VALUES ('$ADMIN_ID', 'admin', 'admin@nexvo.id', '$HASH_ESCAPED', 'Super Admin', 'super_admin', 0, NULL, datetime('now'), datetime('now'));" 2>/dev/null
  
  # Verify insert
  CHECK=$(sqlite3 "$DB" "SELECT id FROM Admin WHERE username='admin' LIMIT 1;" 2>/dev/null)
  if [ -z "$CHECK" ]; then
    echo "Insert gagal, coba dengan prisma seed..."
    bunx prisma db seed 2>&1 | tail -5
    CHECK=$(sqlite3 "$DB" "SELECT id FROM Admin WHERE username='admin' LIMIT 1;" 2>/dev/null)
    [ -n "$CHECK" ] && echo "✓ Admin dibuat via seed" || { echo "GAGAL: Tidak bisa insert admin"; exit 1; }
  else
    echo "✓ Admin baru dibuat"
  fi
fi

# Show result
echo ""
echo "Admin di database:"
sqlite3 -header -column "$DB" "SELECT username, email, name, role, loginAttempts FROM Admin WHERE username='admin';"

# ============================================================================
# 5. Generate prisma client (just in case)
# ============================================================================
echo ""
echo "=== 5. Generate prisma client ==="
bunx prisma generate 2>&1 | tail -3

# ============================================================================
# 6. Restart PM2
# ============================================================================
echo ""
echo "=== 6. Restart PM2 ==="
pm2 restart nexvo-web --update-env 2>/dev/null
sleep 4
echo "✓ nexvo-web restarted"

# ============================================================================
# 7. Test login via API
# ============================================================================
echo ""
echo "=== 7. Test login via API ==="
sleep 3

RESPONSE=$(curl -sk -X POST https://nexvo.id/api/auth/admin-login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@2024"}' \
  --max-time 15 2>&1)

echo "Response:"
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"

if echo "$RESPONSE" | grep -q '"success":true'; then
  echo ""
  echo "╔═══════════════════════════════════════════════╗"
  echo "║  ✅ LOGIN ADMIN BERHASIL!                     ║"
  echo "╠═══════════════════════════════════════════════╣"
  echo "║  URL:      https://nexvo.id/#admin-login      ║"
  echo "║  Username: admin                              ║"
  echo "║  Password: Admin@2024                         ║"
  echo "╚═══════════════════════════════════════════════╝"
else
  echo ""
  echo "⚠ Login masih gagal. Test lokal:"
  echo "  curl -X POST http://127.0.0.1:3000/api/auth/admin-login \\"
  echo "    -H 'Content-Type: application/json' \\"
  echo "    -d '{\"username\":\"admin\",\"password\":\"Admin@2024\"}'"
  echo ""
  echo "  Cek log: pm2 logs nexvo-web --lines 30"
fi
