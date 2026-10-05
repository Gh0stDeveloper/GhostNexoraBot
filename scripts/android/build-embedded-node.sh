#!/usr/bin/env bash
set -Eeuo pipefail

NODE_VERSION="${NODE_VERSION:-v24.21.0}"
ANDROID_API="${ANDROID_API:-33}"
ANDROID_ABI="${ANDROID_ABI:-arm64-v8a}"
WORK_DIR="${WORK_DIR:-${RUNNER_TEMP:-/tmp}/nexora-embedded-node}"
OUTPUT_DIR="${OUTPUT_DIR:-artifacts/embedded-node/${ANDROID_ABI}}"
if [[ -z "${JOBS:-}" ]]; then
  DETECTED_JOBS="$(nproc 2>/dev/null || echo 2)"
  if (( DETECTED_JOBS > 4 )); then
    JOBS=4
  elif (( DETECTED_JOBS < 1 )); then
    JOBS=1
  else
    JOBS="${DETECTED_JOBS}"
  fi
fi

if ! [[ "${JOBS}" =~ ^[1-9][0-9]*$ ]]; then
  echo "JOBS must be a positive integer" >&2
  exit 2
fi
PATCHSET_DIR="${PATCHSET_DIR:-scripts/android/patches/node-${NODE_VERSION}}"

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

if [[ ! -d "${PATCHSET_DIR}" ]]; then
  echo "Missing Nexora Embedded Node patchset: ${PATCHSET_DIR}" >&2
  exit 2
fi

REPO_ROOT="$(pwd)"
OUTPUT_DIR_ABS="${REPO_ROOT}/${OUTPUT_DIR}"
PATCHSET_DIR_ABS="${REPO_ROOT}/${PATCHSET_DIR}"

rm -rf "${WORK_DIR}" "${OUTPUT_DIR_ABS}"
mkdir -p "${WORK_DIR}" "${OUTPUT_DIR_ABS}"

git clone --depth 1 --branch "${NODE_VERSION}" https://github.com/nodejs/node.git "${WORK_DIR}/node"
pushd "${WORK_DIR}/node" >/dev/null

echo "Applying Nexora Android patchset for ${NODE_VERSION}"
for patch_file in "${PATCHSET_DIR_ABS}"/*.patch; do
  echo "  -> $(basename "${patch_file}")"
  git apply --check "${patch_file}"
  git apply "${patch_file}"
done

python3 -m py_compile android_configure.py
git diff --check

HOST_CC="${HOST_CC:-$(command -v gcc || command -v cc)}"
HOST_CXX="${HOST_CXX:-$(command -v g++ || command -v c++)}"
if [[ -z "${HOST_CC}" || -z "${HOST_CXX}" ]]; then
  echo "Native host C/C++ compiler is required for ICU/V8 generators" >&2
  exit 2
fi

export CC_host="${HOST_CC}"
export CXX_host="${HOST_CXX}"

./android-configure   "${ANDROID_NDK_ROOT}"   "${ANDROID_API}"   "${NODE_ARCH}"   --shared   --without-npm   --without-inspector

echo "Building Node.js ${NODE_VERSION} for ${ANDROID_ABI} with ${JOBS} parallel jobs"
make -j"${JOBS}" V=0

LIBNODE="$(find out/Release -type f \( -name 'libnode.so' -o -name 'libnode.so.*' -o -name 'libnode.*.so' \) -print -quit)"
if [[ -z "${LIBNODE}" ]]; then
  echo "libnode shared library was not produced" >&2
  find out/Release -maxdepth 5 -type f | sort | tail -n 150 >&2 || true
  exit 3
fi

cp "${LIBNODE}" "${OUTPUT_DIR_ABS}/libnode.so"

mkdir -p "${OUTPUT_DIR_ABS}/include/node"
cp src/*.h "${OUTPUT_DIR_ABS}/include/node/" 2>/dev/null || true
cp -R deps/v8/include "${OUTPUT_DIR_ABS}/include/v8"
cp -R deps/uv/include "${OUTPUT_DIR_ABS}/include/uv"
cp -R deps/openssl/openssl/include "${OUTPUT_DIR_ABS}/include/openssl" 2>/dev/null || true

popd >/dev/null

sha256sum "${OUTPUT_DIR_ABS}/libnode.so" | sed "s#${OUTPUT_DIR_ABS}/##" | tee "${OUTPUT_DIR_ABS}/libnode.so.sha256"
printf '%s\n' "${NODE_VERSION}" > "${OUTPUT_DIR_ABS}/node-version.txt"
printf '%s\n' "${ANDROID_API}" > "${OUTPUT_DIR_ABS}/android-api.txt"
printf '%s\n' "${ANDROID_ABI}" > "${OUTPUT_DIR_ABS}/abi.txt"
printf '%s\n' "${HOST_CC}" > "${OUTPUT_DIR_ABS}/host-cc.txt"
printf '%s\n' "${HOST_CXX}" > "${OUTPUT_DIR_ABS}/host-cxx.txt"

echo "Nexora Embedded Node built: ${OUTPUT_DIR_ABS}/libnode.so"
