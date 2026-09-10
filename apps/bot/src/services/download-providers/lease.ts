import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { config } from '../../config.js'

const DEFAULT_WAIT_MS = 2 * 60_000
const DEFAULT_STALE_MS = 2 * 60_000
const DEFAULT_HEARTBEAT_MS = 20_000
const DEFAULT_RELEASE_COOLDOWN_MS = 1_500

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function safeProvider(value: string) {
  const safe = value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  if (!safe) throw new Error('Provider lease inválido.')
  return safe
}

/**
 * Los subbots tienen DATA_DIR aislado, pero reciben NEXORA_GLOBAL_CONTROL_DB
 * apuntando al almacenamiento global de MainBot. Eso permite serializar por IP
 * sin mezclar configuración, sesión o datos de usuario entre instancias.
 */
export function providerLeaseRoot() {
  const globalControlDb = process.env.NEXORA_GLOBAL_CONTROL_DB?.trim()
  if (globalControlDb) return path.join(path.dirname(globalControlDb), 'provider-leases')
  return path.join(config.dataDir, 'provider-leases')
}

type LeaseOptions = {
  waitMs?: number
  staleMs?: number
  heartbeatMs?: number
  releaseCooldownMs?: number
  pollMs?: number
}

type LeaseOwner = {
  id: string
  provider: string
  pid: number
  acquiredAt: number
}

async function leaseAgeMs(lockDir: string) {
  try {
    const info = await stat(path.join(lockDir, 'owner.json'))
    return Date.now() - info.mtimeMs
  } catch {
    try {
      const info = await stat(lockDir)
      return Date.now() - info.mtimeMs
    } catch {
      return 0
    }
  }
}

async function ownsLease(ownerPath: string, id: string) {
  try {
    const owner = JSON.parse(await readFile(ownerPath, 'utf8')) as Partial<LeaseOwner>
    return owner.id === id
  } catch {
    return false
  }
}

export async function withProviderLease<T>(provider: string, work: () => Promise<T>, options: LeaseOptions = {}): Promise<T> {
  const name = safeProvider(provider)
  const root = providerLeaseRoot()
  const lockDir = path.join(root, `${name}.lock`)
  const ownerPath = path.join(lockDir, 'owner.json')
  const waitMs = Math.max(1_000, options.waitMs ?? DEFAULT_WAIT_MS)
  const staleMs = Math.max(30_000, options.staleMs ?? DEFAULT_STALE_MS)
  const heartbeatMs = Math.min(Math.max(5_000, options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS), Math.floor(staleMs / 2))
  const releaseCooldownMs = Math.max(0, options.releaseCooldownMs ?? DEFAULT_RELEASE_COOLDOWN_MS)
  const pollMs = Math.max(50, options.pollMs ?? 250)
  const startedAt = Date.now()
  const id = randomUUID()

  await mkdir(root, { recursive: true })

  while (true) {
    try {
      await mkdir(lockDir)
      const owner: LeaseOwner = { id, provider: name, pid: process.pid, acquiredAt: Date.now() }
      await writeFile(ownerPath, `${JSON.stringify(owner)}\n`, { encoding: 'utf8', mode: 0o600 })
      break
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code
      if (code !== 'EEXIST') throw error

      if (await leaseAgeMs(lockDir) > staleMs) {
        await rm(lockDir, { recursive: true, force: true }).catch(() => undefined)
        continue
      }
      if (Date.now() - startedAt >= waitMs) {
        throw new Error(`${name} está atendiendo otra descarga. Reintenta cuando termine la descarga en curso.`)
      }
      await sleep(pollMs + Math.floor(Math.random() * Math.min(150, pollMs)))
    }
  }

  const heartbeat = setInterval(() => {
    const now = new Date()
    void utimes(ownerPath, now, now).catch(() => undefined)
  }, heartbeatMs)
  heartbeat.unref?.()

  try {
    return await work()
  } finally {
    clearInterval(heartbeat)
    if (releaseCooldownMs > 0) await sleep(releaseCooldownMs)
    if (await ownsLease(ownerPath, id)) {
      await rm(lockDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}
