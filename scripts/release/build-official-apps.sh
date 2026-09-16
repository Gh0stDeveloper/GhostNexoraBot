#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/ghost-nexora-bot}"
STATE_DIR="${STATE_DIR:-/var/lib/ghost-nexora-bot}"
SERVICE_USER="${SERVICE_USER:-ghostbot}"
ENV_FILE="${ENV_FILE:-${INSTALL_DIR}/.env}"
TOOLCHAIN_DIR="${OFFICIAL_TOOLCHAIN_DIR:-${STATE_DIR}/release-toolchain}"
RELEASE_DIR="${OFFICIAL_RELEASE_DIR:-${STATE_DIR}/releases}"
RELEASE_DB="${OFFICIAL_RELEASE_DB:-${STATE_DIR}/release-db/releases.sqlite}"
SIGNING_DIR="${OFFICIAL_SIGNING_DIR:-${STATE_DIR}/release-secrets}"
SIGNING_ENV="${OFFICIAL_SIGNING_ENV:-${SIGNING_DIR}/signing.env}"
BUILD_ROOT="${STATE_DIR}/release-build"
LOCK_FILE="${STATE_DIR}/release-build.lock"
PROVISION="${OFFICIAL_RELEASE_PROVISION:-true}"
CHANNEL="${OFFICIAL_RELEASE_CHANNEL:-rc}"
START_TS="$(date +%s)"

info() { printf '[%s] [release] %s\n' "$(date '+%H:%M:%S')" "$*"; }
fail() { printf '[%s] [release:FAIL] %s\n' "$(date '+%H:%M:%S')" "$*" >&2; exit 1; }
truthy() { case "${1,,}" in 1|true|yes|on|si|sí) return 0 ;; *) return 1 ;; esac; }

[[ "${EUID}" -eq 0 ]] || fail 'Este compilador oficial debe ejecutarse como root/sudo.'
[[ -d "${INSTALL_DIR}/.git" ]] || fail "No existe checkout Git en ${INSTALL_DIR}."
command -v flock >/dev/null 2>&1 || fail 'flock no está disponible.'
install -d -m 0750 "${STATE_DIR}" "${BUILD_ROOT}" "${RELEASE_DIR}" "$(dirname "${RELEASE_DB}")"
install -d -m 0700 -o root -g root "${SIGNING_DIR}"
exec 9>"${LOCK_FILE}"
flock -n 9 || fail 'Ya existe una compilación oficial en curso.'

cd "${INSTALL_DIR}"
SOURCE_SHA="$(git rev-parse HEAD)"
SOURCE_REF="${OFFICIAL_SOURCE_REF:-$(git branch --show-current 2>/dev/null || true)}"
[[ -n "${SOURCE_REF}" ]] || SOURCE_REF="${SOURCE_SHA}"
VERSION="${OFFICIAL_RELEASE_VERSION:-$(node -p "require('./package.json').version" 2>/dev/null || echo 2.0.0)}"
VERSION="${VERSION#v}"
STAGE="${BUILD_ROOT}/${SOURCE_SHA:0:12}/stage"
rm -rf "${BUILD_ROOT:?}/${SOURCE_SHA:0:12}"
install -d -m 0750 "${STAGE}"

main_env_set() {
  local key="$1" value="$2"
  [[ -f "${ENV_FILE}" ]] || touch "${ENV_FILE}"
  if grep -q "^${key}=" "${ENV_FILE}"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "${ENV_FILE}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${ENV_FILE}"
  fi
}

secret_set() {
  local key="$1" value="$2"
  touch "${SIGNING_ENV}"
  chmod 0600 "${SIGNING_ENV}"
  if grep -q "^${key}=" "${SIGNING_ENV}"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "${SIGNING_ENV}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${SIGNING_ENV}"
  fi
}

secret_get() {
  local key="$1"
  grep "^${key}=" "${SIGNING_ENV}" 2>/dev/null | tail -n1 | cut -d= -f2- || true
}

random_secret() { openssl rand -hex 32; }

