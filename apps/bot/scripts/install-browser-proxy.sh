#!/usr/bin/env bash
set -euo pipefail
PORT="${BROWSER_PROXY_PORT:-3847}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER="$ROOT/scripts/browser-proxy-server.mjs"

echo "==> Ghost Nexora browser proxy (puerto $PORT, no 3000)"
echo "    Server: $SERVER"

if [[ ! -f "$SERVER" ]]; then
  echo "ERROR: no existe $SERVER"
  exit 1
fi

SERVICE_FILE="/etc/systemd/system/ghost-browser-proxy.service"
if command -v systemctl >/dev/null 2>&1; then
  sudo tee "$SERVICE_FILE" >/dev/null <<EOF
[Unit]
Description=Ghost Nexora Browser Proxy (.nav)
After=network.target

[Service]
Type=simple
Environment=BROWSER_PROXY_PORT=$PORT
Environment=BROWSER_PROXY_HOST=127.0.0.1
Environment=BROWSER_PROXY_MAX_BYTES=2500000
Environment=BROWSER_PROXY_TIMEOUT_MS=18000
ExecStart=$(command -v node) $SERVER
Restart=always
RestartSec=3
WorkingDirectory=$ROOT

[Install]
WantedBy=multi-user.target
EOF
  sudo systemctl daemon-reload
  sudo systemctl enable ghost-browser-proxy
  sudo systemctl restart ghost-browser-proxy
  sleep 1
  sudo systemctl --no-pager status ghost-browser-proxy || true
else
  pkill -f browser-proxy-server.mjs 2>/dev/null || true
  nohup node "$SERVER" >/tmp/ghost-browser-proxy.log 2>&1 &
  echo "PID $! log=/tmp/ghost-browser-proxy.log"
fi

echo ""
echo "Nginx: location /proxy { proxy_pass http://127.0.0.1:$PORT/proxy; ... }"
echo "Prueba: curl -s http://127.0.0.1:$PORT/health"
echo "Público: https://ghostnexorabot.duckdns.org/proxy?url=https://example.com"
