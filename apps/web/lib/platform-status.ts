import { runtime } from './runtime'
import type { OpsRuntimeStatus } from './ops'

export type WebPlatformId = 'whatsapp' | 'discord' | 'telegram'

export type WebPlatformStatus = {
  id: WebPlatformId
  known: boolean
  enabled: boolean | null
  connected: boolean | null
  state: string
  accountLabel: string | null
  detail: string | null
}

type ControlPlatformStatus = {
  id?: string
  enabled?: boolean
  connected?: boolean
  state?: string
  accountLabel?: string | null
  detail?: string | null
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
  }
}

function normalize(item: ControlPlatformStatus): WebPlatformStatus | null {
  if (item.id !== 'whatsapp' && item.id !== 'discord' && item.id !== 'telegram') return null
  return {
    id: item.id,
    known: true,
    enabled: Boolean(item.enabled),
    connected: Boolean(item.connected),
    state: String(item.state || (item.connected ? 'running' : 'stopped')),
    accountLabel: item.accountLabel ? String(item.accountLabel) : null,
    detail: item.detail ? String(item.detail).slice(0, 500) : null,
  }
}

function platformsUrl() {
  const url = new URL(runtime.botHealthUrl)
  url.pathname = '/v2/platforms'
  url.search = ''
  url.hash = ''
  return url
}

export async function readMainPlatformStatuses(
  fallbackRuntime: OpsRuntimeStatus,
): Promise<WebPlatformStatus[]> {
  const fallback = new Map<WebPlatformId, WebPlatformStatus>([
    ['whatsapp', whatsappFallback(fallbackRuntime)],
    ['discord', unknown('discord')],
    ['telegram', unknown('telegram')],
  ])

  if (!runtime.adminToken) return [...fallback.values()]

  try {
    const response = await fetch(platformsUrl(), {
      headers: {
        authorization: `Bearer ${runtime.adminToken}`,
        accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(3500),
    })
    if (!response.ok) return [...fallback.values()]

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
  } catch {
    return [...fallback.values()]
  }
}

export function subbotPlatformStatuses(runtimeStatus: OpsRuntimeStatus): WebPlatformStatus[] {
  return [
    whatsappFallback(runtimeStatus),
    unknown('discord'),
    unknown('telegram'),
  ]
}
