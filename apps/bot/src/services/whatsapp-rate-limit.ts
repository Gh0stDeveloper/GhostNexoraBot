import { logger } from '../utils/logger.js'

type ScopeState = {
  hits: number
  blockedUntil: number
}

const scopes = new Map<string, ScopeState>()
const notedErrors = new WeakSet<object>()

function errorText(error: unknown) {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause
    return [error.name, error.message, cause ? String(cause) : ''].join(' ').toLowerCase()
  }
  try { return JSON.stringify(error).toLowerCase() } catch { return String(error).toLowerCase() }
}

export function isWhatsAppRateOverlimit(error: unknown) {
  const text = errorText(error)
  return text.includes('rate-overlimit')
    || text.includes('rate overlimit')
    || text.includes('rate limit')
    || text.includes('too many requests')
    || text.includes('statuscode":429')
    || text.includes('status":429')
    || text.includes('http 429')
}

export function whatsappRateLimitRemainingMs(scope: string) {
  const state = scopes.get(scope)
  if (!state) return 0
  const remaining = state.blockedUntil - Date.now()
  if (remaining <= 0) {
    scopes.delete(scope)
    return 0
  }
  return remaining
}

export function noteWhatsAppRateOverlimit(scope: string, operation: string, error: unknown) {
  if (error && typeof error === 'object') {
    if (notedErrors.has(error)) return whatsappRateLimitRemainingMs(scope)
    notedErrors.add(error)
  }
  const previous = scopes.get(scope)
  const hits = Math.min(6, (previous?.hits ?? 0) + 1)
  const backoffMs = Math.min(5 * 60_000, 15_000 * (2 ** (hits - 1)))
  const blockedUntil = Math.max(previous?.blockedUntil ?? 0, Date.now() + backoffMs)
  scopes.set(scope, { hits, blockedUntil })
  logger.warn({
    scope,
    operation,
    hits,
    backoffMs,
    blockedUntil: new Date(blockedUntil).toISOString(),
    error,
  }, 'WhatsApp rate-overlimit detected; auxiliary activity paused')
  return backoffMs
}

export async function tryWhatsAppAuxiliaryAction(
  scope: string,
  operation: string,
  action: () => Promise<unknown>,
) {
  if (whatsappRateLimitRemainingMs(scope) > 0) return false
  try {
    await action()
    const state = scopes.get(scope)
    if (state?.hits && state.blockedUntil <= Date.now()) scopes.delete(scope)
    return true
  } catch (error) {
    if (!isWhatsAppRateOverlimit(error)) throw error
    noteWhatsAppRateOverlimit(scope, operation, error)
    return false
  }
}
