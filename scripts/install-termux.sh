#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail

REPO_URL="https://github.com/Gh0stDeveloper/GhostNexoraBot.git"
BRANCH="${BRANCH:-main}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/GhostNexoraBot}"
STATE_DIR="${STATE_DIR:-$HOME/.ghostnexora}"
START_TS="$(date +%s)"

info() { printf '[%s] [INFO] %s\n' "$(date '+%H:%M:%S')" "$*"; }
ok() { printf '[%s] [ OK ] %s\n' "$(date '+%H:%M:%S')" "$*"; }
warn() { printf '[%s] [WARN] %s\n' "$(date '+%H:%M:%S')" "$*" >&2; }
fail() { printf '[%s] [FAIL] %s\n' "$(date '+%H:%M:%S')" "$*" >&2; exit 1; }
section() { printf '\n[%s] ===== %s =====\n' "$(date '+%H:%M:%S')" "$*"; }

trap 'status=$?; printf "\n[%s] [FAIL] Instalación Termux Lite interrumpida en línea %s (exit %s).\n" "$(date "+%H:%M:%S")" "${LINENO}" "${status}" >&2; exit ${status}' ERR

if [[ -z "${PREFIX:-}" ]] || ! command -v pkg >/dev/null 2>&1; then
  fail 'Este instalador es exclusivo para Termux.'
fi
if [[ "$(id -u)" -eq 0 ]]; then
  fail 'No ejecutes Ghost Nexora Lite como root dentro de Termux.'
fi

section 'Ghost Nexora Bot · TERMUX LITE'
info "Rama: ${BRANCH}"
info "Código: ${INSTALL_DIR}"
info "Datos: ${STATE_DIR}"
info 'Perfil: termux-lite · sin Ollama/LLM, panel web, Nginx ni systemd'

section '1/7 · Paquetes de Termux'
pkg update -y >/dev/null
pkg install -y git nodejs ffmpeg python curl unzip procps coreutils >/dev/null
ok 'Dependencias base instaladas.'

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(`.`)[0])' 2>/dev/null || echo 0)"
if (( NODE_MAJOR < 24 )); then
  fail "Se requiere Node.js 24 o superior. Termux tiene $(node -v 2>/dev/null || echo desconocido). Actualiza Termux y sus repositorios."
fi
ok "Node.js $(node -v) · npm $(npm -v)"

section '2/7 · yt-dlp'
if pkg install -y yt-dlp >/dev/null 2>&1; then
  ok "yt-dlp instalado desde Termux: $(yt-dlp --version 2>/dev/null || echo desconocido)"
else
  python -m pip install --upgrade yt-dlp >/dev/null
  command -v yt-dlp >/dev/null 2>&1 || fail 'yt-dlp se instaló con pip pero no quedó disponible en PATH.'
  ok "yt-dlp instalado con Python: $(yt-dlp --version 2>/dev/null || echo desconocido)"
fi

section '3/7 · Código fuente'
if [[ -d "${INSTALL_DIR}/.git" ]]; then
  git -C "${INSTALL_DIR}" fetch origin "${BRANCH}"
  git -C "${INSTALL_DIR}" checkout "${BRANCH}"
  git -C "${INSTALL_DIR}" pull --ff-only origin "${BRANCH}"
else
  git clone --depth 1 --branch "${BRANCH}" "${REPO_URL}" "${INSTALL_DIR}"
fi
cd "${INSTALL_DIR}"
ok "Repositorio listo: $(git rev-parse --short HEAD)"

section '4/7 · Datos persistentes y perfil Lite'
mkdir -p "${STATE_DIR}/session" "${STATE_DIR}/data/subbots" "${STATE_DIR}/logs" "${STATE_DIR}/run"
[[ -f .env ]] || cp .env.example .env

set_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    printf '%s=%s\n' "${key}" "${value}" >> .env
  fi
}

set_env NEXORA_RUNTIME_PROFILE 'termux-lite'
set_env SESSION_DIR "${STATE_DIR}/session"
set_env DATA_DIR "${STATE_DIR}/data"
set_env MAX_DOWNLOAD_MB "450"
set_env BOT_HEALTH_PORT "3001"
set_env BOT_HEALTH_URL "http://127.0.0.1:3001/health"
set_env OLLAMA_ENABLED "false"
set_env TELEGRAM_BOT_TOKEN ""
set_env TELEGRAM_CHANNEL_ID ""
set_env TELEGRAM_CHANNEL_URL ""
set_env PUBLIC_WEB_URL "http://127.0.0.1:3000"
set_env OFFICIAL_CHANNEL_URL "https://whatsapp.com/channel/0029VbCWbix9RZAfkkKOqP2i"

