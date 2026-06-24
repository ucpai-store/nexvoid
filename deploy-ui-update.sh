#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  NEXVO — Hot UI Update Script
#  Pull code terbaru + restart services TANPA rebuild (cepat).
#  Cocok untuk update kecil (UI text, logic fix, dll).
#  Untuk update major (dependency change, schema change), pakai deploy.sh.
#  Usage: curl -fsSL https://raw.githubusercontent.com/ucpai-store/nexvoid/main/deploy-ui-update.sh | bash
# ═══════════════════════════════════════════════════════════════
exec bash "$(dirname "$0")/deploy.sh" --skip-build "$@"
