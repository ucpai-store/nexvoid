# ═══════════════════════════════════════════════════════════════
#  NEXVO ULTIMATE INLINE — Paste LANGSUNG ke terminal VPS
#
#  Copy SEMUA baris di bawah ini (dari 'P=$(find...' sampai 'tail -40')
#  Paste ke terminal VPS, tekan Enter
#
#  Ini akan:
#  1. Cari project dir (otomatis)
#  2. Run force-credit-profit.ts --force (credit profit HARI INI)
#  3. Restart cron v3.2
#
#  Sekarang 00:01 WIB Rabu 1 Juli 2026 — WEEKDAY, profit WAJIB masuk
# ═══════════════════════════════════════════════════════════════
P=$(find / -maxdepth 7 -name "cron-service.ts" -type f 2>/dev/null | head -1 | xargs dirname 2>/dev/null); if [ -z "$P" ]; then echo "❌ Project not found"; exit 1; fi; echo "✅ Project: $P"; cd "$P" && git fetch --all 2>&1 | tail -1 && git reset --hard origin/main 2>&1 | tail -1 && echo "HEAD: $(git log --oneline -1)" && echo "▼ Run force-credit-profit.ts --force (credit profit HARI INI)" && bun run force-credit-profit.ts --force 2>&1 | tail -40 && echo "▼ Restart nexvo-cron" && pkill -f "cron-service.ts" 2>/dev/null; sleep 1; pm2 delete nexvo-cron 2>/dev/null; sleep 1; pm2 start "bun run cron-service.ts" --name nexvo-cron --cwd "$P" 2>&1 | tail -2 && pm2 save 2>/dev/null && echo "✅ DONE — Refresh browser HP, profit harusnya masuk"
