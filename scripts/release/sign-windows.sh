#!/usr/bin/env bash
set -Eeuo pipefail

FILE="${1:-}"
[[ -n "${FILE}" && -f "${FILE}" ]] || { echo '[release-sign] input file missing' >&2; exit 2; }
[[ "${FILE,,}" == *.exe ]] || { echo '[release-sign] only PE .exe files are accepted' >&2; exit 2; }
: "${WINDOWS_PFX:?WINDOWS_PFX is required}"
: "${WINDOWS_PFX_PASSWORD:?WINDOWS_PFX_PASSWORD is required}"
command -v osslsigncode >/dev/null 2>&1 || { echo '[release-sign] osslsigncode is unavailable' >&2; exit 2; }

TMP="${FILE}.signed.$$"
cleanup() { rm -f "${TMP}"; }
trap cleanup EXIT

COMMON=(
  sign
  -pkcs12 "${WINDOWS_PFX}"
  -pass "${WINDOWS_PFX_PASSWORD}"
  -n 'Ghost Nexora Manager'
  -i "${PUBLIC_WEB_URL:-https://github.com/Gh0stDeveloper/GhostNexoraBot}"
  -h sha256
  -in "${FILE}"
  -out "${TMP}"
)

if ! osslsigncode "${COMMON[@]}" -ts 'http://timestamp.digicert.com' >/dev/null 2>&1; then
  echo '[release-sign] timestamp service unavailable; signing without external timestamp' >&2
  rm -f "${TMP}"
  osslsigncode "${COMMON[@]}" >/dev/null
fi

osslsigncode verify -in "${TMP}" >/dev/null
mv "${TMP}" "${FILE}"
chmod 0644 "${FILE}"
