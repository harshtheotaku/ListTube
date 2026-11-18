#!/usr/bin/env bash
set -e
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")"

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo 'localhost')"

echo "=================================================="
echo "  ListTube Live Laptop Tester"
echo "  Laptop URL : http://localhost:5173"
echo "  Phone Wi-Fi: http://${LAN_IP}:5173"
echo "  Tip: Press Cmd+K -> Phone Simulator inside the app"
echo "       to test the 390px mobile UI directly on laptop!"
echo "=================================================="
echo ""

# Stop any stale Vite preview/dev listener on port 5173 so latest code serves cleanly
if lsof -ti :5173 >/dev/null 2>&1; then
  lsof -ti :5173 | xargs kill -9 2>/dev/null || true
  sleep 0.4
fi

npm run laptop
