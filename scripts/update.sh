#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/ghost-nexora-bot}"
BRANCH="${BRANCH:-main}"
SERVICE_USER="${SERVICE_USER:-}"
STATE_DIR="${STATE_DIR:-/var/lib/ghost-nexora-bot}"
START_TS=$(date +%s)
LLM_SERVICE="ghost-nexora-llm.service"
LLM_INSTALLER="${INSTALL_DIR}/scripts/install-llm-worker-service.sh"
BROWSER_PROXY_INSTALLER="${INSTALL_DIR}/scripts/install-browser-proxy.sh"
LLM_STATE_CANDIDATES=(
  "${STATE_DIR}/llm/state.json"
  "${INSTALL_DIR}/data/llm/state.json"
  "${INSTALL_DIR}/apps/bot/data/llm/state.json"
)

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
if [[ -z "${SERVICE_USER}" ]]; then
  SERVICE_USER="$(systemctl show -p User --value ghost-nexora-bot.service 2>/dev/null || true)"
  [[ -z "${SERVICE_USER}" ]] && SERVICE_USER="root"
fi

set_env() {
  local key="$1" value="$2"
  [[ -f .env ]] || cp .env.example .env
  if grep -q "^${key}=" .env; then sed -i "s|^${key}=.*|${key}=${value}|" .env; else printf '%s=%s\n' "${key}" "${value}" >> .env; fi
}

env_truthy() {
  case "${1,,}" in 1|true|yes|on|si|sí) return 0 ;; *) return 1 ;; esac
}

refresh_llm_enabled() {
  local configured model
  configured="$(grep '^OLLAMA_ENABLED=' .env 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
  model="$(grep '^OLLAMA_MODEL=' .env 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
  [[ -n "${model}" ]] || model='qwen2.5:1.5b'
  LLM_ENABLED=0
  if env_truthy "${configured}"; then
    if ! command -v ollama >/dev/null 2>&1; then
      set_env OLLAMA_ENABLED 'false'
      warn 'OLLAMA_ENABLED=true pero Ollama no está instalado. Se desactivó el LLM local y sus comandos quedarán ocultos.'
      return
    fi
    LLM_ENABLED=1
    if systemctl list-unit-files ollama.service >/dev/null 2>&1; then
      systemctl enable --now ollama.service >/dev/null 2>&1 || warn 'No se pudo iniciar ollama.service automáticamente.'
    fi
    info "LLM local habilitado · modelo ${model}."
  else
    info 'LLM local deshabilitado por configuración; no se instalará ni arrancará su worker.'
  fi
}

find_llm_state() {
  local candidate
  for candidate in "${LLM_STATE_CANDIDATES[@]}"; do
    if [[ -f "${candidate}" ]]; then printf '%s\n' "${candidate}"; return 0; fi
  done
  local found
  found="$(find "${STATE_DIR}" "${INSTALL_DIR}" -maxdepth 5 -type f -name state.json -path '*/llm/state.json' 2>/dev/null | head -n 1 || true)"
  if [[ -n "${found}" ]]; then printf '%s\n' "${found}"; return 0; fi
  return 1
}

llm_training_active() {
  local state_file learning
  state_file="$(find_llm_state 2>/dev/null || true)"
  if [[ -z "${state_file}" || ! -f "${state_file}" ]]; then return 1; fi
  if command -v node >/dev/null 2>&1; then
    node -e '
      const fs = require("fs");
      const s = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const learning = s.learning === true;
      const progress = Number(s.currentProgress || 0);
      const msg = String(s.currentMessage || "");
      const busyMsg = /entren|época|epoca|checkpoint|preparando vuelta|pasos/i.test(msg);
      process.exit(learning || (progress > 0 && progress < 100 && busyMsg) ? 0 : 1);
    ' "${state_file}" && return 0
    return 1
  fi
  learning="$(grep -oE '"learning"[[:space:]]*:[[:space:]]*(true|false)' "${state_file}" 2>/dev/null | tail -n1 || true)"
  [[ "${learning}" == *true* ]]
}

section 'Ghost Nexora Bot · ACTUALIZACIÓN'
info "Rama: ${BRANCH}"
info "Usuario de servicios: ${SERVICE_USER}"
info "Versión anterior: ${OLD_SHA:0:12}"
info "Datos persistentes: ${STATE_DIR}"

section '1/7 · Código'
git fetch origin "${BRANCH}"
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"
NEW_SHA="$(git rev-parse HEAD)"
ok "Código actualizado: ${NEW_SHA:0:12}"

refresh_llm_enabled
LLM_BUSY=0
if [[ "${LLM_ENABLED}" -eq 1 ]] && llm_training_active; then
  LLM_BUSY=1
  LLM_STATE_PATH="$(find_llm_state 2>/dev/null || echo desconocido)"
  warn "Entrenamiento LLM activo detectado (${LLM_STATE_PATH})."
  warn 'El worker LLM no se reiniciará para preservar el progreso.'
else
  if [[ "${LLM_ENABLED}" -eq 1 ]]; then info 'No se detectó entrenamiento LLM en curso.'; fi
fi

