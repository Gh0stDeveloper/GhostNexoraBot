import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { gzip } from 'node:zlib'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'
import { economy } from './economy.js'
import { opsInstanceKey } from './ops-database.js'

const gzipAsync = promisify(gzip)
const BACKUP_VERSION = 1
const BACKUP_EXTENSION = '.gnb-backup.gz'
const MAX_BACKUPS = 30
const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60_000
const CHECK_INTERVAL_MS = 60 * 60_000

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

function backupDir() {
  return path.join(config.dataDir, 'backups')
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
