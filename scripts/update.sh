#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/ghost-nexora-bot}"
BRANCH="${BRANCH:-main}"
SERVICE_USER="${SERVICE_USER:-}"
START_TS=$(date +%s)
LLM_SERVICE="ghost-nexora-llm.service"
LLM_INSTALLER="${INSTALL_DIR}/scripts/install-llm-worker-service.sh"

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

section 'Ghost Nexora Bot · ACTUALIZACIÓN'
info "Rama: ${BRANCH}"
info "Usuario de servicios: ${SERVICE_USER}"
info "Versión anterior: ${OLD_SHA:0:12}"
info "Datos persistentes: ${STATE_DIR:-/var/lib/ghost-nexora-bot}"

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
if [[ -d "${STATE_DIR:-/var/lib/ghost-nexora-bot}" ]]; then
  chown -R "${SERVICE_USER}:${SERVICE_USER}" "${STATE_DIR:-/var/lib/ghost-nexora-bot}" || warn 'No se pudo ajustar STATE_DIR.'
fi
chmod 0640 "${INSTALL_DIR}/.env" 2>/dev/null || true
if [[ -f "${LLM_INSTALLER}" ]]; then
  chmod +x "${LLM_INSTALLER}"
  INSTALL_DIR="${INSTALL_DIR}" SERVICE_USER="${SERVICE_USER}" bash "${LLM_INSTALLER}"
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
fi
ok 'Unidad del worker LLM configurada.'

section '6/6 · Reinicio y health check'
systemctl daemon-reload
systemctl restart ghost-nexora-bot.service ghost-nexora-web.service "${LLM_SERVICE}"
sleep 3
BOT_STATE="$(systemctl is-active ghost-nexora-bot.service || true)"
WEB_STATE="$(systemctl is-active ghost-nexora-web.service || true)"
LLM_STATE="$(systemctl is-active "${LLM_SERVICE}" || true)"
if [[ "${BOT_STATE}" != 'active' || "${LLM_STATE}" != 'active' ]]; then
  sleep 4
  BOT_STATE="$(systemctl is-active ghost-nexora-bot.service || true)"
  LLM_STATE="$(systemctl is-active "${LLM_SERVICE}" || true)"
fi
if [[ "${LLM_STATE}" != 'active' ]]; then
  fail 'ghost-nexora-llm no quedó active.'
  systemctl --no-pager --full status "${LLM_SERVICE}" || true
  journalctl -u "${LLM_SERVICE}" -n 80 --no-pager -o short-precise || true
  exit 1
fi
if [[ "${BOT_STATE}" != 'active' ]]; then
  fail 'ghost-nexora-bot no quedó active.'
  systemctl --no-pager --full status ghost-nexora-bot.service || true
  journalctl -u ghost-nexora-bot.service -n 80 --no-pager -o short-precise || true
  exit 1
fi
if [[ "${WEB_STATE}" != 'active' ]]; then warn 'ghost-nexora-web no quedó active.'; fi
ELAPSED=$(( $(date +%s) - START_TS ))
ok "Actualización finalizada en ${ELAPSED}s. Bot=${BOT_STATE}, Web=${WEB_STATE}, LLM=${LLM_STATE}."