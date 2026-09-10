import { spawnSync } from 'node:child_process'
import { access, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const BASELINE_SOURCE_SHA = 'f50f27a4438bb3bd7958e5d28956d3aed4b11997'
const marker = '__GNB_V2_INVENTORY__'
const outputArg = process.argv.find((arg) => arg.startsWith('--output='))
const outputPath = path.resolve(outputArg ? outputArg.slice('--output='.length) : 'artifacts/v2-current-inventory.json')

const providers = [
  { id: 'youtube', family: 'media', source: 'apps/bot/src/commands/youtube-v3.ts' },
  { id: 'tiktok', family: 'social', source: 'apps/bot/src/commands/tiktok-v15.ts' },
  { id: 'instagram', family: 'social', source: 'apps/bot/src/commands/downloads-progress-v2.ts' },
  { id: 'facebook', family: 'social', source: 'apps/bot/src/commands/downloads-progress-v2.ts' },
  { id: 'twitter', family: 'social', source: 'apps/bot/src/commands/downloads-progress-v2.ts' },
  { id: 'soundcloud', family: 'audio', source: 'apps/bot/src/commands/downloads-progress-v2.ts' },
  { id: 'mediafire', family: 'files', source: 'apps/bot/src/commands/downloads.ts' },
  { id: 'erome', family: 'adult', source: 'apps/bot/src/commands/erome.ts' },
  { id: 'xvideos', family: 'adult', source: 'apps/bot/src/commands/adult-download-v15.ts' },
  { id: 'xnxx', family: 'adult', source: 'apps/bot/src/commands/adult-download-v15.ts' },
  { id: 'pornhub', family: 'adult', source: 'apps/bot/src/commands/adult-download-v15.ts' },
  { id: 'uptodown', family: 'apk', source: 'apps/bot/src/commands/app-stores-v15.ts' },
  { id: 'liteapks', family: 'apk', source: 'apps/bot/src/commands/app-stores-v15.ts' },
  { id: 'aptoide', family: 'apk', source: 'apps/bot/src/commands/app-stores-v15.ts' },
  { id: 'happymod', family: 'apk', source: 'apps/bot/src/commands/app-stores-v15.ts' },
  { id: 'fdroid', family: 'apk', source: 'apps/bot/src/commands/app-stores-extra-v15.ts' },
  { id: 'apktools', family: 'apk', source: 'apps/bot/src/commands/app-stores-extra-v15.ts' },
  { id: 'androforever', family: 'apk', source: 'apps/bot/src/commands/app-stores-extra-v15.ts' },
]

async function verifyProviderSources() {
  for (const provider of providers) await access(path.resolve(provider.source))
}

function runInventory(profile, tempRoot) {
  const profileDir = path.join(tempRoot, profile.id)
  const result = spawnSync(process.execPath, ['scripts/v2-inventory-worker.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      DATA_DIR: path.join(profileDir, 'data'),
      SESSION_DIR: path.join(profileDir, 'session'),
      NEXORA_RUNTIME_PROFILE: 'full',
      OLLAMA_ENABLED: profile.ollama ? 'true' : 'false',
      WEB_ENABLED: profile.web ? 'true' : 'false',
      ADMIN_WEB_TOKEN: process.env.ADMIN_WEB_TOKEN || 'v2-baseline-ci-token',
    },
  })

  if (result.status !== 0) {
    process.stderr.write(result.stdout || '')
    process.stderr.write(result.stderr || '')
    throw new Error(`inventory worker failed for profile ${profile.id} with exit ${result.status}`)
  }

  const markerLine = (result.stdout || '').split(/\r?\n/).findLast((line) => line.startsWith(marker))
  if (!markerLine) throw new Error(`inventory marker missing for profile ${profile.id}`)
  return JSON.parse(markerLine.slice(marker.length))
}

const profiles = [
  { id: 'minimal', ollama: false, web: false },
  { id: 'full', ollama: true, web: true },
]

const tempRoot = await import('node:fs/promises').then(({ mkdtemp }) => mkdtemp(path.join(os.tmpdir(), 'ghost-nexora-v2-baseline-')))
try {
  await verifyProviderSources()
  const inventories = Object.fromEntries(profiles.map((profile) => [profile.id, runInventory(profile, tempRoot)]))
  const report = {
    schemaVersion: 1,
    kind: 'ghost-nexora-v1-pre-v2-baseline',
    sourceSha: BASELINE_SOURCE_SHA,
    generatedFromSha: process.env.GITHUB_SHA || null,
    generatedAt: new Date().toISOString(),
    providers,
    profiles: inventories,
  }

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(`[V2 BASELINE] source=${BASELINE_SOURCE_SHA}`)
  console.log(`[V2 BASELINE] providers=${providers.length}`)
  for (const profile of profiles) {
    const inventory = inventories[profile.id]
    console.log(`[V2 BASELINE] ${profile.id}: commands=${inventory.commandCount}, canonical=${inventory.canonicalCommandCount}, duplicateNames=${inventory.duplicateCanonicalNames.length}, aliasCollisions=${inventory.aliasCollisions.length}`)
  }
  console.log(`[V2 BASELINE] report=${path.relative(process.cwd(), outputPath)}`)
} finally {
  await rm(tempRoot, { recursive: true, force: true })
}
