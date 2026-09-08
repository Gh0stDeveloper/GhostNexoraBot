import type { WAMessage } from 'baileys'

const DEFAULT_APPEND_MAX_AGE_MS = 120_000
const SEEN_TTL_MS = 10 * 60_000

function messageTimestampMs(message: WAMessage) {
  const raw = message.messageTimestamp as unknown
  if (typeof raw === 'number') return raw < 10_000_000_000 ? raw * 1000 : raw
  if (typeof raw === 'bigint') {
    const value = Number(raw)
    return value < 10_000_000_000 ? value * 1000 : value
  }
  if (raw && typeof raw === 'object') {
    const value = raw as { toNumber?: () => number; low?: number }
    try {
      const numeric = typeof value.toNumber === 'function' ? value.toNumber() : Number(value.low ?? 0)
      return numeric < 10_000_000_000 ? numeric * 1000 : numeric
    } catch { return 0 }
  }
  return 0
}

export function createSubbotMessageGate(appendMaxAgeMs = DEFAULT_APPEND_MAX_AGE_MS) {
  const seen = new Map<string, number>()

  function cleanup(timestamp = Date.now()) {
    if (seen.size < 250) return
    for (const [id, storedAt] of seen) {
      if (timestamp - storedAt > SEEN_TTL_MS) seen.delete(id)
    }
  }

  return {
    shouldHandle(type: string, message: WAMessage, timestamp = Date.now()) {
      if (!message.message || !message.key.remoteJid || message.key.remoteJid === 'status@broadcast') return false
      if (type !== 'notify' && type !== 'append') return false

      // Baileys puede entregar el primer evento live como "append" justo después de
      // vincular una sesión. Se acepta únicamente si es reciente para evitar ejecutar
      // comandos provenientes de la sincronización histórica.
      if (type === 'append') {
        const createdAt = messageTimestampMs(message)
        if (!createdAt || Math.abs(timestamp - createdAt) > appendMaxAgeMs) return false
      }

      const id = message.key.id
      if (id) {
        cleanup(timestamp)
        if (seen.has(id)) return false
        seen.set(id, timestamp)
      }
      return true
    },
  }
}
