#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="https://github.com/Gh0stDeveloper/GhostNexoraBot.git"
INSTALL_DIR="${INSTALL_DIR:-/opt/ghost-nexora-bot}"
STATE_DIR="${STATE_DIR:-/var/lib/ghost-nexora-bot}"
SERVICE_USER="${SERVICE_USER:-ghostbot}"
BRANCH="${BRANCH:-main}"
BOT_DOMAIN="${BOT_DOMAIN:-}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"
WEB_PORT="${WEB_PORT:-3000}"
BOT_HEALTH_PORT="${BOT_HEALTH_PORT:-3001}"
START_TS=$(date +%s)

info() { printf '[%s] [INFO] %s\n' "$(date '+%H:%M:%S')" "$*"; }
ok() { printf '[%s] [ OK ] %s\n' "$(date '+%H:%M:%S')" "$*"; }
warn() { printf '[%s] [WARN] %s\n' "$(date '+%H:%M:%S')" "$*" >&2; }
fail() { printf '[%s] [FAIL] %s\n' "$(date '+%H:%M:%S')" "$*" >&2; }
section() { printf '\n[%s] ===== %s =====\n' "$(date '+%H:%M:%S')" "$*"; }
finish() { printf '\n[%s] Instalación finalizada en %ss.\n' "$(date '+%H:%M:%S')" "$(( $(date +%s) - START_TS ))"; }
trap 'status=$?; fail "La instalación falló en la línea ${LINENO} (exit ${status}). Revisa el último bloque del log."; exit ${status}' ERR
trap finish EXIT

if [[ "${EUID}" -ne 0 ]]; then fail 'Este instalador debe ejecutarse con sudo/root.'; exit 1; fi

section 'Ghost Nexora Bot · INSTALACIÓN'
info "Repositorio: ${REPO_URL}"
info "Rama: ${BRANCH}"
info "Instalación: ${INSTALL_DIR}"
info "Datos persistentes: ${STATE_DIR}"
info "Usuario de servicio: ${SERVICE_USER}"

if [[ "${WEB_PORT}" == "${BOT_HEALTH_PORT}" ]]; then fail 'WEB_PORT y BOT_HEALTH_PORT deben ser diferentes.'; exit 1; fi
for port in "${WEB_PORT}" "${BOT_HEALTH_PORT}"; do
  if ! [[ "${port}" =~ ^[0-9]+$ ]] || (( port < 1 || port > 65535 )); then fail "Puerto interno inválido: ${port}"; exit 1; fi
done

export DEBIAN_FRONTEND=noninteractive

section '1/9 · Dependencias del sistema'
info 'Actualizando índices APT...'
apt-get update >/tmp/ghost-nexora-apt-update.log
ok 'Índices APT actualizados.'
info 'Instalando dependencias base...'
apt-get install -y ca-certificates curl git ffmpeg webp zip build-essential util-linux nginx unzip >/tmp/ghost-nexora-apt-install.log
ok 'Dependencias base instaladas.'

section '2/9 · Node.js y yt-dlp'
if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'Number(process.versions.node.split(`.`)[0])' 2>/dev/null || echo 0)" -lt 24 ]]; then
  info 'Instalando Node.js 24...'
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/tmp/ghost-nexora-node.log
  apt-get install -y nodejs >>/tmp/ghost-nexora-node.log
  ok "Node.js $(node -v) instalado."
else
  ok "Node.js existente: $(node -v)"
fi

if ! command -v yt-dlp >/dev/null 2>&1; then
  info 'Instalando yt-dlp...'
  curl -fL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp >/tmp/ghost-nexora-ytdlp.log
  chmod 0755 /usr/local/bin/yt-dlp
  ok 'yt-dlp instalado.'
else
  yt-dlp -U >/tmp/ghost-nexora-ytdlp.log 2>&1 || warn 'No se pudo actualizar yt-dlp; se conservará la versión instalada.'
  ok "yt-dlp disponible: $(yt-dlp --version 2>/dev/null || echo desconocido)"
fi

section '3/9 · Usuario y almacenamiento persistente'
if ! id "${SERVICE_USER}" >/dev/null 2>&1; then
  useradd --system --home-dir "${STATE_DIR}" --create-home --shell /usr/sbin/nologin "${SERVICE_USER}"
  ok "Usuario ${SERVICE_USER} creado."
else
  ok "Usuario ${SERVICE_USER} ya existe."
