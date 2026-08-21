import os from 'node:os'
import path from 'node:path'
import { readdir, rm, stat } from 'node:fs/promises'
import { logger } from '../utils/logger.js'

const PREFIX = 'ghostnexora-'
const DEFAULT_MAX_AGE_MS = 2 * 60 * 60_000
const SWEEP_INTERVAL_MS = 30 * 60_000

export async function cleanupStaleTempArtifacts(maxAgeMs = DEFAULT_MAX_AGE_MS) {
  const root = os.tmpdir()
  const now = Date.now()
  let removed = 0

  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.name.startsWith(PREFIX)) continue
    const target = path.join(root, entry.name)
    const info = await stat(target).catch(() => null)
    if (!info || now - info.mtimeMs < maxAgeMs) continue
    await rm(target, { recursive: true, force: true }).catch(() => undefined)
    removed += 1
  }

  if (removed > 0) logger.info({ removed }, 'stale temporary download artifacts removed')
  return removed
}

export function startTempCleanup() {
  void cleanupStaleTempArtifacts().catch((error) => logger.warn({ error }, 'initial temp cleanup failed'))
  const timer = setInterval(() => {
    void cleanupStaleTempArtifacts().catch((error) => logger.warn({ error }, 'scheduled temp cleanup failed'))
  }, SWEEP_INTERVAL_MS)
  timer.unref()
}
