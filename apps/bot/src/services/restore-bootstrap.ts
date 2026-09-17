import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { config } from '../config.js'

export type RestorePlanFile = {
  name: 'ghostnexora.sqlite' | 'nexora-economy.sqlite' | 'settings.json'
  source: string
  target: string
  size: number
  sha256: string
}

export type RestorePlan = {
  schemaVersion: 1
  createdAt: number
  backupId: string
  stagingDir: string
  files: RestorePlanFile[]
}

function restoreRoot() {
  return path.join(config.dataDir, 'restore')
}

export function pendingRestorePath() {
  return path.join(restoreRoot(), 'pending.json')
}

function sha256(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function expectedTargets() {
  const wallet = process.env.NEXORA_GLOBAL_ECONOMY_DB?.trim()
  return new Map<RestorePlanFile['name'], string>([
    ['ghostnexora.sqlite', path.join(config.dataDir, 'ghostnexora.sqlite')],
    ['nexora-economy.sqlite', wallet ? path.resolve(wallet) : path.join(config.dataDir, 'nexora-economy.sqlite')],
    ['settings.json', path.join(config.dataDir, 'settings.json')],
  ])
}

function assertPlan(plan: RestorePlan) {
  if (plan.schemaVersion !== 1) throw new Error('unsupported_restore_plan')
  if (!plan.backupId || !Array.isArray(plan.files) || !plan.files.length) throw new Error('invalid_restore_plan')
  const root = path.resolve(restoreRoot())
  const staging = path.resolve(plan.stagingDir)
  if (!(staging === root || staging.startsWith(`${root}${path.sep}`))) throw new Error('restore_staging_outside_root')
  const expected = expectedTargets()
  const seen = new Set<string>()
  for (const file of plan.files) {
    if (seen.has(file.name)) throw new Error('duplicate_restore_file')
    seen.add(file.name)
    const target = expected.get(file.name)
    if (!target || path.resolve(file.target) !== path.resolve(target)) throw new Error(`invalid_restore_target:${file.name}`)
    const source = path.resolve(file.source)
    if (!(source === staging || source.startsWith(`${staging}${path.sep}`))) throw new Error(`invalid_restore_source:${file.name}`)
    if (!/^[a-f0-9]{64}$/i.test(file.sha256) || !Number.isSafeInteger(file.size) || file.size <= 0) throw new Error(`invalid_restore_metadata:${file.name}`)
  }
  if (!seen.has('ghostnexora.sqlite')) throw new Error('missing_main_database')
}

async function verifyStagedFile(file: RestorePlanFile) {
  const info = await stat(file.source)
  if (!info.isFile() || info.size !== file.size) throw new Error(`restore_size_mismatch:${file.name}`)
  const buffer = await readFile(file.source)
  if (sha256(buffer) !== file.sha256.toLowerCase()) throw new Error(`restore_hash_mismatch:${file.name}`)
}

async function removeSqliteSidecars(target: string) {
  if (!target.endsWith('.sqlite')) return
  await Promise.all([
    rm(`${target}-wal`, { force: true }),
    rm(`${target}-shm`, { force: true }),
    rm(`${target}-journal`, { force: true }),
  ])
}

export async function applyPendingRestoreBeforeRuntime() {
  const pending = pendingRestorePath()
  if (!existsSync(pending)) return { applied: false as const }

  await mkdir(restoreRoot(), { recursive: true, mode: 0o700 })
  const plan = JSON.parse(await readFile(pending, 'utf8')) as RestorePlan
  const resultPath = path.join(restoreRoot(), 'last-result.json')
  const rollbackDir = path.join(restoreRoot(), `rollback-${Date.now()}`)
  const rollback = new Map<string, string | null>()

  try {
    assertPlan(plan)
    await Promise.all(plan.files.map(verifyStagedFile))
    await mkdir(rollbackDir, { recursive: true, mode: 0o700 })

    for (const file of plan.files) {
      await mkdir(path.dirname(file.target), { recursive: true })
      if (existsSync(file.target)) {
        const rollbackPath = path.join(rollbackDir, file.name)
        await copyFile(file.target, rollbackPath)
        await chmod(rollbackPath, 0o600).catch(() => undefined)
        rollback.set(file.target, rollbackPath)
      } else {
        rollback.set(file.target, null)
      }
    }

    for (const file of plan.files) {
      await removeSqliteSidecars(file.target)
      const tempTarget = `${file.target}.restore-${process.pid}.tmp`
      await rm(tempTarget, { force: true })
      await copyFile(file.source, tempTarget)
      await chmod(tempTarget, 0o600).catch(() => undefined)
      await rm(file.target, { force: true })
      await copyFile(tempTarget, file.target)
      await chmod(file.target, 0o600).catch(() => undefined)
      await rm(tempTarget, { force: true })
    }

    await writeFile(resultPath, `${JSON.stringify({
      ok: true,
      backupId: plan.backupId,
      restoredAt: Date.now(),
      files: plan.files.map((file) => file.name),
      sessionRestored: false,
      rollbackDir,
    }, null, 2)}\n`, { mode: 0o600 })
    await rm(pending, { force: true })
    await rm(plan.stagingDir, { recursive: true, force: true })
    console.info(`[restore] operational backup restored: ${plan.backupId}`)
    return { applied: true as const, backupId: plan.backupId }
  } catch (error) {
    for (const [target, rollbackPath] of rollback) {
      try {
        await removeSqliteSidecars(target)
        if (rollbackPath) {
          await copyFile(rollbackPath, target)
          await chmod(target, 0o600).catch(() => undefined)
        } else {
          await rm(target, { force: true })
        }
      } catch {}
    }
    await writeFile(resultPath, `${JSON.stringify({
      ok: false,
      backupId: plan?.backupId ?? null,
      failedAt: Date.now(),
      error: error instanceof Error ? error.message : 'restore_failed',
      sessionRestored: false,
      rollbackDir,
    }, null, 2)}\n`, { mode: 0o600 }).catch(() => undefined)
    await rm(pending, { force: true }).catch(() => undefined)
    console.error('[restore] operational backup restore failed; rollback attempted', error)
    return { applied: false as const, error: error instanceof Error ? error.message : 'restore_failed' }
  }
}