fi
install -d -m 0750 -o "${SERVICE_USER}" -g "${SERVICE_USER}" "${STATE_DIR}" "${STATE_DIR}/session" "${STATE_DIR}/data" "${STATE_DIR}/data/subbots"
ok 'Almacenamiento persistente preparado.'

section '4/9 · Código del bot'
if [[ -d "${INSTALL_DIR}/.git" ]]; then
  info 'Repositorio existente: actualizando sin tocar .env ni datos persistentes...'
  git -C "${INSTALL_DIR}" fetch origin "${BRANCH}"
  git -C "${INSTALL_DIR}" checkout "${BRANCH}"
  git -C "${INSTALL_DIR}" pull --ff-only origin "${BRANCH}"
else
  info 'Clonando repositorio...'
  git clone --depth 1 --branch "${BRANCH}" "${REPO_URL}" "${INSTALL_DIR}"
fi
ok "Código actualizado: $(git -C "${INSTALL_DIR}" rev-parse --short HEAD)"

cd "${INSTALL_DIR}"
[[ -f .env ]] || { cp .env.example .env; warn '.env no existía; se creó desde .env.example.'; }

set_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" .env; then sed -i "s|^${key}=.*|${key}=${value}|" .env; else printf '%s=%s\n' "${key}" "${value}" >> .env; fi
}

set_env SESSION_DIR "${STATE_DIR}/session"
set_env DATA_DIR "${STATE_DIR}/data"
set_env MAX_DOWNLOAD_MB "1900"
set_env WEB_PORT "${WEB_PORT}"
set_env BOT_HEALTH_PORT "${BOT_HEALTH_PORT}"
set_env BOT_HEALTH_URL "http://127.0.0.1:${BOT_HEALTH_PORT}/health"
set_env OFFICIAL_CHANNEL_URL "https://whatsapp.com/channel/0029VbCWbix9RZAfkkKOqP2i"

CURRENT_ADMIN_TOKEN="$(grep '^ADMIN_WEB_TOKEN=' .env | cut -d= -f2- || true)"
if [[ -z "${CURRENT_ADMIN_TOKEN}" || "${CURRENT_ADMIN_TOKEN}" == "change-this-admin-token" ]]; then
  set_env ADMIN_WEB_TOKEN "$(node -e "process.stdout.write(require('crypto').randomBytes(24).toString('hex'))")"
  ok 'ADMIN_WEB_TOKEN generado automáticamente.'
else
  ok 'ADMIN_WEB_TOKEN existente conservado.'
fi

if [[ -n "${BOT_DOMAIN}" ]]; then set_env PUBLIC_WEB_URL "https://${BOT_DOMAIN}"; else set_env PUBLIC_WEB_URL "http://127.0.0.1:${WEB_PORT}"; fi
chown root:"${SERVICE_USER}" .env
chmod 0640 .env
ok '.env configurado y protegido (0640).'

section '5/9 · Dependencias Node'
info 'Ejecutando npm install...'
npm install >/tmp/ghost-nexora-npm-install.log 2>&1
ok 'Dependencias Node instaladas.'

section '6/9 · Build de producción'
info 'Compilando bot + web...'
npm run build >/tmp/ghost-nexora-build.log 2>&1
ok 'Build de producción completado.'
install -d -m 0750 -o "${SERVICE_USER}" -g "${SERVICE_USER}" "${INSTALL_DIR}/apps/web/.next/cache"

section '7/9 · Systemd'
install -m 0644 systemd/ghost-nexora-bot.service /etc/systemd/system/ghost-nexora-bot.service
install -m 0644 systemd/ghost-nexora-web.service /etc/systemd/system/ghost-nexora-web.service
sed -i \
  -e "s|__INSTALL_DIR__|${INSTALL_DIR}|g" \
  -e "s|__STATE_DIR__|${STATE_DIR}|g" \
  -e "s|__SERVICE_USER__|${SERVICE_USER}|g" \
  -e "s|__WEB_PORT__|${WEB_PORT}|g" \
  -e "s|__BOT_HEALTH_PORT__|${BOT_HEALTH_PORT}|g" \
  /etc/systemd/system/ghost-nexora-bot.service \
  /etc/systemd/system/ghost-nexora-web.service
systemctl daemon-reload
ok 'Unidades systemd instaladas.'

