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
INSTALL_OLLAMA="${INSTALL_OLLAMA:-ask}"
OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2.5:1.5b}"
START_TS=$(date +%s)
FIRST_INSTALL=true
[[ -d "${INSTALL_DIR}/.git" ]] && FIRST_INSTALL=false

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
info "Tipo: $([[ "${FIRST_INSTALL}" == true ]] && echo 'primera instalación' || echo 'actualización/reinstalación')"

if [[ "${WEB_PORT}" == "${BOT_HEALTH_PORT}" ]]; then fail 'WEB_PORT y BOT_HEALTH_PORT deben ser diferentes.'; exit 1; fi
for port in "${WEB_PORT}" "${BOT_HEALTH_PORT}"; do
  if ! [[ "${port}" =~ ^[0-9]+$ ]] || (( port < 1 || port > 65535 )); then fail "Puerto interno inválido: ${port}"; exit 1; fi
done

export DEBIAN_FRONTEND=noninteractive

section '1/10 · Dependencias del sistema'
apt-get update >/tmp/ghost-nexora-apt-update.log
apt-get install -y ca-certificates curl git ffmpeg webp zip build-essential util-linux nginx unzip python3 >/tmp/ghost-nexora-apt-install.log
ok 'Dependencias base instaladas.'

section '2/10 · Node.js y yt-dlp'
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

section '3/10 · Usuario y almacenamiento persistente'
if ! id "${SERVICE_USER}" >/dev/null 2>&1; then
  useradd --system --home-dir "${STATE_DIR}" --create-home --shell /usr/sbin/nologin "${SERVICE_USER}"
fi
install -d -m 0750 -o "${SERVICE_USER}" -g "${SERVICE_USER}" "${STATE_DIR}" "${STATE_DIR}/session" "${STATE_DIR}/data" "${STATE_DIR}/data/subbots"
ok 'Almacenamiento persistente preparado.'

section '4/10 · Código y configuración'
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

env_truthy() {
  case "${1,,}" in 1|true|yes|on|si|sí) return 0 ;; *) return 1 ;; esac
}

set_env NEXORA_RUNTIME_PROFILE "full"
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
ok '.env base configurado.'

section '5/10 · Ollama + Qwen opcional'
normalize_choice() {
  case "${1,,}" in
    y|yes|s|si|sí|true|1|on) printf 'yes' ;;
    n|no|false|0|off) printf 'no' ;;
    *) printf 'ask' ;;
  esac
}

OLLAMA_CHOICE="$(normalize_choice "${INSTALL_OLLAMA}")"
if [[ "${FIRST_INSTALL}" == true ]]; then
  if [[ "${OLLAMA_CHOICE}" == "ask" ]]; then
    if [[ -r /dev/tty ]]; then
      printf '\nOllama es OPCIONAL y consume RAM, almacenamiento y CPU.\n' >/dev/tty
      printf 'Modelo recomendado: %s\n' "${OLLAMA_MODEL}" >/dev/tty
      printf '¿Instalar Ollama + Qwen para LLM local? [s/N]: ' >/dev/tty
      ANSWER=''
      IFS= read -r ANSWER </dev/tty || true
      OLLAMA_CHOICE="$(normalize_choice "${ANSWER}")"
      [[ "${OLLAMA_CHOICE}" == "ask" ]] && OLLAMA_CHOICE='no'
    else
      OLLAMA_CHOICE='no'
      warn 'Terminal interactiva no disponible; Ollama se omite. Puedes instalarlo después.'
    fi
  fi

  if [[ "${OLLAMA_CHOICE}" == "yes" ]]; then
    info "Instalando Ollama y descargando ${OLLAMA_MODEL}…"
    if bash "${INSTALL_DIR}/scripts/install-ollama.sh" "${OLLAMA_MODEL}" >/tmp/ghost-nexora-ollama.log 2>&1; then
      set_env OLLAMA_ENABLED "true"
      set_env OLLAMA_MODEL "${OLLAMA_MODEL}"
      ok "Ollama + ${OLLAMA_MODEL} instalados y habilitados."
    else
      set_env OLLAMA_ENABLED "false"
      warn 'Ollama no pudo instalarse. El bot continuará sin LLM local.'
      warn 'Detalle: /tmp/ghost-nexora-ollama.log'
    fi
  else
    set_env OLLAMA_ENABLED "false"
    set_env OLLAMA_MODEL "${OLLAMA_MODEL}"
    ok 'Ollama omitido por elección del usuario. El bot funcionará normalmente sin LLM local.'
  fi
