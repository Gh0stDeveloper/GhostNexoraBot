import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { gunzip } from 'node:zlib'
import { runtime } from './runtime'

const gunzipAsync = promisify(gunzip)

export type WebBackupType = 'economy' | 'configuration' | 'subbots' | 'sessions' | 'groups' | 'full'

export type WebBackupInfo = {
  id: string
  fileName: string
  size: number
  createdAt: number
  type: WebBackupType
  reason: 'manual' | 'scheduled'
  sha256: string
  verified: boolean
  files: number
  tables: number
  sessionIncluded: boolean
}

const PREFIX = 'ghostnexora-backup-'
const EXTENSION = '.gnb-backup.gz'
const MAX_PARSE_BYTES = 512 * 1024 * 1024

export function backupDirectory() {
  return path.join(runtime.dataDir, 'backups')
}

export function safeBackupFileName(value: string) {
  const safe = path.basename(value)
  if (safe !== value || !safe.startsWith(PREFIX) || !safe.endsWith(EXTENSION)) return null
  return safe
}

export function backupPath(value: string) {
  const safe = safeBackupFileName(value)
  return safe ? path.join(backupDirectory(), safe) : null
}

function backupType(value: unknown): WebBackupType {
  return value === 'economy' || value === 'configuration' || value === 'subbots'
    || value === 'sessions' || value === 'groups' || value === 'full'
    ? value
    : 'full'
}

async function inspectBackup(fileName: string): Promise<WebBackupInfo> {
  const filePath = path.join(backupDirectory(), fileName)
  const info = await stat(filePath)
  const sidecarPath = `${filePath}.meta.json`

  try {
    const sidecar = JSON.parse(await readFile(sidecarPath, 'utf8')) as Partial<WebBackupInfo>
    if (
      sidecar.fileName === fileName
      && /^[a-f0-9]{64}$/i.test(String(sidecar.sha256 ?? ''))
    ) {
      return {
        id: fileName,
        fileName,
        size: info.size,
        createdAt: Number(sidecar.createdAt ?? info.mtimeMs),
        type: backupType(sidecar.type),
        reason: sidecar.reason === 'scheduled' ? 'scheduled' : 'manual',
        sha256: String(sidecar.sha256),
        verified: Boolean(sidecar.verified),
        files: Number(sidecar.files ?? 0),
        tables: Number(sidecar.tables ?? 0),
        sessionIncluded: Boolean(sidecar.sessionIncluded),
      }
    }
  } catch {
    // Backups created before E13 do not have metadata sidecars.
  }

  const compressed = await readFile(filePath)
  const hash = createHash('sha256').update(compressed).digest('hex')
  if (compressed.length > MAX_PARSE_BYTES) {
    return {
      id: fileName,
      fileName,
      size: info.size,
      createdAt: info.mtimeMs,
      type: 'full',
      reason: 'manual',
      sha256: hash,
      verified: false,
      files: 0,
      tables: 0,
      sessionIncluded: false,
    }
  }

  try {
    const parsed = JSON.parse((await gunzipAsync(compressed)).toString('utf8')) as {
      schemaVersion?: unknown
      product?: unknown
      createdAt?: unknown
      reason?: unknown
      backupType?: unknown
      source?: { sessionIncluded?: unknown }
      files?: unknown[]
      tables?: unknown[]
    }
    const legacy = Number(parsed.schemaVersion) === 1
    const valid = parsed.product === 'Ghost Nexora Bot' && (legacy || Number(parsed.schemaVersion) === 2)
    return {
      id: fileName,
      fileName,
      size: info.size,
      createdAt: Number(parsed.createdAt ?? info.mtimeMs),
      type: legacy ? 'full' : backupType(parsed.backupType),
      reason: parsed.reason === 'scheduled' ? 'scheduled' : 'manual',
      sha256: hash,
      verified: valid,
      files: Array.isArray(parsed.files) ? parsed.files.length : 0,
      tables: Array.isArray(parsed.tables) ? parsed.tables.length : 0,
      sessionIncluded: Boolean(parsed.source?.sessionIncluded),
    }
  } catch {
    return {
      id: fileName,
      fileName,
      size: info.size,
      createdAt: info.mtimeMs,
      type: 'full',
      reason: 'manual',
      sha256: hash,
      verified: false,
      files: 0,
      tables: 0,
      sessionIncluded: false,
    }
  }
}

export async function listWebBackups(): Promise<WebBackupInfo[]> {
  const dir = backupDirectory()
  await mkdir(dir, { recursive: true })
  const names = (await readdir(dir)).filter((name) => safeBackupFileName(name))
  const rows = await Promise.all(names.map(inspectBackup))
  return rows.sort((a, b) => b.createdAt - a.createdAt)
}
