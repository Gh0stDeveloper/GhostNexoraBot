#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/ghost-nexora-bot}"
SERVICE_USER="${SERVICE_USER:-}"
SERVICE_FILE="/etc/systemd/system/ghost-nexora-llm.service"
# When 1, only write/enable the unit file; do not systemctl restart.
# Used by update.sh while mini-LLM training is in progress.
SKIP_LLM_RESTART="${SKIP_LLM_RESTART:-0}"

if [[ "${EUID}" -ne 0 ]]; then echo 'Ejecuta con sudo/root.' >&2; exit 1; fi
if [[ -z "${SERVICE_USER}" ]]; then
  SERVICE_USER="$(systemctl show -p User --value ghost-nexora-bot.service 2>/dev/null || true)"
  [[ -z "${SERVICE_USER}" ]] && SERVICE_USER="root"
fi

cat > "${SERVICE_FILE}" <<EOF
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
systemctl enable ghost-nexora-llm.service

if [[ "${SKIP_LLM_RESTART}" == "1" || "${SKIP_LLM_RESTART}" == "true" ]]; then
  echo "ghost-nexora-llm.service unit actualizada (SKIP_LLM_RESTART=1); no se reinició el proceso."
  if systemctl is-active --quiet ghost-nexora-llm.service; then
    echo "Estado actual: active (entrenamiento u otro trabajo en curso puede continuar)."
  else
    echo "Advertencia: el servicio no está active. No se forzó restart por SKIP_LLM_RESTART." >&2
  fi
  exit 0
fi

systemctl restart ghost-nexora-llm.service
sleep 2
if ! systemctl is-active --quiet ghost-nexora-llm.service; then
  systemctl --no-pager --full status ghost-nexora-llm.service || true
  journalctl -u ghost-nexora-llm.service -n 80 --no-pager || true
  exit 1
fi

echo "ghost-nexora-llm.service activo con usuario ${SERVICE_USER}."
