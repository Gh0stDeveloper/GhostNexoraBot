#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/ghost-nexora-bot}"
BRANCH="${BRANCH:-main}"
SERVICE_USER="${SERVICE_USER:-}"
STATE_DIR="${STATE_DIR:-/var/lib/ghost-nexora-bot}"
START_TS=$(date +%s)
LLM_SERVICE="ghost-nexora-llm.service"
LLM_INSTALLER="${INSTALL_DIR}/scripts/install-llm-worker-service.sh"
# Default LLM state path matches bot config DATA_DIR under STATE_DIR when using install.sh layout.
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

find_llm_state() {
  local candidate
  for candidate in "${LLM_STATE_CANDIDATES[@]}"; do
    if [[ -f "${candidate}" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done
  # Fallback: search under STATE_DIR / INSTALL_DIR (depth limited).
  local found
  found="$(find "${STATE_DIR}" "${INSTALL_DIR}" -maxdepth 5 -type f -name state.json -path '*/llm/state.json' 2>/dev/null | head -n 1 || true)"
  if [[ -n "${found}" ]]; then
    printf '%s\n' "${found}"
    return 0
  fi
  return 1
}

# Returns 0 if mini-LLM reports an active training run that must not be killed.
llm_training_active() {
  local state_file learning progress message
  state_file="$(find_llm_state 2>/dev/null || true)"
  if [[ -z "${state_file}" || ! -f "${state_file}" ]]; then
    return 1
  fi

  # Prefer node for reliable JSON; fall back to simple grep.
  if command -v node >/dev/null 2>&1; then
    node -e '
      const fs = require("fs");
      const s = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const learning = s.learning === true;
      const progress = Number(s.currentProgress || 0);
      const msg = String(s.currentMessage || "");
      const busyMsg = /entren|época|epoca|checkpoint|preparando vuelta|pasos/i.test(msg);
      const active = learning || (progress > 0 && progress < 100 && busyMsg);
      process.exit(active ? 0 : 1);
    ' "${state_file}" && return 0
    return 1
  fi

  learning="$(grep -oE '"learning"[[:space:]]*:[[:space:]]*(true|false)' "${state_file}" 2>/dev/null | tail -n1 || true)"
  if [[ "${learning}" == *true* ]]; then
    return 0
  fi
  return 1
}

section 'Ghost Nexora Bot · ACTUALIZACIÓN'
info "Rama: ${BRANCH}"
info "Usuario de servicios: ${SERVICE_USER}"
info "Versión anterior: ${OLD_SHA:0:12}"
info "Datos persistentes: ${STATE_DIR}"

LLM_BUSY=0
if llm_training_active; then
  LLM_BUSY=1
  LLM_STATE_PATH="$(find_llm_state 2>/dev/null || echo desconocido)"
  warn "Entrenamiento LLM activo detectado (${LLM_STATE_PATH})."
  warn 'El servicio ghost-nexora-llm NO se reiniciará para no interrumpir el progreso.'
  if command -v node >/dev/null 2>&1 && [[ -f "${LLM_STATE_PATH}" ]]; then
    node -e '
      const s = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      console.log(`[INFO] Progreso: ${s.currentProgress ?? "?"}% · paso ${s.currentStep ?? "?"}/${s.currentTotalSteps ?? "?"} · ${s.currentMessage ?? ""}`);
    ' "${LLM_STATE_PATH}" 2>/dev/null || true
  fi
else
  info 'No se detectó entrenamiento LLM en curso.'
fi

section '1/6 · Código'
git fetch origin "${BRANCH}"
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"
NEW_SHA="$(git rev-parse HEAD)"
ok "Código actualizado: ${NEW_SHA:0:12}"

section '2/6 · Herramientas'
if command -v yt-dlp >/dev/null 2>&1; then
  yt-dlp -U >/tmp/ghost-nexora-ytdlp-update.log 2>&1 || true
  ok "yt-dlp: $(yt-dlp --version 2>/dev/null || echo desconocido)"
fi

section '3/6 · Dependencias Node'
npm install >/tmp/ghost-nexora-npm-install.log 2>&1
ok 'Dependencias sincronizadas.'

section '4/6 · Build'
npm run build >/tmp/ghost-nexora-build.log 2>&1
ok 'Build completado.'

section '5/6 · Servicios y permisos'
if [[ -d "${STATE_DIR}" ]]; then
  chown -R "${SERVICE_USER}:${SERVICE_USER}" "${STATE_DIR}" || warn 'No se pudo ajustar STATE_DIR.'
fi
chmod 0640 "${INSTALL_DIR}/.env" 2>/dev/null || true

# Install / refresh unit file without forcing a restart when training is active.
if [[ -f "${LLM_INSTALLER}" ]]; then
  chmod +x "${LLM_INSTALLER}"
  if [[ "${LLM_BUSY}" -eq 1 ]]; then
    INSTALL_DIR="${INSTALL_DIR}" SERVICE_USER="${SERVICE_USER}" SKIP_LLM_RESTART=1 bash "${LLM_INSTALLER}"
    ok 'Unidad LLM actualizada en disco; reinicio omitido (entrenamiento activo).'
  else
    INSTALL_DIR="${INSTALL_DIR}" SERVICE_USER="${SERVICE_USER}" bash "${LLM_INSTALLER}"
    ok 'Unidad del worker LLM configurada y reiniciada.'
  fi
elif ! systemctl cat "${LLM_SERVICE}" >/dev/null 2>&1; then
  cat > "/etc/systemd/system/${LLM_SERVICE}" <<EOF
[Unit]
Description=Ghost Nexora LLM Worker
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}
Environment=NODE_ENV=production
ExecStart=/usr/bin/env npm --prefix ${INSTALL_DIR} run llm:worker --workspace=@ghostnexora/bot
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable "${LLM_SERVICE}"
  if [[ "${LLM_BUSY}" -eq 0 ]]; then
    systemctl restart "${LLM_SERVICE}" || true
  fi
  ok 'Unidad del worker LLM creada.'
else
  ok 'Unidad LLM ya existía.'
fi

section '6/6 · Reinicio bot/web (LLM protegido si entrena)'
systemctl daemon-reload

# Always restart bot + web. Never kill an active training process.
systemctl restart ghost-nexora-bot.service ghost-nexora-web.service

if [[ "${LLM_BUSY}" -eq 1 ]]; then
  warn "Omitiendo restart de ${LLM_SERVICE} (entrenamiento en curso)."
  if systemctl is-active --quiet "${LLM_SERVICE}"; then
    ok "${LLM_SERVICE} sigue active sin reinicio."
  else
    warn "${LLM_SERVICE} no está active. El entrenamiento pudo haberse caído antes de esta actualización."
    warn 'No se fuerza restart automático para no corromper un posible checkpoint a medias; revisa journalctl -u ghost-nexora-llm.'
  fi
else
  systemctl restart "${LLM_SERVICE}"
  ok "${LLM_SERVICE} reiniciado (sin entrenamiento activo)."
fi

sleep 3
BOT_STATE="$(systemctl is-active ghost-nexora-bot.service || true)"
WEB_STATE="$(systemctl is-active ghost-nexora-web.service || true)"
LLM_STATE="$(systemctl is-active "${LLM_SERVICE}" || true)"

if [[ "${BOT_STATE}" != 'active' ]]; then
  sleep 4
  BOT_STATE="$(systemctl is-active ghost-nexora-bot.service || true)"
fi

if [[ "${BOT_STATE}" != 'active' ]]; then
  fail 'ghost-nexora-bot no quedó active.'
  systemctl --no-pager --full status ghost-nexora-bot.service || true
  journalctl -u ghost-nexora-bot.service -n 80 --no-pager -o short-precise || true
  exit 1
fi

if [[ "${LLM_BUSY}" -eq 0 && "${LLM_STATE}" != 'active' ]]; then
  sleep 4
  LLM_STATE="$(systemctl is-active "${LLM_SERVICE}" || true)"
  if [[ "${LLM_STATE}" != 'active' ]]; then
    fail 'ghost-nexora-llm no quedó active.'
    systemctl --no-pager --full status "${LLM_SERVICE}" || true
    journalctl -u "${LLM_SERVICE}" -n 80 --no-pager -o short-precise || true
    exit 1
  fi
fi

if [[ "${WEB_STATE}" != 'active' ]]; then warn 'ghost-nexora-web no quedó active.'; fi

ELAPSED=$(( $(date +%s) - START_TS ))
if [[ "${LLM_BUSY}" -eq 1 ]]; then
  ok "Actualización finalizada en ${ELAPSED}s. Bot=${BOT_STATE}, Web=${WEB_STATE}, LLM=${LLM_STATE} (entrenamiento preservado, sin reinicio)."
else
  ok "Actualización finalizada en ${ELAPSED}s. Bot=${BOT_STATE}, Web=${WEB_STATE}, LLM=${LLM_STATE}."
fi
