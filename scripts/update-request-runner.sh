#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/ghost-nexora-bot}"
STATE_DIR="${STATE_DIR:-/var/lib/ghost-nexora-bot}"
DATA_DIR="${DATA_DIR:-${STATE_DIR}/data}"
REQUEST_FILE="${DATA_DIR}/update-request"
LOCK_FILE="/run/lock/ghost-nexora-bot-update.lock"

mkdir -p "$(dirname "${LOCK_FILE}")" "${DATA_DIR}"
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  exit 0
fi

# El servicio root solo acepta esta señal fija. El contenido del archivo nunca se
# interpreta como shell ni como argumentos, por lo que WhatsApp no puede inyectar
# comandos en el host.
[[ -f "${REQUEST_FILE}" ]] || exit 0
rm -f "${REQUEST_FILE}"

if [[ ! -x "${INSTALL_DIR}/scripts/update.sh" ]]; then
  chmod +x "${INSTALL_DIR}/scripts/update.sh" 2>/dev/null || true
fi

cd "${INSTALL_DIR}"
exec env INSTALL_DIR="${INSTALL_DIR}" STATE_DIR="${STATE_DIR}" bash "${INSTALL_DIR}/scripts/update.sh"
