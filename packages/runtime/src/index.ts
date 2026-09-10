import type { PlatformId } from '@ghostnexora/platform-contracts'

export type RuntimeState = 'idle' | 'starting' | 'running' | 'stopping' | 'degraded' | 'failed'

export interface RuntimeIdentity {
  platform: PlatformId
  botInstanceId: string
}

export interface RuntimeHealthSnapshot extends RuntimeIdentity {
  state: RuntimeState
  startedAt?: string
  uptimeMs: number
  memoryRssBytes?: number
  queueDepth?: number
  lastErrorCode?: string
}

export interface RuntimeLifecycle {
  readonly identity: RuntimeIdentity
  readonly state: RuntimeState
  start(): Promise<void>
  stop(): Promise<void>
  restart(): Promise<void>
  health(): Promise<RuntimeHealthSnapshot>
}

function encodeSegment(value: string, label: string): string {
  const normalized = value.trim()
  if (!normalized) throw new TypeError(`${label} cannot be empty`)
  return encodeURIComponent(normalized)
}

export function createRuntimeNamespace(identity: RuntimeIdentity): string {
  return `${identity.platform}:${encodeSegment(identity.botInstanceId, 'botInstanceId')}`
}

export function createEntityKey(
  identity: RuntimeIdentity,
  entityType: string,
  externalId: string,
): string {
  return [
    identity.platform,
    encodeSegment(identity.botInstanceId, 'botInstanceId'),
    encodeSegment(entityType, 'entityType'),
    encodeSegment(externalId, 'externalId'),
  ].join(':')
}

export function isHealthyRuntimeState(state: RuntimeState): boolean {
  return state === 'running' || state === 'degraded'
}
