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

if [[ "${EUID}" -ne 0 ]]; then
  echo "Este instalador debe ejecutarse con sudo/root."
  exit 1
fi

if [[ "${WEB_PORT}" == "${BOT_HEALTH_PORT}" ]]; then
  echo "WEB_PORT y BOT_HEALTH_PORT deben ser diferentes."
  exit 1
fi

for port in "${WEB_PORT}" "${BOT_HEALTH_PORT}"; do
  if ! [[ "${port}" =~ ^[0-9]+$ ]] || (( port < 1 || port > 65535 )); then
    echo "Puerto interno inválido: ${port}"
    exit 1
  fi
done

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git ffmpeg webp build-essential util-linux nginx

if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'Number(process.versions.node.split(`.`)[0])' 2>/dev/null || echo 0)" -lt 24 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi

if ! command -v yt-dlp >/dev/null 2>&1; then
  curl -fL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
  chmod 0755 /usr/local/bin/yt-dlp
else
  yt-dlp -U >/dev/null 2>&1 || true
fi

if ! id "${SERVICE_USER}" >/dev/null 2>&1; then
  useradd --system --home-dir "${STATE_DIR}" --create-home --shell /usr/sbin/nologin "${SERVICE_USER}"
fi
install -d -m 0750 -o "${SERVICE_USER}" -g "${SERVICE_USER}" "${STATE_DIR}" "${STATE_DIR}/session" "${STATE_DIR}/data" "${STATE_DIR}/data/subbots"

if [[ -d "${INSTALL_DIR}/.git" ]]; then
  git -C "${INSTALL_DIR}" fetch origin "${BRANCH}"
  git -C "${INSTALL_DIR}" checkout "${BRANCH}"
  git -C "${INSTALL_DIR}" pull --ff-only origin "${BRANCH}"
else
  rm -rf "${INSTALL_DIR}"
  git clone --depth 1 --branch "${BRANCH}" "${REPO_URL}" "${INSTALL_DIR}"
fi

cd "${INSTALL_DIR}"
[[ -f .env ]] || cp .env.example .env

set_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    printf '%s=%s\n' "${key}" "${value}" >> .env
  fi
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
fi

if [[ -n "${BOT_DOMAIN}" ]]; then
  set_env PUBLIC_WEB_URL "https://${BOT_DOMAIN}"
else
  set_env PUBLIC_WEB_URL "http://127.0.0.1:${WEB_PORT}"
fi

chown root:"${SERVICE_USER}" .env
chmod 0640 .env
npm install
npm run build
install -d -m 0750 -o "${SERVICE_USER}" -g "${SERVICE_USER}" "${INSTALL_DIR}/apps/web/.next/cache"

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

SESSION_CREDS="${STATE_DIR}/session/creds.json"
REGISTERED="false"
if [[ -f "${SESSION_CREDS}" ]]; then
  REGISTERED="$(node -e "try{const x=require('${SESSION_CREDS}');process.stdout.write(String(Boolean(x.registered)))}catch{process.stdout.write('false')}" 2>/dev/null || echo false)"
fi

if [[ "${REGISTERED}" != "true" ]]; then
  PHONE=""
  if [[ -r /dev/tty ]]; then
    printf '\nNúmero principal de WhatsApp en formato internacional (puedes usar +, espacios o guiones; Enter para omitir): ' >/dev/tty
    IFS= read -r PHONE </dev/tty || true
    PHONE="$(printf '%s' "${PHONE}" | tr -cd '0-9')"
  fi
  if [[ -n "${PHONE}" ]]; then
    CURRENT_OWNERS="$(grep '^OWNER_NUMBERS=' .env | cut -d= -f2- || true)"
    [[ -n "${CURRENT_OWNERS}" ]] || set_env OWNER_NUMBERS "${PHONE}"
    echo "Generando código de vinculación para ${PHONE}..."
    if ! runuser -u "${SERVICE_USER}" -- env ENV_FILE="${INSTALL_DIR}/.env" PAIRING_NUMBER="${PHONE}" npm --prefix "${INSTALL_DIR}" run pair; then
      echo "La vinculación no terminó, pero la instalación continuará. Repite después:"
      echo "sudo -u ${SERVICE_USER} -H env ENV_FILE=${INSTALL_DIR}/.env npm --prefix ${INSTALL_DIR} run pair"
    fi
  else
    echo "Vinculación omitida. Ejecuta después: sudo -u ${SERVICE_USER} -H env ENV_FILE=${INSTALL_DIR}/.env npm --prefix ${INSTALL_DIR} run pair"
  fi
fi

systemctl enable --now ghost-nexora-bot.service ghost-nexora-web.service nginx

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
  nginx -t
  systemctl reload nginx
  apt-get install -y certbot python3-certbot-nginx
  CERTBOT_ARGS=(--nginx --non-interactive --agree-tos --redirect -d "${BOT_DOMAIN}")
  if [[ -n "${LETSENCRYPT_EMAIL}" ]]; then CERTBOT_ARGS+=(--email "${LETSENCRYPT_EMAIL}"); else CERTBOT_ARGS+=(--register-unsafely-without-email); fi
  certbot "${CERTBOT_ARGS[@]}" || echo "No se pudo emitir HTTPS todavía. Revisa que DNS apunte a esta VPS y repite certbot."
fi

echo
echo "Ghost Nexora Bot instalado."
if [[ -n "${BOT_DOMAIN}" ]]; then echo "Web: https://${BOT_DOMAIN}"; else echo "Web local: http://127.0.0.1:${WEB_PORT}"; fi
echo "Web interna: http://127.0.0.1:${WEB_PORT}"
echo "Health interno: http://127.0.0.1:${BOT_HEALTH_PORT}/health"
echo "Estado: systemctl status ghost-nexora-bot --no-pager"
echo "Logs: journalctl -u ghost-nexora-bot -f"
echo "Configuración: ${INSTALL_DIR}/.env"
echo "Token admin web: $(grep '^ADMIN_WEB_TOKEN=' "${INSTALL_DIR}/.env" | cut -d= -f2-)"