provision_toolchain() {
  truthy "${PROVISION}" || { info 'Provisionado automático omitido por configuración.'; return; }
  info 'Preparando toolchain VPS: Tauri/Linux, Windows cross-build y Android…'
  export DEBIAN_FRONTEND=noninteractive
  apt-get update >/tmp/ghost-nexora-release-apt-update.log
  apt-get install -y \
    ca-certificates curl git unzip zip xz-utils build-essential pkg-config libssl-dev \
    libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf rpm nsis \
    llvm lld clang osslsigncode openssl gnupg openjdk-17-jdk-headless python3 >/tmp/ghost-nexora-release-apt-install.log

  export RUSTUP_HOME="${TOOLCHAIN_DIR}/rustup"
  export CARGO_HOME="${TOOLCHAIN_DIR}/cargo"
  export PATH="${CARGO_HOME}/bin:${PATH}"
  if [[ ! -x "${CARGO_HOME}/bin/rustup" ]]; then
    curl --proto '=https' --tlsv1.2 -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable --no-modify-path
  fi
  rustup toolchain install stable --profile minimal >/dev/null
  rustup default stable >/dev/null
  rustup target add x86_64-pc-windows-msvc >/dev/null
  if [[ ! -x "${CARGO_HOME}/bin/cargo-xwin" ]]; then cargo install --locked cargo-xwin; fi

  local gradle_version='9.6.0' gradle_home="${TOOLCHAIN_DIR}/gradle-9.6.0"
  if [[ ! -x "${gradle_home}/bin/gradle" ]]; then
    local gradle_zip="${TOOLCHAIN_DIR}/gradle-${gradle_version}-bin.zip"
    curl -fL "https://services.gradle.org/distributions/gradle-${gradle_version}-bin.zip" -o "${gradle_zip}"
    unzip -q "${gradle_zip}" -d "${TOOLCHAIN_DIR}"
    rm -f "${gradle_zip}"
  fi

  local android_home="${TOOLCHAIN_DIR}/android-sdk"
  if [[ ! -x "${android_home}/cmdline-tools/latest/bin/sdkmanager" ]]; then
    local tools_zip="${TOOLCHAIN_DIR}/android-commandline-tools.zip" tools_tmp="${TOOLCHAIN_DIR}/android-tools-tmp"
    rm -rf "${tools_tmp}"
    mkdir -p "${tools_tmp}" "${android_home}/cmdline-tools"
    curl -fL 'https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip' -o "${tools_zip}"
    unzip -q "${tools_zip}" -d "${tools_tmp}"
    rm -rf "${android_home}/cmdline-tools/latest"
    mv "${tools_tmp}/cmdline-tools" "${android_home}/cmdline-tools/latest"
    rm -rf "${tools_tmp}" "${tools_zip}"
  fi
  yes | "${android_home}/cmdline-tools/latest/bin/sdkmanager" --licenses >/dev/null 2>&1 || true
  "${android_home}/cmdline-tools/latest/bin/sdkmanager" 'platform-tools' 'platforms;android-37' 'build-tools;37.0.0' >/tmp/ghost-nexora-android-sdk.log
}

