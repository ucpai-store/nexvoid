#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO — Verify-Only Check Script
#  Cek semua sistem tanpa deploy. Untuk pastikan semua jalan.
#  Usage: curl -fsSL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/deploy-check.sh | bash
# ═══════════════════════════════════════════════════════════════
exec bash "$(dirname "$0")/deploy.sh" --check "$@"