section '2/7 · Herramientas'
if command -v yt-dlp >/dev/null 2>&1; then
  yt-dlp -U >/tmp/ghost-nexora-ytdlp-update.log 2>&1 || true
  ok "yt-dlp: $(yt-dlp --version 2>/dev/null || echo desconocido)"
fi

section '3/7 · Dependencias Node'
npm install >/tmp/ghost-nexora-npm-install.log 2>&1
ok 'Dependencias sincronizadas.'

section '4/7 · Build'
npm run build >/tmp/ghost-nexora-build.log 2>&1
ok 'Build completado.'

section '5/7 · Proxy de navegador y Nginx'
if [[ -f "${BROWSER_PROXY_INSTALLER}" ]]; then
  chmod +x "${BROWSER_PROXY_INSTALLER}"
  INSTALL_DIR="${INSTALL_DIR}" bash "${BROWSER_PROXY_INSTALLER}"
  ok 'Proxy de navegador/Nginx verificado y configurado.'
else
  warn "No existe ${BROWSER_PROXY_INSTALLER}; se omite configuración del proxy."
fi

section '6/7 · Servicios y permisos'
if [[ -d "${STATE_DIR}" ]]; then chown -R "${SERVICE_USER}:${SERVICE_USER}" "${STATE_DIR}" || warn 'No se pudo ajustar STATE_DIR.'; fi
chmod 0640 "${INSTALL_DIR}/.env" 2>/dev/null || true

if [[ "${LLM_ENABLED}" -eq 1 ]]; then
  if [[ -f "${LLM_INSTALLER}" ]]; then
    chmod +x "${LLM_INSTALLER}"
    if [[ "${LLM_BUSY}" -eq 1 ]]; then
      INSTALL_DIR="${INSTALL_DIR}" SERVICE_USER="${SERVICE_USER}" SKIP_LLM_RESTART=1 bash "${LLM_INSTALLER}"
      ok 'Unidad LLM actualizada en disco; reinicio omitido por entrenamiento activo.'
    else
      INSTALL_DIR="${INSTALL_DIR}" SERVICE_USER="${SERVICE_USER}" bash "${LLM_INSTALLER}"
      ok 'Worker LLM configurado.'
    fi
  else
    warn "No existe ${LLM_INSTALLER}; no se pudo configurar el worker LLM."
  fi
else
  if systemctl cat "${LLM_SERVICE}" >/dev/null 2>&1; then
    systemctl disable --now "${LLM_SERVICE}" >/dev/null 2>&1 || true
    ok 'Worker LLM detenido y deshabilitado porque Ollama está desactivado.'
  fi
fi

section '7/7 · Reinicio de servicios'
systemctl daemon-reload
systemctl restart ghost-nexora-bot.service ghost-nexora-web.service

if [[ "${LLM_ENABLED}" -eq 1 ]]; then
  if [[ "${LLM_BUSY}" -eq 1 ]]; then
    warn "Omitiendo restart de ${LLM_SERVICE} (entrenamiento en curso)."
  else
    systemctl restart "${LLM_SERVICE}" || true
  fi
fi

sleep 3
BOT_STATE="$(systemctl is-active ghost-nexora-bot.service || true)"
WEB_STATE="$(systemctl is-active ghost-nexora-web.service || true)"
if [[ "${LLM_ENABLED}" -eq 1 ]]; then LLM_STATE="$(systemctl is-active "${LLM_SERVICE}" || true)"; else LLM_STATE='disabled'; fi

if [[ "${BOT_STATE}" != 'active' ]]; then sleep 4; BOT_STATE="$(systemctl is-active ghost-nexora-bot.service || true)"; fi
if [[ "${BOT_STATE}" != 'active' ]]; then
  fail 'ghost-nexora-bot no quedó active.'
  systemctl --no-pager --full status ghost-nexora-bot.service || true
  journalctl -u ghost-nexora-bot.service -n 80 --no-pager -o short-precise || true
  exit 1
fi

if [[ "${LLM_ENABLED}" -eq 1 && "${LLM_BUSY}" -eq 0 && "${LLM_STATE}" != 'active' ]]; then
  sleep 4
  LLM_STATE="$(systemctl is-active "${LLM_SERVICE}" || true)"
  if [[ "${LLM_STATE}" != 'active' ]]; then
    fail 'ghost-nexora-llm no quedó active pese a estar habilitado.'
    systemctl --no-pager --full status "${LLM_SERVICE}" || true
    journalctl -u "${LLM_SERVICE}" -n 80 --no-pager || true
    exit 1
  fi
fi

if [[ "${WEB_STATE}" != 'active' ]]; then warn 'ghost-nexora-web no quedó active.'; fi

ELAPSED=$(( $(date +%s) - START_TS ))
if [[ "${LLM_BUSY}" -eq 1 ]]; then
  ok "Actualización finalizada en ${ELAPSED}s. Bot=${BOT_STATE}, Web=${WEB_STATE}, LLM=${LLM_STATE} (entrenamiento preservado)."
else
  ok "Actualización finalizada en ${ELAPSED}s. Bot=${BOT_STATE}, Web=${WEB_STATE}, LLM=${LLM_STATE}."
fi
