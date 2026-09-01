#!/usr/bin/env bash
# Inyecta location = /proxy → 127.0.0.1:3847 en el server de ghostnexorabot.duckdns.org
# No necesita nano/vim. Ejecutar como root.
set -euo pipefail

DOMAIN="${1:-ghostnexorabot.duckdns.org}"
PORT="${2:-3847}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Ejecuta como root: sudo bash $0"
  exit 1
fi

echo "[1/4] Buscando archivos de nginx que definen server_name ${DOMAIN}…"
mapfile -t FILES < <(
  nginx -T 2>/dev/null \
    | sed -nE 's/^# configuration file ([^ ]+) :$/\1/p' \
    | awk '!seen[$0]++' \
    || true
)

if [[ ${#FILES[@]} -eq 0 ]]; then
  # fallback: sitios típicos
  FILES=(/etc/nginx/sites-enabled/* /etc/nginx/conf.d/*)
fi

TARGET=""
for f in "${FILES[@]}"; do
  [[ -f "$f" ]] || continue
  if grep -qE "server_name[^;]*\b${DOMAIN}\b" "$f" 2>/dev/null; then
    TARGET="$f"
    echo "     → candidato: $f"
  fi
done

if [[ -z "$TARGET" ]]; then
  echo "No encontré un archivo con server_name ${DOMAIN}"
  echo "Lista sites-enabled:"
  ls -la /etc/nginx/sites-enabled/ 2>/dev/null || true
  exit 1
fi

# Preferir el archivo que tenga listen 443 / ssl para este dominio
BEST=""
for f in "${FILES[@]}"; do
  [[ -f "$f" ]] || continue
  grep -qE "server_name[^;]*\b${DOMAIN}\b" "$f" 2>/dev/null || continue
  if grep -qE 'listen\s+443|ssl_certificate' "$f" 2>/dev/null; then
    BEST="$f"
  fi
done
TARGET="${BEST:-$TARGET}"
echo "[2/4] Editando: $TARGET"

python3 - "$TARGET" "$DOMAIN" "$PORT" <<'PY'
import re, sys, shutil, time
from pathlib import Path

path = Path(sys.argv[1])
domain = sys.argv[2]
port = sys.argv[3]
text = path.read_text()

marker = "Ghost Nexora Browser Proxy (managed)"
location_block = f"""
    # {marker}
    location = /proxy {{
        proxy_pass http://127.0.0.1:{port}/proxy;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 10s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
        proxy_buffering off;
        add_header Access-Control-Allow-Origin * always;
    }}
"""

# Si ya existe el bloque managed, no duplicar
if marker in text or re.search(r'location\s*=\s*/proxy\s*\{', text):
    # Reemplazar bloque viejo managed
    text2 = re.sub(
        r'\n?\s*#\s*' + re.escape(marker) + r'[\s\S]*?location\s*=\s*/proxy\s*\{[\s\S]*?\n\s*\}',
        location_block.rstrip(),
        text,
        count=1,
    )
    if text2 == text and re.search(r'location\s*=\s*/proxy\s*\{', text):
        print("OK: location = /proxy ya existe; no se modifica de nuevo.")
        sys.exit(0)
    text = text2
else:
    # Insertar justo ANTES del primer "location / {" dentro de un server que mencione el dominio
    server_re = re.compile(r'(server\s*\{)', re.M)
    # Estrategia simple: insertar antes de location / { en el archivo (suele ser el vhost del panel)
    m = re.search(r'(?m)^(\s*)location\s+/\s*\{', text)
    if not m:
        print("ERROR: no encontré location / { en", path)
        sys.exit(1)
    indent = m.group(1)
    insert = location_block.replace('\n    ', '\n' + indent)
    text = text[:m.start()] + insert + '\n' + text[m.start():]

backup = path.with_suffix(path.suffix + f'.bak-proxy-{int(time.time())}')
shutil.copy2(path, backup)
path.write_text(text)
print(f"Backup: {backup}")
print(f"Escrito: {path}")
PY

echo "[3/4] nginx -t"
nginx -t

echo "[4/4] reload"
systemctl reload nginx

echo ""
echo "Prueba pública (debe ser JSON, no HTML de Next):"
curl -sS -m 15 "https://${DOMAIN}/proxy?url=https://example.com" | head -c 250
echo ""
echo ""
echo "Si ves {\"ok\":true o status/bytes/html → LISTO"
echo "Si ves <!DOCTYPE html>…/_next → el location no está en el server 443 correcto"
