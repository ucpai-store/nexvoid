#!/bin/bash
# ════════════════════════════════════════════════════════════════
#  NEXVO v3.2 DEEP DIAGNOSTIC — cari SUMBER 68800 dengan presisi
#  Jalankan di VPS: bash diag-deep-v32.sh [userId]
#  Jika userId kosong, tampilkan semua user dengan profit
#
#  v3.2.1 (2025-06-30): AUTO-DETECT DB location
#    - Cek multiple candidate project dirs
#    - Parse DATABASE_URL dari .env
#    - Fallback: find / -name 'custom.db'
# ════════════════════════════════════════════════════════════════
set +e
TARGET_USERID="$1"

echo "═══════════════════════════════════════════════════════════"
echo "  NEXVO v3.2 DEEP DIAGNOSTIC — SUMBER 68800"
echo "  Waktu: $(date '+%Y-%m-%d %H:%M:%S WIB')"
echo "═══════════════════════════════════════════════════════════"

# ─────────────────────────────────────────────────────────────
# [0] AUTO-DETECT PROJECT DIR & DB LOCATION
# ─────────────────────────────────────────────────────────────
echo ""
echo "▼ [0/7] DETEKSI PROJECT DIR & DB LOCATION"
echo "─────────────────────────────────────────────────"

PROJECT_DIR=""
for candidate in \
  "/home/nexvo" \
  "/root/nexvo" \
  "/var/www/nexvo" \
  "/var/www/html/nexvo" \
  "/var/www/nexvoid" \
  "/home/$SUDO_USER/nexvo" \
  "/home/$USER/nexvo" \
  "/opt/nexvo" \
  "$HOME/nexvo" \
  "$(pwd)"; do
  if [ -n "$candidate" ] && [ -d "$candidate" ] && [ -f "$candidate/package.json" ]; then
    if grep -q "nexvo\|nexvoid" "$candidate/package.json" 2>/dev/null; then
      PROJECT_DIR="$candidate"
      break
    fi
  fi
done

if [ -z "$PROJECT_DIR" ]; then
  # Fallback: cari project dari PM2 cwd
  PM2_INFO=$(pm2 info nexvo-web 2>/dev/null | grep -E "cwd|script path" | head -3)
  if [ -n "$PM2_INFO" ]; then
    PM2_CWD=$(echo "$PM2_INFO" | grep "cwd" | head -1 | sed 's/.*│ *//;s/ *│.*//' | tr -d ' ')
    if [ -d "$PM2_CWD" ]; then
      PROJECT_DIR="$PM2_CWD"
      echo "  → Project dir dari PM2: $PROJECT_DIR"
    fi
  fi
fi

if [ -z "$PROJECT_DIR" ]; then
  echo "  ⚠️  Project dir tidak ditemukan otomatis"
  echo "     Coba cari via: ps aux | grep nexvo"
  PS_OUT=$(ps aux 2>/dev/null | grep -E "nexvo|node.*standalone" | grep -v grep | head -3)
  if [ -n "$PS_OUT" ]; then
    echo "     PS output:"
    echo "$PS_OUT" | sed 's/^/       /'
  fi
else
  echo "  ✅ Project dir: $PROJECT_DIR"
fi

# ─────────────────────────────────────────────────────────────
# Deteksi DB location: prioritas DATABASE_URL dari .env
# ─────────────────────────────────────────────────────────────
DB=""

# Coba ambil dari .env (prioritas: PROJECT_DIR/.env, lalu candidates lain)
for env_path in \
  "$PROJECT_DIR/.env" \
  "/home/nexvo/.env" \
  "/root/nexvo/.env" \
  "/var/www/nexvo/.env" \
  "$HOME/nexvo/.env"; do
  if [ -f "$env_path" ]; then
    ENV_DB_URL=$(grep -E "^DATABASE_URL=" "$env_path" 2>/dev/null | head -1 | sed 's/^DATABASE_URL=//' | tr -d '"' | tr -d "'")
    if [ -n "$ENV_DB_URL" ]; then
      # Extract path dari file: URL
      ENV_DB_PATH=$(echo "$ENV_DB_URL" | sed 's|^file:||')
      if [ -f "$ENV_DB_PATH" ]; then
        DB="$ENV_DB_PATH"
        echo "  ✅ DB dari .env ($env_path): $DB"
        break
      fi
    fi
  fi
done

# Fallback: cek multiple candidate DB paths
if [ -z "$DB" ]; then
  for db_candidate in \
    "$PROJECT_DIR/db/custom.db" \
    "/home/nexvo/db/custom.db" \
    "/root/nexvo/db/custom.db" \
    "/var/www/nexvo/db/custom.db" \
    "$HOME/nexvo/db/custom.db" \
    "$PROJECT_DIR/prisma/dev.db" \
    "$PROJECT_DIR/custom.db"; do
    if [ -n "$db_candidate" ] && [ -f "$db_candidate" ]; then
      DB="$db_candidate"
      echo "  ✅ DB dari fallback path: $DB"
      break
    fi
  done
fi

