#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Checking prerequisites..."
for bin in node npm; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "missing required binary: $bin" >&2
    exit 1
  fi
done

if [ ! -x /usr/bin/google-chrome ] && [ ! -x /usr/bin/chromium ]; then
  echo "WARNING: no system Chrome/Chromium found." >&2
  echo "         Install one, or run: npx puppeteer browsers install chrome" >&2
fi

echo "==> Installing dependencies (no sudo required)..."
npm install

if [ ! -f .env ]; then
  cp .env.example .env
  echo
  echo "==> Created .env — edit it and set your token:"
  echo "    nano .env        # TOKEN=your_session_token"
elif ! grep -q '^TOKEN=.' .env; then
  echo
  echo "==> .env exists but TOKEN is empty — set it:"
  echo "    nano .env        # TOKEN=your_session_token"
else
  echo "==> .env looks ready."
fi

echo
echo "==> Done."
echo "    Add an alias (once) so you can just run it anytime:"
echo "      echo 'alias trz01=\"~/trz01/trz01\"' >> ~/.zshrc && source ~/.zshrc"
echo
echo "    Run  trz01  — it opens a menu:"
echo "      option 1: set credentials (asks once, saves token)"
echo "      option 2/3: set morning/evening bus time + destinations"
echo "      option 5: start the booking scheduler"
echo
echo "    Optional: run as a background service:  ./install-service.sh"
