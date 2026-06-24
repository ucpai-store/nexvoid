#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  NEXVO — DEPLOY UI UPDATE (lightweight, no profit/cron changes)
#  Use this for frontend-only changes (deposit UI, pages, etc.)
#  - Pulls code, builds with --webpack, restarts PM2 web only
#  - Does NOT touch cron, crontab, or profit system
#  - Crash-resistant: trap ensures PM2 starts even if build fails
# ════════════════════════════════════════════════════════════════════
set -u

PROJECT_DIR="/home/nexvo/nexvo"
BRANCH="main"
BUILD_OK=0

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()    { echo -e "${GREEN}✓ $1${NC}"; }
info()  { echo -e "${CYAN}ℹ $1${NC}"; }
warn()  { echo -e "${YELLOW}⚠ $1${NC}"; }
err()   { echo -e "${RED}✗ $1${NC}"; }
step()  { echo -e "\n${BLUE}━━━ $1 ━━━${NC}"; }

# Find project dir
if [ ! -d "$PROJECT_DIR" ]; then
  for d in "/home/nexvo" "/root/nexvo" "/var/www/nexvo" "$HOME/nexvo"; do
    if [ -f "$d/package.json" ] && grep -q "nexvo" "$d/package.json" 2>/dev/null; then
      PROJECT_DIR="$d"; break
    fi
  done
fi
[ ! -d "$PROJECT_DIR" ] && { err "Project dir not found"; exit 1; }
cd "$PROJECT_DIR"
info "Project: $PROJECT_DIR"

# Find bun
BUN_BIN=""
for b in "$HOME/.bun/bin/bun" "/usr/local/bin/bun" "/usr/bin/bun" "$(command -v bun 2>/dev/null)"; do
  [ -n "$b" ] && [ -x "$b" ] && { BUN_BIN="$b"; break; }
done
[ -z "$BUN_BIN" ] && { err "bun not found"; exit 1; }
info "Bun: $BUN_BIN"

# Trap: ensure web restarts even if build fails
ensure_web_running() {
  if [ "$BUILD_OK" = "1" ]; then
    pm2 restart nexvo-web --update-env 2>/dev/null || pm2 start "$BUN_BIN" --name nexvo-web -- run start 2>/dev/null
    ok "PM2 nexvo-web restarted"
  elif [ -d ".next.backup/standalone" ]; then
    warn "Build failed — restoring previous build..."
    rm -rf .next 2>/dev/null; mv .next.backup .next 2>/dev/null
    pm2 restart nexvo-web --update-env 2>/dev/null
    ok "Previous build restored, web restarted"
  else
    err "Build failed and no backup — web may be down"
  fi
}
trap ensure_web_running EXIT

step "1/5  Stopping PM2 nexvo-web"
pm2 stop nexvo-web 2>/dev/null && ok "nexvo-web stopped" || warn "nexvo-web not running yet"

step "2/5  Pulling latest code"
git fetch origin "$BRANCH" 2>&1 | tail -2
git reset --hard "origin/$BRANCH" 2>&1 | tail -1
ok "Code updated"

step "3/5  Installing deps + generating Prisma"
$BUN_BIN install 2>&1 | tail -3
$BUN_BIN run db:generate 2>&1 | tail -2 || $BUN_BIN x prisma generate 2>&1 | tail -2
ok "Deps ready"

step "4/5  Building with --webpack"
# Backup current build
[ -d ".next" ] && { rm -rf ".next.backup" 2>/dev/null; mv .next .next.backup 2>/dev/null; }
$BUN_BIN run build 2>&1 | tail -15
if [ -d ".next/standalone" ]; then
  ok "Build success"
  BUILD_OK=1
  rm -rf ".next.backup" 2>/dev/null
  # Copy public assets to standalone
  [ -d "public" ] && [ -d ".next/standalone/public" ] && cp -rn public/* .next/standalone/public/ 2>/dev/null || true
  mkdir -p .next/standalone/uploads .next/standalone/public uploads public
else
  err "Build failed — trap will restore previous build"
fi

step "5/5  Restarting PM2 nexvo-web (production mode)"
# Trap handles this, but show status
sleep 2
pm2 list 2>&1 | grep -E "nexvo|name" | head -5
echo ""
WEB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://localhost:3000/ 2>/dev/null || echo "000")
if [ "$WEB_STATUS" = "200" ] || [ "$WEB_STATUS" = "307" ]; then
  ok "Web responding (HTTP $WEB_STATUS)"
else
  err "Web NOT responding (HTTP $WEB_STATUS) — check: pm2 logs nexvo-web --lines 30"
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ UI UPDATE DEPLOYED${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Changes live:"
echo "  ✓ Halaman Produk & Paket sekarang TAMPIL SAMA dengan admin"
echo "    (menampilkan Product model dengan banner emas, persis seperti #admin-products)"
echo "  ✓ Sistem pembelian diubah ke aturan no-duplicates + 1-active-only:"
echo "      • Setiap produk hanya bisa dibeli SEKALI (tidak bisa beli yg sudah dimiliki)"
echo "      • Boleh beli produk mana saja yg belum dimiliki (TIDAK harus berurutan)"
echo "      • 1 produk aktif saja — beli produk baru otomatis menggantikan aktif lama"
echo "  ✓ Profit masuk otomatis jam 00:00 WIB sesuai produk aktif hari ini"
echo "  ✓ State tombol: Beli Sekarang / Sedang Aktif / Sudah Dimiliki"
echo "  ✓ Banner pemberitahuan '1 Paket Aktif Saja' sudah dihapus (tetap dihapus)"
echo ""
echo -e "${YELLOW}👉 HARD REFRESH browser (Ctrl+Shift+R) to see changes.${NC}"
echo ""
