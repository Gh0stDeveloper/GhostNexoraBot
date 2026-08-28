import type { WAMessage, WASocket } from 'baileys'
import { config } from '../config.js'
import { getMessageText } from '../utils/message.js'
import { maybeSendHumanSticker } from './human-stickers.js'
import { HUMAN_RULES, pickHumanReply } from './human-responses-v8.js'

const REPLY_CHANCE = 0.20
const DIRECT_REPLY_CHANCE = 0.55
const GENERAL_REACTION_CHANCE = 0.35
const MATCHED_REACTION_CHANCE = 0.78

const reactionRules: Array<{ test: RegExp; emojis: string[] }> = [
  { test: /\b(hola|buenas|buenos dias|buenas tardes|buenas noches)\b/i, emojis: ['👋', '😊', '✨'] },
  { test: /\b(jaja+|xd+|lol|lmao|me rio|😂|🤣)\b/i, emojis: ['😂', '🤣', '😭'] },
  { test: /\b(gracias|thank you|ty|agradecido)\b/i, emojis: ['❤️', '👍', '😊'] },
  { test: /\b(felicidades|felicidades|gan[eé]|victoria|ganamos|campeon)\b/i, emojis: ['🎉', '🔥', '👏'] },
  { test: /\b(triste|lloro|llorando|😭|depre)\b/i, emojis: ['😢', '❤️', '🫂'] },
  { test: /\b(enojado|enojo|molesto|rabia|furioso)\b/i, emojis: ['😡', '💀', '😮‍💨'] },
  { test: /\b(que\?|como\?|por que\?|porque\?|no entiendo|wtf|qué)\b/i, emojis: ['🤔', '👀', '😮'] },
  { test: /\b(amor|te quiero|te amo|crush|lindo|bonita|guapo)\b/i, emojis: ['❤️', '🥰', '😍'] },
  { test: /\b(ouch|dolor|me pegue|me golpee|au)\b/i, emojis: ['😬', '😭', '🫂'] },
  { test: /\b(fuego|epico|god|basado|brutal|increible|increíble)\b/i, emojis: ['🔥', '💯', '⚡'] },
]
const fallbackEmojis = ['👍', '😂', '❤️', '🔥', '👀', '🤔', '😮', '👏', '✨', '💀', '😭', '🥰']

function matchingRules(text: string) { return HUMAN_RULES.filter((rule) => rule.pattern.test(text)) }
function pickReaction(text: string) {
  const rule = reactionRules.find((item) => item.test.test(text))
  const pool = rule?.emojis ?? fallbackEmojis
  return pool[Math.floor(Math.random() * pool.length)] ?? '👍'
}

async function maybeReactToMessage(socket: WASocket, message: WAMessage, text: string, matched: boolean) {
  const chance = matched ? MATCHED_REACTION_CHANCE : GENERAL_REACTION_CHANCE
  if (Math.random() > chance) return false
  const emoji = pickReaction(text)
  await socket.sendMessage(message.key.remoteJid!, { react: { text: emoji, key: message.key } }).catch(() => undefined)
  return true
}

export async function maybeHumanInteraction(socket: WASocket, message: WAMessage) {
  if (!config.autoReact || message.key.fromMe || !message.key.remoteJid) return false
  const text = getMessageText(message).trim()
  if (!text || text.startsWith(config.defaultPrefix)) return maybeSendHumanSticker(socket, message)

  const matches = matchingRules(text)
  const reacted = await maybeReactToMessage(socket, message, text, matches.length > 0)

  if (matches.length) {
    const rule = matches[Math.floor(Math.random() * matches.length)]!
    const direct = /como se llama|cómo se llama|tu nombre|nombre del bot|quien eres|quién eres/i.test(rule.pattern.source)
    const chance = direct ? DIRECT_REPLY_CHANCE : REPLY_CHANCE
    if (Math.random() <= chance) {
      await socket.sendMessage(message.key.remoteJid, { text: pickHumanReply(rule) }, { quoted: message }).catch(() => undefined)
      return true
    }
  }
  const sticker = await maybeSendHumanSticker(socket, message)
  return reacted || sticker
}

export function clearHumanBehaviorState(_chatId?: string) {
  // Compatibilidad: no existe estado temporal ni cooldown por chat.
}
