#!/usr/bin/env bash
set -Eeuo pipefail

ACTION="${1:-probe}"
SOURCE_REF="${2:-main}"
EXTRA_VALUE="${3:-}"
REPO_URL="https://github.com/Gh0stDeveloper/GhostNexoraBot.git"
DATA_HOME="${XDG_DATA_HOME:-${HOME}/.local/share}"
CONFIG_HOME="${XDG_CONFIG_HOME:-${HOME}/.config}"
ROOT_DIR="${DATA_HOME}/ghost-nexora"
REPO_DIR="${ROOT_DIR}/bot"
STATE_DIR="${ROOT_DIR}/state"
SESSION_DIR="${STATE_DIR}/session"
BOT_DATA_DIR="${STATE_DIR}/data"
DOWNLOAD_DIR="${ROOT_DIR}/downloads"
LOG_DIR="${ROOT_DIR}/logs"
RUN_DIR="${ROOT_DIR}/run"
RUNTIME_DIR="${ROOT_DIR}/runtime"
NODE_DIR="${RUNTIME_DIR}/node"
BIN_DIR="${RUNTIME_DIR}/bin"
ENV_FILE="${STATE_DIR}/.env"
SOURCE_REF_FILE="${STATE_DIR}/source-ref"
BOT_LOG="${LOG_DIR}/bot.log"
WEB_LOG="${LOG_DIR}/web.log"
BOT_PID_FILE="${RUN_DIR}/bot.pid"
WEB_PID_FILE="${RUN_DIR}/web.pid"
USER_UNIT_DIR="${CONFIG_HOME}/systemd/user"
BOT_UNIT="${USER_UNIT_DIR}/ghost-nexora-bot.service"
WEB_UNIT="${USER_UNIT_DIR}/ghost-nexora-web.service"
BOT_PORT=3001
WEB_PORT=3000

log() { printf '[Ghost Nexora Linux] %s\n' "$*" >&2; }
fail() { log "ERROR: $*"; exit 1; }

validate_source_ref() {
  [[ -n "${SOURCE_REF}" && ${#SOURCE_REF} -le 160 ]] || fail 'invalid_source_ref'
  [[ "${SOURCE_REF}" =~ ^[A-Za-z0-9._/-]+$ ]] || fail 'invalid_source_ref'
  [[ "${SOURCE_REF}" != -* && "${SOURCE_REF}" != *'..'* ]] || fail 'invalid_source_ref'
}

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/\t/\\t/g' -e 's/\r/\\r/g'
}

truthy() {
  case "${1,,}" in 1|true|yes|on|si|sí) return 0 ;; *) return 1 ;; esac
}

ensure_dirs() {
  mkdir -p "${ROOT_DIR}" "${STATE_DIR}" "${SESSION_DIR}" "${BOT_DATA_DIR}" "${BOT_DATA_DIR}/subbots" \
    "${DOWNLOAD_DIR}" "${LOG_DIR}" "${RUN_DIR}" "${RUNTIME_DIR}" "${BIN_DIR}" "${USER_UNIT_DIR}"
  chmod 700 "${STATE_DIR}" "${SESSION_DIR}" "${RUN_DIR}" 2>/dev/null || true
}

get_env() {
  local key="$1"
  [[ -f "${ENV_FILE}" ]] || return 0
  awk -v key="${key}" 'index($0,key"=")==1 { value=substr($0,length(key)+2) } END { print value }' "${ENV_FILE}"
}

set_env() {
  local key="$1" value="$2" tmp
  ensure_dirs
  [[ -f "${ENV_FILE}" ]] || : > "${ENV_FILE}"
  tmp="$(mktemp "${STATE_DIR}/.env.XXXXXX")"
  grep -v "^${key}=" "${ENV_FILE}" > "${tmp}" || true
  printf '%s=%s\n' "${key}" "${value}" >> "${tmp}"
  mv "${tmp}" "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
}

node_bin() {
  if [[ -x "${NODE_DIR}/bin/node" ]]; then printf '%s' "${NODE_DIR}/bin/node"; return; fi
  command -v node 2>/dev/null || true
}

npm_bin() {
  if [[ -x "${NODE_DIR}/bin/npm" ]]; then printf '%s' "${NODE_DIR}/bin/npm"; return; fi
  command -v npm 2>/dev/null || true
}

