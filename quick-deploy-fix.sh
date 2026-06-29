#!/bin/bash
# ════════════════════════════════════════════════════════════════
# NEXVO — QUICK DEPLOY FIX (1 command, semua fix profit)
# ════════════════════════════════════════════════════════════════
#
# Cara pakai (copy-paste 1 baris ini di terminal VPS):
#   bash <(curl -sL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/quick-deploy-fix.sh)
#
# Atau kalau download dulu:
#   curl -sL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/quick-deploy-fix.sh -o fix.sh && bash fix.sh
#
# Script ini melakukan:
#   1. Cari project Nexvo di VPS
#   2. Backup DB otomatis
#   3. Git pull latest code (semua fix profit)
#   4. Run fix-profit-v6.sh (6 phase repair)
#   5. Restart PM2 (cron service + web)
#
# 🔒 AMAN: TIDAK hapus data apapun (user, purchase, investment tetap)
# ════════════════════════════════════════════════════════════════

set +e

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  NEXVO QUICK DEPLOY FIX — 1 command, semua fix   ║"
echo "║  🔒 TIDAK HAPUS DATA APAPUN                      ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ─── CARI PROJECT ───
PROJECT_DIR=""
for candidate in "/var/www/nexvo" "/home/nexvo" "/var/www/html/nexvo" "/var/www/nexvoid" "/home/$USER/nexvo" "/root/nexvo" "/opt/nexvo" "$HOME/nexvo" "$(pwd)"; do
  if [ -f "$candidate/package.json" ] && [ -f "$candidate/.env" ]; then
    PROJECT_DIR="$candidate"
    break
  fi
done

if [ -z "$PROJECT_DIR" ]; then
  echo "❌ Project Nexvo tidak ditemukan!"
  echo "   Cari folder yang ada package.json + .env"
  echo "   Folder umum: /var/www/nexvo, /home/nexvo, /root/nexvo"
  exit 1
fi

cd "$PROJECT_DIR" || exit 1
echo "📂 Project: $PROJECT_DIR"
echo "🕐 WIB now: $(TZ='Asia/Jakarta' date '+%Y-%m-%d %H:%M:%S %A')"
echo ""

# ─── CEK BUN ───
if ! command -v bun &>/dev/null; then
  echo "❌ bun tidak tersedia! Install: curl -fsSL https://bun.sh/install | bash"
  exit 1
fi
echo "✅ bun: $(bun --version)"

# ─── CEK GIT ───
if ! command -v git &>/dev/null; then
  echo "⚠️  git tidak tersedia — skip git pull, langsung run fix-profit-v6.sh"
  SKIP_GIT=1
else
  echo "✅ git: $(git --version)"
  SKIP_GIT=0
fi

# ─── CEK PM2 ───
if ! command -v pm2 &>/dev/null; then
  echo "⚠️  pm2 tidak tersedia — skip restart, manual restart diperlukan"
  SKIP_PM2=1
else
  echo "✅ pm2: $(pm2 --version)"
  SKIP_PM2=0
fi
echo ""

# ════════════════════════════════════════════════════════════════
# STEP 1: BACKUP DB
# ════════════════════════════════════════════════════════════════
echo "═══════════════════════════════════════════════════"
echo "  STEP 1: BACKUP DATABASE"
echo "═══════════════════════════════════════════════════"

BACKUP_FILE=""
for db_path in "db/custom.db" "db/production.db" "prisma/dev.db"; do
  if [ -f "$db_path" ]; then
    BACKUP_FILE="${db_path}.backup-$(date +%Y%m%d-%H%M%S)"
    cp "$db_path" "$BACKUP_FILE" 2>/dev/null
    echo "💾 DB backup: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
    break
  fi
done

if [ -z "$BACKUP_FILE" ]; then
  echo "⚠️  DB file tidak ditemukan di path umum — backup skipped"
  echo "   (Database mungkin pakai external MySQL/PostgreSQL)"
fi
echo ""

# ════════════════════════════════════════════════════════════════
# STEP 2: GIT PULL (ambil code terbaru dari GitHub)
# ════════════════════════════════════════════════════════════════
echo "═══════════════════════════════════════════════════"
echo "  STEP 2: GIT PULL (code terbaru)"
echo "═══════════════════════════════════════════════════"

if [ "$SKIP_GIT" = "1" ]; then
  echo "⏭️  Skip git pull (git tidak tersedia)"
