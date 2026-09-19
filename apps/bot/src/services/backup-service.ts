import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { gunzip, gzip } from 'node:zlib'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'
import { economy } from './economy.js'
import { opsInstanceKey } from './ops-database.js'
import { pendingRestorePath, type RestorePlan, type RestorePlanFile, type RestoreTableSnapshotPlan } from './restore-bootstrap.js'

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)
const BACKUP_VERSION = 2
const BACKUP_EXTENSION = '.gnb-backup.gz'
const CHECK_INTERVAL_MS = 60 * 60_000
const MAX_COMPRESSED_BACKUP_BYTES = 512 * 1024 * 1024
const MAX_ARCHIVE_FILE_BYTES = 2 * 1024 * 1024 * 1024
const MAX_SESSION_FILE_BYTES = 32 * 1024 * 1024

export type BackupReason = 'manual' | 'scheduled'
export type BackupType = 'economy' | 'configuration' | 'subbots' | 'sessions' | 'groups' | 'full'

export type BackupInfo = {
  id: string
  fileName: string
  size: number
  createdAt: number
  type: BackupType
  reason: BackupReason
  sha256: string
  verified: boolean
  files: number
  tables: number
}

type EncodedValue = string | number | null | { base64: string }

type BackupTable = {
  name: string
  columns: string[]
  rows: EncodedValue[][]
}

type BackupFile = {
  name: string
  size: number
  sha256: string
  data: string
}

type BackupArchiveV2 = {
  schemaVersion: 2
  product: 'Ghost Nexora Bot'
  createdAt: number
  reason: BackupReason
  backupType: BackupType
  source: {
    instance: 'main'
    sessionIncluded: boolean
  }
  files: BackupFile[]
  tables: BackupTable[]
}

type BackupArchiveV1 = {
  schemaVersion: 1
  product: 'Ghost Nexora Bot'
  createdAt: number
  reason: BackupReason
  source: { instance: 'main'; sessionIncluded: false }
  files: BackupFile[]
}

type BackupArchiveCandidate = {
  schemaVersion?: number
  product?: string
  createdAt?: number
  reason?: BackupReason
  backupType?: BackupType
  source?: { instance?: string; sessionIncluded?: boolean }
  files?: BackupFile[]
  tables?: BackupTable[]
}

type ValidatedArchive = {
  archive: BackupArchiveV2 | BackupArchiveV1
  type: BackupType
  decoded: Map<string, Buffer>
  tables: BackupTable[]
}

const RETENTION: Record<BackupType, number> = {
  economy: 30,
  configuration: 30,
  subbots: 21,
  sessions: 14,
  groups: 21,
  full: 14,
}

const AUTO_INTERVAL: Partial<Record<BackupType, number>> = {
  economy: 6 * 60 * 60_000,
  configuration: 24 * 60 * 60_000,
  full: 24 * 60 * 60_000,
}

const CONFIG_TABLES = new Set([
  'ops_command_settings',
  'ops_command_category_settings',
  'ops_command_aliases',
])

const SUBBOT_TABLES = new Set([
  'subbots',
  'portal_tokens',
  'subbot_customization',
])

let timer: NodeJS.Timeout | null = null
let creating = false
let restorePreparing = false

function backupDir() {
  return path.join(config.dataDir, 'backups')
}

function restoreDir() {
  return path.join(config.dataDir, 'restore')
}

function settingsFile() {
  return path.join(config.dataDir, 'settings.json')
}

