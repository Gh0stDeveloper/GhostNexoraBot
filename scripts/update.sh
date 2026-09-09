#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/ghost-nexora-bot}"
BRANCH="${BRANCH:-main}"
SERVICE_USER="${SERVICE_USER:-}"
STATE_DIR="${STATE_DIR:-/var/lib/ghost-nexora-bot}"
START_TS=$(date +%s)
LLM_SERVICE="ghost-nexora-llm.service"
WEB_SERVICE="ghost-nexora-web.service"
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

refresh_web_enabled() {
  local configured
  configured="$(grep '^WEB_ENABLED=' .env 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
  WEB_ENABLED=0

  if [[ -z "${configured}" ]]; then
    # Compatibilidad: las instalaciones anteriores a WEB_ENABLED tenían la web
    # activa por defecto. Si detectamos servicio o build previo, la preservamos.
    if systemctl is-active --quiet "${WEB_SERVICE}" 2>/dev/null || systemctl is-enabled --quiet "${WEB_SERVICE}" 2>/dev/null || [[ -d "${INSTALL_DIR}/apps/web/.next" ]]; then
      configured='true'
      set_env WEB_ENABLED 'true'
      info 'Instalación heredada con dashboard detectado: WEB_ENABLED=true añadido automáticamente.'
    else
      configured='false'
      set_env WEB_ENABLED 'false'
      info 'No se detectó dashboard previo: WEB_ENABLED=false.'
    fi
  fi

  if env_truthy "${configured}"; then
    WEB_ENABLED=1
    info 'Dashboard web habilitado; se actualizará y reiniciará normalmente.'
  else
    info 'Dashboard web deshabilitado; se omitirán dependencias, build y servicio Next.js.'
  fi
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

section '1/8 · Código'
git fetch origin "${BRANCH}"
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"
NEW_SHA="$(git rev-parse HEAD)"
ok "Código actualizado: ${NEW_SHA:0:12}"

section '2/8 · Detectando componentes existentes'
refresh_web_enabled
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

section '3/8 · Herramientas'
if command -v yt-dlp >/dev/null 2>&1; then
  yt-dlp -U >/tmp/ghost-nexora-ytdlp-update.log 2>&1 || true
  ok "yt-dlp: $(yt-dlp --version 2>/dev/null || echo desconocido)"
fi

section '4/8 · Dependencias Node'
if [[ "${WEB_ENABLED}" -eq 1 ]]; then
  npm install >/tmp/ghost-nexora-npm-install.log 2>&1
  ok 'Dependencias Bot + Web sincronizadas.'
else
  npm install --workspace=@ghostnexora/bot --include=dev >/tmp/ghost-nexora-npm-install.log 2>&1
  ok 'Dependencias del Bot sincronizadas; Web omitida.'
fi

section '5/8 · Build'
if [[ "${WEB_ENABLED}" -eq 1 ]]; then
  npm run build >/tmp/ghost-nexora-build.log 2>&1
  ok 'Build Bot + Web completado.'
else
  npm run assets:waifus >/tmp/ghost-nexora-assets.log 2>&1
  npm run build --workspace=@ghostnexora/bot >/tmp/ghost-nexora-build.log 2>&1
  ok 'Build del Bot completado; Next.js omitido.'
fi

section '6/8 · Proxy de navegador y Nginx'
if [[ -f "${BROWSER_PROXY_INSTALLER}" ]]; then
  chmod +x "${BROWSER_PROXY_INSTALLER}"
  INSTALL_DIR="${INSTALL_DIR}" bash "${BROWSER_PROXY_INSTALLER}"
  ok 'Proxy de navegador/Nginx verificado y configurado.'
else
  warn "No existe ${BROWSER_PROXY_INSTALLER}; se omite configuración del proxy."
fi

section '7/8 · Servicios y permisos'
if [[ -d "${STATE_DIR}" ]]; then chown -R "${SERVICE_USER}:${SERVICE_USER}" "${STATE_DIR}" || warn 'No se pudo ajustar STATE_DIR.'; fi
chmod 0640 "${INSTALL_DIR}/.env" 2>/dev/null || true

# Mantener las unidades principales actualizadas sin forzar la web cuando está apagada.
if [[ -f systemd/ghost-nexora-bot.service ]]; then
  cp systemd/ghost-nexora-bot.service /etc/systemd/system/ghost-nexora-bot.service
  sed -i \
    -e "s|__INSTALL_DIR__|${INSTALL_DIR}|g" \
    -e "s|__STATE_DIR__|${STATE_DIR}|g" \
    -e "s|__SERVICE_USER__|${SERVICE_USER}|g" \
    /etc/systemd/system/ghost-nexora-bot.service
fi

if [[ "${WEB_ENABLED}" -eq 1 ]]; then
  if [[ -f systemd/ghost-nexora-web.service ]]; then
    cp systemd/ghost-nexora-web.service /etc/systemd/system/ghost-nexora-web.service
    WEB_PORT_VALUE="$(grep '^WEB_PORT=' .env | tail -n1 | cut -d= -f2- || echo 3000)"
    BOT_HEALTH_PORT_VALUE="$(grep '^BOT_HEALTH_PORT=' .env | tail -n1 | cut -d= -f2- || echo 3001)"
    sed -i \
      -e "s|__INSTALL_DIR__|${INSTALL_DIR}|g" \
      -e "s|__STATE_DIR__|${STATE_DIR}|g" \
      -e "s|__SERVICE_USER__|${SERVICE_USER}|g" \
      -e "s|__WEB_PORT__|${WEB_PORT_VALUE}|g" \
      -e "s|__BOT_HEALTH_PORT__|${BOT_HEALTH_PORT_VALUE}|g" \
      /etc/systemd/system/ghost-nexora-web.service
  fi
else
  systemctl disable --now "${WEB_SERVICE}" >/dev/null 2>&1 || true
  ok 'Dashboard Web permanece deshabilitado.'
fi

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

section '8/8 · Reinicio selectivo de servicios'
systemctl daemon-reload
systemctl enable ghost-nexora-bot.service >/dev/null 2>&1 || true
systemctl restart ghost-nexora-bot.service

if [[ "${WEB_ENABLED}" -eq 1 ]]; then
  systemctl enable ghost-nexora-web.service >/dev/null 2>&1 || true
  systemctl restart ghost-nexora-web.service
else
  systemctl disable --now ghost-nexora-web.service >/dev/null 2>&1 || true
fi

if [[ "${LLM_ENABLED}" -eq 1 ]]; then
  if [[ "${LLM_BUSY}" -eq 1 ]]; then
    warn "Omitiendo restart de ${LLM_SERVICE} (entrenamiento en curso)."
  else
    systemctl restart "${LLM_SERVICE}" || true
  fi
fi

sleep 3
BOT_STATE="$(systemctl is-active ghost-nexora-bot.service || true)"
if [[ "${WEB_ENABLED}" -eq 1 ]]; then WEB_STATE="$(systemctl is-active ghost-nexora-web.service || true)"; else WEB_STATE='disabled'; fi
if [[ "${LLM_ENABLED}" -eq 1 ]]; then LLM_STATE="$(systemctl is-active "${LLM_SERVICE}" || true)"; else LLM_STATE='disabled'; fi

if [[ "${BOT_STATE}" != 'active' ]]; then sleep 4; BOT_STATE="$(systemctl is-active ghost-nexora-bot.service || true)"; fi
if [[ "${BOT_STATE}" != 'active' ]]; then
  fail 'ghost-nexora-bot no quedó active.'
  systemctl --no-pager --full status ghost-nexora-bot.service || true
  journalctl -u ghost-nexora-bot.service -n 80 --no-pager -o short-precise || true
  exit 1
fi

if [[ "${WEB_ENABLED}" -eq 1 && "${WEB_STATE}" != 'active' ]]; then
  sleep 4
  WEB_STATE="$(systemctl is-active ghost-nexora-web.service || true)"
  if [[ "${WEB_STATE}" != 'active' ]]; then
    warn 'ghost-nexora-web no quedó active pese a estar habilitado.'
    systemctl --no-pager --full status ghost-nexora-web.service || true
  fi
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

ELAPSED=$(( $(date +%s) - START_TS ))
if [[ "${LLM_BUSY}" -eq 1 ]]; then
  ok "Actualización finalizada en ${ELAPSED}s. Bot=${BOT_STATE}, Web=${WEB_STATE}, LLM=${LLM_STATE} (entrenamiento preservado)."
else
  ok "Actualización finalizada en ${ELAPSED}s. Bot=${BOT_STATE}, Web=${WEB_STATE}, LLM=${LLM_STATE}."
fi
