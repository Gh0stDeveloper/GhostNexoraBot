#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
BOT_DIR="${REPO_ROOT}/apps/bot"
OUTPUT_DIR="${OUTPUT_DIR:-${REPO_ROOT}/artifacts/mobile-runtime}"
WORK_DIR="${WORK_DIR:-${RUNNER_TEMP:-/tmp}/ghost-nexora-mobile-runtime}"
STAGE_DIR="${WORK_DIR}/stage"
ZIP_PATH="${OUTPUT_DIR}/mobile-lite-runtime.zip"

test -f "${BOT_DIR}/dist-mobile/mobile-bootstrap.js" || {
  echo "dist-mobile is missing; run the mobile-lite build first" >&2
  exit 2
}
test -d "${REPO_ROOT}/packages/platform-contracts/dist" || {
  echo "platform-contracts dist is missing" >&2
  exit 2
}
test -d "${REPO_ROOT}/packages/control-api-contracts/dist" || {
  echo "control-api-contracts dist is missing" >&2
  exit 2
}

rm -rf "${WORK_DIR}" "${OUTPUT_DIR}"
mkdir -p "${STAGE_DIR}/dist-mobile" "${OUTPUT_DIR}"

cp -R "${BOT_DIR}/dist-mobile/." "${STAGE_DIR}/dist-mobile/"

node --input-type=module - "${BOT_DIR}/package.json" "${STAGE_DIR}/package.json" <<'NODE'
import { readFile, writeFile } from 'node:fs/promises'

const [sourcePath, outputPath] = process.argv.slice(2)
const source = JSON.parse(await readFile(sourcePath, 'utf8'))
const dependencies = Object.fromEntries(
  Object.entries(source.dependencies ?? {}).filter(([name]) =>
    !name.startsWith('@ghostnexora/') && name !== 'qrcode-terminal'
  )
)

const runtime = {
  name: '@ghostnexora/mobile-lite-runtime',
  version: source.version,
  private: true,
  type: 'module',
  engines: { node: '>=24.0.0' },
  dependencies,
}

await writeFile(outputPath, JSON.stringify(runtime, null, 2) + '\n')
NODE

(
  cd "${STAGE_DIR}"
  npm install --omit=dev --omit=optional --ignore-scripts --no-audit --no-fund
)

mkdir -p "${STAGE_DIR}/node_modules/@ghostnexora/platform-contracts"
cp "${REPO_ROOT}/packages/platform-contracts/package.json" "${STAGE_DIR}/node_modules/@ghostnexora/platform-contracts/package.json"
cp -R "${REPO_ROOT}/packages/platform-contracts/dist" "${STAGE_DIR}/node_modules/@ghostnexora/platform-contracts/dist"

mkdir -p "${STAGE_DIR}/node_modules/@ghostnexora/control-api-contracts"
cp "${REPO_ROOT}/packages/control-api-contracts/package.json" "${STAGE_DIR}/node_modules/@ghostnexora/control-api-contracts/package.json"
cp -R "${REPO_ROOT}/packages/control-api-contracts/dist" "${STAGE_DIR}/node_modules/@ghostnexora/control-api-contracts/dist"

node --input-type=module - "${STAGE_DIR}" <<'NODE'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'

const [root] = process.argv.slice(2)
const files = []

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'runtime-manifest.json') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) await walk(full)
    else if (entry.isFile()) files.push(full)
  }
}

await walk(root)
files.sort()

const entries = []
let totalBytes = 0
for (const file of files) {
  const bytes = await readFile(file)
  const size = (await stat(file)).size
  totalBytes += size
  entries.push({
    path: path.relative(root, file).split(path.sep).join('/'),
    size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  })
}

const manifest = {
  schema: 1,
  profile: 'mobile-lite',
  nodeVersion: 'v24.21.0',
  entry: 'dist-mobile/mobile-bootstrap.js',
  fileCount: entries.length,
  totalBytes,
  files: entries,
}
await writeFile(path.join(root, 'runtime-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
NODE

(
  cd "${STAGE_DIR}"
  zip -q -r -9 "${ZIP_PATH}" .
)

(
  cd "${OUTPUT_DIR}"
  sha256sum "$(basename "${ZIP_PATH}")" > mobile-lite-runtime.zip.sha256
)

echo "Mobile Lite runtime pack built: ${ZIP_PATH}"
du -h "${ZIP_PATH}"
