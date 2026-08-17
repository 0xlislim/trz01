#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

[ -f .env ] && grep -q '^TOKEN=.' .env || {
  echo "Missing or empty TOKEN in .env — run ./setup.sh first" >&2
  exit 1
}

mkdir -p logs

CRON_LINES=$(cat <<'EOF'
59 15 * * * cd /home/aesslima/trz01 && DISPLAY=:1 TRZ01_TIMEOUT=600000 /usr/bin/node main.js morning >> logs/cron.log 2>&1
59 11 * * * cd /home/aesslima/trz01 && DISPLAY=:1 TRZ01_TIMEOUT=600000 /usr/bin/node main.js evening >> logs/cron.log 2>&1
EOF
)

CURRENT=$(crontab -l 2>/dev/null || true)

NEW="$CRON_LINES"
[ -n "$CURRENT" ] && NEW="$CURRENT"$'\n'"$CRON_LINES"

printf '%s\n' "$NEW" | crontab -

echo
echo "Installed cron jobs:"
crontab -l | grep trz01
echo
echo "Logs: ~/trz01/logs/cron.log"
echo "Remove with:  crontab -r   (or edit via  crontab -e)"