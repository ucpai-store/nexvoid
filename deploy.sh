#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO — One-Shot Production Deployment Script
#  Usage:
#    curl -fsSL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/deploy.sh | bash
#    bash deploy.sh                 # full deploy (pull + build + restart + verify)
#    bash deploy.sh --skip-build    # skip next build (for hot-pull code only)
#    bash deploy.sh --dev           # run in dev mode (next dev, no build)
#    bash deploy.sh --check         # verify-only, no deploy
#  After this script finishes, ALL systems MUST be 100% working:
#    - Next.js app on :3000
#    - Cron-service on :3032 (profit + salary auto-credit)
#    - Profit 2%/day × 180 days = 576k cap (WEEKDAYS ONLY — Sat/Sun LIBUR)
#    - Salary 1%/week FOREVER (10 refs + active investment)
# ═══════════════════════════════════════════════════════════════
set -eo pipefail

# ─── Config ───
# Auto-detect app dir:
#   1. If APP_DIR env var set → use it
#   2. If $0 is a real file (running from cloned repo) → use its dir
#   3. Else (curl pipe to bash, $0 = "bash") → use /root/nexvo (or ~/nexvo)
if [ -n "$APP_DIR" ]; then
  : # keep env var
elif [ -f "$0" ] && [ "$(dirname "$0")" != "." ]; then
  APP_DIR="$(cd "$(dirname "$0")" && pwd)"
else
  # curl pipe to bash — no script file on disk
  APP_DIR="${HOME}/nexvo"
fi
PORT_APP="${PORT_APP:-3000}"
PORT_CRON="${PORT_CRON:-3032}"
PORT_WABOT="${PORT_WABOT:-3033}"
LOG_DIR="$APP_DIR/logs"
GIT_REPO_URL="${GIT_REPO_URL:-https://github.com/ucpai-store/nexvoid.git}"
GIT_REMOTE="${GIT_REMOTE:-origin}"
GIT_BRANCH="${GIT_BRANCH:-main}"
ABS_DB_PATH="$APP_DIR/db/custom.db"

# ─── Args ───
SKIP_BUILD=false
DEV_MODE=false
CHECK_ONLY=false
FRESH_CLONE=false
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
    --dev) DEV_MODE=true; SKIP_BUILD=true ;;
    --check) CHECK_ONLY=true ;;
    --fresh) FRESH_CLONE=true ;;
    --help|-h)
      sed -n '2,14p' "$0" 2>/dev/null || cat <<'USAGE'
NEXVO Deploy Script
  bash deploy.sh                 # full deploy (clone+pull+build+restart+verify)
  bash deploy.sh --skip-build    # skip next build (hot-pull code only)
  bash deploy.sh --dev           # run in dev mode (next dev, no build)
  bash deploy.sh --check         # verify-only, no deploy
  bash deploy.sh --fresh         # wipe APP_DIR and re-clone from scratch
  curl -fsSL <url>/deploy.sh | bash           # works on fresh VPS (auto-clone)
  APP_DIR=/opt/nexvo bash deploy.sh           # custom install path
USAGE
      exit 0 ;;
  esac
done

# ─── Helpers ───
C_BLUE='\033[0;34m'; C_GREEN='\033[0;32m'; C_YELLOW='\033[1;33m'
C_RED='\033[0;31m'; C_CYAN='\033[1;36m'; C_BOLD='\033[1m'; C_NC='\033[0m'
log()  { echo -e "${C_BLUE}[$(date +%H:%M:%S)]${C_NC} $*"; }
ok()   { echo -e "${C_GREEN}[$(date +%H:%M:%S)] ✓${C_NC} $*"; }
warn() { echo -e "${C_YELLOW}[$(date +%H:%M:%S)] ⚠${C_NC} $*"; }
err()  { echo -e "${C_RED}[$(date +%H:%M:%S)] ✗${C_NC} $*" >&2; }
die()  { err "$*"; exit 1; }
section() { echo -e "\n${C_CYAN}${C_BOLD}══════ $* ══════${C_NC}"; }

FAIL_COUNT=0
record_fail() { FAIL_COUNT=$((FAIL_COUNT+1)); }

# ═══════════════════════════════════════════════════════════════
# 1. PRE-FLIGHT CHECKS
# ═══════════════════════════════════════════════════════════════
section "1/10 PRE-FLIGHT CHECKS"

# Ensure APP_DIR exists (for fresh VPS / curl pipe to bash)
mkdir -p "$APP_DIR"
cd "$APP_DIR"

