import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { gunzip, gzip } from 'node:zlib'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'
import { economy } from './economy.js'
import { opsInstanceKey } from './ops-database.js'
import { pendingRestorePath, type RestorePlan, type RestorePlanFile } from './restore-bootstrap.js'

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)
const BACKUP_VERSION = 1
const BACKUP_EXTENSION = '.gnb-backup.gz'
const MAX_BACKUPS = 30
const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60_000
const CHECK_INTERVAL_MS = 60 * 60_000
const MAX_COMPRESSED_BACKUP_BYTES = 512 * 1024 * 1024
const MAX_ARCHIVE_FILE_BYTES = 2 * 1024 * 1024 * 1024

export type BackupReason = 'manual' | 'scheduled'

export type BackupInfo = {
  id: string
  fileName: string
  size: number
  createdAt: number
}

type BackupFile = {
  name: string
  size: number
  sha256: string
  data: string
}

type BackupArchive = {
  schemaVersion: number
  product: 'Ghost Nexora Bot'
  createdAt: number
  reason: BackupReason
  source: {
    instance: 'main'
    sessionIncluded: false
  }
  files: BackupFile[]
}

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

function backupFileName(timestamp: number) {
  return `ghostnexora-backup-${safeStamp(timestamp)}${BACKUP_EXTENSION}`
}

function sha256(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex')
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

export async function listOperationalBackups(): Promise<BackupInfo[]> {
  const dir = backupDir()
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const names = (await readdir(dir))
    .filter((name) => name.startsWith('ghostnexora-backup-') && name.endsWith(BACKUP_EXTENSION))

  const rows = await Promise.all(names.map(async (fileName) => {
    const filePath = path.join(dir, fileName)
    const info = await stat(filePath)
    return {
      id: fileName,
      fileName,
      size: info.size,
      createdAt: info.mtimeMs,
    }
  }))

  return rows.sort((a, b) => b.createdAt - a.createdAt)
}

async function applyRetention() {
  const backups = await listOperationalBackups()
  for (const backup of backups.slice(MAX_BACKUPS)) {
    await rm(path.join(backupDir(), backup.fileName), { force: true })
  }
}

export async function createOperationalBackup(reason: BackupReason = 'manual'): Promise<BackupInfo> {
  if (opsInstanceKey() !== 'main') throw new Error('Los backups globales solo pueden crearse desde MainBot.')
  if (creating) throw new Error('Ya hay un backup en proceso.')
  creating = true

  const createdAt = Date.now()
  const dir = backupDir()
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const tempDir = await mkdtemp(path.join(dir, '.tmp-'))

  try {
    const mainSnapshot = path.join(tempDir, 'ghostnexora.sqlite')
    const walletSnapshot = path.join(tempDir, 'nexora-economy.sqlite')

    snapshotDatabase(mainSnapshot, economy.db)
    const sameDatabase = path.resolve(economy.file) === path.resolve(economy.walletFile)
    if (!sameDatabase) snapshotDatabase(walletSnapshot, economy.walletDb)

    const files: BackupFile[] = [await encodedFile('ghostnexora.sqlite', mainSnapshot)]
    if (!sameDatabase) files.push(await encodedFile('nexora-economy.sqlite', walletSnapshot))
    if (existsSync(settingsFile())) files.push(await encodedFile('settings.json', settingsFile()))

    const archive: BackupArchive = {
      schemaVersion: BACKUP_VERSION,
      product: 'Ghost Nexora Bot',
      createdAt,
      reason,
      source: {
        instance: 'main',
        sessionIncluded: false,
      },
      files,
    }

    const compressed = await gzipAsync(Buffer.from(JSON.stringify(archive)), { level: 9 })
    const fileName = backupFileName(createdAt)
    const output = path.join(dir, fileName)
    await writeFile(output, compressed, { mode: 0o600 })
    await applyRetention()
    const info = await stat(output)

    logger.info({ reason, fileName, size: info.size, files: files.map((file) => file.name) }, 'operational backup created')
    return { id: fileName, fileName, size: info.size, createdAt }
  } finally {
    creating = false
    await rm(tempDir, { recursive: true, force: true })
  }
}

function validatedArchiveFile(file: BackupFile) {
  const allowed = new Set(['ghostnexora.sqlite', 'nexora-economy.sqlite', 'settings.json'])
  if (!allowed.has(file.name)) throw new Error(`El backup contiene un archivo no permitido: ${file.name}`)
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_ARCHIVE_FILE_BYTES) throw new Error(`Tamaño inválido en ${file.name}.`)
  if (!/^[a-f0-9]{64}$/i.test(file.sha256)) throw new Error(`Hash inválido en ${file.name}.`)
  if (typeof file.data !== 'string' || !file.data.length) throw new Error(`Contenido ausente en ${file.name}.`)
  const buffer = Buffer.from(file.data, 'base64')
  if (buffer.length !== file.size) throw new Error(`El tamaño de ${file.name} no coincide con el manifiesto.`)
  if (sha256(buffer) !== file.sha256.toLowerCase()) throw new Error(`La integridad de ${file.name} no es válida.`)
  return buffer
}

