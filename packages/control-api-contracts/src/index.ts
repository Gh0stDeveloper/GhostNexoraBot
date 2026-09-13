export const CONTROL_API_VERSION = 'v2' as const
export const CONTROL_API_PREFIX = '/v2' as const

export const CONTROL_API_PATHS = {
  health: '/health',
  status: '/v2/status',
  metrics: '/v2/metrics',
  logs: '/v2/logs',
  runtimeStart: '/v2/runtime/start',
  runtimeStop: '/v2/runtime/stop',
  runtimeRestart: '/v2/runtime/restart',
  runtimeUpdate: '/v2/runtime/update',
  pairStart: '/v2/pair/start',
  pairStatus: '/v2/pair/status',
  config: '/v2/config',
  platforms: '/v2/platforms',
  platformConnect: (id: PlatformId) => `/v2/platforms/${id}/connect`,
  platformDisconnect: (id: PlatformId) => `/v2/platforms/${id}/disconnect`,
} as const

export type PlatformId = 'whatsapp' | 'telegram' | 'discord'
export type RuntimeState = 'online' | 'offline' | 'starting' | 'stopping' | 'degraded'
export type RuntimeAction = 'start' | 'stop' | 'restart' | 'update'
export type PairState = 'idle' | 'waiting' | 'paired' | 'expired' | 'error'

export interface ControlError {
  ok: false
  error: string
  code?: string
}

export interface HealthResponse {
  ok: boolean
  service: 'ghost-nexora-bot'
  apiVersion: typeof CONTROL_API_VERSION
  connected: boolean
  startedAt: string
  uptimeSeconds: number
}

export interface PlatformStatus {
  id: PlatformId
  enabled: boolean
  connected: boolean
  state: string
  accountLabel?: string | null
  detail?: string | null
}

export interface RuntimeStatusResponse {
  ok: true
  apiVersion: typeof CONTROL_API_VERSION
  runtime: {
    state: RuntimeState
    profile: 'full' | 'termux-lite'
    startedAt: string
    uptimeSeconds: number
    botName: string
    prefix: string
  }
  platforms: PlatformStatus[]
  llm: {
    requested: boolean
    enabled: boolean
    model: string | null
  }
  subbots: {
    total: number
    online: number
    pending: number
    offline: number
  }
}

export interface RuntimeMetricsResponse {
  ok: true
  generatedAt: string
  memory: {
    rssBytes: number
    heapUsedBytes: number
    heapTotalBytes: number
  }
  process: {
    pid: number
    uptimeSeconds: number
  }
}

export interface LogEntry {
  cursor: string
  timestamp: string
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
}

export interface LogsResponse {
  ok: true
  cursor: string | null
  entries: LogEntry[]
  redacted: true
}

export interface PublicRuntimeConfig {
  botName: string
  prefix: string
  language: 'es' | 'en'
  webEnabled: boolean
  publicWebUrl: string
  ollamaRequested: boolean
  ollamaModel: string | null
}

export interface ConfigResponse {
  ok: true
  config: PublicRuntimeConfig
}

export interface ConfigPatch {
  botName?: string
  prefix?: string
  language?: 'es' | 'en'
}

export interface PlatformsResponse {
  ok: true
  platforms: PlatformStatus[]
}

export interface PairStartRequest {
  platform: PlatformId
  mode?: 'qr' | 'code'
  phoneNumber?: string
}

export interface PairStatusResponse {
  ok: true
  platform: PlatformId
  state: PairState
  expiresAt?: string | null
  qr?: string | null
  pairingCode?: string | null
  detail?: string | null
}

export interface RuntimeActionResponse {
  ok: true
  action: RuntimeAction
  accepted: boolean
  managerRequired?: boolean
  detail?: string
}

export function bearerToken(header: string | string[] | undefined) {
  const raw = Array.isArray(header) ? header[0] : header
  if (!raw?.startsWith('Bearer ')) return null
  const value = raw.slice('Bearer '.length).trim()
  return value || null
}

export function safePlatformId(value: string): PlatformId | null {
  return value === 'whatsapp' || value === 'telegram' || value === 'discord' ? value : null
}

export function normalizeControlBaseUrl(value: string) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported_protocol')
  url.pathname = url.pathname.replace(/\/+$/, '')
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}
