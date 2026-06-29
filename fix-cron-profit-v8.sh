#!/bin/bash
# ════════════════════════════════════════════════════════════════
# NEXVO — FIX CRON PROFIT v8 (1 command, NO build needed!)
# ════════════════════════════════════════════════════════════════
#
# Cara pakai (copy-paste 1 baris ini di terminal VPS):
#   bash <(curl -sL "https://raw.githubusercontent.com/ucpai-store/nexvoid/main/fix-cron-profit-v8.sh?t=$(date +%s)")
#
# Script ini khusus FIX cron profit jam 00:00 WIB yang gak masuk:
#   1. git pull (ambil cron-service.ts terbaru dengan LEGACY purchase path)
#   2. pm2 restart nexvo-cron --update-env (NO BUILD — bun langsung jalanin .ts!)
#   3. VERIFY: curl localhost:3032 → cek version = CRON-V8-20250629
#   4. Test trigger profit manual (optional)
#
# ⚡ CEPAT: cron-service.ts jalan via `bun run cron-service.ts` →
#   TIDAK perlu build Next.js! Restart PM2 = langsung ambil code baru!
#
# 🔒 AMAN: TIDAK sentuh nexvo-web, TIDAK hapus data apapun
# ════════════════════════════════════════════════════════════════

set +e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  FIX CRON PROFIT v8 — NO BUILD, CUMA RESTART!    ║${NC}"
echo -e "${CYAN}║  🔒 TIDAK sentuh nexvo-web, TIDAK hapus data    ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
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
  echo -e "${RED}❌ Project Nexvo tidak ditemukan!${NC}"
  exit 1
fi

cd "$PROJECT_DIR" || exit 1
echo -e "📂 Project: ${YELLOW}$PROJECT_DIR${NC}"
echo -e "🕐 WIB now: $(TZ='Asia/Jakarta' date '+%Y-%m-%d %H:%M:%S %A')"
echo ""

# ─── CEK TOOLS ───
command -v git &>/dev/null || { echo -e "${RED}❌ git tidak tersedia!${NC}"; exit 1; }
command -v pm2 &>/dev/null || { echo -e "${RED}❌ pm2 tidak tersedia!${NC}"; exit 1; }
echo -e "${GREEN}✅ git + pm2 tersedia${NC}"
echo ""

