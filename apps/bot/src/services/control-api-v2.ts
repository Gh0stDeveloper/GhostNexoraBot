import type http from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  CONTROL_API_VERSION,
  safePlatformId,
  type ConfigPatch,
  type LogEntry,
  type PairStartRequest,
  type PairStatusResponse,
  type PlatformStatus,
} from '@ghostnexora/control-api-contracts'
import { config } from '../config.js'
import { settings } from '../core/settings.js'
import { economy } from './economy.js'
import { telegramRuntimeStatus, startTelegramPlatform, stopTelegramPlatform } from '../platform/telegram/runtime.js'
import { discordRuntimeStatus, startDiscordPlatform, stopDiscordPlatform } from '../platform/discord/runtime.js'
import { logger } from '../utils/logger.js'

const startedAt = new Date().toISOString()
const logEntries: LogEntry[] = []
const MAX_CONTROL_LOGS = 200
let pairState: PairStatusResponse = { ok: true, platform: 'whatsapp', state: 'idle', expiresAt: null, qr: null, pairingCode: null }

export interface ControlApiV2Deps {
  whatsappConnected: () => boolean
  whatsappAccountLabel: () => string | null
  connectWhatsApp: () => Promise<void>
  disconnectWhatsApp: () => Promise<void>
  startWhatsAppPairing: (request: PairStartRequest) => Promise<{ pairingCode?: string | null; detail?: string | null }>
}

function now() { return new Date().toISOString() }

export function recordControlLog(level: LogEntry['level'], message: string) {
  const entry: LogEntry = { cursor: `${Date.now()}-${logEntries.length}`, timestamp: now(), level, message: redact(message) }
  logEntries.push(entry)
  if (logEntries.length > MAX_CONTROL_LOGS) logEntries.splice(0, logEntries.length - MAX_CONTROL_LOGS)
}

export function setControlPairQr(qr: string | null) {
  pairState = qr
    ? { ok: true, platform: 'whatsapp', state: 'waiting', expiresAt: new Date(Date.now() + 60_000).toISOString(), qr, pairingCode: pairState.pairingCode ?? null }
    : { ...pairState, qr: null }
}

export function markControlPairConnected() {
  pairState = { ok: true, platform: 'whatsapp', state: 'paired', expiresAt: null, qr: null, pairingCode: null }
}

export function markControlPairError(detail: string) {
  pairState = { ok: true, platform: 'whatsapp', state: 'error', expiresAt: null, qr: null, pairingCode: null, detail: redact(detail) }
}

function redact(value: string) {
  let next = value
  for (const secret of [config.adminWebToken, config.telegramBotToken]) {
    if (secret && secret.length >= 8) next = next.split(secret).join('[REDACTED]')
  }
  next = next.replace(/\b(?:Bearer\s+)?[A-Za-z0-9_-]{24,}\b/g, '[REDACTED]')
  return next.slice(0, 2_000)
}

function json(res: http.ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-ghost-nexora-api': CONTROL_API_VERSION,
  })
  res.end(JSON.stringify(payload))
}

async function body(req: http.IncomingMessage) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 64 * 1024) throw new Error('payload_too_large')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>
}

function authorized(req: http.IncomingMessage) {
  const header = Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization
  return Boolean(config.adminWebToken) && header === `Bearer ${config.adminWebToken}`
}

function platforms(deps: ControlApiV2Deps): PlatformStatus[] {
  const telegram = telegramRuntimeStatus()
  const discord = discordRuntimeStatus()
  return [
    {
      id: 'whatsapp', enabled: true, connected: deps.whatsappConnected(),
      state: deps.whatsappConnected() ? 'running' : 'stopped', accountLabel: deps.whatsappAccountLabel(),
    },
    {
      id: 'telegram', enabled: telegram.configured, connected: telegram.state === 'running',
      state: telegram.state, accountLabel: telegram.username ? `@${telegram.username}` : null, detail: telegram.lastError,
    },
    {
      id: 'discord', enabled: discord.configured, connected: discord.state === 'running',
      state: discord.state, accountLabel: discord.username, detail: discord.lastError,
    },
  ]
}

function publicConfig() {
  return {
    botName: settings.botDisplayName,
    prefix: settings.prefix,
    language: settings.language,
    webEnabled: config.webEnabled,
    publicWebUrl: config.publicWebUrl,
    ollamaRequested: config.ollamaRequested,
    ollamaModel: config.ollamaRequested ? config.ollamaModel : null,
  }
}

async function patchConfig(patch: ConfigPatch) {
  if (patch.botName !== undefined) await settings.setBotDisplayName(String(patch.botName))
  if (patch.prefix !== undefined) await settings.setPrefix(String(patch.prefix))
  if (patch.language !== undefined) {
    if (patch.language !== 'es' && patch.language !== 'en') throw new Error('invalid_language')
    await settings.setLanguage(patch.language)
  }
  recordControlLog('info', 'Runtime configuration updated through Control API V2')
  return publicConfig()
}

async function platformAction(id: string, connect: boolean, deps: ControlApiV2Deps) {
  const platform = safePlatformId(id)
  if (!platform) throw new Error('invalid_platform')
  if (platform === 'whatsapp') connect ? await deps.connectWhatsApp() : await deps.disconnectWhatsApp()
  else if (platform === 'telegram') connect ? await startTelegramPlatform() : await stopTelegramPlatform()
  else connect ? await startDiscordPlatform() : await stopDiscordPlatform()
  recordControlLog('info', `${platform} ${connect ? 'connect' : 'disconnect'} requested`)
  return platforms(deps).find((item) => item.id === platform)
}

