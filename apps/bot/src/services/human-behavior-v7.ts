import type { WAMessage, WASocket } from 'baileys'
import { config } from '../config.js'
import { getMessageText, unwrapMessage } from '../utils/message.js'
import { maybeSendHumanSticker } from './human-stickers.js'

const lastReply = new Map<string, number>()
const MIN_INTERVAL_MS = 10_000
const REPLY_CHANCE = 0.18

type Rule = { pattern: RegExp; replies: readonly string[] }
const rules: readonly Rule[] = [
  { pattern: /\b(?:como se llama|cómo se llama|tu nombre|nombre del bot|quien eres|quién eres)\b/i, replies: ['Me llamo Nexora Bot 👻', 'Soy Nexora, el bot.', 'Nexora Bot por aquí.'] },
  { pattern: /^(?:hola|holi|holaa+|hey|buenas)\b/i, replies: ['👋 Hola.', '👻 ¿Qué pasó?', 'Nexora presente.', 'Qué onda.'] },
  { pattern: /\b(?:jajaja+|jeje+|jiji+|xd+|lol|lmao)\b/i, replies: ['😂 jajaja', '💀 ya estuvo', '🤣', 'JAJA, no puede ser.'] },
  { pattern: /\b(?:gracias|muchas gracias|thanks|thank you)\b/i, replies: ['De nada.', '👻 Para eso estamos.', 'Con gusto.', '✨ Cuando quieras.'] },
  { pattern: /\b(?:qué hacen|que hacen|qué andan haciendo|que andan haciendo)\b/i, replies: ['👀 Aquí viendo qué pasa.', 'Vigilando el grupo.', 'Nada sospechoso por aquí.'] },
  { pattern: /\b(?:tengo hambre|hambre)\b/i, replies: ['🌮 Eso suena a tacos.', '🍕 Hora de comer.', '😋 No me antojes.'] },
  { pattern: /\b(?:nexora|ghost nexora|nexora bot)\b/i, replies: ['👻 ¿Sí?', 'Aquí Nexora.', 'Nexora en línea.'] },
]

function random<T>(items: readonly T[]) { return items[Math.floor(Math.random() * items.length)]! }

export async function maybeHumanInteraction(socket: WASocket, message: WAMessage) {
  if (!config.autoReact || message.key.fromMe || !message.key.remoteJid) return false
  const chatId = message.key.remoteJid
  const now = Date.now()
  const last = lastReply.get(chatId) ?? 0
  if (now - last < MIN_INTERVAL_MS) return false

  const text = getMessageText(message).trim()
  if (!text || text.startsWith('.')) {
    return maybeSendHumanSticker(socket, message)
  }

  const matched = rules.find((rule) => rule.pattern.test(text))
  if (matched && Math.random() <= REPLY_CHANCE) {
    lastReply.set(chatId, now)
    await socket.sendMessage(chatId, { text: random(matched.replies) }, { quoted: message }).catch(() => undefined)
    return true
  }
  return maybeSendHumanSticker(socket, message)
}

export function clearHumanBehaviorState(chatId?: string) {
  if (chatId) lastReply.delete(chatId)
  else lastReply.clear()
}
