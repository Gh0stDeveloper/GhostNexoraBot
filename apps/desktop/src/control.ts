import { invoke } from '@tauri-apps/api/core'
import {
  CONTROL_API_PATHS,
  normalizeControlBaseUrl,
  type ConfigPatch,
  type ConfigResponse,
  type LogsResponse,
  type PairStartRequest,
  type PairStatusResponse,
  type PlatformsResponse,
  type RuntimeMetricsResponse,
  type RuntimeStatusResponse,
} from '@ghostnexora/control-api-contracts'

export type ConnectionProfile = { baseUrl: string; token: string }

type NativeRequest = {
  baseUrl: string
  token: string
  method: string
  path: string
  body?: unknown
}

async function request<T>(connection: ConnectionProfile, method: string, path: string, body?: unknown): Promise<T> {
  const payload: NativeRequest = {
    baseUrl: normalizeControlBaseUrl(connection.baseUrl),
    token: connection.token.trim(),
    method,
    path,
    body,
  }
  if (!payload.token) throw new Error('missing_token')
  const raw = await invoke<string>('control_request', { request: payload })
  const parsed = JSON.parse(raw) as T & { ok?: boolean; error?: string }
  if (parsed && typeof parsed === 'object' && parsed.ok === false) throw new Error(parsed.error || 'control_failed')
  return parsed
}

export const control = {
  status: (c: ConnectionProfile) => request<RuntimeStatusResponse>(c, 'GET', CONTROL_API_PATHS.status),
  metrics: (c: ConnectionProfile) => request<RuntimeMetricsResponse>(c, 'GET', CONTROL_API_PATHS.metrics),
  logs: (c: ConnectionProfile, cursor?: string | null) => request<LogsResponse>(c, 'GET', `${CONTROL_API_PATHS.logs}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
  config: (c: ConnectionProfile) => request<ConfigResponse>(c, 'GET', CONTROL_API_PATHS.config),
  patchConfig: (c: ConnectionProfile, patch: ConfigPatch) => request<ConfigResponse>(c, 'PATCH', CONTROL_API_PATHS.config, patch),
  platforms: (c: ConnectionProfile) => request<PlatformsResponse>(c, 'GET', CONTROL_API_PATHS.platforms),
  platform: (c: ConnectionProfile, id: 'whatsapp' | 'telegram' | 'discord', connect: boolean) =>
    request<{ ok: true }>(c, 'POST', connect ? CONTROL_API_PATHS.platformConnect(id) : CONTROL_API_PATHS.platformDisconnect(id)),
  pairStart: (c: ConnectionProfile, payload: PairStartRequest) => request<PairStatusResponse>(c, 'POST', CONTROL_API_PATHS.pairStart, payload),
  pairStatus: (c: ConnectionProfile) => request<PairStatusResponse>(c, 'GET', CONTROL_API_PATHS.pairStatus),
  update: (c: ConnectionProfile) => request<{ ok: true; accepted: boolean }>(c, 'POST', CONTROL_API_PATHS.runtimeUpdate),
}
