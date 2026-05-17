#!/bin/bash
# Setup auto backup ke GitHub (setiap 6 jam)
# Usage: ./setup-auto-backup.sh ghp_TOKEN_ANDA

TOKEN=${1:-}
if [ -z "$TOKEN" ]; then
    echo "Usage: ./setup-auto-backup.sh ghp_TOKEN_ANDA"
    exit 1
fi

# Save token
echo "$TOKEN" > /home/nexvo/.github-token
chmod 600 /home/nexvo/.github-token

# Add cron job (every 6 hours)
(crontab -l 2>/dev/null; echo "0 */6 * * * /home/nexvo/push-github.sh $(cat /home/nexvo/.github-token) >> /home/nexvo/logs/github-backup.log 2>&1") | crontab -

echo "✅ Auto backup diaktifkan! Backup setiap 6 jam."
echo "   Log: /home/nexvo/logs/github-backup.log"
