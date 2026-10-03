import type { WAMessage } from 'baileys'

export type WhatsAppMessageCacheOptions = {
  maxEntries?: number
  ttlMs?: number
}

type CacheEntry = {
  message: WAMessage
  expiresAt: number
  touchedAt: number
}

const DEFAULT_MAX_ENTRIES = 1000
const DEFAULT_TTL_MS = 15 * 60_000

function key(chatId: string, messageId: string) {
  return `${chatId}:${messageId}`
}

export class WhatsAppMessageCache {
  private readonly rows = new Map<string, CacheEntry>()
  readonly maxEntries: number
  readonly ttlMs: number

  constructor(options: WhatsAppMessageCacheOptions = {}) {
    this.maxEntries = Math.max(64, Math.min(5000, Math.trunc(options.maxEntries ?? DEFAULT_MAX_ENTRIES)))
    this.ttlMs = Math.max(60_000, Math.min(60 * 60_000, Math.trunc(options.ttlMs ?? DEFAULT_TTL_MS)))
  }

  set(chatId: string, message: WAMessage, now = Date.now()) {
    const messageId = message.key.id
    if (!chatId || !messageId) return
    const cacheKey = key(chatId, messageId)
    this.rows.delete(cacheKey)
    this.rows.set(cacheKey, {
      message,
      expiresAt: now + this.ttlMs,
      touchedAt: now,
    })
    this.prune(now)
  }

  get(chatId: string, messageId?: string, now = Date.now()) {
    if (!chatId || !messageId) return undefined
    const cacheKey = key(chatId, messageId)
    const row = this.rows.get(cacheKey)
    if (!row) return undefined
    if (row.expiresAt <= now) {
      this.rows.delete(cacheKey)
      return undefined
    }
    row.touchedAt = now
    this.rows.delete(cacheKey)
    this.rows.set(cacheKey, row)
    return row.message
  }

  prune(now = Date.now()) {
    for (const [cacheKey, row] of this.rows) {
      if (row.expiresAt <= now) this.rows.delete(cacheKey)
    }
    while (this.rows.size > this.maxEntries) {
      const oldest = this.rows.keys().next().value as string | undefined
      if (!oldest) break
      this.rows.delete(oldest)
    }
  }

  size() {
    this.prune()
    return this.rows.size
  }

  clear() {
    this.rows.clear()
  }
}

const caches = new Map<string, WhatsAppMessageCache>()

export function whatsappMessageCache(botInstanceId: string) {
  const scope = botInstanceId.trim() || 'main'
  let cache = caches.get(scope)
  if (!cache) {
    cache = new WhatsAppMessageCache()
    caches.set(scope, cache)
  }
  return cache
}

const cleanupTimer = setInterval(() => {
  for (const [scope, cache] of caches) {
    cache.prune()
    if (cache.size() === 0 && scope !== 'main') caches.delete(scope)
  }
}, 60_000)
cleanupTimer.unref?.()
