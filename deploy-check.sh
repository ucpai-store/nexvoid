#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO — Verify-Only Check Script (self-contained)
#  Cek semua sistem tanpa deploy. Untuk pastikan semua jalan.
#  Usage:
#    bash deploy-check.sh           # local (if you have the repo)
#    curl -fsSL <url>/deploy-check.sh | bash   # works on fresh VPS
# ═══════════════════════════════════════════════════════════════
set -eo pipefail

# Find deploy.sh: try same dir as this script, fallback to download
SCRIPT_DIR=""
if [ -f "$0" ] && [ "$(basename "$0")" != "bash" ]; then
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
fi

DEPLOY_SH=""
# 1. Try local repo (running from cloned nexvo dir)
for candidate in \
  "$SCRIPT_DIR/deploy.sh" \
  "$PWD/deploy.sh" \
  "$HOME/nexvo/deploy.sh" \
  "/root/nexvo/deploy.sh"; do
  if [ -f "$candidate" ]; then
    DEPLOY_SH="$candidate"
    break
  fi
done

# 2. If not found, download to temp
if [ -z "$DEPLOY_SH" ]; then
  DEPLOY_URL="${DEPLOY_URL:-https://raw.githubusercontent.com/ucpai-store/nexvoid/main/deploy.sh}"
  DEPLOY_SH="$(mktemp /tmp/nexvo-deploy.XXXXXX.sh)"
  curl -fsSL "$DEPLOY_URL" -o "$DEPLOY_SH" || {
    echo "✗ Failed to download deploy.sh from $DEPLOY_URL" >&2
    exit 1
  }
  chmod +x "$DEPLOY_SH"
  # Cleanup temp on exit
  trap 'rm -f "$DEPLOY_SH"' EXIT
fi

# Run deploy.sh in --check mode
exec bash "$DEPLOY_SH" --check "$@"