command -v git >/dev/null  || die "git not found. Install: apt install git"
command -v bun >/dev/null  || die "bun not found. Install: curl -fsSL https://bun.sh/install | bash"
command -v node >/dev/null || die "node not found. Install Node 18+"
command -v curl >/dev/null || die "curl not found"
command -v lsof >/dev/null || warn "lsof not found (port checks will use ss fallback)"

ok "git:   $(git --version | cut -d' ' -f3)"
ok "bun:   $(bun --version)"
ok "node:  $(node --version)"
ok "app:   $APP_DIR"

# Auto-install pm2 if missing (production process manager)
if ! command -v pm2 >/dev/null; then
  warn "pm2 not found — installing globally..."
  npm install -g pm2 2>/dev/null || die "failed to install pm2 (try: sudo npm install -g pm2)"
fi
ok "pm2:   $(pm2 --version)"

mkdir -p "$LOG_DIR" "$APP_DIR/db"

# ═══════════════════════════════════════════════════════════════
# If --check mode, jump straight to verification
# ═══════════════════════════════════════════════════════════════
if [ "$CHECK_ONLY" = true ]; then
  log "Check-only mode — skipping deploy steps, jumping to verification..."
  # Skip to step 10
  SKIP_BUILD=true
  DEV_MODE=true  # don't try to rebuild
fi

# ═══════════════════════════════════════════════════════════════
# 2. STOP OLD SERVICES
# ═══════════════════════════════════════════════════════════════
if [ "$CHECK_ONLY" = false ]; then
  section "2/10 STOP OLD SERVICES"

  # Stop via pm2 (if any) — include ALL possible old process names
  for name in nexvo-app nexvo-cron nexvo-wa-bot nexvo-web nexvo-next nexvo; do
    if pm2 describe "$name" >/dev/null 2>&1; then
      pm2 delete "$name" >/dev/null 2>&1 && ok "stopped $name" || warn "could not stop $name"
    fi
  done

  # Also kill ANY pm2 process that might still hold our ports (leftover from old deploys)
  # NOTE: wrap in || true and use { } group so set -eo pipefail doesn't kill the script
  # when pm2 jlist returns empty or grep finds no matches
  {
    pm2_jlist_out=$(pm2 jlist 2>/dev/null || echo '[]')
    echo "$pm2_jlist_out" | grep -o '"name":"[^"]*"' | cut -d'"' -f4 | sort -u | while read -r pname; do
      [ -z "$pname" ] && continue
      case "$pname" in
        nexvo*|nexa*|next*) pm2 delete "$pname" >/dev/null 2>&1 && warn "killed leftover pm2 process: $pname" || true ;;
      esac
    done
  } || true

  # Kill anything still holding our ports (leftover/rogue processes)
  # Use multiple methods: lsof → ss → fuser → pkill (belt + suspenders)
  # All wrapped with || true so set -eo pipefail won't exit on empty results
  for port in $PORT_APP $PORT_CRON $PORT_WABOT; do
    pids=""
    if command -v lsof >/dev/null; then
      pids=$(lsof -ti :$port 2>/dev/null || true)
    fi
    if [ -z "$pids" ] && command -v ss >/dev/null; then
      pids=$(ss -tlnp 2>/dev/null | grep ":$port " | grep -o 'pid=[0-9]*' | cut -d= -f2 | tr '\n' ' ' || true)
    fi
    if [ -z "$pids" ] && command -v fuser >/dev/null; then
      pids=$(fuser $port/tcp 2>/dev/null | tr -s ' ' | sed 's/^ //;s/ $//' || true)
    fi
    if [ -n "$pids" ]; then
      warn "killing leftover process on port $port (PID: $pids)"
      kill -9 $pids 2>/dev/null || true
      sleep 3
    fi
  done

  # Final belt-and-suspenders: kill ANY node/bun/next process that might be rogue
  # (but DON'T kill pm2 itself or our ssh session)
  pkill -9 -f "next start" 2>/dev/null || true
  pkill -9 -f "next dev" 2>/dev/null || true
  pkill -9 -f "bun run index.ts" 2>/dev/null || true
  sleep 2
  ok "ports cleared"
fi

