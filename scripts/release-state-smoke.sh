#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(mktemp -d /tmp/ghost-nexora-phase8-state.XXXXXX)"
INSTALL_DIR="${ROOT}/install"
STATE_DIR="${ROOT}/state"
RELEASE_STATE_DIR="${STATE_DIR}/releases"
cleanup() { rm -rf "${ROOT}"; }
trap cleanup EXIT

mkdir -p "${INSTALL_DIR}/data" "${STATE_DIR}/data" "${STATE_DIR}/session"
git -C "${ROOT}" init -q install
git -C "${INSTALL_DIR}" config user.email phase8@example.invalid
git -C "${INSTALL_DIR}" config user.name 'Phase 8 Smoke'
printf 'tracked\n' > "${INSTALL_DIR}/README"
git -C "${INSTALL_DIR}" add README
git -C "${INSTALL_DIR}" commit -qm init

printf 'TOKEN=original\n' > "${INSTALL_DIR}/.env"
printf 'legacy-install-data\n' > "${INSTALL_DIR}/data/legacy.txt"
printf 'sqlite-state\n' > "${STATE_DIR}/data/nexora-economy.sqlite"
printf 'session-secret\n' > "${STATE_DIR}/session/creds.json"

export INSTALL_DIR STATE_DIR RELEASE_STATE_DIR
# shellcheck source=./release-state.sh
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/release-state.sh"

snapshot="$(release_state_create_snapshot phase8-smoke)"
[[ -f "${snapshot}/manifest.env" ]]
[[ "$(stat -c '%a' "${RELEASE_STATE_DIR}")" == '700' ]]
[[ -f "${snapshot}/state/data/nexora-economy.sqlite" ]]
[[ -f "${snapshot}/state/session/creds.json" ]]

printf 'TOKEN=mutated\n' > "${INSTALL_DIR}/.env"
printf 'changed-install-data\n' > "${INSTALL_DIR}/data/legacy.txt"
printf 'changed-db\n' > "${STATE_DIR}/data/nexora-economy.sqlite"
printf 'changed-session\n' > "${STATE_DIR}/session/creds.json"

release_state_restore_persistent "${snapshot}"

grep -qx 'TOKEN=original' "${INSTALL_DIR}/.env"
grep -qx 'legacy-install-data' "${INSTALL_DIR}/data/legacy.txt"
grep -qx 'sqlite-state' "${STATE_DIR}/data/nexora-economy.sqlite"
grep -qx 'session-secret' "${STATE_DIR}/session/creds.json"
printf 'Phase 8 release-state smoke passed.\n'
