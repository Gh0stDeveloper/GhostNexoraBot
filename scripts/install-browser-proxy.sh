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
command -v nginx >/dev/null 2>&1 || { fail 'Nginx no está instalado.'; exit 1; }
command -v python3 >/dev/null 2>&1 || { fail 'python3 no está instalado.'; exit 1; }

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

# The previous installer could create a second vhost for the same hostname.
# Remove only our managed duplicate before inspecting the active configuration.
rm -f "${SITE_ENABLED}" "${SITE_AVAILABLE}"

# Ask Nginx which files are actually part of the active configuration.
NGINX_DUMP="$(nginx -T 2>/dev/null)" || {
  fail 'No se pudo obtener la configuración efectiva de Nginx con nginx -T.'
  exit 1
}
printf '%s\n' "${NGINX_DUMP}" > /tmp/ghost-nexora-nginx-effective.conf

# Extract candidate config files from nginx -T output. The Python parser then
# edits the server block itself, which is safer than guessing from filenames.
mapfile -t CONFIG_FILES < <(
  printf '%s\n' "${NGINX_DUMP}" \
    | sed -nE 's/^# configuration file ([^ ]+) :$/\1/p' \
    | awk '!seen[$0]++' \
    | grep -vE '^/etc/nginx/(sites-available/ghost-nexora-browser-proxy|sites-enabled/ghost-nexora-browser-proxy)$' \
    || true
)

INJECTED_FILE=""
INJECT_STATUS="0"
for file in "${CONFIG_FILES[@]}"; do
  [[ -f "${file}" && -r "${file}" && -w "${file}" ]] || continue
  result="$(python3 - "${file}" "${DOMAIN}" "${PORT}" <<'PY'
import re
import sys
from pathlib import Path

path, domain, port = sys.argv[1:]
text = Path(path).read_text()
marker = 'Ghost Nexora Browser Proxy (managed)'

# Find server blocks by balanced braces and pick the block that actually owns
# the requested hostname. Prefer the TLS/443 server when several exist.
server_start = re.compile(r'(?m)^\s*server\s*\{')
blocks = []
for m in server_start.finditer(text):
    start = m.start()
    depth = 0
    i = m.end() - 1
    quote = None
    comment = False
    while i < len(text):
        ch = text[i]
        if comment:
            if ch == '\n': comment = False
        elif quote:
            if ch == quote and (i == 0 or text[i - 1] != '\\'):
                quote = None
        else:
            if ch == '#': comment = True
            elif ch in "'\"": quote = ch
            elif ch == '{': depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    blocks.append((start, i + 1, text[start:i + 1]))
                    break
        i += 1

candidates = []
needle = re.compile(r'(?m)^\s*server_name\s+[^;]*\b' + re.escape(domain) + r'\b[^;]*;')
for start, end, block in blocks:
    if not needle.search(block):
        continue
    score = 0
    if re.search(r'(?m)^\s*listen\s+443(?:\s|;)', block): score += 100
    if re.search(r'\bssl\b', block): score += 25
    if marker in block or re.search(r'location\s*=\s*/proxy/?\s*\{', block): score += 10
    candidates.append((score, start, end, block))

if not candidates:
    print('NO_SERVER')
    raise SystemExit(0)

# Existing managed location already present in this exact server block.
candidates.sort(reverse=True)
score, start, end, block = candidates[0]
if marker in block or re.search(r'location\s*=\s*/proxy/?\s*\{', block):
    print('EXISTS')
    raise SystemExit(0)

location = f'''\n    # Ghost Nexora Browser Proxy (managed)\n    location = /proxy {{\n        proxy_pass http://127.0.0.1:{port}/proxy;\n        proxy_http_version 1.1;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n        proxy_connect_timeout 10s;\n        proxy_send_timeout 30s;\n        proxy_read_timeout 30s;\n        proxy_buffering off;\n    }}\n'''
new = text[:end - 1] + location + text[end - 1:]
Path(path).write_text(new)
print(f'INJECTED:{score}')
PY
)"

  case "${result}" in
    INJECTED:*)
      INJECTED_FILE="${file}"
      INJECT_STATUS="1"
      info "location /proxy insertado en ${file} (${result#INJECTED:})."
      break
      ;;
    EXISTS)
      INJECTED_FILE="${file}"
      INJECT_STATUS="1"
      info "location /proxy ya existe en ${file}."
      break
      ;;
  esac
done

if [[ -z "${INJECTED_FILE}" ]]; then
  warn "No encontré un server_name=${DOMAIN} en la configuración activa de Nginx; se creará un vhost dedicado HTTP."
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
}
NGINX
  ln -sfn "${SITE_AVAILABLE}" "${SITE_ENABLED}"
  INJECTED_FILE="${SITE_AVAILABLE}"
fi

nginx -t
systemctl reload nginx

# Verify the local backend and the public route. The second check catches the
# exact failure where /proxy is still being handled by Next.js.
if curl -fsS --max-time 5 "http://127.0.0.1:${PORT}/health" >/tmp/ghost-nexora-browser-proxy-health.json 2>/dev/null; then
  ok "Backend del proxy responde en 127.0.0.1:${PORT}."
else
  warn "El backend aún no responde en ${PORT}; reinicia ghost-nexora-bot después del build."
fi

PUBLIC_TEST_URL="https://${DOMAIN}/proxy?url=https://example.com&format=html"
PUBLIC_HEADERS="$(curl -ksSIL --max-time 15 "${PUBLIC_TEST_URL}" || true)"
if printf '%s\n' "${PUBLIC_HEADERS}" | grep -qi 'x-nextjs-'; then
  warn 'La ruta pública /proxy todavía está llegando a Next.js. Revisa nginx -T; no se considerará correcto.'
elif printf '%s\n' "${PUBLIC_HEADERS}" | grep -qiE 'content-type: text/html'; then
  ok 'La ruta pública /proxy está siendo atendida como HTML por el proxy.'
else
  warn 'No se pudo verificar automáticamente la respuesta pública de /proxy. Revisa ${PUBLIC_TEST_URL}.'
fi

ok "Nginx configurado: https://${DOMAIN}/proxy → http://127.0.0.1:${PORT}/proxy"
