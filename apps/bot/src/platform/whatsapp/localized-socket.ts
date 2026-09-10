import type { WASocket } from 'baileys'
import type { NexoraSocket } from '../../types.js'
import { localizeLegacyText, resolveChatLocale, type LocaleCode } from '../../i18n/index.js'

const LOCALIZED_KEYS = new Set([
  'text',
  'caption',
  'title',
  'description',
  'footer',
  'displayText',
  'display_text',
])

function isBinary(value: unknown) {
  return Buffer.isBuffer(value) || value instanceof Uint8Array
}

function localizeValue(value: unknown, locale: LocaleCode, key = ''): unknown {
  if (typeof value === 'string') {
    return LOCALIZED_KEYS.has(key) ? localizeLegacyText(value, locale) : value
  }
  if (!value || typeof value !== 'object' || isBinary(value)) return value
  if (Array.isArray(value)) return value.map((entry) => localizeValue(entry, locale, key))

  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return value

  const output: Record<string, unknown> = {}
  for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
    output[childKey] = localizeValue(childValue, locale, childKey)
  }
  return output
}

/**
 * Puente V1. Conserva la localización transparente de payloads Baileys mientras
 * los comandos antiguos migran a PlatformAdapter.
 */
export function createLocalizedSocket(socket: WASocket, fallbackLocale: LocaleCode): NexoraSocket {
  return new Proxy(socket as NexoraSocket, {
    get(target, property, receiver) {
      if (property === 'sendMessage') {
        return async (jid: string, content: unknown, options?: unknown) => {
          let locale = fallbackLocale
          try { locale = resolveChatLocale(jid) } catch { /* keep context fallback */ }
          return target.sendMessage(jid, localizeValue(content, locale) as never, options as never)
        }
      }
      const value = Reflect.get(target, property, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}
