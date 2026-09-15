import { readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { config } from './config.js'
import { settings } from './core/settings.js'

const installDir = process.env.GHOSTNEXORA_HOME || path.resolve(process.cwd())
const stateDir = process.env.GHOSTNEXORA_STATE || path.join(os.homedir(), '.ghostnexora')
const envFile = process.env.ENV_FILE || path.join(installDir, '.env')
const pairLog = path.join(stateDir, 'run', 'pair.log')
const pairPidFile = path.join(stateDir, 'run', 'pair.pid')

const truthy = (value: string | undefined) => ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase())

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T
  } catch {
    return null
  }
}

async function readEnvMap() {
  let raw = ''
  try { raw = await readFile(envFile, 'utf8') } catch { return new Map<string, string>() }
  const result = new Map<string, string>()
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match) result.set(match[1], match[2])
  }
  return result
}

async function setEnvValue(key: string, value: string) {
  let raw = ''
  try { raw = await readFile(envFile, 'utf8') } catch { /* created below */ }
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matcher = new RegExp(`^${escapedKey}=.*$`, 'm')
  const next = matcher.test(raw)
    ? raw.replace(matcher, `${key}=${value}`)
    : `${raw.trimEnd()}${raw.trim() ? '\n' : ''}${key}=${value}\n`
  await writeFile(envFile, next, { mode: 0o600 })
}

async function fetchHealth() {
  try {
    const response = await fetch(`http://127.0.0.1:${config.healthPort}/health`, {
      signal: AbortSignal.timeout(1800),
      headers: { accept: 'application/json' },
    })
    const body = await response.json() as Record<string, unknown>
    return body
  } catch {
    return null
  }
}

async function runtimeStatus(running: boolean, pid: string | undefined) {
  await settings.init()
  const health = running ? await fetchHealth() : null
  const creds = await readJson<{ registered?: boolean }>(path.join(config.sessionDir, 'creds.json'))
  const packageJson = await readJson<{ version?: string }>(path.join(installDir, 'package.json'))
  const env = await readEnvMap()
  const webEnabled = truthy(env.get('TERMUX_LOCAL_WEB_ENABLED'))
  const whatsappConnected = Boolean(health?.connected)

  process.stdout.write(`${JSON.stringify({
    ok: true,
    installed: true,
    running,
    pid: pid || null,
    runtimeState: running ? (whatsappConnected ? 'online' : 'starting') : 'offline',
    whatsappConnected,
    paired: Boolean(creds?.registered),
    uptimeSeconds: Number(health?.uptimeSeconds ?? 0),
    botName: settings.botDisplayName,
    prefix: settings.prefix,
    language: settings.language,
    nodeVersion: process.version,
    version: packageJson?.version ?? '2.0.0',
    profile: 'termux-lite',
    webEnabled,
    webUrl: `http://127.0.0.1:${config.healthPort}/`,
    installDir,
    stateDir,
  })}\n`)
}

async function setConfig(botName: string, prefix: string, language: string) {
  await settings.init()
  await settings.setBotDisplayName(botName)
  await settings.setPrefix(prefix)
  await settings.setLanguage(language === 'en' ? 'en' : 'es')
  process.stdout.write(`${JSON.stringify({
    ok: true,
    botName: settings.botDisplayName,
    prefix: settings.prefix,
    language: settings.language,
  })}\n`)
}

async function setWeb(enabled: boolean) {
  await setEnvValue('TERMUX_LOCAL_WEB_ENABLED', enabled ? 'true' : 'false')
  process.stdout.write(`${JSON.stringify({ ok: true, webEnabled: enabled })}\n`)
}

type PairEvent = {
  type?: string
  value?: string
  message?: string
  at?: string
}

async function pairStatus() {
  let raw = ''
  try { raw = await readFile(pairLog, 'utf8') } catch { /* idle */ }
  const events: PairEvent[] = []
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith('GHOST_NEXORA_PAIR_EVENT:')) continue
    try { events.push(JSON.parse(line.slice('GHOST_NEXORA_PAIR_EVENT:'.length)) as PairEvent) } catch { /* ignore malformed */ }
  }

  const latest = events.at(-1)
  const latestQr = [...events].reverse().find((event) => event.type === 'qr')?.value ?? null
  const latestCode = [...events].reverse().find((event) => event.type === 'code')?.value ?? null
  const creds = await readJson<{ registered?: boolean }>(path.join(config.sessionDir, 'creds.json'))
  const pidRaw = (await readFile(pairPidFile, 'utf8').catch(() => '')).trim()
  const pid = Number(pidRaw)
  let active = false
  if (Number.isInteger(pid) && pid > 0) {
    try { process.kill(pid, 0); active = true } catch { active = false }
  }

  const linked = Boolean(creds?.registered) || latest?.type === 'linked'
  const state = linked
    ? 'linked'
    : latest?.type === 'error'
      ? 'error'
      : active
        ? (latestCode || latestQr ? 'waiting' : 'starting')
        : (latest ? latest.type ?? 'idle' : 'idle')

  process.stdout.write(`${JSON.stringify({
    ok: true,
    state,
    active,
    qr: latestQr,
    pairingCode: latestCode,
    message: latest?.message ?? null,
  })}\n`)
}

async function main() {
  const command = process.argv[2] ?? ''
  if (command === 'status') {
    await runtimeStatus(process.argv[3] === 'true', process.argv[4])
    return
  }
  if (command === 'config-set') {
    await setConfig(process.argv[3] ?? '', process.argv[4] ?? '.', process.argv[5] ?? 'es')
    return
  }
  if (command === 'web-set') {
    await setWeb(process.argv[3] === 'on')
    return
  }
  if (command === 'pair-status') {
    await pairStatus()
    return
  }
  throw new Error('unsupported_local_manager_command')
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`)
  process.exit(1)
})
