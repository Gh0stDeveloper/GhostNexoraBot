#!/usr/bin/env bash
set -Eeuo pipefail

NODE_VERSION="${NODE_VERSION:-v24.21.0}"
ANDROID_API="${ANDROID_API:-33}"
ANDROID_ABI="${ANDROID_ABI:-arm64-v8a}"
WORK_DIR="${WORK_DIR:-${RUNNER_TEMP:-/tmp}/nexora-embedded-node}"
OUTPUT_DIR="${OUTPUT_DIR:-artifacts/embedded-node/${ANDROID_ABI}}"
JOBS="${JOBS:-2}"

if [[ -z "${ANDROID_NDK_ROOT:-}" ]]; then
  echo "ANDROID_NDK_ROOT is required" >&2
  exit 2
fi

case "${ANDROID_ABI}" in
  arm64-v8a) NODE_ARCH="arm64" ;;
  x86_64) NODE_ARCH="x86_64" ;;
  *)
    echo "Unsupported ABI: ${ANDROID_ABI}" >&2
    exit 2
    ;;
esac

rm -rf "${WORK_DIR}"
mkdir -p "${WORK_DIR}" "${OUTPUT_DIR}"

git clone --depth 1 --branch "${NODE_VERSION}" https://github.com/nodejs/node.git "${WORK_DIR}/node"
pushd "${WORK_DIR}/node" >/dev/null

./android-configure "${ANDROID_NDK_ROOT}" "${ANDROID_API}" "${NODE_ARCH}"
make -j"${JOBS}"

LIBNODE="$(find out/Release -type f \( -name 'libnode.so' -o -name 'libnode.*.so' \) -print -quit)"
if [[ -z "${LIBNODE}" ]]; then
  echo "libnode.so was not produced" >&2
  find out/Release -maxdepth 4 -type f | sort | tail -n 100 >&2 || true
  exit 3
fi

cp "${LIBNODE}" "${OLDPWD}/${OUTPUT_DIR}/libnode.so"
cp -R src "${OLDPWD}/${OUTPUT_DIR}/node-src-headers"
cp -R deps/v8/include "${OLDPWD}/${OUTPUT_DIR}/v8-include"
cp -R deps/uv/include "${OLDPWD}/${OUTPUT_DIR}/uv-include"
cp -R deps/openssl/openssl/include "${OLDPWD}/${OUTPUT_DIR}/openssl-include" 2>/dev/null || true

popd >/dev/null
sha256sum "${OUTPUT_DIR}/libnode.so" | tee "${OUTPUT_DIR}/libnode.so.sha256"
printf '%s\n' "${NODE_VERSION}" > "${OUTPUT_DIR}/node-version.txt"
printf '%s\n' "${ANDROID_API}" > "${OUTPUT_DIR}/android-api.txt"
printf '%s\n' "${ANDROID_ABI}" > "${OUTPUT_DIR}/abi.txt"

echo "Nexora Embedded Node built: ${OUTPUT_DIR}/libnode.so"