function sqlPath(value: string) {
  return value.replace(/'/g, "''")
}

function safeStamp(timestamp: number) {
  return new Date(timestamp).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function backupFileName(timestamp: number, type: BackupType) {
  return `ghostnexora-backup-${type}-${safeStamp(timestamp)}${BACKUP_EXTENSION}`
}

function sha256(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function validType(value: unknown): value is BackupType {
  return value === 'economy' || value === 'configuration' || value === 'subbots'
    || value === 'sessions' || value === 'groups' || value === 'full'
}

function encodeValue(value: unknown): EncodedValue {
  if (value === null || value === undefined) return null
  if (Buffer.isBuffer(value)) return { base64: value.toString('base64') }
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value)
  if (typeof value === 'bigint') return value.toString()
  return String(value)
}

function tableExists(db: typeof economy.db, name: string) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
}

function allTableNames(db: typeof economy.db) {
  return (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as Array<{ name?: string }>)
    .map((row) => String(row.name ?? ''))
    .filter((name) => /^[A-Za-z0-9_]+$/.test(name))
}

function selectedTables(type: BackupType) {
  const names = allTableNames(economy.db)
  if (type === 'configuration') return names.filter((name) => CONFIG_TABLES.has(name))
  if (type === 'subbots') return names.filter((name) => SUBBOT_TABLES.has(name) || /^subbot_/.test(name))
  if (type === 'groups') return names.filter((name) => /^group_/.test(name) || /^ops_group_/.test(name) || name === 'ops_platform_groups')
  if (type === 'economy') {
    return names.filter((name) =>
      /^economy_/.test(name)
      || /^rpg_/.test(name)
      || /^bank/.test(name)
      || /^mining/.test(name)
      || name === 'community_profiles'
      || name === 'entitlements',
    )
  }
  return []
}

function snapshotTables(type: BackupType): BackupTable[] {
  return selectedTables(type).map((name) => {
    if (!tableExists(economy.db, name)) return { name, columns: [], rows: [] }
    const columns = (economy.db.prepare(`PRAGMA table_info("${name}")`).all() as Array<{ name?: string }>)
      .map((column) => String(column.name ?? ''))
      .filter(Boolean)
    const rawRows = economy.db.prepare(`SELECT * FROM "${name}"`).all() as Array<Record<string, unknown>>
    return {
      name,
      columns,
      rows: rawRows.map((row) => columns.map((column) => encodeValue(row[column]))),
    }
  })
}

async function encodedFile(name: string, filePath: string): Promise<BackupFile> {
  const buffer = await readFile(filePath)
  return {
    name,
    size: buffer.length,
    sha256: sha256(buffer),
    data: buffer.toString('base64'),
  }
}

function snapshotDatabase(targetPath: string, database: typeof economy.db) {
  database.exec(`VACUUM INTO '${sqlPath(targetPath)}'`)
}

async function collectDirectoryFiles(root: string, archivePrefix: string): Promise<BackupFile[]> {
  if (!existsSync(root)) return []
  const output: BackupFile[] = []

  const walk = async (dir: string, relative = ''): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const rel = relative ? path.posix.join(relative, entry.name) : entry.name
      const absolute = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        await walk(absolute, rel)
        continue
      }
      if (!entry.isFile()) continue
      const info = await lstat(absolute)
      if (info.size <= 0 || info.size > MAX_SESSION_FILE_BYTES) continue
      output.push(await encodedFile(path.posix.join(archivePrefix, rel), absolute))
    }
  }

  await walk(root)
  return output
}

async function sessionFiles() {
  const files = await collectDirectoryFiles(config.sessionDir, 'sessions/main')
  const subbotsRoot = path.join(config.dataDir, 'subbots')
  if (!existsSync(subbotsRoot)) return files
  const entries = await readdir(subbotsRoot, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue
    files.push(...await collectDirectoryFiles(
      path.join(subbotsRoot, entry.name, 'session'),
      `sessions/subbots/${entry.name}`,
    ))
  }
  return files
}

async function subbotLocalFiles(tempDir: string) {
  const output: BackupFile[] = []
  const root = path.join(config.dataDir, 'subbots')
  if (!existsSync(root)) return output
  const entries = await readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue
    const instanceRoot = path.join(root, entry.name)
    const localDb = path.join(instanceRoot, 'ghostnexora.sqlite')
    if (existsSync(localDb)) {
      const snapshot = path.join(tempDir, `subbot-${entry.name}.sqlite`)
      const db = new DatabaseSync(localDb)
      try {
        db.exec(`VACUUM INTO '${sqlPath(snapshot)}'`)
      } finally {
        db.close()
      }
      output.push(await encodedFile(`subbots/${entry.name}/ghostnexora.sqlite`, snapshot))
    }
    const localSettings = path.join(instanceRoot, 'settings.json')
    if (existsSync(localSettings)) {
      output.push(await encodedFile(`subbots/${entry.name}/settings.json`, localSettings))
    }
  }
  return output
}

function archiveType(archive: BackupArchiveCandidate): BackupType {
  if (archive.schemaVersion === 1) return 'full'
  if (archive.schemaVersion === 2 && validType(archive.backupType)) return archive.backupType
  throw new Error('Formato o tipo de backup no compatible.')
}