# ═══════════════════════════════════════════════════════════════
# 3. PULL LATEST CODE (auto-clone if not a git repo yet)
# ═══════════════════════════════════════════════════════════════
if [ "$CHECK_ONLY" = false ]; then
  section "3/10 PULL LATEST CODE"
  cd "$APP_DIR"

  # ─── Fresh clone requested: wipe and re-clone ───
  if [ "$FRESH_CLONE" = true ] && [ -d ".git" ]; then
    warn "--fresh: wiping $APP_DIR/.git + node_modules for clean re-clone"
    # Preserve .env + db/ before wipe (so user data survives fresh clone)
    cp -f .env /tmp/nexvo.env.bak 2>/dev/null || true
    cp -rf db /tmp/nexvo-db.bak 2>/dev/null || true
    rm -rf .git node_modules .next
  fi

  if [ ! -d ".git" ]; then
    # ─── First-time deploy: clone the repo ───
    if [ -n "$GIT_TOKEN" ]; then
      # Private repo with token
      CLONE_URL="${GIT_REPO_URL/:\/\//:\/$GIT_TOKEN@}"
    else
      CLONE_URL="$GIT_REPO_URL"
    fi

    # Always clone to temp then move — works whether APP_DIR is empty or has stray files (logs/, db/)
    log "cloning $GIT_REPO_URL (branch: $GIT_BRANCH) → $APP_DIR"
    TMP_CLONE=$(mktemp -d)
    if git clone --depth 1 -b "$GIT_BRANCH" "$CLONE_URL" "$TMP_CLONE/repo" 2>&1 | tail -5; then
      # Move repo contents into APP_DIR (including .git, dotfiles)
      shopt -s dotglob nullglob
      mv "$TMP_CLONE/repo"/* "$APP_DIR"/ 2>/dev/null || true
      shopt -u dotglob nullglob
      rm -rf "$TMP_CLONE"
      ok "repo cloned into $APP_DIR"
    else
      rm -rf "$TMP_CLONE"
      die "git clone failed. Check GIT_REPO_URL or GIT_TOKEN env var."
    fi

    # Restore preserved .env + db/ if --fresh was used
    [ -f /tmp/nexvo.env.bak ] && cp -f /tmp/nexvo.env.bak .env && rm /tmp/nexvo.env.bak && ok "restored .env"
    [ -d /tmp/nexvo-db.bak ] && cp -rf /tmp/nexvo-db.bak/* db/ 2>/dev/null && rm -rf /tmp/nexvo-db.bak && ok "restored db/"
  else
    # ─── Existing repo: pull latest ───
    git fetch "$GIT_REMOTE" "$GIT_BRANCH" 2>&1 | tail -3 || warn "git fetch failed (offline?)"
    git reset --hard "$GIT_REMOTE/$GIT_BRANCH" 2>&1 | tail -2 || warn "git reset failed"
  fi

  if [ -d ".git" ]; then
    ok "code at commit: $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
    git log -1 --format="   %h %s (%cr)" 2>/dev/null || true
  fi
fi

# ═══════════════════════════════════════════════════════════════
# 4. INSTALL DEPENDENCIES
# ═══════════════════════════════════════════════════════════════
if [ "$CHECK_ONLY" = false ]; then
  section "4/10 INSTALL DEPENDENCIES"
  cd "$APP_DIR"

  # Sanity: package.json must exist after clone/pull
  if [ ! -f "package.json" ]; then
    die "package.json not found in $APP_DIR. Clone failed? Try: bash deploy.sh --fresh"
  fi

  log "installing root deps..."
  bun install 2>&1 | tail -5
  ok "root deps installed"

  # wa-bot has its own package.json
  if [ -f "mini-services/wa-bot/package.json" ]; then
    log "installing wa-bot deps..."
    (cd mini-services/wa-bot && bun install 2>&1 | tail -3) || warn "wa-bot install failed (optional)"
    ok "wa-bot deps installed"
  fi
fi

# ═══════════════════════════════════════════════════════════════
# 5. BUILD (production only)
# ═══════════════════════════════════════════════════════════════
if [ "$CHECK_ONLY" = false ]; then
  section "5/10 BUILD"
  cd "$APP_DIR"

  if [ "$SKIP_BUILD" = true ]; then
    warn "skipping build (--skip-build or --dev mode)"
  else
    log "running: bun run build (prisma generate + next build)..."
    # Run build with explicit DATABASE_URL to avoid prisma issues
    DATABASE_URL="file:$ABS_DB_PATH" bun run build 2>&1 | tail -15
    BUILD_EXIT=${PIPESTATUS[0]}
    if [ "$BUILD_EXIT" -ne 0 ]; then
      err "BUILD FAILED (exit $BUILD_EXIT) — nexvo-app will not start correctly"
      warn "check build errors above. Trying to continue anyway (existing .next may be used)..."
    else
      ok "build complete"
    fi
  fi
fi

# ═══════════════════════════════════════════════════════════════
# 6. DATABASE
# ═══════════════════════════════════════════════════════════════
if [ "$CHECK_ONLY" = false ]; then
  section "6/10 DATABASE"
  cd "$APP_DIR"

  # Ensure .env has correct DATABASE_URL with absolute path
  mkdir -p "$APP_DIR/db"
  if [ ! -f "$APP_DIR/.env" ]; then
    echo "DATABASE_URL=file:$ABS_DB_PATH" > "$APP_DIR/.env"
    ok "created .env"
  elif ! grep -q "^DATABASE_URL=file:$ABS_DB_PATH" "$APP_DIR/.env"; then
    # Update DATABASE_URL to absolute path (cron-service needs this)
    sed -i "\|^DATABASE_URL=|c|DATABASE_URL=file:$ABS_DB_PATH|" "$APP_DIR/.env" 2>/dev/null || \
      echo "DATABASE_URL=file:$ABS_DB_PATH" >> "$APP_DIR/.env"
    ok "updated .env DATABASE_URL → $ABS_DB_PATH"
  else
    ok ".env OK"
  fi

  # ★ CRITICAL: explicitly export DATABASE_URL so prisma uses our path (not inherited from shell env)
  export DATABASE_URL="file:$ABS_DB_PATH"

  # Generate prisma client (SAFE — never touches data)
  bun run db:generate 2>&1 | tail -3 || warn "db:generate issue"
  ok "prisma client generated"

  # ★ DATA PROTECTION: Backup DB before any schema operations ★
  DB_HAD_DATA=false
  if [ -f "$ABS_DB_PATH" ] && [ -s "$ABS_DB_PATH" ]; then
    DB_HAD_DATA=true
    BACKUP_FILE="$ABS_DB_PATH.backup-$(date +%Y%m%d-%H%M%S)"
    cp "$ABS_DB_PATH" "$BACKUP_FILE" 2>/dev/null && ok "DB backed up → $BACKUP_FILE" || warn "backup failed"
    # Keep only the 5 most recent backups
    ls -t "$ABS_DB_PATH".backup-* 2>/dev/null | tail -n +6 | xargs -r rm -f 2>/dev/null || true
  fi

  # ★ SAFE DB PUSH: Only push schema if DB is fresh OR --fresh flag ★
  # On existing installs, db:push can RESET DATA if schema changed — we AVOID that.
  # Instead: generate client (done above), and only push schema if DB is empty/new.
  if [ "$DB_HAD_DATA" = true ] && [ "$FRESH_CLONE" = false ]; then
    # Check if schema is in sync (if migration shadow table exists)
    SCHEMA_IN_SYNC=$(bun -e '
      const { PrismaClient } = require("@prisma/client");
      const db = new PrismaClient();
      db.user.count().then(c => { console.log(c > 0 ? "HAS_DATA" : "EMPTY"); }).catch(() => console.log("ERROR"));
    ' 2>/dev/null || echo "UNKNOWN")

    if [ "$SCHEMA_IN_SYNC" = "HAS_DATA" ]; then
      ok "DB has data → SKIPPING db:push (data protection)"
      warn "if schema changed, run: bash deploy.sh --fresh (will backup + reset)"
    else
      # DB exists but no data, or unknown — safe to push
      log "DB empty or new → running db:push..."
      DATABASE_URL="file:$ABS_DB_PATH" bun run db:push 2>&1 | tail -5
      ok "db schema pushed"
    fi
  else
    # Fresh install or --fresh → push schema
    log "fresh install → running db:push..."
    DATABASE_URL="file:$ABS_DB_PATH" bun run db:push 2>&1 | tail -5
    ok "db schema pushed"
  fi

  # Verify DB file actually exists
  if [ -f "$ABS_DB_PATH" ]; then
    ok "DB file: $ABS_DB_PATH ($(du -h "$ABS_DB_PATH" | cut -f1))"
  else
    warn "DB file not found at $ABS_DB_PATH — check prisma config"
  fi

  # ★ AUTO-SEED: If products/packages are missing, restore defaults ★
  PRODUCT_COUNT=$(bun -e '
    const { PrismaClient } = require("@prisma/client");
    const db = new PrismaClient();
    Promise.all([db.product.count(), db.investmentPackage.count()]).then(([p, pkg]) => {
      console.log(p + pkg);
    }).catch(() => console.log("0"));
  ' 2>/dev/null || echo "0")

  if [ "$PRODUCT_COUNT" -le 1 ] 2>/dev/null; then
    warn "products/packages missing (count=$PRODUCT_COUNT) → restoring defaults..."
    DATABASE_URL="file:$ABS_DB_PATH" bun run prisma/seed.ts 2>&1 | tail -10 || warn "seed.ts failed"
    # Also restore default products via seed API route logic
    DATABASE_URL="file:$ABS_DB_PATH" bun -e '
      const { PrismaClient } = require("@prisma/client");
      const db = new PrismaClient();
      (async () => {
        const existing = await db.product.count();
        if (existing === 0) {
          await db.product.createMany({ data: [
            { name: "Emas Starter Pack", price: 100000, duration: 30, estimatedProfit: 8000, quota: 500, quotaUsed: 342, description: "Paket investasi emas untuk pemula. Dapatkan keuntungan stabil dari pergerakan harga emas dengan modal minimal.", banner: "", isActive: true, isStopped: false, profitRate: 8.0 },
            { name: "Silver Mining Portfolio", price: 500000, duration: 60, estimatedProfit: 55000, quota: 300, quotaUsed: 187, description: "Portfolio penambangan perak dengan diversifikasi aset. Keuntungan lebih tinggi dari paket starter.", banner: "", isActive: true, isStopped: false, profitRate: 11.0 },
            { name: "Gold Premium Asset", price: 1000000, duration: 90, estimatedProfit: 150000, quota: 200, quotaUsed: 98, description: "Aset emas premium dengan estimasi profit tinggi. Kelola portofolio emas Anda secara profesional.", banner: "", isActive: true, isStopped: false, profitRate: 15.0 },
            { name: "Diamond Elite Investment", price: 5000000, duration: 120, estimatedProfit: 1000000, quota: 100, quotaUsed: 43, description: "Investasi berlian elite untuk investor serius. Akses eksklusif ke portfolio berlian dan mineral langka.", banner: "", isActive: true, isStopped: false, profitRate: 20.0 },
          ]});
          console.log("✓ 4 default products restored");
        }
        const pkgCount = await db.investmentPackage.count();
        if (pkgCount === 0) {
          await db.investmentPackage.createMany({ data: [
            { name: "Paket Starter", amount: 500000, profitRate: 10, contractDays: 90, isActive: true, order: 1 },
            { name: "Paket Silver", amount: 1000000, profitRate: 10, contractDays: 90, isActive: true, order: 2 },
            { name: "Paket Gold", amount: 5000000, profitRate: 10, contractDays: 90, isActive: true, order: 3 },
            { name: "Paket Platinum", amount: 10000000, profitRate: 10, contractDays: 90, isActive: true, order: 4 },
          ]});
          console.log("✓ 4 default packages restored");
        }
        const salaryCfg = await db.salaryConfig.findFirst();
        if (!salaryCfg) {
          await db.salaryConfig.create({ data: { minDirectRefs: 10, salaryRate: 1, maxWeeks: 0, requireActiveDeposit: true, fixedSalaryAmount: 25000, isActive: true }});
          console.log("✓ salary config created (1%/week, permanent)");
        } else if (salaryCfg.maxWeeks !== 0 || salaryCfg.salaryRate !== 1) {
          await db.salaryConfig.update({ where: { id: salaryCfg.id }, data: { salaryRate: 1, maxWeeks: 0, minDirectRefs: 10, requireActiveDeposit: true, isActive: true }});
          console.log("✓ salary config fixed (1%/week, permanent)");
        }
        await db.$disconnect();
      })();
    ' 2>&1 | tail -5
    ok "default products/packages restored"
  else
    ok "products/packages exist (count=$PRODUCT_COUNT) — no seed needed"
  fi
fi

# ═══════════════════════════════════════════════════════════════
# 7. START NEXT.JS
# ═══════════════════════════════════════════════════════════════
if [ "$CHECK_ONLY" = false ]; then
  section "7/10 START NEXT.JS (port $PORT_APP)"
  cd "$APP_DIR"

  # ★ FINAL PORT CHECK: if port 3000 is still occupied, abort with clear message
  if command -v lsof >/dev/null && lsof -i :$PORT_APP >/dev/null 2>&1; then
    warn "port $PORT_APP STILL occupied after cleanup — force killing..."
    lsof -ti :$PORT_APP | xargs -r kill -9 2>/dev/null || true
    sleep 3
  elif command -v ss >/dev/null && ss -tlnp 2>/dev/null | grep -q ":$PORT_APP "; then
    warn "port $PORT_APP STILL occupied (ss) — force killing..."
    ss -tlnp 2>/dev/null | grep ":$PORT_APP " | grep -o 'pid=[0-9]*' | cut -d= -f2 | xargs -r kill -9 2>/dev/null || true
    sleep 3
  fi

  # Verify .next build exists for prod mode (otherwise next start will fail silently)
  if [ "$DEV_MODE" = false ] && [ ! -d "$APP_DIR/.next" ]; then
    err "❌ .next build directory missing — next start will fail!"
    warn "running emergency build..."
    DATABASE_URL="file:$ABS_DB_PATH" bun run build 2>&1 | tail -10
    if [ ! -d "$APP_DIR/.next" ]; then
      die "build failed — cannot start nexvo-app. Run: bash deploy.sh (full rebuild)"
    fi
    ok "emergency build complete"
  fi

  if [ "$DEV_MODE" = true ]; then
    warn "starting in DEV mode (next dev — no build needed)"
    pm2 start "npx next dev -p $PORT_APP" \
      --name nexvo-app \
      --cwd "$APP_DIR" \
      --log "$LOG_DIR/nexvo-app.log" \
      --time 2>&1 | tail -3
  else
    pm2 start "bun run start" \
      --name nexvo-app \
      --cwd "$APP_DIR" \
      --log "$LOG_DIR/nexvo-app.log" \
      --time 2>&1 | tail -3
  fi
  ok "nexvo-app started (mode: $([ "$DEV_MODE" = true ] && echo dev || echo prod))"
fi

# ═══════════════════════════════════════════════════════════════
# 8. START CRON-SERVICE (profit + salary auto-credit)
# ═══════════════════════════════════════════════════════════════
if [ "$CHECK_ONLY" = false ]; then
  section "8/10 START CRON-SERVICE (port $PORT_CRON)"
  cd "$APP_DIR/mini-services/cron-service"

  # cron-service uses @prisma/client from root node_modules (resolved via parent dir lookup)
  # CWD must be mini-services/cron-service so `../../db/custom.db` resolves correctly
  pm2 start "bun run index.ts" \
    --name nexvo-cron \
    --cwd "$APP_DIR/mini-services/cron-service" \
    --log "$LOG_DIR/nexvo-cron.log" \
    --time 2>&1 | tail -3
  ok "nexvo-cron started (profit 2%/day × 180d WEEKDAYS + salary 1%/week forever)"
fi

# ═══════════════════════════════════════════════════════════════
# 8b. START WA-BOT (optional — only if configured)
# ═══════════════════════════════════════════════════════════════
if [ "$CHECK_ONLY" = false ] && [ -f "$APP_DIR/mini-services/wa-bot/index.ts" ]; then
  section "8b/10 START WA-BOT (port $PORT_WABOT, optional)"
  cd "$APP_DIR/mini-services/wa-bot"
  # wa-bot needs tsx (in its own node_modules)
  pm2 start "npx tsx index.ts" \
    --name nexvo-wa-bot \
    --cwd "$APP_DIR/mini-services/wa-bot" \
    --log "$LOG_DIR/nexvo-wa-bot.log" \
    --time 2>&1 | tail -3 || warn "wa-bot failed to start (optional, skip)"
  ok "nexvo-wa-bot started (scan QR via admin panel)"
fi

# ═══════════════════════════════════════════════════════════════
# 9. SAVE PM2 + AUTO-RESTART ON REBOOT
# ═══════════════════════════════════════════════════════════════
if [ "$CHECK_ONLY" = false ]; then
  section "9/10 SAVE PM2 CONFIG"
  pm2 save 2>&1 | tail -2
  ok "pm2 config saved"

  # Try to setup startup script (may need sudo on first run)
  if [ ! -f "/etc/systemd/system/pm2-$USER.service" ] && [ "$EUID" -eq 0 ]; then
    pm2 startup 2>&1 | tail -2
    ok "pm2 startup configured"
  else
    warn "pm2 startup: run 'sudo env PATH=\$PATH:\$(dirname \$(which node)) pm2 startup' once manually"
  fi
fi

# ═══════════════════════════════════════════════════════════════
# 10. VERIFY ALL SYSTEMS (with self-heal)
# ═══════════════════════════════════════════════════════════════
section "10/10 VERIFY ALL SYSTEMS"

# ★ Disable set -e for verification — we want to continue even if checks fail
# (we track failures manually via FAIL_COUNT and report at the end)
set +eo pipefail

log "warming up (8s)..."
sleep 8

# ── Port check helper ──
check_port() {
  local port=$1 name=$2
  for i in 1 2 3 4 5 6 7 8; do
    if command -v lsof >/dev/null; then
      lsof -i :$port >/dev/null 2>&1 && { ok "$name listening on :$port"; return 0; }
    else
      ss -tlnp 2>/dev/null | grep -q ":$port " && { ok "$name listening on :$port"; return 0; }
    fi
    sleep 2
  done
  err "$name NOT listening on :$port"
  record_fail
  return 1
}

# ── HTTP check helper ──
check_http() {
  local url=$1 name=$2 grep_for=$3
  local body
  body=$(curl -s -m 15 "$url" 2>/dev/null || echo "")
  if [ -n "$body" ] && echo "$body" | grep -q "$grep_for"; then
    ok "$name OK"
    return 0
  else
    err "$name FAILED (expected: $grep_for)"
    record_fail
    return 1
  fi
}

# ── 10a. Port checks (with self-heal restart for nexvo-app) ──
check_port $PORT_APP  "nexvo-app"
APP_PORT_OK=$?
if [ "$APP_PORT_OK" -ne 0 ]; then
  warn "self-heal: nexvo-app not listening — checking logs + restart..."
  pm2 logs nexvo-app --lines 20 --nostream 2>/dev/null | tail -20 || true
  pm2 restart nexvo-app 2>/dev/null || true
  sleep 10
  check_port $PORT_APP  "nexvo-app (retry)" || true
fi
check_port $PORT_CRON "nexvo-cron"

# ── 10b. HTTP health ──
check_http "http://localhost:$PORT_APP/"          "nexvo-app health"       "NEXVO"
check_http "http://localhost:$PORT_CRON/"         "nexvo-cron health"      "\"status\":\"running\""

# ── 10c. Profit trigger (idempotent — safe to run) ──
log "testing profit trigger (idempotent backfill)..."
profit_resp=$(curl -s -m 30 -X POST "http://localhost:$PORT_CRON/api/trigger/profit" \
  -H "Content-Type: application/json" -d '{}' 2>/dev/null || echo '{}')
if echo "$profit_resp" | grep -q '"success":true'; then
  processed=$(echo "$profit_resp" | grep -o '"processed":[0-9]*' | head -1 | cut -d: -f2)
  total_profit=$(echo "$profit_resp" | grep -o '"totalProfit":[0-9]*' | head -1 | cut -d: -f2)
  errors=$(echo "$profit_resp" | grep -o '"errors":[0-9]*' | head -1 | cut -d: -f2)
  ok "profit trigger OK (processed=$processed, profit=$total_profit, errors=$errors)"
  [ "$errors" -gt 0 ] 2>/dev/null && warn "profit had $errors errors — check pm2 logs nexvo-cron"
else
  err "profit trigger FAILED: $profit_resp"
  record_fail
  # Self-heal: restart cron and retry once
  warn "self-heal: restarting nexvo-cron..."
  pm2 restart nexvo-cron 2>/dev/null || true
  sleep 5
  profit_resp=$(curl -s -m 30 -X POST "http://localhost:$PORT_CRON/api/trigger/profit" \
    -H "Content-Type: application/json" -d '{}' 2>/dev/null || echo '{}')
  if echo "$profit_resp" | grep -q '"success":true'; then
    ok "profit trigger OK after self-heal"
  else
    err "profit trigger STILL failing — check: pm2 logs nexvo-cron"
  fi
fi

# ── 10d. Salary trigger (idempotent — safe to run) ──
log "testing salary trigger (idempotent)..."
salary_resp=$(curl -s -m 30 -X POST "http://localhost:$PORT_CRON/api/trigger/salary" \
  -H "Content-Type: application/json" -d '{}' 2>/dev/null || echo '{}')
if echo "$salary_resp" | grep -q '"success":true'; then
  ok "salary trigger OK"
else
  err "salary trigger FAILED: $salary_resp"
  record_fail
fi

# ── 10e. DB integrity check ──
log "checking DB integrity..."
db_check=$(cd "$APP_DIR" && bun -e '
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const [users, products, investments, salaryCfg] = await Promise.all([
  db.user.count(),
  db.product.count(),
  db.investment.count(),
  db.salaryConfig.findFirst(),
]);
console.log(JSON.stringify({
  users, products, investments,
  salaryRate: salaryCfg?.salaryRate,
  maxWeeks: salaryCfg?.maxWeeks,
  minDirectRefs: salaryCfg?.minDirectRefs,
  isActive: salaryCfg?.isActive,
}));
' 2>/dev/null || echo '{}')
if echo "$db_check" | grep -q '"users"'; then
  ok "DB OK: $db_check"
else
  err "DB check FAILED: $db_check"
  record_fail
fi

# ── 10f. Salary config sanity ──
if echo "$db_check" | grep -q '"salaryRate":1.*"maxWeeks":0'; then
  ok "salary config: 1%/week FOREVER ✓"
elif echo "$db_check" | grep -q '"salaryRate":1'; then
  warn "salary config: rate=1% but maxWeeks!=0 (check admin panel)"
else
  warn "salary config missing/wrong — self-healing to 1%/week, maxWeeks=0, minDirectRefs=10..."
  cd "$APP_DIR" && bun -e '
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const existing = await db.salaryConfig.findFirst();
if (existing) {
  await db.salaryConfig.update({ where: { id: existing.id }, data: {
    salaryRate: 1, maxWeeks: 0, minDirectRefs: 10, requireActiveDeposit: true, isActive: true
  }});
} else {
  await db.salaryConfig.create({ data: {
    salaryRate: 1, maxWeeks: 0, minDirectRefs: 10, requireActiveDeposit: true, isActive: true,
    fixedSalaryAmount: 25000,
  }});
}
console.log("✓ salary config fixed");
' 2>&1 | tail -1
  # Re-verify after self-heal
  db_check2=$(cd "$APP_DIR" && bun -e '
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const c = await db.salaryConfig.findFirst();
console.log(JSON.stringify({salaryRate:c?.salaryRate, maxWeeks:c?.maxWeeks, minDirectRefs:c?.minDirectRefs, isActive:c?.isActive}));
' 2>/dev/null || echo '{}')
  if echo "$db_check2" | grep -q '"salaryRate":1.*"maxWeeks":0'; then
    ok "salary config self-healed OK ✓"
  else
    err "salary config self-heal FAILED: $db_check2"
    record_fail
  fi
fi

# ═══════════════════════════════════════════════════════════════
# FINAL REPORT
# ═══════════════════════════════════════════════════════════════
echo ""
echo -e "${C_CYAN}${C_BOLD}══════ PM2 STATUS ══════${C_NC}"
pm2 status 2>/dev/null | head -15

echo ""
if [ "$FAIL_COUNT" -eq 0 ]; then
  echo -e "${C_GREEN}${C_BOLD}╔══════════════════════════════════════════════════════════════╗"
  echo -e "║   ✅  NEXVO DEPLOYED SUCCESSFULLY — ALL SYSTEMS 100% OK      ║"
  echo -e "╠══════════════════════════════════════════════════════════════╣"
  echo -e "║  Next.js app:     http://localhost:$PORT_APP                       ║"
  echo -e "║  Cron-service:    http://localhost:$PORT_CRON                      ║"
  echo -e "║                                                              ║"
  echo -e "║  💰 Profit:  2%/day × 180 days = 576k cap (WEEKDAYS, Sat/Sun LIBUR)║"
  echo -e "║  📅 Salary:  1%/week FOREVER (10 refs + active investment)   ║"
  echo -e "║  🔄 Catchup: auto-credit all missed WEEKDAYS in one shot      ║"
  echo -e "║  ⏰ Schedule: 00:00 WIB weekdays (profit) + Mon 00:00 (salary)║"
  echo -e "╚══════════════════════════════════════════════════════════════╝${C_NC}"
  echo ""
  echo -e "${C_BOLD}Logs:${C_NC}"
  echo "  pm2 logs nexvo-app          # Next.js logs"
  echo "  pm2 logs nexvo-cron         # profit + salary logs"
  echo "  pm2 logs nexvo-wa-bot       # WhatsApp bot logs"
  echo ""
  echo -e "${C_BOLD}Manual triggers (idempotent, safe to re-run):${C_NC}"
  echo "  curl -X POST http://localhost:$PORT_CRON/api/trigger/profit   # credit missed profits"
  echo "  curl -X POST http://localhost:$PORT_CRON/api/trigger/salary   # credit weekly salary"
  echo "  curl -X POST http://localhost:$PORT_CRON/api/trigger/quota-bump  # bump product quotas"
  echo ""
  echo -e "${C_BOLD}Admin panel:${C_NC}  open http://localhost:$PORT_APP/#admin-login"
  echo -e "${C_BOLD}Re-deploy:${C_NC}     bash deploy.sh  (or curl pipe from GitHub)"
  echo -e "${C_BOLD}Check only:${C_NC}     bash deploy.sh --check"
  exit 0
else
  echo -e "${C_RED}${C_BOLD}╔══════════════════════════════════════════════════════════════╗"
  echo -e "║   ⚠️  DEPLOY COMPLETED WITH $FAIL_COUNT ISSUE(S)                          ║"
  echo -e "╠══════════════════════════════════════════════════════════════╣"
  echo -e "║  Some systems failed verification. Check logs below.         ║"
  echo -e "╚══════════════════════════════════════════════════════════════╝${C_NC}"
  echo ""
  echo -e "${C_BOLD}Debug commands:${C_NC}"
  echo "  pm2 status                          # which services are online?"
  echo "  pm2 logs nexvo-app --lines 50       # Next.js errors"
  echo "  pm2 logs nexvo-cron --lines 50      # cron errors"
  echo "  pm2 restart nexvo-app nexvo-cron    # force restart"
  echo "  bash deploy.sh --check              # re-verify"
  exit 1
fi
