#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

[ -f .env ] && grep -q '^TOKEN=.' .env || {
  echo "Missing or empty TOKEN in .env — run ./setup.sh first" >&2
  exit 1
}

mkdir -p "$HOME/.config/systemd/user"
cp trz01.service "$HOME/.config/systemd/user/trz01.service"
systemctl --user daemon-reload
systemctl --user enable trz01
systemctl --user start trz01

echo
echo "Service installed. Status:"
echo "    systemctl --user status trz01"
echo
echo "Note: to also start at boot (no login) you need lingering:"
echo "    loginctl enable-linger $USER"
echo "    (may require sudo once — ask your admin)"
