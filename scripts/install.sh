#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="https://github.com/Gh0stDeveloper/GhostNexoraBot.git"
INSTALL_DIR="${INSTALL_DIR:-/opt/ghost-nexora-bot}"
STATE_DIR="${STATE_DIR:-/var/lib/ghost-nexora-bot}"
SERVICE_USER="${SERVICE_USER:-ghostbot}"
BRANCH="${BRANCH:-main}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Este instalador debe ejecutarse con sudo/root."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git ffmpeg build-essential

if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'Number(process.versions.node.split(`.`)[0])' 2>/dev/null || echo 0)" -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi

if ! command -v pnpm >/dev/null 2>&1; then
  npm install -g pnpm@10
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
install -d -m 0750 -o "${SERVICE_USER}" -g "${SERVICE_USER}" "${STATE_DIR}" "${STATE_DIR}/session" "${STATE_DIR}/data"

if [[ -d "${INSTALL_DIR}/.git" ]]; then
  git -C "${INSTALL_DIR}" fetch origin "${BRANCH}"
  git -C "${INSTALL_DIR}" checkout "${BRANCH}"
  git -C "${INSTALL_DIR}" pull --ff-only origin "${BRANCH}"
else
  rm -rf "${INSTALL_DIR}"
  git clone --depth 1 --branch "${BRANCH}" "${REPO_URL}" "${INSTALL_DIR}"
fi

cd "${INSTALL_DIR}"
if [[ ! -f .env ]]; then
  cp .env.example .env
fi

sed -i \
  -e "s|^SESSION_DIR=.*|SESSION_DIR=${STATE_DIR}/session|" \
  -e "s|^DATA_DIR=.*|DATA_DIR=${STATE_DIR}/data|" \
  .env

chown root:"${SERVICE_USER}" .env
chmod 0640 .env

pnpm install --no-frozen-lockfile
pnpm build

install -m 0644 systemd/ghost-nexora-bot.service /etc/systemd/system/ghost-nexora-bot.service
install -m 0644 systemd/ghost-nexora-web.service /etc/systemd/system/ghost-nexora-web.service

sed -i \
  -e "s|__INSTALL_DIR__|${INSTALL_DIR}|g" \
  -e "s|__STATE_DIR__|${STATE_DIR}|g" \
  -e "s|__SERVICE_USER__|${SERVICE_USER}|g" \
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
    printf '\nNumero de WhatsApp con codigo de pais, solo digitos (Enter para omitir): ' >/dev/tty
    IFS= read -r PHONE </dev/tty || true
    PHONE="$(printf '%s' "${PHONE}" | tr -cd '0-9')"
  fi
  if [[ -n "${PHONE}" ]]; then
    echo "Generando codigo de vinculacion..."
    sudo -u "${SERVICE_USER}" -H env \
      ENV_FILE="${INSTALL_DIR}/.env" \
      PAIRING_NUMBER="${PHONE}" \
      pnpm --dir "${INSTALL_DIR}" pair
  else
    echo "Vinculacion omitida. Ejecuta: cd ${INSTALL_DIR} && sudo -u ${SERVICE_USER} -H env ENV_FILE=${INSTALL_DIR}/.env pnpm pair"
  fi
fi

systemctl enable --now ghost-nexora-bot.service ghost-nexora-web.service

echo
echo "Ghost Nexora Bot instalado."
echo "Web local: http://127.0.0.1:3000"
echo "Estado bot: systemctl status ghost-nexora-bot --no-pager"
echo "Logs bot: journalctl -u ghost-nexora-bot -f"
echo "Configuracion: ${INSTALL_DIR}/.env"
