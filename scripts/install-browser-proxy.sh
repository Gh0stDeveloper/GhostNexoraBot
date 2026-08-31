#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/ghost-nexora-bot}"
DOMAIN="${BROWSER_PROXY_DOMAIN:-}"
PUBLIC_URL="${BROWSER_PROXY_PUBLIC_URL:-}"
PORT="${BROWSER_PROXY_PORT:-3847}"
NGINX_NAME="ghost-nexora-browser-proxy"
SITE_AVAILABLE="/etc/nginx/sites-available/${NGINX_NAME}"
SITE_ENABLED="/etc/nginx/sites-enabled/${NGINX_NAME}"

info() { printf '[%s] [INFO] %s\n' "$(date '+%H:%M:%S')" "$*"; }
ok() { printf '[%s] [ OK ] %s\n' "$(date '+%H:%M:%S')" "$*"; }
warn() { printf '[%s] [WARN] %s\n' "$(date '+%H:%M:%S')" "$*" >&2; }
fail() { printf '[%s] [FAIL] %s\n' "$(date '+%H:%M:%S')" "$*" >&2; }

if [[ "${EUID}" -ne 0 ]]; then
  fail 'Ejecuta este script como root/sudo.'
  exit 1
fi
[[ -d "${INSTALL_DIR}" ]] || { fail "No existe INSTALL_DIR=${INSTALL_DIR}"; exit 1; }
[[ -f "${INSTALL_DIR}/.env" ]] || { fail "No existe ${INSTALL_DIR}/.env"; exit 1; }

read_env() {
  local key="$1"
  grep -E "^${key}=" "${INSTALL_DIR}/.env" 2>/dev/null | tail -n1 | cut -d= -f2- || true
}

[[ -n "${PUBLIC_URL}" ]] || PUBLIC_URL="$(read_env BROWSER_PROXY_PUBLIC_URL)"
[[ -n "${PORT}" ]] || PORT="$(read_env BROWSER_PROXY_PORT)"
PORT="${PORT:-3847}"

if [[ -z "${DOMAIN}" && -n "${PUBLIC_URL}" ]]; then
  DOMAIN="$(printf '%s' "${PUBLIC_URL}" | sed -E 's#^[a-zA-Z]+://([^/]+).*$#\1#')"
fi
DOMAIN="${DOMAIN:-ghostnexorabot.duckdns.org}"

if [[ ! "${DOMAIN}" =~ ^[A-Za-z0-9.-]+$ ]]; then
  fail "Dominio inválido: ${DOMAIN}"
  exit 1
fi
if ! [[ "${PORT}" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
  fail "Puerto inválido: ${PORT}"
  exit 1
fi

set_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "${INSTALL_DIR}/.env"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "${INSTALL_DIR}/.env"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${INSTALL_DIR}/.env"
  fi
}

set_env BROWSER_PROXY_PUBLIC_URL "https://${DOMAIN}/proxy"
set_env BROWSER_PROXY_PORT "${PORT}"
chmod 0640 "${INSTALL_DIR}/.env" || true

info "Configurando backend local ${DOMAIN}/proxy → 127.0.0.1:${PORT}"

# Try to reuse an existing server block for this hostname (including TLS).
MATCHES=()
while IFS= read -r -d '' file; do
  MATCHES+=("${file}")
done < <(grep -RIlZF --include='*.conf' --include='*' "server_name[[:space:]].*${DOMAIN}" /etc/nginx/sites-enabled /etc/nginx/sites-available 2>/dev/null || true)

inject_location() {
  local file="$1"
  python3 - "${file}" "${DOMAIN}" "${PORT}" <<'PY'
import re
import sys
from pathlib import Path

path, domain, port = sys.argv[1:]
text = Path(path).read_text()
location = f'''\n    # Ghost Nexora Browser Proxy\n    location = /proxy {{\n        proxy_pass http://127.0.0.1:{port}/proxy;\n        proxy_http_version 1.1;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n        proxy_connect_timeout 10s;\n        proxy_send_timeout 30s;\n        proxy_read_timeout 30s;\n        proxy_buffering off;\n    }}\n\n    location = /proxy/ {{\n        proxy_pass http://127.0.0.1:{port}/proxy;\n        proxy_http_version 1.1;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n        proxy_connect_timeout 10s;\n        proxy_send_timeout 30s;\n        proxy_read_timeout 30s;\n        proxy_buffering off;\n    }}\n'''

if re.search(r'location\s*=\s*/proxy/?\s*\{', text):
    print(f'UNCHANGED {path}')
    raise SystemExit(0)

server_re = re.compile(r'(?m)^\s*server\s*\{')
for match in list(server_re.finditer(text))[::-1]:
    start = match.start()
    depth = 0
    i = match.end() - 1
    in_single = False
    in_double = False
    comment = False
    while i < len(text):
        ch = text[i]
        if comment:
            if ch == '\n': comment = False
        elif in_single:
            if ch == "'": in_single = False
        elif in_double:
            if ch == '"' and (i == 0 or text[i-1] != '\\'): in_double = False
        else:
            if ch == '#': comment = True
            elif ch == "'": in_single = True
            elif ch == '"': in_double = True
            elif ch == '{': depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    block = text[start:i+1]
                    if re.search(r'(?m)^\s*server_name\s+[^;]*\b' + re.escape(domain) + r'\b[^;]*;', block):
                        new = text[:i] + location + text[i:]
                        Path(path).write_text(new)
                        print(f'INJECTED {path}')
                        raise SystemExit(0)
        i += 1
print(f'NO_MATCH {path}')
PY
}

INJECTED=0
for file in "${MATCHES[@]}"; do
  [[ -f "${file}" ]] || continue
  if inject_location "${file}"; then INJECTED=1; fi
done

if (( INJECTED == 0 )); then
  warn "No encontré un server_name=${DOMAIN}; se creará un vhost dedicado en HTTP."
  cat > "${SITE_AVAILABLE}" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location = /proxy {
        proxy_pass http://127.0.0.1:${PORT}/proxy;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 10s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
        proxy_buffering off;
    }

    location = /proxy/ {
        proxy_pass http://127.0.0.1:${PORT}/proxy;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 10s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
        proxy_buffering off;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX
  ln -sfn "${SITE_AVAILABLE}" "${SITE_ENABLED}"
fi

nginx -t
systemctl reload nginx

if command -v curl >/dev/null 2>&1; then
  if curl -fsS --max-time 5 "http://127.0.0.1:${PORT}/health" >/tmp/ghost-nexora-browser-proxy-health.json 2>/dev/null; then
    ok "Backend del proxy responde en 127.0.0.1:${PORT}."
  else
    warn "Nginx quedó configurado, pero el backend aún no responde en ${PORT}. Reinicia ghost-nexora-bot después del build."
  fi
fi

ok "Nginx configurado: https://${DOMAIN}/proxy → http://127.0.0.1:${PORT}/proxy"
