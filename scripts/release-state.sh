#!/usr/bin/env bash
set -Eeuo pipefail

STATE_DIR="${STATE_DIR:-/var/lib/ghost-nexora-bot}"
INSTALL_DIR="${INSTALL_DIR:-/opt/ghost-nexora-bot}"
RELEASE_STATE_DIR="${RELEASE_STATE_DIR:-${STATE_DIR}/releases}"

release_state_now() { date -u '+%Y%m%dT%H%M%SZ'; }

release_state_require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    printf '[FAIL] This operation requires sudo/root.\n' >&2
    return 1
  fi
}

release_state_safe_id() {
  local value="${1:-}"
  [[ "${value}" =~ ^[A-Za-z0-9._-]+$ ]]
}

release_state_create_snapshot() {
  local reason="${1:-manual}"
  release_state_require_root
  mkdir -p "${RELEASE_STATE_DIR}"
  chmod 0700 "${RELEASE_STATE_DIR}"

  local stamp snapshot sha branch
  stamp="$(release_state_now)"
  snapshot="${RELEASE_STATE_DIR}/${stamp}"
  mkdir -p "${snapshot}/persistent"
  chmod 0700 "${snapshot}" "${snapshot}/persistent"

  sha="$(git -C "${INSTALL_DIR}" rev-parse HEAD)"
  branch="$(git -C "${INSTALL_DIR}" symbolic-ref --short -q HEAD || printf 'detached')"

  cat > "${snapshot}/manifest.env" <<EOF
SNAPSHOT_ID=${stamp}
SOURCE_SHA=${sha}
SOURCE_BRANCH=${branch}
CREATED_AT=${stamp}
REASON=${reason//[^A-Za-z0-9._-]/_}
EOF
  chmod 0600 "${snapshot}/manifest.env"

  if [[ -f "${INSTALL_DIR}/.env" ]]; then
    cp -a "${INSTALL_DIR}/.env" "${snapshot}/persistent/.env"
  fi

  for rel in data auth downloads; do
    if [[ -e "${INSTALL_DIR}/${rel}" ]]; then
      cp -a "${INSTALL_DIR}/${rel}" "${snapshot}/persistent/${rel}"
    fi
  done

  for rel in session sessions db sqlite; do
    if [[ -e "${STATE_DIR}/${rel}" ]]; then
      mkdir -p "${snapshot}/state"
      cp -a "${STATE_DIR}/${rel}" "${snapshot}/state/${rel}"
    fi
  done

  printf '%s\n' "${snapshot}"
}

release_state_restore_persistent() {
  local snapshot="${1:?snapshot required}"
  release_state_require_root
  [[ -f "${snapshot}/manifest.env" ]] || { printf '[FAIL] Invalid snapshot: %s\n' "${snapshot}" >&2; return 1; }

  if [[ -f "${snapshot}/persistent/.env" ]]; then
    cp -a "${snapshot}/persistent/.env" "${INSTALL_DIR}/.env"
  fi

  for rel in data auth downloads; do
    if [[ -e "${snapshot}/persistent/${rel}" ]]; then
      rm -rf "${INSTALL_DIR:?}/${rel}"
      cp -a "${snapshot}/persistent/${rel}" "${INSTALL_DIR}/${rel}"
    fi
  done

  if [[ -d "${snapshot}/state" ]]; then
    for source in "${snapshot}/state"/*; do
      [[ -e "${source}" ]] || continue
      local name
      name="$(basename "${source}")"
      rm -rf "${STATE_DIR:?}/${name}"
      cp -a "${source}" "${STATE_DIR}/${name}"
    done
  fi
}

release_state_latest_snapshot() {
  [[ -d "${RELEASE_STATE_DIR}" ]] || return 1
  find "${RELEASE_STATE_DIR}" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -r | head -n 1
}
