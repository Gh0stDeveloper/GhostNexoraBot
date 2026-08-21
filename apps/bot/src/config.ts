import { existsSync } from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import { z } from 'zod'

const envCandidates = [
  process.env.ENV_FILE,
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../../.env'),
].filter(Boolean) as string[]

for (const candidate of envCandidates) {
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate, override: false })
    break
  }
}

const schema = z.object({
  BOT_NAME: z.string().min(1).default('Ghost Nexora Bot'),
  PREFIX: z.string().min(1).max(4).default('.'),
  OWNER_NUMBERS: z.string().default(''),
  AUTO_REACT: z.string().default('true'),
  MAX_DOWNLOAD_MB: z.coerce.number().int().min(5).max(500).default(60),
  SESSION_DIR: z.string().default('./data/session'),
  DATA_DIR: z.string().default('./data'),
  BOT_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z.string().default('info'),
})

const raw = schema.parse(process.env)
const workspaceRoot = process.cwd().endsWith(`${path.sep}apps${path.sep}bot`)
  ? path.resolve(process.cwd(), '../..')
  : process.cwd()

const resolveFromRoot = (value: string) =>
  path.isAbsolute(value) ? value : path.resolve(workspaceRoot, value)

export const config = {
  botName: raw.BOT_NAME,
  defaultPrefix: raw.PREFIX,
  owners: raw.OWNER_NUMBERS.split(',').map((value) => value.replace(/\D/g, '')).filter(Boolean),
  autoReact: ['1', 'true', 'yes', 'on'].includes(raw.AUTO_REACT.toLowerCase()),
  maxDownloadBytes: raw.MAX_DOWNLOAD_MB * 1024 * 1024,
  maxDownloadMb: raw.MAX_DOWNLOAD_MB,
  sessionDir: resolveFromRoot(raw.SESSION_DIR),
  dataDir: resolveFromRoot(raw.DATA_DIR),
  healthPort: raw.BOT_HEALTH_PORT,
  logLevel: raw.LOG_LEVEL,
  workspaceRoot,
} as const