async function archiveMetadata(filePath: string, fileName: string): Promise<BackupInfo> {
  const compressed = await readFile(filePath)
  const info = await stat(filePath)
  try {
    const decompressed = await gunzipAsync(compressed)
    const archive = JSON.parse(decompressed.toString('utf8')) as BackupArchiveCandidate
    const type = archiveType(archive)
    return {
      id: fileName,
      fileName,
      size: info.size,
      createdAt: Number(archive.createdAt ?? info.mtimeMs),
      type,
      reason: archive.reason === 'scheduled' ? 'scheduled' : 'manual',
      sha256: sha256(compressed),
      verified: archive.product === 'Ghost Nexora Bot',
      files: Array.isArray(archive.files) ? archive.files.length : 0,
      tables: Array.isArray((archive as Partial<BackupArchiveV2>).tables) ? (archive as Partial<BackupArchiveV2>).tables!.length : 0,
    }
  } catch {
    return {
      id: fileName,
      fileName,
      size: info.size,
      createdAt: info.mtimeMs,
      type: 'full',
      reason: 'manual',
      sha256: sha256(compressed),
      verified: false,
      files: 0,
      tables: 0,
    }
  }
}

export async function listOperationalBackups(): Promise<BackupInfo[]> {
  const dir = backupDir()
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const names = (await readdir(dir))
    .filter((name) => name.startsWith('ghostnexora-backup-') && name.endsWith(BACKUP_EXTENSION))

  const rows = await Promise.all(names.map((fileName) => archiveMetadata(path.join(dir, fileName), fileName)))
  return rows.sort((a, b) => b.createdAt - a.createdAt)
}

async function applyRetention() {
  const backups = await listOperationalBackups()
  for (const type of Object.keys(RETENTION) as BackupType[]) {
    const typed = backups.filter((backup) => backup.type === type)
    for (const backup of typed.slice(RETENTION[type])) {
      await rm(path.join(backupDir(), backup.fileName), { force: true })
    }
  }
}

export async function createOperationalBackup(
  reason: BackupReason = 'manual',
  type: BackupType = 'full',
): Promise<BackupInfo> {
  if (opsInstanceKey() !== 'main') throw new Error('Los backups globales solo pueden crearse desde MainBot.')
  if (!validType(type)) throw new Error('Tipo de backup inválido.')
  if (creating) throw new Error('Ya hay un backup en proceso.')
  creating = true

  const createdAt = Date.now()
  const dir = backupDir()
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const tempDir = await mkdtemp(path.join(dir, '.tmp-'))

  try {
    const files: BackupFile[] = []
    let tables: BackupTable[] = []

    if (type === 'full') {
      const mainSnapshot = path.join(tempDir, 'ghostnexora.sqlite')
      const walletSnapshot = path.join(tempDir, 'nexora-economy.sqlite')
      snapshotDatabase(mainSnapshot, economy.db)
      files.push(await encodedFile('ghostnexora.sqlite', mainSnapshot))
      const sameDatabase = path.resolve(economy.file) === path.resolve(economy.walletFile)
      if (!sameDatabase) {
        snapshotDatabase(walletSnapshot, economy.walletDb)
        files.push(await encodedFile('nexora-economy.sqlite', walletSnapshot))
      }
      if (existsSync(settingsFile())) files.push(await encodedFile('settings.json', settingsFile()))
      files.push(...await subbotLocalFiles(tempDir))
      files.push(...await sessionFiles())
    } else if (type === 'economy') {
      const walletSnapshot = path.join(tempDir, 'nexora-economy.sqlite')
      snapshotDatabase(walletSnapshot, economy.walletDb)
      files.push(await encodedFile('nexora-economy.sqlite', walletSnapshot))
      tables = snapshotTables(type)
    } else if (type === 'configuration') {
      if (existsSync(settingsFile())) files.push(await encodedFile('settings.json', settingsFile()))
      tables = snapshotTables(type)
    } else if (type === 'sessions') {
      files.push(...await sessionFiles())
      if (!files.length) throw new Error('No hay sesiones disponibles para respaldar.')
    } else if (type === 'subbots') {
      tables = snapshotTables(type)
      files.push(...await subbotLocalFiles(tempDir))
      if (!tables.length && !files.length) throw new Error('No hay datos de subbots disponibles para respaldar.')
    } else {
      tables = snapshotTables(type)
      if (!tables.length) throw new Error(`No hay datos disponibles para el backup de tipo ${type}.`)
    }

    const archive: BackupArchiveV2 = {
      schemaVersion: BACKUP_VERSION,
      product: 'Ghost Nexora Bot',
      createdAt,
      reason,
      backupType: type,
      source: {
        instance: 'main',
        sessionIncluded: files.some((file) => file.name.startsWith('sessions/')),
      },
      files,
      tables,
    }

    const compressed = await gzipAsync(Buffer.from(JSON.stringify(archive)), { level: 9 })
    if (compressed.length > MAX_COMPRESSED_BACKUP_BYTES) throw new Error('El backup comprimido supera el límite permitido.')
    const fileName = backupFileName(createdAt, type)
    const output = path.join(dir, fileName)
    await writeFile(output, compressed, { mode: 0o600 })
    await applyRetention()
    const info = await archiveMetadata(output, fileName)

    logger.info({
      reason,
      type,
      fileName,
      size: info.size,
      sha256: info.sha256,
      files: files.length,
      tables: tables.length,
    }, 'operational backup created')
    return info
  } finally {
    creating = false
    await rm(tempDir, { recursive: true, force: true })
  }
}

