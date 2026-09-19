import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { chmod, copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { config } from '../config.js'

export type RestorePlanFile = {
  name: string
  source: string
  target: string
  size: number
  sha256: string
}

export type RestoreTableSnapshotPlan = {
  source: string
  targetDatabase: string
  size: number
  sha256: string
}

export type RestorePlan = {
  schemaVersion: 1 | 2
  createdAt: number
  backupId: string
  backupType?: 'economy' | 'configuration' | 'subbots' | 'sessions' | 'groups' | 'full'
  stagingDir: string
  files: RestorePlanFile[]
  tableSnapshot?: RestoreTableSnapshotPlan
}

type EncodedValue = string | number | null | { base64: string }

type LogicalTable = {
  name: string
  columns: string[]
  rows: EncodedValue[][]
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

function mainDatabasePath() {
  return path.join(config.dataDir, 'ghostnexora.sqlite')
}

function walletDatabasePath() {
  const wallet = process.env.NEXORA_GLOBAL_ECONOMY_DB?.trim()
  return wallet ? path.resolve(wallet) : path.join(config.dataDir, 'nexora-economy.sqlite')
}

function inside(child: string, parent: string) {
  const resolvedChild = path.resolve(child)
  const resolvedParent = path.resolve(parent)
  return resolvedChild === resolvedParent || resolvedChild.startsWith(`${resolvedParent}${path.sep}`)
}

function validSessionTarget(target: string) {
  if (inside(target, config.sessionDir)) return true
  const subbotsRoot = path.join(config.dataDir, 'subbots')
  if (!inside(target, subbotsRoot)) return false
  const relative = path.relative(subbotsRoot, path.resolve(target))
  const parts = relative.split(path.sep)
  return parts.length >= 3 && /^\d+$/.test(parts[0] ?? '') && parts[1] === 'session'
}

function validSubbotDataTarget(target: string) {
  const subbotsRoot = path.join(config.dataDir, 'subbots')
  if (!inside(target, subbotsRoot)) return false
  const relative = path.relative(subbotsRoot, path.resolve(target))
  const parts = relative.split(path.sep)
  return parts.length === 2
    && /^\d+$/.test(parts[0] ?? '')
    && (parts[1] === 'ghostnexora.sqlite' || parts[1] === 'settings.json')
}

function expectedSimpleTarget(name: string) {
  if (name === 'ghostnexora.sqlite') return mainDatabasePath()
  if (name === 'nexora-economy.sqlite') return walletDatabasePath()
  if (name === 'settings.json') return path.join(config.dataDir, 'settings.json')
  return null
}

function assertPlan(plan: RestorePlan) {
  if (plan.schemaVersion !== 1 && plan.schemaVersion !== 2) throw new Error('unsupported_restore_plan')
  if (!plan.backupId || !Array.isArray(plan.files)) throw new Error('invalid_restore_plan')
  if (!plan.files.length && !plan.tableSnapshot) throw new Error('empty_restore_plan')

  const root = path.resolve(restoreRoot())
  const staging = path.resolve(plan.stagingDir)
  if (!(staging === root || staging.startsWith(`${root}${path.sep}`))) throw new Error('restore_staging_outside_root')

  const seenTargets = new Set<string>()
  for (const file of plan.files) {
    if (!file.name || seenTargets.has(path.resolve(file.target))) throw new Error('duplicate_restore_file')
    seenTargets.add(path.resolve(file.target))
    const simple = expectedSimpleTarget(file.name)
    if (simple) {
      if (path.resolve(file.target) !== path.resolve(simple)) throw new Error(`invalid_restore_target:${file.name}`)
    } else if (file.name.startsWith('sessions/')) {
      if (!validSessionTarget(file.target)) throw new Error(`invalid_session_restore_target:${file.name}`)
    } else if (/^subbots\/\d+\/(ghostnexora\.sqlite|settings\.json)$/.test(file.name)) {
      if (!validSubbotDataTarget(file.target)) throw new Error(`invalid_subbot_restore_target:${file.name}`)
    } else {
      throw new Error(`invalid_restore_file:${file.name}`)
    }
    const source = path.resolve(file.source)
    if (!(source === staging || source.startsWith(`${staging}${path.sep}`))) throw new Error(`invalid_restore_source:${file.name}`)
    if (!/^[a-f0-9]{64}$/i.test(file.sha256) || !Number.isSafeInteger(file.size) || file.size <= 0) {
      throw new Error(`invalid_restore_metadata:${file.name}`)
    }
  }

  if (plan.tableSnapshot) {
    const snapshot = plan.tableSnapshot
    const source = path.resolve(snapshot.source)
    if (!(source === staging || source.startsWith(`${staging}${path.sep}`))) throw new Error('invalid_table_snapshot_source')
    if (path.resolve(snapshot.targetDatabase) !== path.resolve(mainDatabasePath())) throw new Error('invalid_table_snapshot_target')
    if (!/^[a-f0-9]{64}$/i.test(snapshot.sha256) || !Number.isSafeInteger(snapshot.size) || snapshot.size <= 0) {
      throw new Error('invalid_table_snapshot_metadata')
    }
  }

  if (plan.schemaVersion === 1 && !plan.files.some((file) => file.name === 'ghostnexora.sqlite')) {
    throw new Error('missing_main_database')
  }
}

async function verifyStagedFile(file: RestorePlanFile | RestoreTableSnapshotPlan) {
  const info = await stat(file.source)
  if (!info.isFile() || info.size !== file.size) throw new Error('restore_size_mismatch')
  const buffer = await readFile(file.source)
  if (sha256(buffer) !== file.sha256.toLowerCase()) throw new Error('restore_hash_mismatch')
}

async function removeSqliteSidecars(target: string) {
  if (!target.endsWith('.sqlite')) return
  await Promise.all([
    rm(`${target}-wal`, { force: true }),
    rm(`${target}-shm`, { force: true }),
    rm(`${target}-journal`, { force: true }),
  ])
}

function decodeValue(value: EncodedValue) {
  if (value && typeof value === 'object' && 'base64' in value) {
    return Buffer.from(String(value.base64), 'base64')
  }
  return value
}

function assertLogicalSnapshot(value: unknown): LogicalTable[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { tables?: unknown }).tables)) {
    throw new Error('invalid_logical_snapshot')
  }
  const tables = (value as { tables: unknown[] }).tables
  const seen = new Set<string>()
  return tables.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('invalid_logical_table')
    const table = entry as Partial<LogicalTable>
    if (!table.name || !/^[A-Za-z0-9_]+$/.test(table.name) || seen.has(table.name)) throw new Error('invalid_logical_table_name')
    seen.add(table.name)
    if (!Array.isArray(table.columns) || !table.columns.length || table.columns.some((column) => !/^[A-Za-z0-9_]+$/.test(column))) {
      throw new Error(`invalid_logical_columns:${table.name}`)
    }
    if (!Array.isArray(table.rows) || table.rows.some((row) => !Array.isArray(row) || row.length !== table.columns!.length)) {
      throw new Error(`invalid_logical_rows:${table.name}`)
    }
    return table as LogicalTable
  })
}