prepare_signing_identities() {
  command -v openssl >/dev/null 2>&1 || fail 'openssl no está disponible.'
  touch "${SIGNING_ENV}"
  chmod 0600 "${SIGNING_ENV}"

  local android_pass android_alias android_jks
  android_pass="$(secret_get ANDROID_KEYSTORE_PASSWORD)"
  android_alias="$(secret_get ANDROID_KEY_ALIAS)"
  [[ -n "${android_pass}" ]] || { android_pass="$(random_secret)"; secret_set ANDROID_KEYSTORE_PASSWORD "${android_pass}"; secret_set ANDROID_KEY_PASSWORD "${android_pass}"; }
  [[ -n "${android_alias}" ]] || { android_alias='ghostnexora-release'; secret_set ANDROID_KEY_ALIAS "${android_alias}"; }
  android_jks="${SIGNING_DIR}/ghost-nexora-android-release.p12"
  if [[ ! -f "${android_jks}" ]]; then
    keytool -genkeypair -noprompt -storetype PKCS12 -keystore "${android_jks}" -storepass "${android_pass}" -keypass "${android_pass}" \
      -alias "${android_alias}" -keyalg RSA -keysize 4096 -validity 36500 -dname 'CN=Ghost Nexora Manager, OU=Release Signing, O=Ghost Developer'
  fi
  chmod 0600 "${android_jks}"
  secret_set ANDROID_KEYSTORE_PATH "${android_jks}"

  local windows_pass windows_pfx windows_mode
  windows_pass="$(secret_get WINDOWS_PFX_PASSWORD)"
  [[ -n "${windows_pass}" ]] || { windows_pass="$(random_secret)"; secret_set WINDOWS_PFX_PASSWORD "${windows_pass}"; }
  windows_pfx="$(secret_get WINDOWS_PFX_PATH)"
  [[ -n "${windows_pfx}" ]] || windows_pfx="${SIGNING_DIR}/ghost-nexora-windows-release.pfx"
  windows_mode="$(secret_get WINDOWS_SIGNING_MODE)"
  [[ -n "${windows_mode}" ]] || windows_mode='self-signed'
  if [[ ! -f "${windows_pfx}" ]]; then
    local key_pem="${SIGNING_DIR}/ghost-nexora-windows.key.pem" cert_pem="${SIGNING_DIR}/ghost-nexora-windows.cert.pem"
    openssl req -x509 -newkey rsa:4096 -sha256 -days 3650 -nodes -keyout "${key_pem}" -out "${cert_pem}" \
      -subj '/CN=Ghost Nexora Manager/O=Ghost Developer/OU=Release Signing'
    openssl pkcs12 -export -out "${windows_pfx}" -inkey "${key_pem}" -in "${cert_pem}" -passout "pass:${windows_pass}"
    chmod 0600 "${key_pem}" "${cert_pem}" "${windows_pfx}"
    windows_mode='self-signed'
  fi
  secret_set WINDOWS_PFX_PATH "${windows_pfx}"
  secret_set WINDOWS_SIGNING_MODE "${windows_mode}"

  local gpg_pass gnupg_home
  gpg_pass="$(secret_get GPG_KEY_PASSPHRASE)"
  [[ -n "${gpg_pass}" ]] || { gpg_pass="$(random_secret)"; secret_set GPG_KEY_PASSPHRASE "${gpg_pass}"; }
  gnupg_home="${SIGNING_DIR}/gnupg"
  install -d -m 0700 "${gnupg_home}"
  if ! GNUPGHOME="${gnupg_home}" gpg --batch --list-secret-keys 'Ghost Nexora Release' >/dev/null 2>&1; then
    local batch="${SIGNING_DIR}/gpg-generate.$$"
    cat >"${batch}" <<EOF
Key-Type: RSA
Key-Length: 4096
Subkey-Type: RSA
Subkey-Length: 4096
Name-Real: Ghost Nexora Release
Name-Email: releases@ghostnexora.local
Expire-Date: 0
Passphrase: ${gpg_pass}
%commit
EOF
    chmod 0600 "${batch}"
    GNUPGHOME="${gnupg_home}" gpg --batch --pinentry-mode loopback --generate-key "${batch}"
    rm -f "${batch}"
  fi
  secret_set GNUPGHOME_PATH "${gnupg_home}"
  chmod 0600 "${SIGNING_ENV}"
}

load_signing() {
  # Archivo generado exclusivamente por root; nunca está dentro del árbol Git ni del directorio público.
  # shellcheck disable=SC1090
  source "${SIGNING_ENV}"
  export ANDROID_KEYSTORE_PATH ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_PASSWORD ANDROID_KEY_ALIAS
  export WINDOWS_PFX_PATH WINDOWS_PFX_PASSWORD WINDOWS_SIGNING_MODE GPG_KEY_PASSPHRASE GNUPGHOME_PATH
}

fingerprints() {
  ANDROID_SIGNER_FINGERPRINT="$(keytool -list -v -storetype PKCS12 -keystore "${ANDROID_KEYSTORE_PATH}" -storepass "${ANDROID_KEYSTORE_PASSWORD}" -alias "${ANDROID_KEY_ALIAS}" 2>/dev/null | awk '/SHA256:/{gsub(":","",$2); print tolower($2); exit}')"
  WINDOWS_SIGNER_FINGERPRINT="$(openssl pkcs12 -in "${WINDOWS_PFX_PATH}" -clcerts -nokeys -passin "pass:${WINDOWS_PFX_PASSWORD}" 2>/dev/null | openssl x509 -noout -fingerprint -sha256 | cut -d= -f2 | tr -d ':' | tr '[:upper:]' '[:lower:]')"
  LINUX_SIGNER_FINGERPRINT="$(GNUPGHOME="${GNUPGHOME_PATH}" gpg --batch --with-colons --list-secret-keys 'Ghost Nexora Release' | awk -F: '$1=="fpr"{print tolower($10); exit}')"
  [[ -n "${ANDROID_SIGNER_FINGERPRINT}" && -n "${WINDOWS_SIGNER_FINGERPRINT}" && -n "${LINUX_SIGNER_FINGERPRINT}" ]] || fail 'No se pudieron resolver fingerprints de firma.'
  export ANDROID_SIGNER_FINGERPRINT WINDOWS_SIGNER_FINGERPRINT LINUX_SIGNER_FINGERPRINT
}