else
  # Cek apakah ini git repo
  if [ -d ".git" ]; then
    echo "🔄 git fetch origin..."
    git fetch origin 2>&1 | tail -3
    echo "🔄 git reset --hard origin/main..."
    git reset --hard origin/main 2>&1 | tail -3
    echo "📋 Latest commit:"
    git log --oneline -3
  else
    echo "⚠️  Folder ini bukan git repo — skip git pull"
    echo "   Download fix-profit-v6.sh manual dari GitHub"
  fi
fi
echo ""

# ════════════════════════════════════════════════════════════════
# STEP 3: RUN DIAG-DB (read-only diagnostic)
# ════════════════════════════════════════════════════════════════
echo "═══════════════════════════════════════════════════"
echo "  STEP 3: DIAGNOSTIC DB (read-only, gak rubah apapun)"
echo "═══════════════════════════════════════════════════"

if [ -f "diag-db.sh" ]; then
  bash diag-db.sh 2>&1 | head -50
else
  echo "⚠️  diag-db.sh tidak ditemukan — download dari GitHub..."
  curl -sL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/diag-db.sh -o diag-db.sh
  bash diag-db.sh 2>&1 | head -50
fi
echo ""

# ════════════════════════════════════════════════════════════════
# STEP 4: RUN FIX-PROFIT-V6 (6 phase repair)
# ════════════════════════════════════════════════════════════════
echo "═══════════════════════════════════════════════════"
echo "  STEP 4: FIX PROFIT v6 (6 phase repair)"
echo "═══════════════════════════════════════════════════"

if [ -f "fix-profit-v6.sh" ]; then
  bash fix-profit-v6.sh 2>&1
else
  echo "⚠️  fix-profit-v6.sh tidak ditemukan — download dari GitHub..."
  curl -sL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/fix-profit-v6.sh -o fix-profit-v6.sh
  bash fix-profit-v6.sh 2>&1
fi
echo ""

# ════════════════════════════════════════════════════════════════
# STEP 5: RESTART PM2 (cron + web)
# ════════════════════════════════════════════════════════════════
echo "═══════════════════════════════════════════════════"
echo "  STEP 5: RESTART PM2 (cron service + web)"
echo "═══════════════════════════════════════════════════"

if [ "$SKIP_PM2" = "1" ]; then
  echo "⚠️  pm2 tidak tersedia — manual restart diperlukan:"
  echo "   pm2 restart nexvo-cron"
  echo "   pm2 restart nexvo-web"
else
  # Restart cron service
  if pm2 list 2>/dev/null | grep -q "nexvo-cron"; then
    echo "🔄 pm2 restart nexvo-cron..."
    pm2 restart nexvo-cron 2>&1 | tail -3
    echo "✅ nexvo-cron restarted"
  else
    echo "⚠️  nexvo-cron tidak ditemukan di PM2 — mungkin pakai nama lain"
    pm2 list 2>/dev/null
  fi

  # Restart web (optional — code Next.js auto-reload di dev, perlu restart di production)
  if pm2 list 2>/dev/null | grep -q "nexvo-web"; then
    echo "🔄 pm2 restart nexvo-web..."
    pm2 restart nexvo-web 2>&1 | tail -3
    echo "✅ nexvo-web restarted"
  fi
fi
echo ""

# ════════════════════════════════════════════════════════════════
# SELESAI
# ════════════════════════════════════════════════════════════════
echo "╔══════════════════════════════════════════════════╗"
echo "║  ✅ QUICK DEPLOY FIX SELESAI                    ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║                                                  ║"
echo "║  🔒 TIDAK HAPUS DATA APAPUN                      ║"
echo "║  • Backup DB: $BACKUP_FILE"
echo "║  • Git pull: latest code (semua fix profit)      ║"
echo "║  • Fix DB: 6 phase repair (riwayat + total)      ║"
echo "║  • PM2 restart: cron + web                       ║"
echo "║                                                  ║"
echo "║  🔎 CEK HASIL:                                   ║"
echo "║  • Login admin → Kelola Aset → lihat Total Profit ║"
echo "║  • Login user → Riwayat → lihat profit entries    ║"
echo "║  • Cron auto jalan tiap 10 detik di weekday       ║"
echo "║                                                  ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "📝 Kalau ada masalah, cek log:"
echo "   pm2 logs nexvo-cron --lines 50"
echo "   pm2 logs nexvo-web --lines 50"
echo ""