function applyLogicalSnapshot(targetDatabase: string, snapshotBuffer: Buffer) {
  const payload = JSON.parse(snapshotBuffer.toString('utf8')) as unknown
  const tables = assertLogicalSnapshot(payload)
  const db = new DatabaseSync(targetDatabase)
  try {
    db.exec('PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;')
    try {
      for (const table of tables) {
        const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table.name)
        if (!exists) throw new Error(`restore_table_missing:${table.name}`)
        const currentColumns = new Set(
          (db.prepare(`PRAGMA table_info("${table.name}")`).all() as Array<{ name?: string }>)
            .map((column) => String(column.name ?? '')),
        )
        for (const column of table.columns) {
          if (!currentColumns.has(column)) throw new Error(`restore_column_missing:${table.name}.${column}`)
        }

        db.prepare(`DELETE FROM "${table.name}"`).run()
        if (!table.rows.length) continue
        const columns = table.columns.map((column) => `"${column}"`).join(', ')
        const placeholders = table.columns.map(() => '?').join(', ')
        const insert = db.prepare(`INSERT INTO "${table.name}" (${columns}) VALUES (${placeholders})`)
        for (const row of table.rows) insert.run(...row.map(decodeValue))
      }
      db.exec('COMMIT;')
    } catch (error) {
      db.exec('ROLLBACK;')
      throw error
    } finally {
      db.exec('PRAGMA foreign_keys = ON;')
    }
  } finally {
    db.close()
  }
}

async function backupTargetForRollback(target: string, rollbackDir: string, key: string) {
  if (!existsSync(target)) return null
  const safeKey = createHash('sha256').update(key).digest('hex').slice(0, 16)
  const rollbackPath = path.join(rollbackDir, `${safeKey}-${path.basename(target)}`)
  await mkdir(path.dirname(rollbackPath), { recursive: true, mode: 0o700 })
  await copyFile(target, rollbackPath)
  await chmod(rollbackPath, 0o600).catch(() => undefined)
  return rollbackPath
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
    if (plan.tableSnapshot) await verifyStagedFile(plan.tableSnapshot)
    await mkdir(rollbackDir, { recursive: true, mode: 0o700 })

    for (const file of plan.files) {
      await mkdir(path.dirname(file.target), { recursive: true, mode: 0o700 })
      rollback.set(file.target, await backupTargetForRollback(file.target, rollbackDir, file.target))
    }

    if (plan.tableSnapshot && !rollback.has(plan.tableSnapshot.targetDatabase)) {
      rollback.set(
        plan.tableSnapshot.targetDatabase,
        await backupTargetForRollback(plan.tableSnapshot.targetDatabase, rollbackDir, 'logical-main-db'),
      )
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

    if (plan.tableSnapshot) {
      await removeSqliteSidecars(plan.tableSnapshot.targetDatabase)
      applyLogicalSnapshot(plan.tableSnapshot.targetDatabase, await readFile(plan.tableSnapshot.source))
    }

    const sessionRestored = plan.files.some((file) => file.name.startsWith('sessions/'))
    await writeFile(resultPath, `${JSON.stringify({
      ok: true,
      backupId: plan.backupId,
      backupType: plan.backupType ?? 'full',
      restoredAt: Date.now(),
      files: plan.files.map((file) => file.name),
      logicalTables: Boolean(plan.tableSnapshot),
      sessionRestored,
      rollbackDir,
    }, null, 2)}\n`, { mode: 0o600 })
    await rm(pending, { force: true })
    await rm(plan.stagingDir, { recursive: true, force: true })
    console.info(`[restore] operational backup restored: ${plan.backupId}`)
    return { applied: true as const, backupId: plan.backupId, backupType: plan.backupType ?? 'full' }
  } catch (error) {
    for (const [target, rollbackPath] of rollback) {
      try {
        await removeSqliteSidecars(target)
        if (rollbackPath) {
          await mkdir(path.dirname(target), { recursive: true, mode: 0o700 })
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
      backupType: plan?.backupType ?? null,
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
