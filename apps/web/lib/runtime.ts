import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

function loadEnvFile() {
  const file = process.env.ENV_FILE
  const values: Record<string, string> = {}
  if (!file || !existsSync(file)) return values
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const index = line.indexOf('=')
    if (index < 1) continue
    values[line.slice(0, index)] = line.slice(index + 1)
  }
  return values
}

const fileEnv = loadEnvFile()
export const runtime = {
  adminToken: process.env.ADMIN_WEB_TOKEN ?? fileEnv.ADMIN_WEB_TOKEN ?? '',
  dataDir: process.env.DATA_DIR ?? fileEnv.DATA_DIR ?? path.resolve(process.cwd(), '../../data'),
  publicWebUrl: process.env.PUBLIC_WEB_URL ?? fileEnv.PUBLIC_WEB_URL ?? 'http://127.0.0.1:3000',
  botHealthUrl: process.env.BOT_HEALTH_URL ?? fileEnv.BOT_HEALTH_URL ?? 'http://127.0.0.1:3001/health',
}

export function openBotDb() {
  const file = path.join(runtime.dataDir, 'ghostnexora.sqlite')
  if (!existsSync(file)) return null
  return new DatabaseSync(file, { readOnly: true })
}

export function tokenHash(token: string) { return createHash('sha256').update(token).digest('hex') }
