#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail

BRANCH="${BRANCH:-main}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/GhostNexoraBot}"
STATE_DIR="${STATE_DIR:-$HOME/.ghostnexora}"
ENV_FILE="${INSTALL_DIR}/.env"
START_TS="$(date +%s)"

info() { printf '[%s] [INFO] %s\n' "$(date '+%H:%M:%S')" "$*"; }
ok() { printf '[%s] [ OK ] %s\n' "$(date '+%H:%M:%S')" "$*"; }
warn() { printf '[%s] [WARN] %s\n' "$(date '+%H:%M:%S')" "$*" >&2; }
fail() { printf '[%s] [FAIL] %s\n' "$(date '+%H:%M:%S')" "$*" >&2; exit 1; }
section() { printf '\n[%s] ===== %s =====\n' "$(date '+%H:%M:%S')" "$*"; }

if [[ -z "${PREFIX:-}" ]] || ! command -v pkg >/dev/null 2>&1; then fail 'Este actualizador es exclusivo para Termux.'; fi
if [[ ! -d "${INSTALL_DIR}/.git" ]]; then fail "No existe un repositorio válido en ${INSTALL_DIR}."; fi
if [[ ! -f "${ENV_FILE}" ]]; then fail "Falta ${ENV_FILE}."; fi

cd "${INSTALL_DIR}"
OLD_SHA="$(git rev-parse HEAD)"
WAS_RUNNING=0
if command -v ghostnexora >/dev/null 2>&1 && [[ -f "${STATE_DIR}/run/bot.pid" ]]; then
  PID="$(cat "${STATE_DIR}/run/bot.pid" 2>/dev/null || true)"
  if [[ "${PID}" =~ ^[0-9]+$ ]] && kill -0 "${PID}" 2>/dev/null; then WAS_RUNNING=1; fi
fi

section 'Ghost Nexora Bot · ACTUALIZACIÓN TERMUX LITE'
info "Versión anterior: ${OLD_SHA:0:12}"
info "Rama: ${BRANCH}"
info "Sesión persistente: ${STATE_DIR}/session"
info "Datos persistentes: ${STATE_DIR}/data"

section '1/5 · Detener proceso'
if [[ "${WAS_RUNNING}" -eq 1 ]]; then ghostnexora stop; else info 'El bot ya estaba detenido.'; fi

section '2/5 · Código'
git fetch origin "${BRANCH}"
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"
NEW_SHA="$(git rev-parse HEAD)"
ok "Código actualizado: ${NEW_SHA:0:12}"

section '3/5 · Perfil, dependencias y build Lite'
set_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "${ENV_FILE}"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "${ENV_FILE}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${ENV_FILE}"
  fi
}
set_env NEXORA_RUNTIME_PROFILE 'termux-lite'
set_env OLLAMA_ENABLED 'false'
set_env TELEGRAM_BOT_TOKEN ''
set_env TELEGRAM_CHANNEL_ID ''
set_env TELEGRAM_CHANNEL_URL ''
chmod 600 "${ENV_FILE}"

export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
npm install --workspace=@ghostnexora/bot --include=dev --omit=optional >/tmp/ghostnexora-termux-update-npm.log 2>&1 || {
  warn 'npm install falló. Últimas líneas:'
  tail -n 60 /tmp/ghostnexora-termux-update-npm.log >&2 || true
  exit 1
}
npm run build:termux --workspace=@ghostnexora/bot >/tmp/ghostnexora-termux-update-build.log 2>&1 || {
  warn 'El build Termux Lite falló. Últimas líneas:'
  tail -n 80 /tmp/ghostnexora-termux-update-build.log >&2 || true
  exit 1
}
ok 'Dependencias Lite sincronizadas sin Sharp/Playwright y runtime recompilado.'

if command -v yt-dlp >/dev/null 2>&1; then
  if pkg list-installed 2>/dev/null | grep -q '^yt-dlp/'; then
    pkg upgrade -y yt-dlp >/dev/null 2>&1 || true
  else
    python -m pip install --upgrade yt-dlp >/dev/null 2>&1 || true
  fi
elif ! pkg install -y yt-dlp >/dev/null 2>&1; then
  python -m pip install --upgrade yt-dlp >/dev/null 2>&1 || warn 'No se pudo instalar yt-dlp durante la actualización.'
fi

section '4/5 · Gestor Termux'
install -m 0755 "${INSTALL_DIR}/scripts/termux/ghostnexora" "${PREFIX}/bin/ghostnexora"
chmod +x "${INSTALL_DIR}/scripts/update-termux.sh"
ok 'Comando ghostnexora actualizado.'

section '5/5 · Arranque'
if [[ "${WAS_RUNNING}" -eq 1 ]]; then
  ghostnexora start
  ok 'Bot reiniciado con la nueva versión.'
else
  info 'El bot estaba detenido antes de actualizar; se conserva detenido.'
fi

ELAPSED=$(( $(date +%s) - START_TS ))
printf '\nActualización Termux Lite finalizada en %ss.\n' "${ELAPSED}"
printf 'Anterior: %s\n' "${OLD_SHA:0:12}"
printf 'Actual : %s\n' "${NEW_SHA:0:12}"
printf 'Runtime: JavaScript compilado Lite.\n'
printf 'Sharp/Playwright: omitidos.\n'
printf 'Sesión y datos: conservados.\n'
