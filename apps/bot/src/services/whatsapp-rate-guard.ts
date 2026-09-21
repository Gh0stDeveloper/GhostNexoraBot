import type { WAMessage, WASocket } from 'baileys'
import { logger } from '../utils/logger.js'

type GuardState = {
  until: number
  strikes: number
  lastLimitedAt: number
}

const states = new Map<string, GuardState>()
const BACKOFF_MS = [30_000, 60_000, 120_000, 300_000, 600_000] as const
const STRIKE_RESET_MS = 15 * 60_000

function errorText(error: unknown) {
  const seen = new Set<unknown>()
  const parts: string[] = []
  const visit = (value: unknown, depth = 0) => {
    if (value == null || depth > 4 || seen.has(value)) return
    if (typeof value === 'string' || typeof value === 'number') {
      parts.push(String(value))
      return
    }
    if (value instanceof Error) {
      parts.push(value.message, value.name)
      seen.add(value)
      visit((value as Error & { cause?: unknown }).cause, depth + 1)
      return
    }
    if (typeof value !== 'object') return
    seen.add(value)
    const record = value as Record<string, unknown>
    for (const key of ['message', 'error', 'data', 'status', 'statusCode', 'code', 'output', 'response', 'cause']) {
      if (key in record) visit(record[key], depth + 1)
    }
  }
  visit(error)
  return parts.join(' ').toLowerCase()
}

export function isWhatsAppRateOverlimit(error: unknown) {
  const text = errorText(error)
  return text.includes('rate-overlimit')
    || text.includes('rate overlimit')
    || text.includes('rate limit')
    || text.includes('too many requests')
    || /\b429\b/.test(text)
}

export function whatsappScopeFromEnv() {
  const subbotId = String(process.env.NEXORA_SUBBOT_ID ?? '').trim()
  return subbotId ? `subbot-${subbotId}` : 'main'
}

export function whatsappAuxiliaryAllowed(scope = whatsappScopeFromEnv()) {
  return Date.now() >= (states.get(scope)?.until ?? 0)
}

export function noteWhatsAppRateOverlimit(
  scope = whatsappScopeFromEnv(),
  error?: unknown,
  operation = 'whatsapp',
) {
  const now = Date.now()
  const previous = states.get(scope)
  const strikes = previous && now - previous.lastLimitedAt < STRIKE_RESET_MS
    ? Math.min(previous.strikes + 1, BACKOFF_MS.length)
    : 1
  const delayMs = BACKOFF_MS[Math.min(strikes - 1, BACKOFF_MS.length - 1)]!
  const state = { until: now + delayMs, strikes, lastLimitedAt: now }
  states.set(scope, state)
  logger.warn({
    scope,
    operation,
    strikes,
    delayMs,
    error: error instanceof Error ? error.message : String(error ?? ''),
  }, 'WhatsApp rate-overlimit detected; auxiliary traffic paused')
  return state
}

export function observeWhatsAppError(scope: string, error: unknown, operation: string) {
  if (!isWhatsAppRateOverlimit(error)) return false
  noteWhatsAppRateOverlimit(scope, error, operation)
  return true
}

export async function sendWhatsAppReactionWithBackoff(
  socket: WASocket,
  chatId: string,
  key: WAMessage['key'],
  emoji: string,
  scope = whatsappScopeFromEnv(),
) {
  if (!whatsappAuxiliaryAllowed(scope)) return false
  try {
    await socket.sendMessage(chatId, { react: { text: emoji, key } } as never)
    return true
  } catch (error) {
    if (observeWhatsAppError(scope, error, 'reaction')) return false
    throw error
  }
}

export function whatsappRateGuardStatus(scope = whatsappScopeFromEnv()) {
  const state = states.get(scope)
  const remainingMs = Math.max(0, (state?.until ?? 0) - Date.now())
  return {
    limited: remainingMs > 0,
    remainingMs,
    strikes: state?.strikes ?? 0,
  }
}