# ════════════════════════════════════════════════════════════════
# STEP 1: GIT PULL (ambil cron-service.ts terbaru)
# ════════════════════════════════════════════════════════════════
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  📥 STEP 1: GIT PULL (ambil code terbaru)${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"

git fetch origin 2>&1 | tail -2
git reset --hard origin/main 2>&1 | tail -2
echo ""
echo "📋 Latest commit:"
git log --oneline -3
echo ""

# Cek apakah cron-service.ts punya LEGACY purchase path + CRON-V8 marker
echo "─── Verify cron-service.ts v8 ───"
if grep -q "CRON-V8-20250629" cron-service.ts 2>/dev/null; then
  echo -e "${GREEN}✅ CRON-V8 marker ADA di cron-service.ts${NC}"
else
  echo -e "${RED}❌ CRON-V8 marker TIDAK ADA — git pull mungkin gagal!${NC}"
fi
if grep -q "LEGACY purchase" cron-service.ts 2>/dev/null; then
  echo -e "${GREEN}✅ LEGACY purchase profit path ADA (BonusLog + User balance update)${NC}"
else
  echo -e "${RED}❌ LEGACY purchase path TIDAK ADA!${NC}"
fi
if grep -q "BonusLog" cron-service.ts 2>/dev/null; then
  echo -e "${GREEN}✅ BonusLog creation ADA (untuk Riwayat user)${NC}"
else
  echo -e "${RED}❌ BonusLog TIDAK ADA — profit gak akan muncul di Riwayat!${NC}"
fi
echo ""

# ════════════════════════════════════════════════════════════════
# STEP 2: RESTART nexvo-cron (NO BUILD NEEDED!)
# ════════════════════════════════════════════════════════════════
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  🔄 STEP 2: RESTART nexvo-cron (NO BUILD!)${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}⚡ cron-service.ts jalan via 'bun run cron-service.ts'${NC}"
echo -e "${YELLOW}   → TIDAK perlu build! Restart PM2 = langsung ambil code baru!${NC}"
echo ""

# Restart nexvo-cron ONLY (jangan sentuh nexvo-web!)
if pm2 list 2>/dev/null | grep -q "nexvo-cron"; then
  echo "🔄 pm2 restart nexvo-cron --update-env..."
  pm2 restart nexvo-cron --update-env 2>&1 | tail -5
  echo -e "${GREEN}✅ nexvo-cron restarted dengan code baru!${NC}"
else
  echo -e "${YELLOW}⚠️  nexvo-cron tidak ditemukan di PM2. Starting baru...${NC}"
  pm2 start ecosystem.config.cjs --only nexvo-cron 2>&1 | tail -5
  pm2 save 2>/dev/null
fi
echo ""

# ════════════════════════════════════════════════════════════════
# STEP 3: VERIFY (cek version via cron service HTTP API)
# ════════════════════════════════════════════════════════════════
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  🔍 STEP 3: VERIFY (cek cron service version)${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""

# Tunggu cron service ready
echo "⏳ Tunggu cron service ready (5 detik)..."
sleep 5

# Test cron service status
echo "─── Test cron service: curl http://localhost:3032/ ───"
CRON_RESP=$(curl -s --max-time 10 http://localhost:3032/ 2>/dev/null)
if [ -n "$CRON_RESP" ]; then
  echo "Response: $CRON_RESP"
  echo ""
  if echo "$CRON_RESP" | grep -q "CRON-V8-20250629"; then
    echo -e "${GREEN}✅✅✅ CRON SERVICE v8 SUDAH AKTIF! ✅✅✅${NC}"
    echo -e "${GREEN}   Version marker CRON-V8-20250629 ditemukan${NC}"
    echo -e "${GREEN}   Cron profit jam 00:00 WIB akan jalan dengan code baru${NC}"
  else
    echo -e "${RED}❌ CRON SERVICE masih jalanin code LAMA!${NC}"
    echo -e "${YELLOW}   Version CRON-V8-20250629 tidak ditemukan.${NC}"
    echo "   Coba: pm2 restart nexvo-cron --update-env"
    echo "   Atau cek log: pm2 logs nexvo-cron --lines 30"
  fi
else
  echo -e "${RED}❌ Tidak dapat response dari cron service (port 3032)${NC}"
  echo "   Cron service mungkin crash atau belum start."
  echo "   Cek: pm2 logs nexvo-cron --lines 30"
fi
echo ""

# ════════════════════════════════════════════════════════════════
# STEP 4: PM2 STATUS
# ════════════════════════════════════════════════════════════════
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  📊 STEP 4: PM2 STATUS${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""
pm2 list 2>/dev/null | grep -E "nexvo|name|online|stopped|errored" | head -10
echo ""

# ════════════════════════════════════════════════════════════════
# SELESAI
# ════════════════════════════════════════════════════════════════
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  ✅ FIX CRON PROFIT v8 SELESAI                  ║${NC}"
echo -e "${CYAN}╠══════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  🔒 TIDAK sentuh nexvo-web                      ║${NC}"
echo -e "${CYAN}║  🔒 TIDAK hapus data apapun                     ║${NC}"
echo -e "${CYAN}║                                                  ║${NC}"
echo -e "${CYAN}║  🔎 CEK HASIL (WAJIB):                           ║${NC}"
echo -e "${CYAN}║  1. curl http://localhost:3032/                  ║${NC}"
echo -e "${CYAN}║     → Harus ada "CRON-V8-20250629"               ║${NC}"
echo -e "${CYAN}║  2. pm2 logs nexvo-cron --lines 30               ║${NC}"
echo -e "${CYAN}║     → Cari [Cron Service] ★ VERSION              ║${NC}"
echo -e "${CYAN}║  3. Besok 00:01 WIB, cek:                        ║${NC}"
echo -e "${CYAN}║     • pm2 logs nexvo-cron --lines 50             ║${NC}"
echo -e "${CYAN}║       → Harus ada "[Profit Cron] 💰 LEGACY"      ║${NC}"
echo -e "${CYAN}║     • User Riwayat → muncul "Profit harian"      ║${NC}"
echo -e "${CYAN}║     • User Total Profit → naik                   ║${NC}"
echo -e "${CYAN}║                                                  ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}📝 Kalau masih gak masuk besok 00:00 WIB:${NC}"
echo "   1. Cek weekend libur: Sabtu/Minggu profit emang OFF by design"
echo "   2. Cek: curl http://localhost:3032/api/debug/profit"
echo "   3. Manual trigger: curl -X POST http://localhost:3032/api/trigger/profit?force=true"
echo "   4. Kirim output pm2 logs nexvo-cron --lines 50 ke dev"
echo ""
echo -e "${YELLOW}📝 Manual trigger profit SEKARANG (test):${NC}"
echo "   curl -X POST http://localhost:3032/api/trigger/profit?force=true"
echo "   Lalu cek user Riwayat + Total Profit dalam 10 detik."
echo ""
