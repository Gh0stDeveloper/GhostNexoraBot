#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/ghost-nexora-bot}"
BRANCH="${BRANCH:-main}"
SERVICE_USER="${SERVICE_USER:-ghostbot}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Ejecuta este script con sudo/root."
  exit 1
fi

cd "${INSTALL_DIR}"
git fetch origin "${BRANCH}"
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

if command -v yt-dlp >/dev/null 2>&1; then
  yt-dlp -U >/dev/null 2>&1 || true
fi

pnpm install --no-frozen-lockfile
pnpm build
install -d -m 0750 -o "${SERVICE_USER}" -g "${SERVICE_USER}" "${INSTALL_DIR}/apps/web/.next/cache"
systemctl restart ghost-nexora-bot.service ghost-nexora-web.service
systemctl --no-pager --full status ghost-nexora-bot.service ghost-nexora-web.service || true