node_ok() {
  local node major
  node="$(node_bin)"
  [[ -n "${node}" ]] || return 1
  major="$(${node} -p 'Number(process.versions.node.split(`.`)[0])' 2>/dev/null || echo 0)"
  [[ "${major}" =~ ^[0-9]+$ ]] && (( major >= 24 ))
}

npm_ok() {
  local npm major
  npm="$(npm_bin)"
  [[ -n "${npm}" ]] || return 1
  major="$(${npm} --version 2>/dev/null | cut -d. -f1 || echo 0)"
  [[ "${major}" =~ ^[0-9]+$ ]] && (( major >= 11 ))
}

systemd_user_available() {
  command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1
}

pid_running() {
  local file="$1" pid
  [[ -f "${file}" ]] || return 1
  pid="$(cat "${file}" 2>/dev/null || true)"
  [[ "${pid}" =~ ^[0-9]+$ ]] || return 1
  kill -0 "${pid}" >/dev/null 2>&1
}

bot_running() {
  if systemd_user_available && systemctl --user is-active --quiet ghost-nexora-bot.service 2>/dev/null; then return 0; fi
  pid_running "${BOT_PID_FILE}"
}

web_running() {
  if systemd_user_available && systemctl --user is-active --quiet ghost-nexora-web.service 2>/dev/null; then return 0; fi
  pid_running "${WEB_PID_FILE}"
}

missing_system_dependencies() {
  local missing=() cmd
  for cmd in git curl ffmpeg python3 tar xz sha256sum; do
    command -v "${cmd}" >/dev/null 2>&1 || missing+=("${cmd}")
  done
  printf '%s\n' "${missing[@]:-}"
}

missing_json() {
  local first=1 item
  printf '['
  while IFS= read -r item; do
    [[ -n "${item}" ]] || continue
    if (( first == 0 )); then printf ','; fi
    first=0
    printf '"%s"' "$(json_escape "${item}")"
  done < <(missing_system_dependencies)
  printf ']'
}

current_sha() {
  [[ -d "${REPO_DIR}/.git" ]] || return 0
  git -C "${REPO_DIR}" rev-parse --short=12 HEAD 2>/dev/null || true
}

stored_source_ref() {
  if [[ -f "${SOURCE_REF_FILE}" ]]; then cat "${SOURCE_REF_FILE}"; else printf '%s' "${SOURCE_REF}"; fi
}

runtime_mode() {
  if [[ -f "${BOT_UNIT}" ]] && systemd_user_available; then printf 'systemd-user'; else printf 'process'; fi
}

emit_probe() {
  local installed=false running=false web=false web_active=false node="" npm="" sha="" ref="" mode="" deps
  [[ -d "${REPO_DIR}/.git" && -f "${REPO_DIR}/apps/bot/dist/index.js" && -f "${ENV_FILE}" ]] && installed=true
  bot_running && running=true || true
  web_running && web_active=true || true
  truthy "$(get_env WEB_ENABLED)" && web=true || true
  node="$(node_bin)"; npm="$(npm_bin)"; sha="$(current_sha)"; ref="$(stored_source_ref)"; mode="$(runtime_mode)"
  deps="$(missing_json)"
  printf '{'
  printf '"ok":true,"supported":true,"installed":%s,"running":%s,"webEnabled":%s,"webRunning":%s,' "${installed}" "${running}" "${web}" "${web_active}"
  printf '"serviceMode":"%s","sourceRef":"%s","currentSha":"%s",' "$(json_escape "${mode}")" "$(json_escape "${ref}")" "$(json_escape "${sha}")"
  printf '"nodeVersion":"%s","npmVersion":"%s","nodeOk":%s,"npmOk":%s,' \
    "$(json_escape "$([[ -n "${node}" ]] && "${node}" --version 2>/dev/null || true)")" \
    "$(json_escape "$([[ -n "${npm}" ]] && "${npm}" --version 2>/dev/null || true)")" \
    "$([[ -n "${node}" ]] && node_ok && echo true || echo false)" \
    "$([[ -n "${npm}" ]] && npm_ok && echo true || echo false)"
  printf '"missingDependencies":%s,' "${deps}"
  printf '"paths":{"root":"%s","repo":"%s","state":"%s","session":"%s","data":"%s","downloads":"%s","logs":"%s"}' \
    "$(json_escape "${ROOT_DIR}")" "$(json_escape "${REPO_DIR}")" "$(json_escape "${STATE_DIR}")" "$(json_escape "${SESSION_DIR}")" \
    "$(json_escape "${BOT_DATA_DIR}")" "$(json_escape "${DOWNLOAD_DIR}")" "$(json_escape "${LOG_DIR}")"
  printf '}\n'
}