else
  CURRENT_OLLAMA_ENABLED="$(grep '^OLLAMA_ENABLED=' .env | cut -d= -f2- | tr '[:upper:]' '[:lower:]' || true)"
  if env_truthy "${CURRENT_OLLAMA_ENABLED}" && ! command -v ollama >/dev/null 2>&1; then
    set_env OLLAMA_ENABLED "false"
    warn 'OLLAMA_ENABLED estaba activo pero Ollama no existe en el sistema; se desactivó para ocultar los comandos LLM locales.'
  else
    info 'Instalación existente: se conserva la decisión actual sobre Ollama.'
  fi
fi

chown root:"${SERVICE_USER}" .env
chmod 0640 .env
ok '.env protegido.'

section '6/10 · Dependencias Node'
npm install >/tmp/ghost-nexora-npm-install.log 2>&1
ok 'Dependencias Node instaladas.'

section '7/10 · Build de producción'
npm run build >/tmp/ghost-nexora-build.log 2>&1
ok 'Build de producción completado.'
install -d -m 0750 -o "${SERVICE_USER}" -g "${SERVICE_USER}" "${INSTALL_DIR}/apps/web/.next/cache"

section '8/10 · Systemd y worker LLM opcional'
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
ok 'Unidades principales systemd instaladas.'

OLLAMA_FINAL="$(grep '^OLLAMA_ENABLED=' .env | tail -n1 | cut -d= -f2- || echo false)"
if env_truthy "${OLLAMA_FINAL}" && command -v ollama >/dev/null 2>&1; then
  if [[ -f "${INSTALL_DIR}/scripts/install-llm-worker-service.sh" ]]; then
    chmod +x "${INSTALL_DIR}/scripts/install-llm-worker-service.sh"
    INSTALL_DIR="${INSTALL_DIR}" SERVICE_USER="${SERVICE_USER}" bash "${INSTALL_DIR}/scripts/install-llm-worker-service.sh"
    ok 'Worker LLM instalado porque Ollama está habilitado.'
  else
    warn 'Ollama está habilitado, pero no se encontró install-llm-worker-service.sh.'
  fi
else
  set_env OLLAMA_ENABLED 'false'
  systemctl disable --now ghost-nexora-llm.service >/dev/null 2>&1 || true
  ok 'Worker LLM omitido/deshabilitado. Los comandos Ollama/Mini-LLM/free-chat no se registrarán.'
fi
chown root:"${SERVICE_USER}" .env
chmod 0640 .env

section '9/10 · Vinculación WhatsApp'
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
    chown root:"${SERVICE_USER}" .env
    chmod 0640 .env
    runuser -u "${SERVICE_USER}" -- env ENV_FILE="${INSTALL_DIR}/.env" PAIRING_NUMBER="${PHONE}" npm --prefix "${INSTALL_DIR}" run pair || warn 'La vinculación no terminó; puedes repetirla después.'
  fi
else
  ok 'Sesión WhatsApp existente detectada; no se volvió a vincular.'
fi

section '10/10 · Servicios, proxy y Nginx'
systemctl enable --now ghost-nexora-bot.service ghost-nexora-web.service nginx
ok 'Servicios principales habilitados y arrancados.'

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

OLLAMA_FINAL="$(grep '^OLLAMA_ENABLED=' .env | tail -n1 | cut -d= -f2- || echo false)"
printf '\nGhost Nexora Bot instalado. Código: %s\n' "$(git rev-parse --short HEAD)"
printf 'Ollama/LLM local: %s\n' "${OLLAMA_FINAL}"
printf 'Proxy: https://${BOT_DOMAIN:-ghostnexorabot.duckdns.org}/proxy\n'
printf 'Health: http://127.0.0.1:${BOT_HEALTH_PORT}/health\n'