setup_paths() {
  export RUSTUP_HOME="${TOOLCHAIN_DIR}/rustup"
  export CARGO_HOME="${TOOLCHAIN_DIR}/cargo"
  export XWIN_CACHE_DIR="${TOOLCHAIN_DIR}/xwin-cache"
  export ANDROID_HOME="${TOOLCHAIN_DIR}/android-sdk"
  export ANDROID_SDK_ROOT="${ANDROID_HOME}"
  export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
  export PATH="${TOOLCHAIN_DIR}/gradle-9.6.0/bin:${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/cmdline-tools/latest/bin:${CARGO_HOME}/bin:${PATH}"
}

copy_one() {
  local pattern="$1" target="$2" source
  source="$(find ${pattern} -type f 2>/dev/null | head -n1 || true)"
  [[ -n "${source}" && -f "${source}" ]] || fail "Artefacto no encontrado: ${pattern}"
  cp "${source}" "${STAGE}/${target}"
  chmod 0644 "${STAGE}/${target}"
}

build_android() {
  info 'Compilando Android APK con keystore persistente…'
  export GHOST_NEXORA_ANDROID_KEYSTORE="${ANDROID_KEYSTORE_PATH}"
  export GHOST_NEXORA_ANDROID_KEY_ALIAS="${ANDROID_KEY_ALIAS}"
  export GHOST_NEXORA_ANDROID_KEYSTORE_PASSWORD="${ANDROID_KEYSTORE_PASSWORD}"
  export GHOST_NEXORA_ANDROID_KEY_PASSWORD="${ANDROID_KEY_PASSWORD}"
  export GHOST_NEXORA_SOURCE_REF="${SOURCE_SHA}"
  gradle -p apps/android clean assembleRelease >/tmp/ghost-nexora-release-android.log 2>&1
  local apk
  apk="$(find apps/android/app/build/outputs/apk/release -type f -name '*.apk' | head -n1 || true)"
  [[ -n "${apk}" ]] || fail 'APK release no generado.'
  "${ANDROID_HOME}/build-tools/37.0.0/apksigner" verify --verbose --print-certs "${apk}" >/tmp/ghost-nexora-release-apksigner.log
  cp "${apk}" "${STAGE}/GhostNexoraManager-${VERSION}-android.apk"
}

build_linux() {
  info 'Compilando Linux: DEB, AppImage y RPM…'
  export GHOST_NEXORA_SOURCE_REF="${SOURCE_SHA}"
  npm run tauri:build --workspace=@ghostnexora/desktop -- --bundles deb,appimage,rpm >/tmp/ghost-nexora-release-linux.log 2>&1
  copy_one 'apps/desktop/src-tauri/target/release/bundle/deb/*.deb' "ghost-nexora-manager_${VERSION}_amd64.deb"
  copy_one 'apps/desktop/src-tauri/target/release/bundle/appimage/*.AppImage' "GhostNexoraManager-${VERSION}-linux-x86_64.AppImage"
  local rpm
  rpm="$(find apps/desktop/src-tauri/target/release/bundle/rpm -type f -name '*.rpm' 2>/dev/null | head -n1 || true)"
  if [[ -n "${rpm}" ]]; then cp "${rpm}" "${STAGE}/ghost-nexora-manager-${VERSION}-1.x86_64.rpm"; else info 'RPM no generado; DEB/AppImage siguen disponibles.'; fi
}

build_windows() {
  info 'Compilando Windows NSIS x64 desde Linux con cargo-xwin…'
  export GHOST_NEXORA_SOURCE_REF="${SOURCE_SHA}"
  export WINDOWS_PFX="${WINDOWS_PFX_PATH}"
  export WINDOWS_PFX_PASSWORD
  export PUBLIC_WEB_URL="${PUBLIC_WEB_URL:-https://github.com/Gh0stDeveloper/GhostNexoraBot}"
  npm run tauri --workspace=@ghostnexora/desktop -- build --runner cargo-xwin --target x86_64-pc-windows-msvc --no-bundle >/tmp/ghost-nexora-release-windows-build.log 2>&1
  local exe
  exe="$(find apps/desktop/src-tauri/target/x86_64-pc-windows-msvc/release -maxdepth 1 -type f -name '*.exe' | head -n1 || true)"
  [[ -n "${exe}" ]] || fail 'Ejecutable Windows no generado.'
  bash scripts/release/sign-windows.sh "${exe}"
  npm run tauri --workspace=@ghostnexora/desktop -- bundle --target x86_64-pc-windows-msvc --bundles nsis >/tmp/ghost-nexora-release-windows-bundle.log 2>&1
  local installer
  installer="$(find apps/desktop/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis -type f -name '*.exe' | head -n1 || true)"
  [[ -n "${installer}" ]] || fail 'Instalador NSIS no generado.'
  bash scripts/release/sign-windows.sh "${installer}"
  cp "${installer}" "${STAGE}/GhostNexoraManager-${VERSION}-windows-x64-setup.exe"
}

