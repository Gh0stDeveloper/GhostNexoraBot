#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/ghost-nexora-bot}"
STATE_DIR="${STATE_DIR:-/var/lib/ghost-nexora-bot}"
REPO_URL="${REPO_URL:-https://github.com/Gh0stDeveloper/GhostNexoraBot.git}"
TARGET_REF="${1:-}"
LOCK_FILE="${LOCK_FILE:-/run/lock/ghost-nexora-release-update.lock}"
SERVICE_USER="${SERVICE_USER:-}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }
fail() { printf '[%s] [FAIL] %s\n' "$(date '+%H:%M:%S')" "$*" >&2; exit 1; }
was_active() { systemctl is-active --quiet "$1" 2>/dev/null; }
restart_if_was_active() {
  local unit="$1" state="$2"
  if [[ "${state}" -eq 1 ]]; then systemctl restart "${unit}"; fi
}

[[ "${EUID}" -eq 0 ]] || fail 'Run with sudo/root.'
[[ -n "${TARGET_REF}" ]] || fail 'Usage: sudo bash scripts/release-update.sh <v2.x.y|40-char-sha>'
[[ "${TARGET_REF}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ || "${TARGET_REF}" =~ ^[0-9a-f]{40}$ ]] || fail 'Target must be a SemVer release tag or full commit SHA.'
[[ -d "${INSTALL_DIR}/.git" ]] || fail "${INSTALL_DIR} is not a Git checkout."

exec 9>"${LOCK_FILE}"
flock -n 9 || fail 'Another release update is already running.'

# shellcheck source=./release-state.sh
source "${SCRIPT_DIR}/release-state.sh"

cd "${INSTALL_DIR}"
REMOTE_URL="$(git remote get-url origin)"
case "${REMOTE_URL}" in
  https://github.com/Gh0stDeveloper/GhostNexoraBot|https://github.com/Gh0stDeveloper/GhostNexoraBot.git|git@github.com:Gh0stDeveloper/GhostNexoraBot.git) ;;
  *) fail "Unexpected origin remote: ${REMOTE_URL}" ;;
esac

OLD_SHA="$(git rev-parse HEAD)"
if [[ -z "${SERVICE_USER}" ]]; then
  SERVICE_USER="$(systemctl show -p User --value ghost-nexora-bot.service 2>/dev/null || true)"
  [[ -n "${SERVICE_USER}" ]] || SERVICE_USER='ghostbot'
fi

BOT_WAS_ACTIVE=0
WEB_WAS_ACTIVE=0
MANAGER_WAS_ACTIVE=0
was_active ghost-nexora-bot.service && BOT_WAS_ACTIVE=1 || true
was_active ghost-nexora-web.service && WEB_WAS_ACTIVE=1 || true
was_active ghost-nexora-manager.service && MANAGER_WAS_ACTIVE=1 || true

STAGE_DIR="$(mktemp -d /tmp/ghost-nexora-release.XXXXXX)"
SNAPSHOT=""
ACTIVATED=0
SERVICES_STOPPED=0
cleanup() { rm -rf "${STAGE_DIR}"; }
trap cleanup EXIT

rollback() {
  local status=$?
  trap - ERR
  if [[ "${ACTIVATED}" -eq 1 && -n "${SNAPSHOT}" ]]; then
    log "Update failed; rolling back to ${OLD_SHA:0:12}."
    git reset --hard "${OLD_SHA}" || true
    npm install >/tmp/ghost-nexora-rollback-install.log 2>&1 || true
    npm run build >/tmp/ghost-nexora-rollback-build.log 2>&1 || true
    release_state_restore_persistent "${SNAPSHOT}" || true
    systemctl daemon-reload || true
  fi
  if [[ "${SERVICES_STOPPED}" -eq 1 ]]; then
    restart_if_was_active ghost-nexora-bot.service "${BOT_WAS_ACTIVE}" || true
    restart_if_was_active ghost-nexora-web.service "${WEB_WAS_ACTIVE}" || true
    restart_if_was_active ghost-nexora-manager.service "${MANAGER_WAS_ACTIVE}" || true
  fi
  printf '[FAIL] Release update aborted (exit %s). Previous installation was restored where possible.\n' "${status}" >&2
  exit "${status}"
}
trap rollback ERR

log "Fetching release target ${TARGET_REF}."
git fetch --tags --prune origin
if [[ "${TARGET_REF}" =~ ^v ]]; then
  git rev-parse --verify "refs/tags/${TARGET_REF}^{commit}" >/dev/null
  TARGET_SHA="$(git rev-list -n1 "${TARGET_REF}")"
else
  git cat-file -e "${TARGET_REF}^{commit}"
  TARGET_SHA="${TARGET_REF}"
fi

log "Validating ${TARGET_SHA:0:12} in an isolated checkout before touching production."
git clone --no-hardlinks --shared "${INSTALL_DIR}" "${STAGE_DIR}/repo" >/dev/null 2>&1
git -C "${STAGE_DIR}/repo" checkout --detach "${TARGET_SHA}" >/dev/null 2>&1
(
  cd "${STAGE_DIR}/repo"
  npm install
  npm run typecheck
  npm run build
  npm run v2:release-gate -- --mode=install
) >/tmp/ghost-nexora-release-preflight.log 2>&1

log 'Preflight passed. Quiescing runtime before the persistent snapshot.'
systemctl stop ghost-nexora-bot.service 2>/dev/null || true
systemctl stop ghost-nexora-web.service 2>/dev/null || true
systemctl stop ghost-nexora-manager.service 2>/dev/null || true
SERVICES_STOPPED=1

SNAPSHOT="$(release_state_create_snapshot "release-update-${TARGET_REF}")"
log "Persistent snapshot: ${SNAPSHOT}"
ACTIVATED=1

git reset --hard "${TARGET_SHA}"
npm install >/tmp/ghost-nexora-release-install.log 2>&1
npm run build >/tmp/ghost-nexora-release-build.log 2>&1
release_state_restore_persistent "${SNAPSHOT}"

if [[ -f "${INSTALL_DIR}/scripts/normalize-runtime-permissions.sh" ]]; then
  INSTALL_DIR="${INSTALL_DIR}" SERVICE_USER="${SERVICE_USER}" bash "${INSTALL_DIR}/scripts/normalize-runtime-permissions.sh"
fi
if [[ -f "${INSTALL_DIR}/scripts/install-manager-api.sh" ]]; then
  INSTALL_DIR="${INSTALL_DIR}" bash "${INSTALL_DIR}/scripts/install-manager-api.sh"
fi

systemctl daemon-reload
restart_if_was_active ghost-nexora-bot.service "${BOT_WAS_ACTIVE}"
restart_if_was_active ghost-nexora-web.service "${WEB_WAS_ACTIVE}" || true
# install-manager-api may have started the manager; if it was previously disabled,
# preserve the previous operator choice.
if [[ "${MANAGER_WAS_ACTIVE}" -eq 1 ]]; then
  systemctl restart ghost-nexora-manager.service
else
  systemctl stop ghost-nexora-manager.service 2>/dev/null || true
fi

if [[ "${BOT_WAS_ACTIVE}" -eq 1 ]]; then
  sleep 3
  systemctl is-active --quiet ghost-nexora-bot.service
fi

ACTIVATED=0
SERVICES_STOPPED=0
trap - ERR
log "Release update complete: ${OLD_SHA:0:12} -> ${TARGET_SHA:0:12}."
log "Rollback snapshot retained at ${SNAPSHOT}."