# Last resort: find / -name 'custom.db'
if [ -z "$DB" ]; then
  echo "  ⚠️  DB tidak ditemukan via .env atau candidate paths"
  echo "     Mencari via: find / -name 'custom.db' (mungkin butuh ~30s)"
  FOUND_DBS=$(find / -name "custom.db" -type f 2>/dev/null | head -5)
  if [ -n "$FOUND_DBS" ]; then
    echo "     Ditemukan:"
    echo "$FOUND_DBS" | sed 's/^/       /'
    DB=$(echo "$FOUND_DBS" | head -1)
    echo "  ✅ DB dari find: $DB"
  else
    echo "  ❌ Tidak ada custom.db di seluruh filesystem!"
    echo ""
    echo "▼ DIAGNOSA LANJUTAN (tanpa DB)"
    echo "─────────────────────────────────────────────────"

    # Cek PM2 status
    echo ""
    echo "▼ PM2 STATUS"
    pm2 list 2>/dev/null | grep -E "nexvo|name" || echo "  PM2 tidak tersedia / no nexvo process"

    # Cek deploy marker via HTTP
    echo ""
    echo "▼ DEPLOY MARKER (via HTTP localhost:3000)"
    MARKER=$(curl -s --max-time 5 http://localhost:3000/api/deploy-version 2>/dev/null)
    if [ -n "$MARKER" ]; then
      echo "  $MARKER" | head -c 500
      echo ""
    else
      echo "  ❌ nexvo-web tidak respond di port 3000"
    fi

    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "  ❌ DB TIDAK DITEMUKAN. Tidak bisa lanjut diagnostic."
    echo "═══════════════════════════════════════════════════════════"
    echo "  Kemungkinan:"
    echo "  1. nexvo BELUM di-deploy di VPS ini"
    echo "     → jalankan: bash <(curl -sL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/bootstrap-deploy.sh)"
    echo "  2. nexvo deploy di lokasi non-standar"
    echo "     → cari manual: find / -name 'package.json' 2>/dev/null | xargs grep -l 'nexvo' 2>/dev/null"
    echo "  3. DB punya nama lain (bukan custom.db)"
    echo "     → cari: find / -name '*.db' -type f 2>/dev/null | head -20"
    echo "═══════════════════════════════════════════════════════════"
    exit 1
  fi
fi

# ─────────────────────────────────────────────────────────────
# [1] DEPLOY MARKER
# ─────────────────────────────────────────────────────────────
echo ""
echo "▼ [1/7] DEPLOY MARKER"
echo "─────────────────────────────────────────────────"
MARKER=$(curl -s --max-time 5 http://localhost:3000/api/deploy-version 2>/dev/null | grep -o '"versionMarker":"[^"]*"' | head -1)
echo "  $MARKER"
if echo "$MARKER" | grep -q "V3.2"; then
  echo "  ✅ v3.2 running"
else
  echo "  ❌ v3.2 BELUM running! Deploy dulu."
  echo "     bash <(curl -sL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/bootstrap-deploy.sh)"
fi

# ─────────────────────────────────────────────────────────────
# [2] USERS DENGAN PROFIT
# ─────────────────────────────────────────────────────────────
echo ""
echo "▼ [2/7] USERS DENGAN PROFIT (mainBalance atau totalProfit > 0)"
echo "─────────────────────────────────────────────────"
sqlite3 -header -column "$DB" "SELECT id, userId, name, mainBalance, totalProfit FROM User WHERE mainBalance > 0 OR totalProfit > 0 ORDER BY mainBalance DESC LIMIT 10;" 2>/dev/null

# ─────────────────────────────────────────────────────────────
# [3] INVESTMENT RECORDS
# ─────────────────────────────────────────────────────────────
echo ""
echo "▼ [3/7] SEMUA INVESTMENT RECORDS (per user)"
echo "─────────────────────────────────────────────────"
if [ -n "$TARGET_USERID" ]; then
  sqlite3 -header -column "$DB" "SELECT i.id, i.userId, u.name, i.amount, i.dailyProfit, i.totalProfitEarned, i.status, i.startDate, i.lastProfitDate, i.endDate FROM Investment i JOIN User u ON i.userId = u.id WHERE u.userId = '$TARGET_USERID' ORDER BY i.createdAt DESC;" 2>/dev/null
else
  sqlite3 -header -column "$DB" "SELECT i.id, i.userId, u.name, i.amount, i.dailyProfit, i.totalProfitEarned, i.status, date(i.startDate) as startWIB, date(i.lastProfitDate) as lastProfitWIB FROM Investment i JOIN User u ON i.userId = u.id WHERE i.totalProfitEarned > 0 OR i.status = 'active' ORDER BY i.userId, i.createdAt DESC LIMIT 30;" 2>/dev/null
fi

# ─────────────────────────────────────────────────────────────
# [4] PURCHASE RECORDS
# ─────────────────────────────────────────────────────────────
echo ""
echo "▼ [4/7] SEMUA PURCHASE RECORDS (per user)"
echo "─────────────────────────────────────────────────"
if [ -n "$TARGET_USERID" ]; then
  sqlite3 -header -column "$DB" "SELECT p.id, p.userId, u.name, p.totalPrice, p.profitEarned, p.dailyProfit, p.status, date(p.createdAt) as createdWIB, date(p.lastProfitDate) as lastProfitWIB FROM Purchase p JOIN User u ON p.userId = u.id WHERE u.userId = '$TARGET_USERID' ORDER BY p.createdAt DESC;" 2>/dev/null
else
  sqlite3 -header -column "$DB" "SELECT p.id, p.userId, u.name, p.totalPrice, p.profitEarned, p.status, date(p.createdAt) as createdWIB FROM Purchase p JOIN User u ON p.userId = u.id WHERE p.profitEarned > 0 OR p.status = 'active' ORDER BY p.userId, p.createdAt DESC LIMIT 30;" 2>/dev/null
fi

# ─────────────────────────────────────────────────────────────
# [5] BONUSLOG SUM per USER
# ─────────────────────────────────────────────────────────────
echo ""
echo "▼ [5/7] BONUSLOG SUM per USER (type='profit')"
echo "─────────────────────────────────────────────────"
sqlite3 -header -column "$DB" "SELECT b.userId, u.name, COUNT(*) as entries, SUM(b.amount) as totalProfitLogs FROM BonusLog b JOIN User u ON b.userId = u.id WHERE b.type = 'profit' GROUP BY b.userId ORDER BY totalProfitLogs DESC LIMIT 10;" 2>/dev/null

# ─────────────────────────────────────────────────────────────
# [6] BONUSLOG ENTRIES DETAIL
# ─────────────────────────────────────────────────────────────
echo ""
echo "▼ [6/7] BONUSLOG ENTRIES DETAIL untuk user dengan profit > 30000"
echo "─────────────────────────────────────────────────"
sqlite3 -header -column "$DB" "SELECT b.id, b.userId, u.name, b.amount, b.type, datetime(b.createdAt) as createdWIB, substr(b.description, 1, 60) as desc FROM BonusLog b JOIN User u ON b.userId = u.id WHERE b.type = 'profit' AND b.userId IN (SELECT userId FROM User WHERE totalProfit > 30000) ORDER BY b.userId, b.createdAt DESC LIMIT 20;" 2>/dev/null

# ─────────────────────────────────────────────────────────────
# [7] PERHITUNGAN EXPECTED vs AKTUAL
# ─────────────────────────────────────────────────────────────
echo ""
echo "▼ [7/7] PERHITUNGAN EXPECTED vs AKTUAL"
echo "─────────────────────────────────────────────────"
echo "  Untuk setiap user, hitung:"
echo "  - sumInv = SUM(Investment.totalProfitEarned)"
echo "  - sumPur = SUM(Purchase.profitEarned)"
echo "  - sumLog = SUM(BonusLog.amount WHERE type='profit')"
echo "  - userTotalProfit = User.totalProfit"
echo "  - userMainBalance = User.mainBalance"
echo ""
sqlite3 -header -column "$DB" "
SELECT
  u.userId,
  u.name,
  u.mainBalance,
  u.totalProfit,
  COALESCE(i.sumInv, 0) as sumInv,
  COALESCE(p.sumPur, 0) as sumPur,
  COALESCE(b.sumLog, 0) as sumLog,
  CASE
    WHEN u.totalProfit > COALESCE(b.sumLog, 0) + 1 THEN 'DRIFT User.totalProfit > BonusLog'
    WHEN COALESCE(b.sumLog, 0) > COALESCE(i.sumInv, 0) + COALESCE(p.sumPur, 0) + 1 THEN 'EXCESS BonusLog > Investment+Purchase'
    ELSE 'OK'
  END as diagnosis
FROM User u
LEFT JOIN (SELECT userId, SUM(totalProfitEarned) as sumInv FROM Investment GROUP BY userId) i ON i.userId = u.id
LEFT JOIN (SELECT userId, SUM(profitEarned) as sumPur FROM Purchase GROUP BY userId) p ON p.userId = u.id
LEFT JOIN (SELECT userId, SUM(amount) as sumLog FROM BonusLog WHERE type='profit' GROUP BY userId) b ON b.userId = u.id
WHERE u.totalProfit > 0 OR u.mainBalance > 0
ORDER BY u.totalProfit DESC
LIMIT 10;
" 2>/dev/null

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  CARA BACA DIAGNOSIS:"
echo "═══════════════════════════════════════════════════════════"
echo "  • DRIFT User.totalProfit > BonusLog:"
echo "    → User.mainBalance inflated (cleanup v3.2 STEP 5 akan fix)"
echo "  • EXCESS BonusLog > Investment+Purchase:"
echo "    → BonusLog punya entries lebih dari seharusnya (STEP 4 akan trim)"
echo "  • OK:"
echo "    → Semua match. Kalau Asset page masih salah = masalah di API Math.max/min"
echo ""
echo "  Kirim output ini ke developer untuk analisis."
echo "═══════════════════════════════════════════════════════════"