install_system_dependencies() {
  mapfile -t missing < <(missing_system_dependencies)
  (( ${#missing[@]} == 0 )) && return 0
  command -v pkexec >/dev/null 2>&1 || fail "system_dependencies_missing:${missing[*]}:pkexec_unavailable"
  log "Instalando dependencias del sistema: ${missing[*]}"
  if [[ -x /usr/bin/apt-get ]]; then
    pkexec env DEBIAN_FRONTEND=noninteractive /usr/bin/apt-get update || return 1
    pkexec env DEBIAN_FRONTEND=noninteractive /usr/bin/apt-get install -y ca-certificates curl git ffmpeg python3 xz-utils build-essential webp || return 1
  elif [[ -x /usr/bin/dnf ]]; then
    pkexec /usr/bin/dnf install -y ca-certificates curl git ffmpeg python3 xz gcc gcc-c++ make libwebp-tools || return 1
  elif [[ -x /usr/bin/pacman ]]; then
    pkexec /usr/bin/pacman -Sy --needed --noconfirm ca-certificates curl git ffmpeg python xz base-devel libwebp || return 1
  else
    fail "unsupported_package_manager:${missing[*]}"
  fi
  mapfile -t missing < <(missing_system_dependencies)
  (( ${#missing[@]} == 0 )) || fail "system_dependencies_still_missing:${missing[*]}"
}

install_node_runtime() {
  node_ok && npm_ok && return 0
  local arch suffix sums filename expected tmp extracted
  case "$(uname -m)" in
    x86_64|amd64) arch=x64 ;;
    aarch64|arm64) arch=arm64 ;;
    *) fail "unsupported_linux_arch:$(uname -m)" ;;
  esac
  log 'Preparando Node.js 24 per-user…'
  sums="$(curl -fsSL https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt)" || fail 'node_checksums_download_failed'
  suffix="linux-${arch}.tar.xz"
  filename="$(printf '%s\n' "${sums}" | awk -v suffix="${suffix}" '$2 ~ suffix"$" {print $2; exit}')"
  [[ -n "${filename}" ]] || fail 'node_archive_not_found'
  expected="$(printf '%s\n' "${sums}" | awk -v file="${filename}" '$2==file {print $1; exit}')"
  tmp="$(mktemp -d "${RUNTIME_DIR}/node-download.XXXXXX")"
  curl -fL "https://nodejs.org/dist/latest-v24.x/${filename}" -o "${tmp}/${filename}" || return 1
  printf '%s  %s\n' "${expected}" "${tmp}/${filename}" | sha256sum -c - >/dev/null || fail 'node_checksum_failed'
  tar -xJf "${tmp}/${filename}" -C "${tmp}" || return 1
  extracted="$(find "${tmp}" -maxdepth 1 -type d -name 'node-v*-linux-*' | head -n1)"
  [[ -n "${extracted}" ]] || fail 'node_extract_failed'
  rm -rf "${NODE_DIR}"
  mv "${extracted}" "${NODE_DIR}" || return 1
  rm -rf "${tmp}"
  node_ok && npm_ok || fail 'node_runtime_invalid'
}

install_ytdlp() {
  local target="${BIN_DIR}/yt-dlp"
  log 'Preparando yt-dlp local…'
  curl -fL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o "${target}" || return 1
  chmod 755 "${target}" || return 1
}

checkout_source() {
  validate_source_ref
  if [[ ! -d "${REPO_DIR}/.git" ]]; then
    rm -rf "${REPO_DIR}"
    log 'Clonando Ghost Nexora Bot…'
    git clone --filter=blob:none --no-checkout "${REPO_URL}" "${REPO_DIR}" || return 1
  fi
  log "Sincronizando ref ${SOURCE_REF}…"
  git -C "${REPO_DIR}" fetch --depth 1 origin "${SOURCE_REF}" || return 1
  git -C "${REPO_DIR}" checkout --detach FETCH_HEAD || return 1
  printf '%s\n' "${SOURCE_REF}" > "${SOURCE_REF_FILE}" || return 1
  chmod 600 "${SOURCE_REF_FILE}" || return 1
}

prepare_env() {
  ensure_dirs
  if [[ ! -f "${ENV_FILE}" ]]; then
    cp "${REPO_DIR}/.env.example" "${ENV_FILE}" || return 1
  fi
  set_env NEXORA_RUNTIME_PROFILE full
  set_env BOT_NAME "$(get_env BOT_NAME || true)"
  [[ -n "$(get_env BOT_NAME)" ]] || set_env BOT_NAME 'Ghost Nexora Bot'
  set_env PREFIX "$(get_env PREFIX || true)"
  [[ -n "$(get_env PREFIX)" ]] || set_env PREFIX '.'
  if [[ "$(get_env OWNER_NUMBERS)" == '5210000000000' ]]; then set_env OWNER_NUMBERS ''; fi
  set_env SESSION_DIR "${SESSION_DIR}"
  set_env DATA_DIR "${BOT_DATA_DIR}"
  set_env MAX_DOWNLOAD_MB 1900
  set_env BOT_HEALTH_PORT "${BOT_PORT}"
  set_env BOT_HEALTH_URL "http://127.0.0.1:${BOT_PORT}/health"
  set_env WEB_ENABLED false
  set_env WEB_PORT "${WEB_PORT}"
  set_env PUBLIC_WEB_URL "http://127.0.0.1:${WEB_PORT}"
  set_env OLLAMA_ENABLED false
  set_env BROWSER_PROXY_PUBLIC_URL 'http://127.0.0.1:3847/proxy'
  set_env BROWSER_PROXY_PORT 3847
  set_env YTDLP_COOKIES_FILE "${STATE_DIR}/cookies/media.txt"
  mkdir -p "${STATE_DIR}/cookies"
  local token node
  token="$(get_env ADMIN_WEB_TOKEN)"
  if [[ -z "${token}" || "${token}" == 'change-this-admin-token' ]]; then
    node="$(node_bin)"
    token="$(${node} -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")" || return 1
    set_env ADMIN_WEB_TOKEN "${token}"
  fi
  set_env MANAGER_API_TOKEN "${token}"
  chmod 600 "${ENV_FILE}" || return 1
}

with_runtime_path() {
  PATH="${NODE_DIR}/bin:${BIN_DIR}:${PATH}" GHOST_NEXORA_INSTALL_CLI=0 "$@"
}

build_bot() {
  local npm
  npm="$(npm_bin)"; [[ -n "${npm}" ]] || fail 'npm_unavailable'
  log 'Instalando dependencias Node del bot…'
  (cd "${REPO_DIR}" && with_runtime_path "${npm}" install --workspace=@ghostnexora/bot --include=dev) || return 1
  log 'Preparando assets…'
  (cd "${REPO_DIR}" && with_runtime_path "${npm}" run assets:waifus) || return 1
  log 'Compilando runtime…'
  (cd "${REPO_DIR}" && with_runtime_path "${npm}" run build --workspace=@ghostnexora/bot) || return 1
}

write_bot_unit() {
  local node
  node="$(node_bin)"; [[ -n "${node}" ]] || fail 'node_unavailable'
  cat > "${BOT_UNIT}" <<EOF
[Unit]
Description=Ghost Nexora Bot local runtime
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${REPO_DIR}
Environment="ENV_FILE=${ENV_FILE}"
Environment="PATH=${NODE_DIR}/bin:${BIN_DIR}:/usr/local/bin:/usr/bin:/bin"
ExecStart=${node} apps/bot/dist/index.js
Restart=on-failure
RestartSec=4
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=${ROOT_DIR}

[Install]
WantedBy=default.target
EOF
  chmod 600 "${BOT_UNIT}" || return 1
  if systemd_user_available; then
    systemctl --user daemon-reload || return 1
    systemctl --user enable ghost-nexora-bot.service >/dev/null || return 1
  fi
}

start_bot() {
  ensure_dirs
  [[ -f "${REPO_DIR}/apps/bot/dist/index.js" && -f "${ENV_FILE}" ]] || fail 'runtime_not_installed'
  write_bot_unit || return 1
  if systemd_user_available; then
    systemctl --user start ghost-nexora-bot.service || return 1
  else
    if pid_running "${BOT_PID_FILE}"; then return 0; fi
    local node
    node="$(node_bin)"; [[ -n "${node}" ]] || fail 'node_unavailable'
    (cd "${REPO_DIR}" && nohup env ENV_FILE="${ENV_FILE}" PATH="${NODE_DIR}/bin:${BIN_DIR}:${PATH}" "${node}" apps/bot/dist/index.js >> "${BOT_LOG}" 2>&1 & echo $! > "${BOT_PID_FILE}") || return 1
  fi
  local attempt
  for attempt in $(seq 1 50); do
    if curl -fsS --max-time 1 "http://127.0.0.1:${BOT_PORT}/health" >/dev/null 2>&1; then return 0; fi
    sleep 0.2
  done
  bot_running || fail 'runtime_start_failed'
}

stop_bot() {
  if systemd_user_available && [[ -f "${BOT_UNIT}" ]]; then
    systemctl --user stop ghost-nexora-bot.service >/dev/null 2>&1 || true
  fi
  if pid_running "${BOT_PID_FILE}"; then
    local pid
    pid="$(cat "${BOT_PID_FILE}")"
    kill "${pid}" >/dev/null 2>&1 || true
    for _ in $(seq 1 25); do kill -0 "${pid}" >/dev/null 2>&1 || break; sleep 0.2; done
  fi
  rm -f "${BOT_PID_FILE}"
}

build_web() {
  local npm
  npm="$(npm_bin)"; [[ -n "${npm}" ]] || fail 'npm_unavailable'
  log 'Instalando dependencias Web…'
  (cd "${REPO_DIR}" && with_runtime_path "${npm}" install --workspace=@ghostnexora/web --include=dev) || return 1
  log 'Compilando dashboard Web…'
  (cd "${REPO_DIR}" && with_runtime_path "${npm}" run build --workspace=@ghostnexora/web) || return 1
}

write_web_unit() {
  local npm
  npm="$(npm_bin)"; [[ -n "${npm}" ]] || fail 'npm_unavailable'
  cat > "${WEB_UNIT}" <<EOF
[Unit]
Description=Ghost Nexora local web dashboard
After=network-online.target ghost-nexora-bot.service

[Service]
Type=simple
WorkingDirectory=${REPO_DIR}
Environment="ENV_FILE=${ENV_FILE}"
Environment="PATH=${NODE_DIR}/bin:${BIN_DIR}:/usr/local/bin:/usr/bin:/bin"
ExecStart=${npm} run start --workspace=@ghostnexora/web -- --hostname 127.0.0.1 --port ${WEB_PORT}
Restart=on-failure
RestartSec=4
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=${ROOT_DIR} ${REPO_DIR}/apps/web/.next

[Install]
WantedBy=default.target
EOF
  chmod 600 "${WEB_UNIT}" || return 1
  if systemd_user_available; then
    systemctl --user daemon-reload || return 1
    systemctl --user enable ghost-nexora-web.service >/dev/null || return 1
  fi
}

start_web() {
  [[ -d "${REPO_DIR}/apps/web/.next" ]] || fail 'web_not_built'
  write_web_unit || return 1
  if systemd_user_available; then
    systemctl --user start ghost-nexora-web.service || return 1
  else
    if pid_running "${WEB_PID_FILE}"; then return 0; fi
    local npm
    npm="$(npm_bin)"; [[ -n "${npm}" ]] || fail 'npm_unavailable'
    (cd "${REPO_DIR}" && nohup env ENV_FILE="${ENV_FILE}" PATH="${NODE_DIR}/bin:${BIN_DIR}:${PATH}" "${npm}" run start --workspace=@ghostnexora/web -- --hostname 127.0.0.1 --port "${WEB_PORT}" >> "${WEB_LOG}" 2>&1 & echo $! > "${WEB_PID_FILE}") || return 1
  fi
}

stop_web() {
  if systemd_user_available && [[ -f "${WEB_UNIT}" ]]; then
    systemctl --user disable --now ghost-nexora-web.service >/dev/null 2>&1 || true
  fi
  if pid_running "${WEB_PID_FILE}"; then
    kill "$(cat "${WEB_PID_FILE}")" >/dev/null 2>&1 || true
  fi
  rm -f "${WEB_PID_FILE}"
}

install_runtime() {
  ensure_dirs
  install_system_dependencies || fail 'system_dependency_install_failed'
  install_node_runtime || fail 'node_runtime_install_failed'
  install_ytdlp || fail 'ytdlp_install_failed'
  checkout_source || fail 'source_checkout_failed'
  prepare_env || fail 'environment_prepare_failed'
  build_bot || fail 'bot_build_failed'
  write_bot_unit || fail 'bot_unit_prepare_failed'
  start_bot || fail 'bot_start_failed'
}

update_runtime() {
  [[ -d "${REPO_DIR}/.git" ]] || fail 'runtime_not_installed'
  local old_sha old_ref was_running=false
  old_sha="$(git -C "${REPO_DIR}" rev-parse HEAD)"
  old_ref="$(stored_source_ref)"
  bot_running && was_running=true || true
  stop_bot
  if checkout_source && build_bot && write_bot_unit; then
    [[ "${was_running}" == true ]] && start_bot || true
    return 0
  fi
  log 'Actualización falló; revirtiendo código anterior…'
  git -C "${REPO_DIR}" checkout --detach "${old_sha}" || true
  printf '%s\n' "${old_ref}" > "${SOURCE_REF_FILE}" || true
  build_bot || true
  write_bot_unit || true
  [[ "${was_running}" == true ]] && start_bot || true
  fail 'update_failed_rolled_back'
}

repair_runtime() {
  [[ -d "${REPO_DIR}/.git" ]] || fail 'runtime_not_installed'
  install_system_dependencies || fail 'system_dependency_install_failed'
  install_node_runtime || fail 'node_runtime_install_failed'
  install_ytdlp || fail 'ytdlp_install_failed'
  prepare_env || fail 'environment_prepare_failed'
  build_bot || fail 'bot_build_failed'
  write_bot_unit || fail 'bot_unit_prepare_failed'
}

enable_web() {
  [[ -d "${REPO_DIR}/.git" ]] || fail 'runtime_not_installed'
  build_web || fail 'web_build_failed'
  set_env WEB_ENABLED true
  set_env PUBLIC_WEB_URL "http://127.0.0.1:${WEB_PORT}"
  start_web || fail 'web_start_failed'
  if bot_running; then stop_bot; start_bot || fail 'bot_restart_failed'; fi
}

disable_web() {
  stop_web
  [[ -f "${ENV_FILE}" ]] && set_env WEB_ENABLED false
  if bot_running; then stop_bot; start_bot || fail 'bot_restart_failed'; fi
}

connection_json() {
  [[ -f "${ENV_FILE}" ]] || fail 'runtime_not_installed'
  local token
  token="$(get_env ADMIN_WEB_TOKEN)"
  [[ ${#token} -ge 12 ]] || fail 'local_token_missing'
  printf '{"ok":true,"baseUrl":"http://127.0.0.1:%s","token":"%s"}\n' "${BOT_PORT}" "$(json_escape "${token}")"
}

set_owner() {
  local number
  number="$(printf '%s' "${EXTRA_VALUE}" | tr -cd '0-9')"
  [[ ${#number} -ge 8 && ${#number} -le 20 ]] || fail 'invalid_owner_number'
  set_env OWNER_NUMBERS "${number}"
  printf '{"ok":true,"ownerNumber":"%s"}\n' "${number}"
}

validate_source_ref
case "${ACTION}" in
  probe) emit_probe ;;
  install) install_runtime; emit_probe ;;
  start) start_bot; emit_probe ;;
  stop) stop_bot; emit_probe ;;
  restart) stop_bot; start_bot; emit_probe ;;
  update) update_runtime; emit_probe ;;
  repair) repair_runtime; emit_probe ;;
  web-on) enable_web; emit_probe ;;
  web-off) disable_web; emit_probe ;;
  connection) connection_json ;;
  owner-set) set_owner ;;
  *) fail 'unsupported_linux_runtime_action' ;;
esac