sign_catalog_files() {
  info 'Generando hashes y firma GPG del catálogo…'
  (cd "${STAGE}" && find . -maxdepth 1 -type f \( -name '*.apk' -o -name '*.exe' -o -name '*.deb' -o -name '*.AppImage' -o -name '*.rpm' \) -printf '%f\n' | sort | xargs sha256sum > SHA256SUMS.txt)
  GNUPGHOME="${GNUPGHOME_PATH}" gpg --batch --yes --pinentry-mode loopback --passphrase "${GPG_KEY_PASSPHRASE}" --armor --detach-sign \
    --local-user "${LINUX_SIGNER_FINGERPRINT}" --output "${STAGE}/SHA256SUMS.txt.asc" "${STAGE}/SHA256SUMS.txt"
  GNUPGHOME="${GNUPGHOME_PATH}" gpg --batch --armor --export "${LINUX_SIGNER_FINGERPRINT}" > "${STAGE}/GHOST-NEXORA-RELEASE-PUBLIC.asc"
  chmod 0644 "${STAGE}/SHA256SUMS.txt" "${STAGE}/SHA256SUMS.txt.asc" "${STAGE}/GHOST-NEXORA-RELEASE-PUBLIC.asc"
}

publish() {
  info 'Publicando catálogo y registrando historial SQLite…'
  OFFICIAL_RELEASE_STAGE="${STAGE}" \
  OFFICIAL_RELEASE_DIR="${RELEASE_DIR}" \
  OFFICIAL_RELEASE_DB="${RELEASE_DB}" \
  OFFICIAL_RELEASE_VERSION="${VERSION}" \
  OFFICIAL_RELEASE_CHANNEL="${CHANNEL}" \
  OFFICIAL_SOURCE_SHA="${SOURCE_SHA}" \
  OFFICIAL_SOURCE_REF="${SOURCE_REF}" \
  ANDROID_SIGNER_FINGERPRINT="${ANDROID_SIGNER_FINGERPRINT}" \
  WINDOWS_SIGNER_FINGERPRINT="${WINDOWS_SIGNER_FINGERPRINT}" \
  WINDOWS_SIGNING_MODE="${WINDOWS_SIGNING_MODE}" \
  LINUX_SIGNER_FINGERPRINT="${LINUX_SIGNER_FINGERPRINT}" \
  node scripts/release/publish-official-release.mjs

  chown -R root:"${SERVICE_USER}" "${RELEASE_DIR}"
  find "${RELEASE_DIR}" -type d -exec chmod 0750 {} +
  find "${RELEASE_DIR}" -type f -exec chmod 0640 {} +
  chown -R root:root "${SIGNING_DIR}" "$(dirname "${RELEASE_DB}")"
  chmod 0700 "${SIGNING_DIR}" "$(dirname "${RELEASE_DB}")"
  chmod 0600 "${SIGNING_ENV}" "${RELEASE_DB}" 2>/dev/null || true
}

main_env_set OFFICIAL_DISTRIBUTION_ENABLED 'true'
main_env_set OFFICIAL_RELEASE_DIR "${RELEASE_DIR}"
main_env_set OFFICIAL_RELEASE_DB "${RELEASE_DB}"
main_env_set OFFICIAL_SIGNING_DIR "${SIGNING_DIR}"
main_env_set OFFICIAL_SIGNING_ENV "${SIGNING_ENV}"
main_env_set OFFICIAL_RELEASE_CHANNEL "${CHANNEL}"
chmod 0640 "${ENV_FILE}" 2>/dev/null || true

provision_toolchain
setup_paths
prepare_signing_identities
load_signing
fingerprints

info "Fuente: ${SOURCE_REF} · ${SOURCE_SHA:0:12} · versión ${VERSION} · canal ${CHANNEL}"
npm install >/tmp/ghost-nexora-release-npm.log 2>&1
build_android
build_linux
build_windows
sign_catalog_files
publish

info "Distribución oficial lista en ${RELEASE_DIR}."
info "Android fingerprint: ${ANDROID_SIGNER_FINGERPRINT}"
info "Windows fingerprint: ${WINDOWS_SIGNER_FINGERPRINT} (${WINDOWS_SIGNING_MODE})"
info "Linux GPG fingerprint: ${LINUX_SIGNER_FINGERPRINT}"
info "Tiempo total: $(( $(date +%s) - START_TS ))s"