async function runtimeUpdate() {
  await mkdir(config.dataDir, { recursive: true })
  const requestFile = path.join(config.dataDir, 'update-request')
  await writeFile(requestFile, `${JSON.stringify({ source: 'control-api-v2', requestedAt: now() })}\n`, { mode: 0o600 })
  recordControlLog('info', 'Safe updater request created')
}

function parseUrl(req: http.IncomingMessage) {
  return new URL(req.url ?? '/', 'http://127.0.0.1')
}

export async function handleControlApiV2(req: http.IncomingMessage, res: http.ServerResponse, deps: ControlApiV2Deps) {
  const url = parseUrl(req)
  if (!url.pathname.startsWith('/v2/')) return false
  if (!authorized(req)) {
    json(res, 401, { ok: false, error: 'unauthorized' })
    return true
  }

  try {
    if (req.method === 'GET' && url.pathname === '/v2/status') {
      const subbots = economy.listSubbots()
      json(res, 200, {
        ok: true,
        apiVersion: CONTROL_API_VERSION,
        runtime: {
          state: deps.whatsappConnected() ? 'online' : 'degraded',
          profile: config.runtimeProfile,
          startedAt,
          uptimeSeconds: Math.floor(process.uptime()),
          botName: settings.botDisplayName,
          prefix: settings.prefix,
        },
        platforms: platforms(deps),
        llm: { requested: config.ollamaRequested, enabled: config.ollamaEnabled, model: config.ollamaRequested ? config.ollamaModel : null },
        subbots: {
          total: subbots.length,
          online: subbots.filter((item) => item.status === 'online').length,
          pending: subbots.filter((item) => item.status === 'pending').length,
          offline: subbots.filter((item) => item.status === 'offline').length,
        },
      })
      return true
    }

    if (req.method === 'GET' && url.pathname === '/v2/metrics') {
      const memory = process.memoryUsage()
      json(res, 200, {
        ok: true, generatedAt: now(),
        memory: { rssBytes: memory.rss, heapUsedBytes: memory.heapUsed, heapTotalBytes: memory.heapTotal },
        process: { pid: process.pid, uptimeSeconds: Math.floor(process.uptime()) },
      })
      return true
    }

    if (req.method === 'GET' && url.pathname === '/v2/logs') {
      const cursor = url.searchParams.get('cursor')
      const index = cursor ? logEntries.findIndex((entry) => entry.cursor === cursor) + 1 : Math.max(0, logEntries.length - 100)
      const entries = logEntries.slice(Math.max(0, index))
      json(res, 200, { ok: true, cursor: entries.at(-1)?.cursor ?? cursor ?? null, entries, redacted: true })
      return true
    }

    if (req.method === 'GET' && url.pathname === '/v2/config') {
      json(res, 200, { ok: true, config: publicConfig() })
      return true
    }
    if (req.method === 'PATCH' && url.pathname === '/v2/config') {
      json(res, 200, { ok: true, config: await patchConfig(await body(req) as ConfigPatch) })
      return true
    }

    if (req.method === 'GET' && url.pathname === '/v2/platforms') {
      json(res, 200, { ok: true, platforms: platforms(deps) })
      return true
    }
    const platformMatch = /^\/v2\/platforms\/([^/]+)\/(connect|disconnect)$/.exec(url.pathname)
    if (req.method === 'POST' && platformMatch) {
      const item = await platformAction(platformMatch[1] ?? '', platformMatch[2] === 'connect', deps)
      json(res, 200, { ok: true, platform: item })
      return true
    }

    if (req.method === 'POST' && url.pathname === '/v2/pair/start') {
      const request = await body(req) as unknown as PairStartRequest
      if (request.platform !== 'whatsapp') {
        json(res, 409, { ok: false, error: 'pairing_managed_by_platform_token', code: 'manager_required' })
        return true
      }
      const result = await deps.startWhatsAppPairing(request)
      pairState = {
        ok: true, platform: 'whatsapp', state: deps.whatsappConnected() ? 'paired' : 'waiting',
        expiresAt: deps.whatsappConnected() ? null : new Date(Date.now() + 60_000).toISOString(),
        qr: pairState.qr ?? null, pairingCode: result.pairingCode ?? pairState.pairingCode ?? null, detail: result.detail ?? null,
      }
      json(res, 202, pairState)
      return true
    }
    if (req.method === 'GET' && url.pathname === '/v2/pair/status') {
      json(res, 200, deps.whatsappConnected() ? { ...pairState, state: 'paired', qr: null, pairingCode: null, expiresAt: null } : pairState)
      return true
    }

    if (req.method === 'POST' && url.pathname === '/v2/runtime/update') {
      await runtimeUpdate()
      json(res, 202, { ok: true, action: 'update', accepted: true, detail: 'safe_update_request_queued' })
      return true
    }
    if (req.method === 'POST' && ['/v2/runtime/start', '/v2/runtime/stop', '/v2/runtime/restart'].includes(url.pathname)) {
      const action = url.pathname.split('/').at(-1) as 'start' | 'stop' | 'restart'
      json(res, 409, { ok: true, action, accepted: false, managerRequired: true, detail: 'host_process_manager_required' })
      return true
    }

    json(res, 404, { ok: false, error: 'not_found' })
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : 'control_api_failed'
    recordControlLog('error', message)
    logger.warn({ error }, 'Control API V2 request failed')
    json(res, 400, { ok: false, error: redact(message) })
    return true
  }
}
