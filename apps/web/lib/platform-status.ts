import { runtime } from './runtime'
import type { OpsRuntimeStatus } from './ops'

export type WebPlatformId = 'whatsapp' | 'discord' | 'telegram'
export type WebPlatformAction = 'connect' | 'disconnect' | 'restart'

export type WebPlatformMetrics = {
  groups: number | null
  messagesPerMinute: number | null
  reconnects: number | null
  lastActivityAt: string | null
  startedAt: string | null
  readyAt: string | null
  eventsProcessed: number | null
  sequence: number | null
  sessionResumable: boolean | null
  commandRegistrationEnabled: boolean | null
  commandScope: string | null
  commandSyncAt: string | null
  commandSyncError: string | null
  updatesProcessed: number | null
  offset: number | null
  webhookConfigured: boolean | null
  bridgeChannelConfigured: boolean | null
}

export type WebPlatformStatus = {
  id: WebPlatformId
  known: boolean
  enabled: boolean | null
  connected: boolean | null
  state: string
  accountLabel: string | null
  detail: string | null
  metrics: WebPlatformMetrics
}

type ControlPlatformStatus = {
  id?: string
  enabled?: boolean
  connected?: boolean
  state?: string
  accountLabel?: string | null
  detail?: string | null
  metrics?: Record<string, unknown>
}

function numeric(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function booleanOrNull(value: unknown) {
  return typeof value === 'boolean' ? value : null
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.slice(0, 500) : null
}

function emptyMetrics(): WebPlatformMetrics {
  return {
    groups: null,
    messagesPerMinute: null,
    reconnects: null,
    lastActivityAt: null,
    startedAt: null,
    readyAt: null,
    eventsProcessed: null,
    sequence: null,
    sessionResumable: null,
    commandRegistrationEnabled: null,
    commandScope: null,
    commandSyncAt: null,
    commandSyncError: null,
    updatesProcessed: null,
    offset: null,
    webhookConfigured: null,
    bridgeChannelConfigured: null,
  }
}

function unknown(id: WebPlatformId): WebPlatformStatus {
  return {
    id,
    known: false,
    enabled: null,
    connected: null,
    state: 'unknown',
    accountLabel: null,
    detail: null,
    metrics: emptyMetrics(),
  }
}

function whatsappFallback(runtimeStatus: OpsRuntimeStatus): WebPlatformStatus {
  return {
    id: 'whatsapp',
    known: true,
    enabled: true,
    connected: runtimeStatus.connected,
    state: runtimeStatus.connected
      ? 'running'
      : runtimeStatus.registered
        ? 'registered-no-heartbeat'
        : 'stopped',
    accountLabel: null,
    detail: runtimeStatus.lastGroupSyncError,
    metrics: {
      ...emptyMetrics(),
      groups: runtimeStatus.groupCount,
      lastActivityAt: runtimeStatus.lastEventAt ? new Date(runtimeStatus.lastEventAt).toISOString() : null,
      startedAt: runtimeStatus.connectedAt ? new Date(runtimeStatus.connectedAt).toISOString() : null,
    },
  }
}

function normalize(item: ControlPlatformStatus): WebPlatformStatus | null {
  if (item.id !== 'whatsapp' && item.id !== 'discord' && item.id !== 'telegram') return null
  const metrics = item.metrics ?? {}
  return {
    id: item.id,
    known: true,
    enabled: Boolean(item.enabled),
    connected: Boolean(item.connected),
    state: String(item.state || (item.connected ? 'running' : 'stopped')),
    accountLabel: item.accountLabel ? String(item.accountLabel) : null,
    detail: item.detail ? String(item.detail).slice(0, 500) : null,
    metrics: {
      groups: numeric(metrics.groups),
      messagesPerMinute: numeric(metrics.messagesPerMinute),
      reconnects: numeric(metrics.reconnects),
      lastActivityAt: stringOrNull(metrics.lastActivityAt),
      startedAt: stringOrNull(metrics.startedAt),
      readyAt: stringOrNull(metrics.readyAt),
      eventsProcessed: numeric(metrics.eventsProcessed),
      sequence: numeric(metrics.sequence),
      sessionResumable: booleanOrNull(metrics.sessionResumable),
      commandRegistrationEnabled: booleanOrNull(metrics.commandRegistrationEnabled),
      commandScope: stringOrNull(metrics.commandScope),
      commandSyncAt: stringOrNull(metrics.commandSyncAt),
      commandSyncError: stringOrNull(metrics.commandSyncError),
      updatesProcessed: numeric(metrics.updatesProcessed),
      offset: numeric(metrics.offset),
      webhookConfigured: booleanOrNull(metrics.webhookConfigured),
      bridgeChannelConfigured: booleanOrNull(metrics.bridgeChannelConfigured),
    },
  }
}

function controlUrl(pathname: string) {
  const url = new URL(runtime.botHealthUrl)
  url.pathname = pathname
  url.search = ''
  url.hash = ''
  return url
}

async function controlFetch(pathname: string, init: RequestInit = {}) {
  if (!runtime.adminToken) return null
  return fetch(controlUrl(pathname), {
    ...init,
    headers: {
      authorization: `Bearer ${runtime.adminToken}`,
      accept: 'application/json',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  }).catch(() => null)
}

export async function readMainPlatformStatuses(
  fallbackRuntime: OpsRuntimeStatus,
): Promise<WebPlatformStatus[]> {
  const fallback = new Map<WebPlatformId, WebPlatformStatus>([
    ['whatsapp', whatsappFallback(fallbackRuntime)],
    ['discord', unknown('discord')],
    ['telegram', unknown('telegram')],
  ])

  const response = await controlFetch('/v2/platforms')
  if (!response?.ok) return [...fallback.values()]

  const payload = await response.json().catch(() => null) as {
    ok?: boolean
    platforms?: ControlPlatformStatus[]
  } | null

  if (!payload?.ok || !Array.isArray(payload.platforms)) return [...fallback.values()]
  for (const item of payload.platforms) {
    const value = normalize(item)
    if (value) fallback.set(value.id, value)
  }
  return [...fallback.values()]
}

export async function runMainPlatformAction(id: WebPlatformId, action: WebPlatformAction) {
  const response = await controlFetch(`/v2/platforms/${id}/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  })
  if (!response) return { ok: false as const, error: 'control_api_unavailable' }
  const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; platform?: ControlPlatformStatus } | null
  if (!response.ok || !payload?.ok) return { ok: false as const, error: payload?.error || `control_api_http_${response.status}` }
  return { ok: true as const, platform: payload.platform ? normalize(payload.platform) : null }
}

export function subbotPlatformStatuses(runtimeStatus: OpsRuntimeStatus): WebPlatformStatus[] {
  return [
    whatsappFallback(runtimeStatus),
    unknown('discord'),
    unknown('telegram'),
  ]
}