section '8/9 · Vinculación WhatsApp'
SESSION_CREDS="${STATE_DIR}/session/creds.json"
REGISTERED="false"
if [[ -f "${SESSION_CREDS}" ]]; then REGISTERED="$(node -e "try{const x=require('${SESSION_CREDS}');process.stdout.write(String(Boolean(x.registered)))}catch{process.stdout.write('false')}" 2>/dev/null || echo false)"; fi
if [[ "${REGISTERED}" != "true" ]]; then
  PHONE=""
  if [[ -r /dev/tty ]]; then
    printf 'Número principal de WhatsApp en formato internacional (Enter para omitir): ' >/dev/tty
    IFS= read -r PHONE </dev/tty || true
    PHONE="$(printf '%s' "${PHONE}" | tr -cd '0-9')"
  fi
  if [[ -n "${PHONE}" ]]; then
    CURRENT_OWNERS="$(grep '^OWNER_NUMBERS=' .env | cut -d= -f2- || true)"
    [[ -n "${CURRENT_OWNERS}" ]] || set_env OWNER_NUMBERS "${PHONE}"
    info "Iniciando pairing como ${SERVICE_USER}..."
    if runuser -u "${SERVICE_USER}" -- env ENV_FILE="${INSTALL_DIR}/.env" PAIRING_NUMBER="${PHONE}" npm --prefix "${INSTALL_DIR}" run pair; then
      ok 'Vinculación completada.'
    else
      warn 'La vinculación no terminó. La instalación continuará y puedes repetir npm run pair después.'
    fi
  else
    warn "Vinculación omitida. Ejecuta después: sudo -u ${SERVICE_USER} -H env ENV_FILE=${INSTALL_DIR}/.env npm --prefix ${INSTALL_DIR} run pair"
  fi
else
  ok 'Sesión WhatsApp existente detectada; no se volvió a vincular.'
fi

section '9/9 · Servicios y web'
systemctl enable --now ghost-nexora-bot.service ghost-nexora-web.service nginx
ok 'Servicios habilitados y arrancados.'

if [[ -n "${BOT_DOMAIN}" ]]; then
  cat > /etc/nginx/sites-available/ghost-nexora-bot <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${BOT_DOMAIN};
    client_max_body_size 2g;
    location / {
        proxy_pass http://127.0.0.1:${WEB_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX
  ln -sfn /etc/nginx/sites-available/ghost-nexora-bot /etc/nginx/sites-enabled/ghost-nexora-bot
  nginx -t >/tmp/ghost-nexora-nginx-test.log
  systemctl reload nginx
  apt-get install -y certbot python3-certbot-nginx >/tmp/ghost-nexora-certbot.log
  CERTBOT_ARGS=(--nginx --non-interactive --agree-tos --redirect -d "${BOT_DOMAIN}")
  if [[ -n "${LETSENCRYPT_EMAIL}" ]]; then CERTBOT_ARGS+=(--email "${LETSENCRYPT_EMAIL}"); else CERTBOT_ARGS+=(--register-unsafely-without-email); fi
  certbot "${CERTBOT_ARGS[@]}" >/tmp/ghost-nexora-certbot-run.log 2>&1 || warn 'No se pudo emitir HTTPS todavía; revisa DNS y ejecuta certbot cuando corresponda.'
  ok "Nginx configurado para ${BOT_DOMAIN}."
fi

printf '\n╔══════════════════════════════════════════════════════╗\n'
printf '║       GHOST NEXORA BOT · INSTALACIÓN OK             ║\n'
printf '╚══════════════════════════════════════════════════════╝\n'
printf 'Código          : %s\n' "$(git -C "${INSTALL_DIR}" rev-parse --short HEAD)"
printf 'Instalación     : %s\n' "${INSTALL_DIR}"
printf 'Datos           : %s\n' "${STATE_DIR}"
printf 'Usuario servicio: %s\n' "${SERVICE_USER}"
printf 'Web             : %s\n' "${BOT_DOMAIN:+https://${BOT_DOMAIN}}${BOT_DOMAIN:-http://127.0.0.1:${WEB_PORT}}"
printf 'Health          : http://127.0.0.1:%s/health\n' "${BOT_HEALTH_PORT}"
printf 'Estado bot      : systemctl status ghost-nexora-bot --no-pager\n'
printf 'Logs bot        : journalctl -u ghost-nexora-bot -f\n'
printf 'Configuración   : %s/.env\n' "${INSTALL_DIR}"
printf 'Nota seguridad  : secretos y ADMIN_WEB_TOKEN no se imprimen en el log.\n'
printf '══════════════════════════════════════════════════════\n'
