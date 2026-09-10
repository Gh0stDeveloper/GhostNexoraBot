import { logger } from '../../utils/logger.js'

export type DownloadProviderId =
  | 'x-official'
  | 'x-ytdlp'
  | 'vk-official'
  | 'vk-ytdlp'
  | 'apkmirror-html'
  | 'apkpure-html'

export type ProviderOperation = 'resolve' | 'search' | 'download'

export type ProviderHealth = {
  provider: DownloadProviderId
  attempts: number
  successes: number
  failures: number
  lastLatencyMs?: number
  lastSuccessAt?: number
  lastFailureAt?: number
  lastError?: string
}

const state = new Map<DownloadProviderId, ProviderHealth>()

function compactError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').slice(0, 240)
}

function row(provider: DownloadProviderId) {
  const current = state.get(provider)
  if (current) return current
  const created: ProviderHealth = { provider, attempts: 0, successes: 0, failures: 0 }
  state.set(provider, created)
  return created
}

export async function withProviderTelemetry<T>(
  provider: DownloadProviderId,
  operation: ProviderOperation,
  work: () => Promise<T>,
): Promise<T> {
  const current = row(provider)
  current.attempts += 1
  const started = Date.now()
  try {
    const result = await work()
    current.successes += 1
    current.lastLatencyMs = Date.now() - started
    current.lastSuccessAt = Date.now()
    current.lastError = undefined
    logger.info({ provider, operation, latencyMs: current.lastLatencyMs }, 'download provider succeeded')
    return result
  } catch (error) {
    current.failures += 1
    current.lastLatencyMs = Date.now() - started
    current.lastFailureAt = Date.now()
    current.lastError = compactError(error)
    logger.warn({ provider, operation, latencyMs: current.lastLatencyMs, error: current.lastError }, 'download provider failed')
    throw error
  }
}

export function providerHealthSnapshot(): ProviderHealth[] {
  return [...state.values()].map((item) => ({ ...item })).sort((a, b) => a.provider.localeCompare(b.provider))
}

/** Solo para pruebas deterministas. No forma parte del flujo de comandos. */
export function resetProviderHealthForTests() {
  state.clear()
}
