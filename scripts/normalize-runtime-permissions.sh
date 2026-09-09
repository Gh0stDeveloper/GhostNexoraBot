#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/ghost-nexora-bot}"
SERVICE_USER="${SERVICE_USER:-ghostbot}"
SERVICE_GROUP="${SERVICE_GROUP:-${SERVICE_USER}}"

if [[ ! -d "${INSTALL_DIR}" ]]; then
  printf '[perms] instalación inexistente: %s\n' "${INSTALL_DIR}" >&2
  exit 1
fi

if ! id "${SERVICE_USER}" >/dev/null 2>&1; then
  printf '[perms] usuario de servicio inexistente: %s\n' "${SERVICE_USER}" >&2
  exit 1
fi

if ! getent group "${SERVICE_GROUP}" >/dev/null 2>&1; then
  printf '[perms] grupo de servicio inexistente: %s\n' "${SERVICE_GROUP}" >&2
  exit 1
fi

# El servicio solo necesita atravesar el checkout y leer artefactos de runtime.
# No se concede escritura sobre el código fuente ni sobre .git.
for dir in \
  "${INSTALL_DIR}" \
  "${INSTALL_DIR}/apps" \
  "${INSTALL_DIR}/apps/bot" \
  "${INSTALL_DIR}/apps/web"
do
  [[ -d "${dir}" ]] || continue
  chgrp "${SERVICE_GROUP}" "${dir}"
  chmod g+rx "${dir}"
done

make_service_readable() {
  local path="$1"
  [[ -e "${path}" ]] || return 0
  chgrp -R "${SERVICE_GROUP}" "${path}"
  # g+rX agrega lectura y traversal sin convertir archivos normales en ejecutables.
  chmod -R g+rX "${path}"
}

# Artefactos compilados y recursos que Node/Next/Whisper consumen en runtime.
make_service_readable "${INSTALL_DIR}/apps/bot/dist"
make_service_readable "${INSTALL_DIR}/apps/bot/assets"
make_service_readable "${INSTALL_DIR}/apps/web/.next"
make_service_readable "${INSTALL_DIR}/node_modules"
make_service_readable "${INSTALL_DIR}/apps/bot/node_modules"
make_service_readable "${INSTALL_DIR}/apps/web/node_modules"
make_service_readable "${INSTALL_DIR}/venv-whisper"

# Next puede escribir caché en producción; el resto del checkout permanece de solo lectura.
if [[ -d "${INSTALL_DIR}/apps/web/.next/cache" ]]; then
  chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "${INSTALL_DIR}/apps/web/.next/cache"
  chmod -R u+rwX,g+rX "${INSTALL_DIR}/apps/web/.next/cache"
fi

# El secreto de configuración conserva el modelo root + grupo del servicio.
if [[ -f "${INSTALL_DIR}/.env" ]]; then
  chown root:"${SERVICE_GROUP}" "${INSTALL_DIR}/.env" 2>/dev/null || chgrp "${SERVICE_GROUP}" "${INSTALL_DIR}/.env"
  chmod 0640 "${INSTALL_DIR}/.env"
fi

printf '[perms] runtime legible por %s:%s\n' "${SERVICE_USER}" "${SERVICE_GROUP}"
