#!/usr/bin/env bash
# Kill ONLY the booking popup Chrome (unique user-data-dir marker).
# Never touches other Chrome instances (your working browser uses its own profile).
set -u
PID_FILE=/tmp/trz01-browser.pid
PROFILE=/tmp/trz01-profile

[ -f "$PID_FILE" ] && pid=$(cat "$PID_FILE")

# Layer 1: kill the saved PID and its descendants (only the booking browser).
if [ -n "${pid:-}" ] && [ "$pid" -gt 0 ] 2>/dev/null && kill -0 "$pid" 2>/dev/null; then
  pkill -9 -P "$pid" 2>/dev/null
  for _ in 1 2 3 4 5; do
    for child in $(pgrep -P "$pid" 2>/dev/null); do
      pkill -9 -P "$child" 2>/dev/null
    done
  done
  kill -9 "$pid" 2>/dev/null
  echo "Booking browser (PID $pid) stopped."
fi

# Layer 2 (safety net): kill any process whose cmdline carries the booking
# profile marker. The [/] trick stops pkill from matching its own command line.
leaked=$(pgrep -f "user-data-dir=[/]tmp/trz01-profile" 2>/dev/null)
if [ -n "$leaked" ]; then
  kill -9 $leaked 2>/dev/null
  echo "Stopped leaked booking processes: $leaked"
fi

rm -f "$PID_FILE"
[ -d "$PROFILE" ] && rm -rf "$PROFILE"
echo "Done."
