#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/ghost-nexora-bot}"
STATE_DIR="${STATE_DIR:-/var/lib/ghost-nexora-bot}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SNAPSHOT_ID="${1:-latest}"

fail() { printf '[FAIL] %s\n' "$*" >&2; exit 1; }
was_active() { systemctl is-active --quiet "$1" 2>/dev/null; }
restart_if_was_active() {
  local unit="$1" state="$2"
  if [[ "${state}" -eq 1 ]]; then systemctl restart "${unit}"; fi
}

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

# Read only the source SHA from the generated manifest. The manifest is root-owned
# in a 0700 snapshot directory and values are constrained when written.
SOURCE_SHA="$(grep '^SOURCE_SHA=' "${SNAPSHOT}/manifest.env" | head -n1 | cut -d= -f2-)"
[[ "${SOURCE_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || fail 'Snapshot manifest has an invalid SOURCE_SHA.'
git -C "${INSTALL_DIR}" cat-file -e "${SOURCE_SHA}^{commit}" || fail "Source commit ${SOURCE_SHA} is not available locally."

CURRENT_SHA="$(git -C "${INSTALL_DIR}" rev-parse HEAD)"
BOT_WAS_ACTIVE=0
WEB_WAS_ACTIVE=0
MANAGER_WAS_ACTIVE=0
was_active ghost-nexora-bot.service && BOT_WAS_ACTIVE=1 || true
was_active ghost-nexora-web.service && WEB_WAS_ACTIVE=1 || true
was_active ghost-nexora-manager.service && MANAGER_WAS_ACTIVE=1 || true

printf 'Rolling back Ghost Nexora Bot to %s using snapshot %s\n' "${SOURCE_SHA:0:12}" "${SNAPSHOT_ID}"
systemctl stop ghost-nexora-bot.service 2>/dev/null || true
systemctl stop ghost-nexora-web.service 2>/dev/null || true
systemctl stop ghost-nexora-manager.service 2>/dev/null || true

RESCUE_SNAPSHOT="$(release_state_create_snapshot "pre-manual-rollback-${CURRENT_SHA:0:12}")"
printf 'Current state preserved at %s before rollback.\n' "${RESCUE_SNAPSHOT}"

rescue() {
  local status=$?
  trap - ERR
  printf '[WARN] Rollback failed; restoring the pre-rollback state %s.\n' "${CURRENT_SHA:0:12}" >&2
  git -C "${INSTALL_DIR}" reset --hard "${CURRENT_SHA}" || true
  (
    cd "${INSTALL_DIR}"
    npm install
    npm run build
  ) >/tmp/ghost-nexora-release-rollback-rescue.log 2>&1 || true
  release_state_restore_persistent "${RESCUE_SNAPSHOT}" || true
  systemctl daemon-reload || true
  restart_if_was_active ghost-nexora-bot.service "${BOT_WAS_ACTIVE}" || true
  restart_if_was_active ghost-nexora-web.service "${WEB_WAS_ACTIVE}" || true
  restart_if_was_active ghost-nexora-manager.service "${MANAGER_WAS_ACTIVE}" || true
  printf '[FAIL] Manual rollback aborted (exit %s); rescue recovery was attempted.\n' "${status}" >&2
  exit "${status}"
}
trap rescue ERR

git -C "${INSTALL_DIR}" reset --hard "${SOURCE_SHA}"
(
  cd "${INSTALL_DIR}"
  npm install
  npm run build
) >/tmp/ghost-nexora-release-rollback.log 2>&1
release_state_restore_persistent "${SNAPSHOT}"

systemctl daemon-reload
restart_if_was_active ghost-nexora-bot.service "${BOT_WAS_ACTIVE}"
restart_if_was_active ghost-nexora-web.service "${WEB_WAS_ACTIVE}" || true
restart_if_was_active ghost-nexora-manager.service "${MANAGER_WAS_ACTIVE}" || true
if [[ "${BOT_WAS_ACTIVE}" -eq 1 ]]; then
  sleep 3
  systemctl is-active --quiet ghost-nexora-bot.service || fail 'Bot service did not recover after rollback.'
fi
trap - ERR
printf 'Rollback completed successfully. Rescue snapshot retained at %s.\n' "${RESCUE_SNAPSHOT}"
