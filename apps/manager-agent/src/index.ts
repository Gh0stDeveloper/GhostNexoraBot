import http from 'node:http'
import { execFile } from 'node:child_process'
import { timingSafeEqual } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import {
  CONTROL_API_VERSION,
  type RuntimeActionResponse,
  type RuntimeStatusResponse,
} from '@ghostnexora/control-api-contracts'

const execFileAsync = promisify(execFile)
const startedAt = new Date().toISOString()
const BOT_SERVICE = 'ghost-nexora-bot.service'
const PORT = numberEnv('MANAGER_PORT', 3002)
const BOT_PORT = numberEnv('BOT_HEALTH_PORT', 3001)
const DATA_DIR = process.env.DATA_DIR || '/var/lib/ghost-nexora-bot/data'
const TOKEN = (process.env.MANAGER_API_TOKEN || process.env.ADMIN_WEB_TOKEN || '').trim()
const runtimeProfile = process.env.NEXORA_RUNTIME_PROFILE === 'termux-lite' ? 'termux-lite' : 'full'

if (TOKEN.length < 12) {
  throw new Error('MANAGER_API_TOKEN/ADMIN_WEB_TOKEN must contain at least 12 characters')
}

function numberEnv(key: string, fallback: number) {
  const parsed = Number(process.env[key] ?? fallback)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) throw new Error(`${key} is invalid`)
  return parsed
}

function json(res: http.ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-ghost-nexora-api': CONTROL_API_VERSION,
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(payload))
}

function bearer(header: string | string[] | undefined) {
  const raw = Array.isArray(header) ? header[0] : header
  if (!raw?.startsWith('Bearer ')) return ''
  return raw.slice('Bearer '.length).trim()
}

function authorized(req: http.IncomingMessage) {
  const provided = Buffer.from(bearer(req.headers.authorization))
  const expected = Buffer.from(TOKEN)
  return provided.length === expected.length && provided.length > 0 && timingSafeEqual(provided, expected)
}

async function readBody(req: http.IncomingMessage) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 64 * 1024) throw new Error('payload_too_large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

async function systemctl(action: 'start' | 'stop' | 'restart' | 'is-active') {
  const result = await execFileAsync('/usr/bin/systemctl', [action, BOT_SERVICE], {
    timeout: 30_000,
    windowsHide: true,
    maxBuffer: 64 * 1024,
  }).catch((error: unknown) => {
    const row = error as { stdout?: string; stderr?: string; code?: number }
    if (action === 'is-active') return { stdout: row.stdout ?? 'inactive\n', stderr: row.stderr ?? '' }
    const detail = String(row.stderr || row.stdout || `systemctl_${action}_failed`).trim()
    throw new Error(detail.slice(0, 500))
  })
  return String(result.stdout ?? '').trim()
}

async function botActive() {
  return (await systemctl('is-active')) === 'active'
}

async function botFetch(pathname: string, method = 'GET', body?: Buffer) {
  const url = `http://127.0.0.1:${BOT_PORT}${pathname}`
  return fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      ...(body?.length ? { 'content-type': 'application/json' } : {}),
    },
    body: body?.length ? body : undefined,
    signal: AbortSignal.timeout(method === 'GET' ? 5_000 : 30_000),
  }).catch(() => null)
}

async function proxy(req: http.IncomingMessage, res: http.ServerResponse, pathname: string) {
  const payload = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req)
  const response = await botFetch(pathname, req.method || 'GET', payload)
  if (!response) {
    json(res, 503, { ok: false, error: 'bot_control_unavailable' })
    return
  }
  const text = await response.text()
  res.writeHead(response.status, {
    'content-type': response.headers.get('content-type') || 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-ghost-nexora-api': CONTROL_API_VERSION,
    'x-content-type-options': 'nosniff',
  })
  res.end(text)
}