async function readAndValidateArchive(fileName: string) {
  const filePath = operationalBackupPath(fileName)
  const info = await stat(filePath)
  if (!info.isFile() || info.size <= 0 || info.size > MAX_COMPRESSED_BACKUP_BYTES) throw new Error('El archivo de backup supera el límite permitido.')
  const decompressed = await gunzipAsync(await readFile(filePath))
  const archive = JSON.parse(decompressed.toString('utf8')) as Partial<BackupArchive>
  if (archive.schemaVersion !== BACKUP_VERSION || archive.product !== 'Ghost Nexora Bot') throw new Error('Formato o versión de backup no compatible.')
  if (archive.source?.instance !== 'main' || archive.source?.sessionIncluded !== false) throw new Error('El backup no cumple la política de restauración segura.')
  if (!Array.isArray(archive.files) || !archive.files.length) throw new Error('El backup no contiene archivos restaurables.')

  const decoded = new Map<string, Buffer>()
  for (const file of archive.files) {
    if (!file || typeof file !== 'object') throw new Error('Entrada de backup inválida.')
    if (decoded.has(file.name)) throw new Error(`Archivo duplicado en backup: ${file.name}`)
    decoded.set(file.name, validatedArchiveFile(file))
  }
  if (!decoded.has('ghostnexora.sqlite')) throw new Error('El backup no contiene ghostnexora.sqlite.')
  const sameDatabase = path.resolve(economy.file) === path.resolve(economy.walletFile)
  if (!sameDatabase && !decoded.has('nexora-economy.sqlite')) throw new Error('El backup no contiene la base global de economía.')
  return { archive: archive as BackupArchive, decoded }
}

export async function prepareOperationalRestore(fileName: string) {
  if (opsInstanceKey() !== 'main') throw new Error('La restauración global solo puede ejecutarse desde MainBot.')
  if (restorePreparing || existsSync(pendingRestorePath())) throw new Error('Ya hay una restauración pendiente.')
  restorePreparing = true
  const root = restoreDir()
  await mkdir(root, { recursive: true, mode: 0o700 })
  const stagingDir = await mkdtemp(path.join(root, 'staging-'))

  try {
    const { decoded } = await readAndValidateArchive(fileName)
    const targets = new Map<string, string>([
      ['ghostnexora.sqlite', economy.file],
      ['nexora-economy.sqlite', economy.walletFile],
      ['settings.json', settingsFile()],
    ])
    const files: RestorePlanFile[] = []
    for (const [name, buffer] of decoded) {
      const target = targets.get(name)
      if (!target) continue
      if (name === 'nexora-economy.sqlite' && path.resolve(economy.file) === path.resolve(economy.walletFile)) continue
      const source = path.join(stagingDir, name)
      await writeFile(source, buffer, { mode: 0o600 })
      files.push({
        name: name as RestorePlanFile['name'],
        source,
        target,
        size: buffer.length,
        sha256: sha256(buffer),
      })
    }

    const plan: RestorePlan = {
      schemaVersion: 1,
      createdAt: Date.now(),
      backupId: path.basename(fileName),
      stagingDir,
      files,
    }
    await writeFile(pendingRestorePath(), `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600 })

    const restartScheduled = !['1', 'true', 'yes', 'on'].includes(String(process.env.NEXORA_DISABLE_RESTORE_EXIT ?? '').toLowerCase())
    if (restartScheduled) {
      const exitTimer = setTimeout(() => {
        logger.warn({ backupId: plan.backupId }, 'stopping MainBot to apply prepared operational restore on next bootstrap')
        process.exit(76)
      }, 1_500)
      exitTimer.unref?.()
    }

    logger.warn({ backupId: plan.backupId, files: files.map((file) => file.name), restartScheduled }, 'operational restore prepared')
    return { backupId: plan.backupId, files: files.map((file) => file.name), restartScheduled, sessionRestored: false }
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined)
    throw error
  } finally {
    restorePreparing = false
  }
}

async function scheduledTick() {
  try {
    const latest = (await listOperationalBackups())[0]
    if (latest && Date.now() - latest.createdAt < AUTO_BACKUP_INTERVAL_MS) return
    await createOperationalBackup('scheduled')
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

export function operationalBackupPath(fileName: string) {
  const safe = path.basename(fileName)
  if (safe !== fileName || !safe.startsWith('ghostnexora-backup-') || !safe.endsWith(BACKUP_EXTENSION)) {
    throw new Error('Backup inválido.')
  }
  return path.join(backupDir(), safe)
}
