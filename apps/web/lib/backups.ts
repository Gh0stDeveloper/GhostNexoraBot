import { mkdir, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { runtime } from './runtime'

export type WebBackupInfo = {
  id: string
  fileName: string
  size: number
  createdAt: number
}

const PREFIX = 'ghostnexora-backup-'
const EXTENSION = '.gnb-backup.gz'

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

export async function listWebBackups(): Promise<WebBackupInfo[]> {
  const dir = backupDirectory()
  await mkdir(dir, { recursive: true })
  const names = (await readdir(dir)).filter((name) => safeBackupFileName(name))
  const rows = await Promise.all(names.map(async (fileName) => {
    const info = await stat(path.join(dir, fileName))
    return { id: fileName, fileName, size: info.size, createdAt: info.mtimeMs }
  }))
  return rows.sort((a, b) => b.createdAt - a.createdAt)
}
