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

export const LOCALIZED_SOCKET_CONTEXT = Symbol.for('ghostnexora.localizedSocketContext')
export type LocalizedSocketContext = { locale: LocaleCode; chatId?: string; botInstanceId?: string }

function isBinary(value: unknown) {
  return Buffer.isBuffer(value) || value instanceof Uint8Array
}

function localizeValue(value: unknown, locale: LocaleCode, key = ''): unknown {
  if (typeof value === 'string') return LOCALIZED_KEYS.has(key) ? localizeLegacyText(value, locale) : value
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

export function localizedSocketContext(socket: WASocket): LocalizedSocketContext | undefined {
  try { return (socket as unknown as Record<PropertyKey, unknown>)[LOCALIZED_SOCKET_CONTEXT] as LocalizedSocketContext | undefined } catch { return undefined }
}

/**
 * V1 bridge. The invoking chat keeps the locale already resolved by the router.
 * Cross-chat sends still resolve the destination language, namespaced by bot.
 */
export function createLocalizedSocket(
  socket: WASocket,
  fallbackLocale: LocaleCode,
  options: { contextChatId?: string; botInstanceId?: string } = {},
): NexoraSocket {
  const context: LocalizedSocketContext = {
    locale: fallbackLocale,
    chatId: options.contextChatId,
    botInstanceId: options.botInstanceId,
  }
  return new Proxy(socket as NexoraSocket, {
    get(target, property, receiver) {
      if (property === LOCALIZED_SOCKET_CONTEXT) return context
      if (property === 'sendMessage') {
        return async (jid: string, content: unknown, sendOptions?: unknown) => {
          let locale = fallbackLocale
          if (!options.contextChatId || jid !== options.contextChatId) {
            try { locale = resolveChatLocale(jid, undefined, options.botInstanceId ?? 'main') } catch { /* keep context fallback */ }
          }
          return target.sendMessage(jid, localizeValue(content, locale) as never, sendOptions as never)
        }
      }
      const value = Reflect.get(target, property, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}
