import type { WASocket } from 'baileys'
import type { NexoraSocket } from '../../types.js'
import { localizeLegacyText, resolveChatLocale, type LocaleCode } from '../../i18n/index.js'
import { deliverWithOutbox } from '../../services/delivery-outbox.js'
import { whatsappOpsInstanceKey } from './instance.js'

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
export type LocalizedSocketContext = { locale: LocaleCode; chatId?: string; botInstanceId?: string; correlationId?: string }

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
  options: { contextChatId?: string; botInstanceId?: string; useOutbox?: boolean; correlationId?: string } = {},
): NexoraSocket {
  const context: LocalizedSocketContext = {
    locale: fallbackLocale,
    chatId: options.contextChatId,
    botInstanceId: options.botInstanceId,
    correlationId: options.correlationId,
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
          const send = () => target.sendMessage(jid, localizeValue(content, locale) as never, sendOptions as never)
          if (!options.useOutbox) return send()
          return deliverWithOutbox({
            platform: 'whatsapp',
            chatId: jid,
            kind: 'legacy-message',
            label: 'whatsapp_legacy_send',
            correlationId: options.correlationId,
            instanceKey: whatsappOpsInstanceKey(options.botInstanceId ?? 'main'),
          }, send)
        }
      }
      if (property === 'relayMessage' && options.useOutbox) {
        return async (jid: string, content: unknown, relayOptions?: unknown) =>
          deliverWithOutbox({
            platform: 'whatsapp',
            chatId: jid,
            kind: 'legacy-relay',
            label: 'whatsapp_legacy_relay',
            correlationId: options.correlationId,
            instanceKey: whatsappOpsInstanceKey(options.botInstanceId ?? 'main'),
          }, () => target.relayMessage(jid, content as never, relayOptions as never))
      }
      const value = Reflect.get(target, property, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}
