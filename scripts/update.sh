#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/ghost-nexora-bot}"
BRANCH="${BRANCH:-main}"
SERVICE_USER="${SERVICE_USER:-ghostbot}"
START_TS=$(date +%s)

info() { printf '[%s] [INFO] %s\n' "$(date '+%H:%M:%S')" "$*"; }
ok() { printf '[%s] [ OK ] %s\n' "$(date '+%H:%M:%S')" "$*"; }
warn() { printf '[%s] [WARN] %s\n' "$(date '+%H:%M:%S')" "$*" >&2; }
fail() { printf '[%s] [FAIL] %s\n' "$(date '+%H:%M:%S')" "$*" >&2; }
section() { printf '\n[%s] ===== %s =====\n' "$(date '+%H:%M:%S')" "$*"; }
trap 'status=$?; fail "La actualización falló en la línea ${LINENO} (exit ${status}). Revisa npm y el log anterior."; exit ${status}' ERR

if [[ "${EUID}" -ne 0 ]]; then fail 'Ejecuta este script con sudo/root.'; exit 1; fi
if [[ ! -d "${INSTALL_DIR}/.git" ]]; then fail "No existe un repositorio Git válido en ${INSTALL_DIR}. Usa install.sh primero."; exit 1; fi

cd "${INSTALL_DIR}"
OLD_SHA="$(git rev-parse HEAD)"

section 'Ghost Nexora Bot · ACTUALIZACIÓN'
info "Rama: ${BRANCH}"
info "Versión anterior: ${OLD_SHA:0:12}"
info "Datos persistentes: ${STATE_DIR:-/var/lib/ghost-nexora-bot}"

section '1/6 · Código'
git fetch origin "${BRANCH}"
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"
NEW_SHA="$(git rev-parse HEAD)"
if [[ "${OLD_SHA}" == "${NEW_SHA}" ]]; then
  ok "Ya estabas actualizado (${NEW_SHA:0:12})."
else
  ok "Código actualizado: ${NEW_SHA:0:12}"
fi

section '2/6 · Herramientas'
if command -v yt-dlp >/dev/null 2>&1; then
  yt-dlp -U >/tmp/ghost-nexora-ytdlp-update.log 2>&1 || warn 'yt-dlp no pudo actualizarse; se conserva la versión actual.'
  ok "yt-dlp: $(yt-dlp --version 2>/dev/null || echo desconocido)"
fi
if ! command -v webpmux >/dev/null 2>&1 || ! command -v zip >/dev/null 2>&1 || ! command -v unzip >/dev/null 2>&1; then
  info 'Instalando herramientas auxiliares faltantes...'
  apt-get update >/tmp/ghost-nexora-apt-update.log
  apt-get install -y webp zip unzip >/tmp/ghost-nexora-apt-install.log
  ok 'Herramientas auxiliares instaladas.'
else
  ok 'Herramientas auxiliares disponibles.'
fi

section '3/6 · Dependencias Node'
info 'npm install...'
npm install >/tmp/ghost-nexora-npm-install.log 2>&1
ok 'Dependencias sincronizadas.'

section '4/6 · Build'
info 'Compilando producción...'
npm run build >/tmp/ghost-nexora-build.log 2>&1
ok 'Build completado.'

section '5/6 · Permisos persistentes'
if id "${SERVICE_USER}" >/dev/null 2>&1 && [[ -d "${STATE_DIR:-/var/lib/ghost-nexora-bot}" ]]; then
  chown -R "${SERVICE_USER}:${SERVICE_USER}" "${STATE_DIR:-/var/lib/ghost-nexora-bot}"
  chmod 0640 "${INSTALL_DIR}/.env" 2>/dev/null || true
  ok 'Propietario/permisos de datos verificados.'
fi

section '6/6 · Reinicio y health check'
systemctl restart ghost-nexora-bot.service ghost-nexora-web.service
sleep 3
BOT_STATE="$(systemctl is-active ghost-nexora-bot.service || true)"
WEB_STATE="$(systemctl is-active ghost-nexora-web.service || true)"
if [[ "${BOT_STATE}" != 'active' ]]; then
  sleep 4
  BOT_STATE="$(systemctl is-active ghost-nexora-bot.service || true)"
fi
if [[ "${BOT_STATE}" != 'active' ]]; then
  fail 'ghost-nexora-bot no quedó active.'
  systemctl --no-pager --full status ghost-nexora-bot.service || true
  printf '\n----- ÚLTIMOS LOGS DEL BOT -----\n'
  journalctl -u ghost-nexora-bot.service -n 80 --no-pager -o short-precise || true
  printf '%s\n' '----- FIN DE LOGS -----'
  exit 1
fi
if [[ "${WEB_STATE}" != 'active' ]]; then warn 'ghost-nexora-web no quedó active; revisa su estado.'; fi
ok "Bot: ${BOT_STATE}"
ok "Web: ${WEB_STATE}"

HEALTH_URL="$(grep '^BOT_HEALTH_URL=' .env | cut -d= -f2- || true)"
if [[ -n "${HEALTH_URL}" ]] && command -v curl >/dev/null 2>&1; then
  if curl -fsS --max-time 8 "${HEALTH_URL}" >/tmp/ghost-nexora-health.json; then
    ok "Health endpoint respondió correctamente."
  else
    warn "Health endpoint no respondió todavía; revisa: ${HEALTH_URL}"
  fi
fi

printf '\n╔══════════════════════════════════════════════════╗\n'
printf '║        GHOST NEXORA · ACTUALIZACIÓN OK          ║\n'
printf '╚══════════════════════════════════════════════════╝\n'
printf 'Versión anterior : %s\n' "${OLD_SHA:0:12}"
printf 'Versión actual   : %s\n' "${NEW_SHA:0:12}"
printf 'Bot              : %s\n' "${BOT_STATE}"
printf 'Web              : %s\n' "${WEB_STATE}"
printf 'Tiempo           : %ss\n' "$(( $(date +%s) - START_TS ))"
printf 'Datos preservados: SQLite, sesión, .env y STATE_DIR\n'
printf 'Logs             : journalctl -u ghost-nexora-bot -f\n'
printf '══════════════════════════════════════════════════\n'
