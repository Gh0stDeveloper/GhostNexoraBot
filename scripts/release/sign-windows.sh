#!/usr/bin/env bash
set -Eeuo pipefail

FILE="${1:-}"
[[ -n "${FILE}" && -f "${FILE}" ]] || { echo '[release-sign] input file missing' >&2; exit 2; }
[[ "${FILE,,}" == *.exe ]] || { echo '[release-sign] only PE .exe files are accepted' >&2; exit 2; }
: "${WINDOWS_PFX:?WINDOWS_PFX is required}"
: "${WINDOWS_PFX_PASSWORD:?WINDOWS_PFX_PASSWORD is required}"
command -v osslsigncode >/dev/null 2>&1 || { echo '[release-sign] osslsigncode is unavailable' >&2; exit 2; }
command -v openssl >/dev/null 2>&1 || { echo '[release-sign] openssl is unavailable' >&2; exit 2; }

TMP="${FILE}.signed.$$"
VERIFY_CERT="${FILE}.signer-cert.$$"
LOG="${WINDOWS_SIGN_LOG:-/tmp/ghost-nexora-osslsigncode.log}"
cleanup() { rm -f "${TMP}" "${VERIFY_CERT}"; }
trap cleanup EXIT

# Trust the exact certificate stored in the persistent PFX for the local
# post-sign integrity check. The default Linux CA bundle cannot validate the
# self-signed fallback identity created by the VPS builder.
openssl pkcs12 \
  -in "${WINDOWS_PFX}" \
  -clcerts -nokeys \
  -passin "pass:${WINDOWS_PFX_PASSWORD}" \
  -out "${VERIFY_CERT}" >/dev/null 2>&1
chmod 0600 "${VERIFY_CERT}"

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

: >"${LOG}"
chmod 0600 "${LOG}" 2>/dev/null || true
if ! osslsigncode "${COMMON[@]}" -ts 'http://timestamp.digicert.com' >>"${LOG}" 2>&1; then
  echo '[release-sign] timestamp service unavailable; signing without external timestamp' >&2
  rm -f "${TMP}"
  if ! osslsigncode "${COMMON[@]}" >>"${LOG}" 2>&1; then
    echo "[release-sign] signing failed; see ${LOG}" >&2
    tail -n 50 "${LOG}" >&2 || true
    exit 1
  fi
fi

# -ignore-timestamp keeps this local verification focused on the Authenticode
# signature and signer identity. Timestamp-service trust is independent from
# the persistent code-signing identity and must not make a valid local
# signature fail on a Linux VPS.
if ! osslsigncode verify \
  -CAfile "${VERIFY_CERT}" \
  -ignore-timestamp \
  -in "${TMP}" >>"${LOG}" 2>&1; then
  echo "[release-sign] Authenticode verification failed; see ${LOG}" >&2
  tail -n 50 "${LOG}" >&2 || true
  exit 1
fi

mv "${TMP}" "${FILE}"
chmod 0644 "${FILE}"
echo "[release-sign] signed and verified: ${FILE}"