#!/bin/bash
# ════════════════════════════════════════════════════════════════
#  NEXVO v3.2 DEEP DIAGNOSTIC — cari SUMBER 68800 dengan presisi
#  Jalankan di VPS: bash diag-deep-v32.sh [userId]
#  Jika userId kosong, tampilkan semua user dengan profit
# ════════════════════════════════════════════════════════════════
set +e
PROJECT_DIR="/home/nexvo"
DB="$PROJECT_DIR/db/custom.db"
TARGET_USERID="$1"

echo "═══════════════════════════════════════════════════════════"
echo "  NEXVO v3.2 DEEP DIAGNOSTIC — SUMBER 68800"
echo "  Waktu: $(date '+%Y-%m-%d %H:%M:%S WIB')"
echo "═══════════════════════════════════════════════════════════"

if [ ! -f "$DB" ]; then
  echo "❌ DB tidak ditemukan di $DB"
  echo "   Cari DB: find / -name 'custom.db' 2>/dev/null | head -5"
  exit 1
fi

echo ""
echo "▼ [1/7] DEPLOY MARKER"
echo "─────────────────────────────────────────────────"
MARKER=$(curl -s --max-time 5 http://localhost:3000/api/deploy-version 2>/dev/null | grep -o '"versionMarker":"[^"]*"' | head -1)
echo "  $MARKER"
if echo "$MARKER" | grep -q "V3.2"; then
  echo "  ✅ v3.2 running"
else
  echo "  ❌ v3.2 BELUM running! Deploy dulu."
fi

echo ""
echo "▼ [2/7] USERS DENGAN PROFIT (mainBalance atau totalProfit > 0)"
echo "─────────────────────────────────────────────────"
sqlite3 -header -column "$DB" "SELECT id, userId, name, mainBalance, totalProfit FROM User WHERE mainBalance > 0 OR totalProfit > 0 ORDER BY mainBalance DESC LIMIT 10;" 2>/dev/null

echo ""
echo "▼ [3/7] SEMUA INVESTMENT RECORDS (per user)"
echo "─────────────────────────────────────────────────"
if [ -n "$TARGET_USERID" ]; then
  sqlite3 -header -column "$DB" "SELECT i.id, i.userId, u.name, i.amount, i.dailyProfit, i.totalProfitEarned, i.status, i.startDate, i.lastProfitDate, i.endDate FROM Investment i JOIN User u ON i.userId = u.id WHERE u.userId = '$TARGET_USERID' ORDER BY i.createdAt DESC;" 2>/dev/null
else
  sqlite3 -header -column "$DB" "SELECT i.id, i.userId, u.name, i.amount, i.dailyProfit, i.totalProfitEarned, i.status, date(i.startDate) as startWIB, date(i.lastProfitDate) as lastProfitWIB FROM Investment i JOIN User u ON i.userId = u.id WHERE i.totalProfitEarned > 0 OR i.status = 'active' ORDER BY i.userId, i.createdAt DESC LIMIT 30;" 2>/dev/null
fi

echo ""
echo "▼ [4/7] SEMUA PURCHASE RECORDS (per user)"
echo "─────────────────────────────────────────────────"
if [ -n "$TARGET_USERID" ]; then
  sqlite3 -header -column "$DB" "SELECT p.id, p.userId, u.name, p.totalPrice, p.profitEarned, p.dailyProfit, p.status, date(p.createdAt) as createdWIB, date(p.lastProfitDate) as lastProfitWIB FROM Purchase p JOIN User u ON p.userId = u.id WHERE u.userId = '$TARGET_USERID' ORDER BY p.createdAt DESC;" 2>/dev/null
else
  sqlite3 -header -column "$DB" "SELECT p.id, p.userId, u.name, p.totalPrice, p.profitEarned, p.status, date(p.createdAt) as createdWIB FROM Purchase p JOIN User u ON p.userId = u.id WHERE p.profitEarned > 0 OR p.status = 'active' ORDER BY p.userId, p.createdAt DESC LIMIT 30;" 2>/dev/null
fi

echo ""
echo "▼ [5/7] BONUSLOG SUM per USER (type='profit')"
echo "─────────────────────────────────────────────────"
sqlite3 -header -column "$DB" "SELECT b.userId, u.name, COUNT(*) as entries, SUM(b.amount) as totalProfitLogs FROM BonusLog b JOIN User u ON b.userId = u.id WHERE b.type = 'profit' GROUP BY b.userId ORDER BY totalProfitLogs DESC LIMIT 10;" 2>/dev/null

echo ""
echo "▼ [6/7] BONUSLOG ENTRIES DETAIL untuk user dengan profit > 30000"
echo "─────────────────────────────────────────────────"
sqlite3 -header -column "$DB" "SELECT b.id, b.userId, u.name, b.amount, b.type, datetime(b.createdAt) as createdWIB, substr(b.description, 1, 60) as desc FROM BonusLog b JOIN User u ON b.userId = u.id WHERE b.type = 'profit' AND b.userId IN (SELECT userId FROM User WHERE totalProfit > 30000) ORDER BY b.userId, b.createdAt DESC LIMIT 20;" 2>/dev/null

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
