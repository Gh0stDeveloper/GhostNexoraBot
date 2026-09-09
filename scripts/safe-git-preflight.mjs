#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const stateDir = path.resolve(process.env.STATE_DIR || '/var/lib/ghost-nexora-bot')
const backupsDir = path.join(stateDir, 'backups')

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.capture === false ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  })
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
}

if (!existsSync(path.join(repoRoot, '.git'))) {
  console.error(`[FAIL] No existe checkout Git en ${repoRoot}`)
  process.exit(1)
}

const trackedStatus = git(['status', '--porcelain=v1', '--untracked-files=no']).trim()
if (!trackedStatus) process.exit(0)

mkdirSync(backupsDir, { recursive: true, mode: 0o750 })
const id = stamp()
const patchFile = path.join(backupsDir, `local-tracked-${id}.patch`)
const manifestFile = path.join(backupsDir, `local-tracked-${id}.txt`)
const head = git(['rev-parse', 'HEAD']).trim()
const patch = git(['diff', '--binary', 'HEAD'])

writeFileSync(patchFile, patch, { mode: 0o600 })
writeFileSync(manifestFile, [
  `created_at=${new Date().toISOString()}`,
  `repo=${repoRoot}`,
  `head=${head}`,
  '',
  trackedStatus,
  '',
].join('\n'), { mode: 0o600 })

console.warn('[WARN] Se detectaron cambios locales en archivos versionados del checkout.')
console.warn(`[WARN] Backup recuperable: ${patchFile}`)
console.warn('[INFO] Restaurando únicamente archivos versionados al HEAD instalado; .env y datos persistentes no se tocan.')

// Reset to the CURRENT installed HEAD only. This intentionally does not clean
// untracked/ignored files. The normal updater performs fetch/pull afterwards.
git(['reset', '--hard', 'HEAD'], { capture: false })

const remaining = git(['status', '--porcelain=v1', '--untracked-files=no']).trim()
if (remaining) {
  console.error('[FAIL] El checkout sigue teniendo cambios versionados después del preflight.')
  process.exit(1)
}

console.log('[ OK ] Checkout versionado limpio; la actualización puede continuar.')
