#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/ghost-nexora-bot}"
STATE_DIR="${STATE_DIR:-/var/lib/ghost-nexora-bot}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SNAPSHOT_ID="${1:-latest}"

fail() { printf '[FAIL] %s\n' "$*" >&2; exit 1; }
[[ "${EUID}" -eq 0 ]] || fail 'Run with sudo/root.'
[[ -d "${INSTALL_DIR}/.git" ]] || fail "${INSTALL_DIR} is not a Git checkout."

# shellcheck source=./release-state.sh
source "${SCRIPT_DIR}/release-state.sh"

if [[ "${SNAPSHOT_ID}" == 'latest' ]]; then
  SNAPSHOT_ID="$(release_state_latest_snapshot || true)"
  [[ -n "${SNAPSHOT_ID}" ]] || fail 'No release snapshots exist.'
fi
release_state_safe_id "${SNAPSHOT_ID}" || fail 'Invalid snapshot id.'
SNAPSHOT="${RELEASE_STATE_DIR}/${SNAPSHOT_ID}"
[[ -f "${SNAPSHOT}/manifest.env" ]] || fail "Snapshot not found: ${SNAPSHOT_ID}"

# shellcheck disable=SC1090
source "${SNAPSHOT}/manifest.env"
[[ "${SOURCE_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || fail 'Snapshot manifest has an invalid SOURCE_SHA.'

git -C "${INSTALL_DIR}" cat-file -e "${SOURCE_SHA}^{commit}" || fail "Source commit ${SOURCE_SHA} is not available locally."

printf 'Rolling back Ghost Nexora Bot to %s using snapshot %s\n' "${SOURCE_SHA:0:12}" "${SNAPSHOT_ID}"
systemctl stop ghost-nexora-bot.service 2>/dev/null || true
systemctl stop ghost-nexora-web.service 2>/dev/null || true
systemctl stop ghost-nexora-manager.service 2>/dev/null || true

git -C "${INSTALL_DIR}" reset --hard "${SOURCE_SHA}"
(
  cd "${INSTALL_DIR}"
  npm install
  npm run build
) >/tmp/ghost-nexora-release-rollback.log 2>&1
release_state_restore_persistent "${SNAPSHOT}"

systemctl daemon-reload
systemctl restart ghost-nexora-bot.service
systemctl restart ghost-nexora-web.service 2>/dev/null || true
systemctl restart ghost-nexora-manager.service 2>/dev/null || true
sleep 3
systemctl is-active --quiet ghost-nexora-bot.service || fail 'Bot service did not recover after rollback.'
printf 'Rollback completed successfully.\n'