function safeArchiveName(name: string) {
  if (!name || name.includes('\\') || name.startsWith('/') || name.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Ruta inválida en backup: ${name}`)
  }
  return name
}

function validatedArchiveFile(file: BackupFile) {
  safeArchiveName(file.name)
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_ARCHIVE_FILE_BYTES) throw new Error(`Tamaño inválido en ${file.name}.`)
  if (!/^[a-f0-9]{64}$/i.test(file.sha256)) throw new Error(`Hash inválido en ${file.name}.`)
  if (typeof file.data !== 'string' || !file.data.length) throw new Error(`Contenido ausente en ${file.name}.`)
  const buffer = Buffer.from(file.data, 'base64')
  if (buffer.length !== file.size) throw new Error(`El tamaño de ${file.name} no coincide con el manifiesto.`)
  if (sha256(buffer) !== file.sha256.toLowerCase()) throw new Error(`La integridad de ${file.name} no es válida.`)
  return buffer
}

function validateTable(table: BackupTable) {
  if (!table || typeof table !== 'object' || !/^[A-Za-z0-9_]+$/.test(table.name)) throw new Error('Tabla inválida en backup.')
  if (!Array.isArray(table.columns) || !table.columns.length || table.columns.some((column) => !/^[A-Za-z0-9_]+$/.test(column))) {
    throw new Error(`Columnas inválidas en ${table.name}.`)
  }
  if (!Array.isArray(table.rows)) throw new Error(`Filas inválidas en ${table.name}.`)
  for (const row of table.rows) {
    if (!Array.isArray(row) || row.length !== table.columns.length) throw new Error(`Fila inválida en ${table.name}.`)
  }
}

async function readAndValidateArchive(fileName: string): Promise<ValidatedArchive> {
  const filePath = operationalBackupPath(fileName)
  const info = await stat(filePath)
  if (!info.isFile() || info.size <= 0 || info.size > MAX_COMPRESSED_BACKUP_BYTES) throw new Error('El archivo de backup supera el límite permitido.')
  const decompressed = await gunzipAsync(await readFile(filePath))
  const archive = JSON.parse(decompressed.toString('utf8')) as BackupArchiveCandidate
  const type = archiveType(archive)
  if (archive.product !== 'Ghost Nexora Bot') throw new Error('Producto de backup no compatible.')
  if (archive.source?.instance !== 'main') throw new Error('El backup no pertenece a MainBot.')
  if (!Array.isArray(archive.files)) throw new Error('El backup no contiene un manifiesto de archivos.')

  const decoded = new Map<string, Buffer>()
  for (const file of archive.files) {
    if (!file || typeof file !== 'object') throw new Error('Entrada de backup inválida.')
    if (decoded.has(file.name)) throw new Error(`Archivo duplicado en backup: ${file.name}`)
    decoded.set(file.name, validatedArchiveFile(file))
  }

  const tables = archive.schemaVersion === 2 && Array.isArray((archive as BackupArchiveV2).tables)
    ? (archive as BackupArchiveV2).tables
    : []
  const seenTables = new Set<string>()
  for (const table of tables) {
    validateTable(table)
    if (seenTables.has(table.name)) throw new Error(`Tabla duplicada en backup: ${table.name}`)
    seenTables.add(table.name)
  }

  if (archive.schemaVersion === 1) {
    if (archive.source?.sessionIncluded !== false) throw new Error('El backup legacy no cumple la política esperada.')
    if (!decoded.has('ghostnexora.sqlite')) throw new Error('El backup legacy no contiene ghostnexora.sqlite.')
  } else if (type === 'full' && !decoded.has('ghostnexora.sqlite')) {
    throw new Error('El backup completo no contiene ghostnexora.sqlite.')
  } else if (type === 'economy' && !decoded.has('nexora-economy.sqlite')) {
    throw new Error('El backup de economía no contiene nexora-economy.sqlite.')
  } else if (type === 'configuration' && !decoded.size && !tables.length) {
    throw new Error('El backup de configuración está vacío.')
  } else if ((type === 'groups' || type === 'subbots') && !tables.length) {
    throw new Error(`El backup ${type} no contiene tablas.`)
  } else if (type === 'sessions' && ![...decoded.keys()].some((name) => name.startsWith('sessions/'))) {
    throw new Error('El backup de sesiones no contiene sesiones.')
  }

  return { archive: archive as BackupArchiveV2 | BackupArchiveV1, type, decoded, tables }
}

async function sqliteIntegrity(buffer: Buffer, label: string) {
  const dir = await mkdtemp(path.join(restoreDir(), '.verify-'))
  const file = path.join(dir, label)
  try {
    await writeFile(file, buffer, { mode: 0o600 })
    const db = new DatabaseSync(file, { readOnly: true })
    try {
      const row = db.prepare('PRAGMA quick_check').get() as { quick_check?: string } | undefined
      const result = row ? String(Object.values(row)[0] ?? '') : ''
      if (result.toLowerCase() !== 'ok') throw new Error(`SQLite quick_check falló para ${label}: ${result || 'sin resultado'}`)
    } finally {
      db.close()
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function validateTableCompatibility(table: BackupTable) {
  if (!tableExists(economy.db, table.name)) throw new Error(`La instalación actual no contiene la tabla ${table.name}.`)
  const current = new Set(
    (economy.db.prepare(`PRAGMA table_info("${table.name}")`).all() as Array<{ name?: string }>)
      .map((column) => String(column.name ?? '')),
  )
  for (const column of table.columns) {
    if (!current.has(column)) throw new Error(`La tabla ${table.name} no contiene la columna ${column} en esta versión.`)
  }
}

export async function verifyOperationalBackup(fileName: string) {
  const validated = await readAndValidateArchive(fileName)
  await mkdir(restoreDir(), { recursive: true, mode: 0o700 })
  for (const [name, buffer] of validated.decoded) {
    if (name.endsWith('.sqlite')) await sqliteIntegrity(buffer, path.basename(name))
  }
  for (const table of validated.tables) validateTableCompatibility(table)
  return {
    backupId: path.basename(fileName),
    type: validated.type,
    files: validated.decoded.size,
    tables: validated.tables.length,
    sessionIncluded: [...validated.decoded.keys()].some((name) => name.startsWith('sessions/')),
    verifiedAt: Date.now(),
  }
}

export async function testOperationalRestore(fileName: string) {
  const result = await verifyOperationalBackup(fileName)
  return { ...result, dryRun: true, activeDataChanged: false }
}

function targetForArchiveFile(name: string) {
  if (name === 'ghostnexora.sqlite') return economy.file
  if (name === 'nexora-economy.sqlite') return economy.walletFile
  if (name === 'settings.json') return settingsFile()
  if (name.startsWith('sessions/main/')) {
    const relative = name.slice('sessions/main/'.length)
    return path.join(config.sessionDir, ...relative.split('/'))
  }
  const sessionMatch = /^sessions\/subbots\/(\d+)\/(.+)$/.exec(name)
  if (sessionMatch?.[1] && sessionMatch[2]) {
    return path.join(config.dataDir, 'subbots', sessionMatch[1], 'session', ...sessionMatch[2].split('/'))
  }
  const subbotMatch = /^subbots\/(\d+)\/(ghostnexora\.sqlite|settings\.json)$/.exec(name)
  if (subbotMatch?.[1] && subbotMatch[2]) {
    return path.join(config.dataDir, 'subbots', subbotMatch[1], subbotMatch[2])
  }
  throw new Error(`Archivo no restaurable: ${name}`)
}

export async function prepareOperationalRestore(fileName: string) {
  if (opsInstanceKey() !== 'main') throw new Error('La restauración global solo puede ejecutarse desde MainBot.')
  if (restorePreparing || existsSync(pendingRestorePath())) throw new Error('Ya hay una restauración pendiente.')
  restorePreparing = true
  const root = restoreDir()
  await mkdir(root, { recursive: true, mode: 0o700 })
  const stagingDir = await mkdtemp(path.join(root, 'staging-'))

  try {
    const validated = await readAndValidateArchive(fileName)
    await verifyOperationalBackup(fileName)
    const files: RestorePlanFile[] = []

    for (const [name, buffer] of validated.decoded) {
      const source = path.join(stagingDir, 'files', ...name.split('/'))
      await mkdir(path.dirname(source), { recursive: true, mode: 0o700 })
      await writeFile(source, buffer, { mode: 0o600 })
      files.push({
        name,
        source,
        target: targetForArchiveFile(name),
        size: buffer.length,
        sha256: sha256(buffer),
      })
    }

    let tableSnapshot: RestoreTableSnapshotPlan | undefined
    if (validated.tables.length) {
      const payload = Buffer.from(JSON.stringify({ tables: validated.tables }))
      const source = path.join(stagingDir, 'logical-tables.json')
      await writeFile(source, payload, { mode: 0o600 })
      tableSnapshot = {
        source,
        targetDatabase: economy.file,
        size: payload.length,
        sha256: sha256(payload),
      }
    }

    const plan: RestorePlan = {
      schemaVersion: 2,
      createdAt: Date.now(),
      backupId: path.basename(fileName),
      backupType: validated.type,
      stagingDir,
      files,
      tableSnapshot,
    }
    await writeFile(pendingRestorePath(), `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600 })

    const restartScheduled = !['1', 'true', 'yes', 'on'].includes(String(process.env.NEXORA_DISABLE_RESTORE_EXIT ?? '').toLowerCase())
    if (restartScheduled) {
      const exitTimer = setTimeout(() => {
        logger.warn({ backupId: plan.backupId, backupType: plan.backupType }, 'stopping MainBot to apply prepared restore on next bootstrap')
        process.exit(76)
      }, 1_500)
      exitTimer.unref?.()
    }

    logger.warn({
      backupId: plan.backupId,
      backupType: plan.backupType,
      files: files.map((file) => file.name),
      tables: validated.tables.map((table) => table.name),
      restartScheduled,
    }, 'operational restore prepared')
    return {
      backupId: plan.backupId,
      type: validated.type,
      files: files.map((file) => file.name),
      tables: validated.tables.map((table) => table.name),
      restartScheduled,
      sessionRestored: validated.type === 'sessions' || validated.type === 'full',
    }
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined)
    throw error
  } finally {
    restorePreparing = false
  }
}

async function scheduledTick() {
  try {
    const backups = await listOperationalBackups()
    for (const [type, interval] of Object.entries(AUTO_INTERVAL) as Array<[BackupType, number]>) {
      const latest = backups.find((backup) => backup.type === type && backup.reason === 'scheduled')
      if (latest && Date.now() - latest.createdAt < interval) continue
      await createOperationalBackup('scheduled', type)
    }
  } catch (error) {
    logger.warn({ error }, 'automatic operational backup skipped')
  }
}

export function startAutomaticBackups() {
  if (timer || opsInstanceKey() !== 'main') return
  const initial = setTimeout(() => void scheduledTick(), 30_000)
  initial.unref?.()
  timer = setInterval(() => void scheduledTick(), CHECK_INTERVAL_MS)
  timer.unref?.()
}

export function backupRetentionPolicy() {
  return {
    maxPerType: { ...RETENTION },
    automatic: { ...AUTO_INTERVAL },
  }
}

export function operationalBackupPath(fileName: string) {
  const safe = path.basename(fileName)
  if (safe !== fileName || !safe.startsWith('ghostnexora-backup-') || !safe.endsWith(BACKUP_EXTENSION)) {
    throw new Error('Backup inválido.')
  }
  return path.join(backupDir(), safe)
}
