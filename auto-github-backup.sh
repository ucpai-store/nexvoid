#!/bin/bash
# Auto backup to GitHub (run via cron)
# Add to crontab: 0 */6 * * * /home/nexvo/auto-github-backup.sh

TOKEN_FILE="/home/nexvo/.github-token"
if [ ! -f "$TOKEN_FILE" ]; then
    echo "No GitHub token found at $TOKEN_FILE"
    exit 1
fi

TOKEN=$(cat "$TOKEN_FILE")
/home/nexvo/github-backup.sh "$TOKEN" >> /home/nexvo/logs/github-backup.log 2>&1
