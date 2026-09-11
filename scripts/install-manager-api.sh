#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/ghost-nexora-bot}"
MANAGER_PORT="${MANAGER_PORT:-3002}"
DOMAIN="${MANAGER_DOMAIN:-}"

info() { printf '[%s] [INFO] %s\n' "$(date '+%H:%M:%S')" "$*"; }
ok() { printf '[%s] [ OK ] %s\n' "$(date '+%H:%M:%S')" "$*"; }
warn() { printf '[%s] [WARN] %s\n' "$(date '+%H:%M:%S')" "$*" >&2; }
fail() { printf '[%s] [FAIL] %s\n' "$(date '+%H:%M:%S')" "$*" >&2; }

if [[ "${EUID}" -ne 0 ]]; then fail 'Ejecuta este script como root/sudo.'; exit 1; fi
[[ -f "${INSTALL_DIR}/.env" ]] || { fail "No existe ${INSTALL_DIR}/.env"; exit 1; }
command -v nginx >/dev/null 2>&1 || { fail 'Nginx no está instalado.'; exit 1; }
command -v python3 >/dev/null 2>&1 || { fail 'python3 no está instalado.'; exit 1; }

read_env() {
  grep -E "^${1}=" "${INSTALL_DIR}/.env" 2>/dev/null | tail -n1 | cut -d= -f2- || true
}
set_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "${INSTALL_DIR}/.env"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "${INSTALL_DIR}/.env"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${INSTALL_DIR}/.env"
  fi
}

[[ -n "${MANAGER_PORT}" ]] || MANAGER_PORT="$(read_env MANAGER_PORT)"
MANAGER_PORT="${MANAGER_PORT:-3002}"
if ! [[ "${MANAGER_PORT}" =~ ^[0-9]+$ ]] || (( MANAGER_PORT < 1 || MANAGER_PORT > 65535 )); then
  fail "MANAGER_PORT inválido: ${MANAGER_PORT}"
  exit 1
fi

if [[ -z "${DOMAIN}" ]]; then
  PUBLIC="$(read_env MANAGER_PUBLIC_URL)"
  [[ -n "${PUBLIC}" ]] || PUBLIC="$(read_env PUBLIC_WEB_URL)"
  [[ -n "${PUBLIC}" ]] || PUBLIC="$(read_env BROWSER_PROXY_PUBLIC_URL)"
  if [[ -n "${PUBLIC}" ]]; then DOMAIN="$(printf '%s' "${PUBLIC}" | sed -E 's#^[a-zA-Z]+://([^/]+).*$#\1#')"; fi
fi
DOMAIN="${DOMAIN:-ghostnexorabot.duckdns.org}"
if [[ ! "${DOMAIN}" =~ ^[A-Za-z0-9.-]+$ ]]; then fail "Dominio inválido: ${DOMAIN}"; exit 1; fi

set_env MANAGER_PORT "${MANAGER_PORT}"
set_env MANAGER_PUBLIC_URL "https://${DOMAIN}/manager"
chmod 0640 "${INSTALL_DIR}/.env" || true

NGINX_DUMP="$(nginx -T 2>/dev/null)" || { fail 'No se pudo leer nginx -T.'; exit 1; }
mapfile -t CONFIG_FILES < <(
  printf '%s\n' "${NGINX_DUMP}" \
    | sed -nE 's/^# configuration file (.+):$/\1/p' \
    | awk '!seen[$0]++' \
    || true
)

UPDATED=''
for file in "${CONFIG_FILES[@]}"; do
  [[ -f "${file}" && -r "${file}" && -w "${file}" ]] || continue
  result="$(python3 - "${file}" "${DOMAIN}" "${MANAGER_PORT}" <<'PY'
import re
import sys
from pathlib import Path

path, domain, port = sys.argv[1:]
text = Path(path).read_text()
marker = 'Ghost Nexora Manager API (managed)'
server_start = re.compile(r'(?m)^\s*server\s*\{')
blocks = []
for match in server_start.finditer(text):
    start = match.start()
    depth = 0
    quote = None
    comment = False
    i = match.end() - 1
    while i < len(text):
        ch = text[i]
        if comment:
            if ch == '\n': comment = False
        elif quote:
            if ch == quote and (i == 0 or text[i - 1] != '\\'): quote = None
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

needle = re.compile(r'(?m)^\s*server_name\s+[^;]*\b' + re.escape(domain) + r'\b[^;]*;')
candidates = []
for start, end, block in blocks:
    if not needle.search(block):
        continue
    score = 100 if re.search(r'(?m)^\s*listen\s+443(?:\s|;)', block) else 0
    if re.search(r'\bssl\b', block): score += 20
    candidates.append((score, start, end, block))

if not candidates:
    print('NO_SERVER')
    raise SystemExit(0)

candidates.sort(reverse=True)
_, start, end, block = candidates[0]
if marker in block or re.search(r'location\s+\^~\s+/manager/', block):
    print('EXISTS')
    raise SystemExit(0)

location = f'''\n    # {marker}\n    location = /manager {{\n        return 308 /manager/;\n    }}\n\n    location ^~ /manager/ {{\n        proxy_pass http://127.0.0.1:{port}/;\n        proxy_http_version 1.1;\n        proxy_set_header Host $host;\n        proxy_set_header Authorization $http_authorization;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n        proxy_connect_timeout 5s;\n        proxy_send_timeout 35s;\n        proxy_read_timeout 35s;\n        proxy_buffering off;\n        add_header Cache-Control "no-store" always;\n    }}\n'''
Path(path).write_text(text[:end - 1] + location + text[end - 1:])
print('INJECTED')
PY
)"
  case "${result}" in
    INJECTED|EXISTS) UPDATED="${file}"; info "Ruta /manager/ gestionada en ${file}."; break ;;
  esac
done

if [[ -z "${UPDATED}" ]]; then
  fail "No se encontró un server_name=${DOMAIN} editable. Configura primero Nginx/HTTPS para ese dominio."
  exit 1
fi

nginx -t
systemctl reload nginx

if curl -fsS --max-time 5 "http://127.0.0.1:${MANAGER_PORT}/health" >/tmp/ghost-nexora-manager-health.json 2>/dev/null; then
  ok "Manager Agent responde en 127.0.0.1:${MANAGER_PORT}."
else
  warn "Manager Agent aún no responde en ${MANAGER_PORT}; verifica ghost-nexora-manager.service tras el build."
fi
ok "Control remoto: https://${DOMAIN}/manager"
