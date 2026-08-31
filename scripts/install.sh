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
apt-get update >/tmp/ghost-nexora-apt-update.log
apt-get install -y ca-certificates curl git ffmpeg webp zip build-essential util-linux nginx unzip python3 >/tmp/ghost-nexora-apt-install.log
ok 'Dependencias base instaladas.'

section '2/9 · Node.js y yt-dlp'
if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'Number(process.versions.node.split(`.`)[0])' 2>/dev/null || echo 0)" -lt 24 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/tmp/ghost-nexora-node.log
  apt-get install -y nodejs >>/tmp/ghost-nexora-node.log
fi
ok "Node.js $(node -v) disponible."

if ! command -v yt-dlp >/dev/null 2>&1; then
  curl -fL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp >/tmp/ghost-nexora-ytdlp.log
  chmod 0755 /usr/local/bin/yt-dlp
else
  yt-dlp -U >/tmp/ghost-nexora-ytdlp.log 2>&1 || warn 'No se pudo actualizar yt-dlp; se conservará la versión instalada.'
fi
ok "yt-dlp disponible: $(yt-dlp --version 2>/dev/null || echo desconocido)"

section '3/9 · Usuario y almacenamiento persistente'
if ! id "${SERVICE_USER}" >/dev/null 2>&1; then
  useradd --system --home-dir "${STATE_DIR}" --create-home --shell /usr/sbin/nologin "${SERVICE_USER}"
fi
install -d -m 0750 -o "${SERVICE_USER}" -g "${SERVICE_USER}" "${STATE_DIR}" "${STATE_DIR}/session" "${STATE_DIR}/data" "${STATE_DIR}/data/subbots"
ok 'Almacenamiento persistente preparado.'

section '4/9 · Código del bot'
if [[ -d "${INSTALL_DIR}/.git" ]]; then
  git -C "${INSTALL_DIR}" fetch origin "${BRANCH}"
  git -C "${INSTALL_DIR}" checkout "${BRANCH}"
  git -C "${INSTALL_DIR}" pull --ff-only origin "${BRANCH}"
else
  git clone --depth 1 --branch "${BRANCH}" "${REPO_URL}" "${INSTALL_DIR}"
fi
cd "${INSTALL_DIR}"
[[ -f .env ]] || cp .env.example .env

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
set_env BROWSER_PROXY_PUBLIC_URL "https://${BOT_DOMAIN:-ghostnexorabot.duckdns.org}/proxy"
set_env BROWSER_PROXY_PORT "3847"

CURRENT_ADMIN_TOKEN="$(grep '^ADMIN_WEB_TOKEN=' .env | cut -d= -f2- || true)"
if [[ -z "${CURRENT_ADMIN_TOKEN}" || "${CURRENT_ADMIN_TOKEN}" == "change-this-admin-token" ]]; then
  set_env ADMIN_WEB_TOKEN "$(node -e "process.stdout.write(require('crypto').randomBytes(24).toString('hex'))")"
fi

if [[ -n "${BOT_DOMAIN}" ]]; then set_env PUBLIC_WEB_URL "https://${BOT_DOMAIN}"; else set_env PUBLIC_WEB_URL "http://127.0.0.1:${WEB_PORT}"; fi
chown root:"${SERVICE_USER}" .env
chmod 0640 .env
ok '.env configurado y protegido.'

section '5/9 · Dependencias Node'
npm install >/tmp/ghost-nexora-npm-install.log 2>&1
ok 'Dependencias Node instaladas.'

section '6/9 · Build de producción'
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
    runuser -u "${SERVICE_USER}" -- env ENV_FILE="${INSTALL_DIR}/.env" PAIRING_NUMBER="${PHONE}" npm --prefix "${INSTALL_DIR}" run pair || warn 'La vinculación no terminó; puedes repetirla después.'
  fi
else
  ok 'Sesión WhatsApp existente detectada; no se volvió a vincular.'
fi

section '9/9 · Servicios, proxy y Nginx'
systemctl enable --now ghost-nexora-bot.service ghost-nexora-web.service nginx
ok 'Servicios habilitados y arrancados.'

if [[ -f "${INSTALL_DIR}/scripts/install-browser-proxy.sh" ]]; then
  chmod +x "${INSTALL_DIR}/scripts/install-browser-proxy.sh"
  INSTALL_DIR="${INSTALL_DIR}" BROWSER_PROXY_DOMAIN="${BOT_DOMAIN}" bash "${INSTALL_DIR}/scripts/install-browser-proxy.sh"
else
  warn 'No se encontró install-browser-proxy.sh; no se pudo configurar Nginx automáticamente.'
fi

if [[ -n "${BOT_DOMAIN}" ]]; then
  apt-get install -y certbot python3-certbot-nginx >/tmp/ghost-nexora-certbot.log
  CERTBOT_ARGS=(--nginx --non-interactive --agree-tos --redirect -d "${BOT_DOMAIN}")
  if [[ -n "${LETSENCRYPT_EMAIL}" ]]; then CERTBOT_ARGS+=(--email "${LETSENCRYPT_EMAIL}"); else CERTBOT_ARGS+=(--register-unsafely-without-email); fi
  certbot "${CERTBOT_ARGS[@]}" >/tmp/ghost-nexora-certbot-run.log 2>&1 || warn 'HTTPS no pudo emitirse automáticamente; comprueba DNS.'
fi

printf '\nGhost Nexora Bot instalado. Código: %s\n' "$(git rev-parse --short HEAD)"
printf 'Proxy: https://${BOT_DOMAIN:-ghostnexorabot.duckdns.org}/proxy\n'
printf 'Health: http://127.0.0.1:${BOT_HEALTH_PORT}/health\n'