function offlineStatus(): RuntimeStatusResponse {
  return {
    ok: true,
    apiVersion: CONTROL_API_VERSION,
    runtime: {
      state: 'offline',
      profile: runtimeProfile,
      startedAt,
      uptimeSeconds: 0,
      botName: process.env.BOT_NAME || 'Ghost Nexora Bot',
      prefix: process.env.PREFIX || '.',
    },
    platforms: [
      { id: 'whatsapp', enabled: true, connected: false, state: 'stopped', accountLabel: null },
      { id: 'telegram', enabled: Boolean(process.env.TELEGRAM_BOT_TOKEN), connected: false, state: 'stopped', accountLabel: null },
      { id: 'discord', enabled: Boolean(process.env.DISCORD_BOT_TOKEN), connected: false, state: 'stopped', accountLabel: null },
    ],
    llm: {
      requested: ['1', 'true', 'yes', 'on'].includes(String(process.env.OLLAMA_ENABLED ?? '').toLowerCase()),
      enabled: false,
      model: process.env.OLLAMA_MODEL || null,
    },
    subbots: { total: 0, online: 0, pending: 0, offline: 0 },
  }
}

async function waitForBot(expectedUp: boolean, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if ((await botActive()) === expectedUp) return true
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  return (await botActive()) === expectedUp
}

async function runtimeAction(action: 'start' | 'stop' | 'restart' | 'update'): Promise<RuntimeActionResponse> {
  if (action === 'update') {
    await mkdir(DATA_DIR, { recursive: true })
    await writeFile(
      path.join(DATA_DIR, 'update-request'),
      `${JSON.stringify({ source: 'manager-agent-v2', requestedAt: new Date().toISOString() })}\n`,
      { mode: 0o600 },
    )
    return { ok: true, action, accepted: true, detail: 'safe_update_request_queued' }
  }

  if (action === 'start') {
    if (await botActive()) return { ok: true, action, accepted: true, detail: 'already_active' }
    await systemctl('start')
    const ready = await waitForBot(true)
    return { ok: true, action, accepted: true, detail: ready ? 'started' : 'start_requested_health_pending' }
  }

  if (action === 'stop') {
    if (!(await botActive())) return { ok: true, action, accepted: true, detail: 'already_stopped' }
    await systemctl('stop')
    const stopped = await waitForBot(false)
    return { ok: true, action, accepted: true, detail: stopped ? 'stopped' : 'stop_requested' }
  }

  await systemctl('restart')
  const ready = await waitForBot(true)
  return { ok: true, action, accepted: true, detail: ready ? 'restarted' : 'restart_requested_health_pending' }
}

function requestUrl(req: http.IncomingMessage) {
  return new URL(req.url || '/', 'http://127.0.0.1')
}

const server = http.createServer(async (req, res) => {
  const url = requestUrl(req)

  if (url.pathname === '/health') {
    json(res, 200, {
      ok: true,
      service: 'ghost-nexora-manager-agent',
      apiVersion: CONTROL_API_VERSION,
      botService: (await botActive()) ? 'active' : 'inactive',
      startedAt,
      uptimeSeconds: Math.floor(process.uptime()),
    })
    return
  }

  if (!url.pathname.startsWith('/v2/')) {
    json(res, 404, { ok: false, error: 'not_found' })
    return
  }

  if (!authorized(req)) {
    json(res, 401, { ok: false, error: 'unauthorized' })
    return
  }

  try {
    const actionMatch = /^\/v2\/runtime\/(start|stop|restart|update)$/.exec(url.pathname)
    if (req.method === 'POST' && actionMatch) {
      const action = actionMatch[1] as 'start' | 'stop' | 'restart' | 'update'
      json(res, action === 'update' ? 202 : 200, await runtimeAction(action))
      return
    }

    if (req.method === 'GET' && url.pathname === '/v2/status') {
      const response = await botFetch(`${url.pathname}${url.search}`)
      if (!response) {
        json(res, 200, offlineStatus())
        return
      }
      const text = await response.text()
      res.writeHead(response.status, {
        'content-type': response.headers.get('content-type') || 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-ghost-nexora-api': CONTROL_API_VERSION,
      })
      res.end(text)
      return
    }

    await proxy(req, res, `${url.pathname}${url.search}`)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'manager_agent_failed'
    json(res, 500, { ok: false, error: detail.slice(0, 500) })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`[Ghost Nexora Manager] listening on 127.0.0.1:${PORT}\n`)
})

function shutdown() {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 3_000).unref()
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