CURRENT_ADMIN_TOKEN="$(grep '^ADMIN_WEB_TOKEN=' .env | cut -d= -f2- || true)"
if [[ -z "${CURRENT_ADMIN_TOKEN}" || "${CURRENT_ADMIN_TOKEN}" == 'change-this-admin-token' ]]; then
  set_env ADMIN_WEB_TOKEN "$(node -e "process.stdout.write(require('crypto').randomBytes(24).toString('hex'))")"
fi
chmod 600 .env
ok '.env configurado para Termux Lite; la sesión y la base quedan fuera del árbol Git.'

section '5/7 · Dependencias y build Lite'
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
npm install --workspace=@ghostnexora/bot --include=dev >/tmp/ghostnexora-termux-npm.log 2>&1 || {
  warn 'npm install falló. Últimas líneas:'
  tail -n 60 /tmp/ghostnexora-termux-npm.log >&2 || true
  exit 1
}
npm run build:termux --workspace=@ghostnexora/bot >/tmp/ghostnexora-termux-build.log 2>&1 || {
  warn 'El build Termux Lite falló. Últimas líneas:'
  tail -n 80 /tmp/ghostnexora-termux-build.log >&2 || true
  exit 1
}
ok 'Runtime Lite compilado en apps/bot/dist-termux; el workspace web no se inicia ni se usa.'

section '6/7 · Comando ghostnexora'
install -m 0755 "${INSTALL_DIR}/scripts/termux/ghostnexora" "${PREFIX}/bin/ghostnexora"
chmod +x "${INSTALL_DIR}/scripts/update-termux.sh" 2>/dev/null || true
ok "Gestor instalado: ${PREFIX}/bin/ghostnexora"

section '7/7 · Vinculación y arranque'
SESSION_CREDS="${STATE_DIR}/session/creds.json"
REGISTERED=false
if [[ -f "${SESSION_CREDS}" ]]; then
  REGISTERED="$(node -e "try{const x=require(process.argv[1]);process.stdout.write(String(Boolean(x.registered)))}catch{process.stdout.write('false')}" "${SESSION_CREDS}" 2>/dev/null || echo false)"
fi

if [[ "${REGISTERED}" != 'true' && -r /dev/tty ]]; then
  PHONE=''
  printf 'Número principal de WhatsApp con código de país (Enter para vincular después): ' >/dev/tty
  IFS= read -r PHONE </dev/tty || true
  PHONE="$(printf '%s' "${PHONE}" | tr -cd '0-9')"
  if [[ -n "${PHONE}" ]]; then
    CURRENT_OWNERS="$(grep '^OWNER_NUMBERS=' .env | cut -d= -f2- || true)"
    [[ -n "${CURRENT_OWNERS}" ]] || set_env OWNER_NUMBERS "${PHONE}"
    env \
      ENV_FILE="${INSTALL_DIR}/.env" \
      NEXORA_RUNTIME_PROFILE=termux-lite \
      OLLAMA_ENABLED=false \
      PAIRING_NUMBER="${PHONE}" \
      npm run termux:pair --workspace=@ghostnexora/bot || warn 'La vinculación no terminó. Repite con: ghostnexora pair 52XXXXXXXXXX'
  fi
fi

ghostnexora start || warn 'El bot no pudo arrancar. Ejecuta ghostnexora logs para revisar el motivo.'

ELAPSED=$(( $(date +%s) - START_TS ))
printf '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
printf ' Ghost Nexora Bot · Termux Lite listo\n'
printf '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
printf ' Tiempo: %ss\n' "${ELAPSED}"
printf ' Perfil: termux-lite\n'
printf ' Runtime: JavaScript compilado Lite\n'
printf ' LLM/Ollama: desactivado\n'
printf ' Subbots: habilitados\n'
printf ' Panel web/Nginx/systemd: no incluidos\n\n'
printf ' Comandos:\n'
printf '   ghostnexora status\n'
printf '   ghostnexora logs\n'
printf '   ghostnexora pair 52XXXXXXXXXX\n'
printf '   ghostnexora restart\n'
printf '   ghostnexora update\n'
printf '   ghostnexora doctor\n\n'
printf ' Para evitar que Android suspenda Termux, opcionalmente instala Termux:API\n'
printf ' y usa: ghostnexora wakelock on\n'
