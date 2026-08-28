import type { WAMessage, WASocket } from 'baileys'
import { config } from '../config.js'
import { getMessageText } from '../utils/message.js'
import { maybeSendHumanSticker } from './human-stickers.js'
import { HUMAN_RULES, pickHumanReply } from './human-responses-v8.js'

const REPLY_CHANCE = 0.20
const DIRECT_REPLY_CHANCE = 0.55

function matchingRules(text: string) {
  return HUMAN_RULES.filter((rule) => rule.pattern.test(text))
}

export async function maybeHumanInteractionV9(socket: WASocket, message: WAMessage) {
  if (!config.autoReact || message.key.fromMe || !message.key.remoteJid) return false
  const text = getMessageText(message).trim()
  if (!text || text.startsWith(config.defaultPrefix)) return maybeSendHumanSticker(socket, message)

  const matches = matchingRules(text)
  if (matches.length) {
    const rule = matches[Math.floor(Math.random() * matches.length)]!
    const direct = /como se llama|cómo se llama|tu nombre|nombre del bot|quien eres|quién eres/i.test(rule.pattern.source)
    const chance = direct ? DIRECT_REPLY_CHANCE : REPLY_CHANCE
    if (Math.random() <= chance) {
      await socket.sendMessage(message.key.remoteJid, { text: pickHumanReply(rule) }, { quoted: message }).catch(() => undefined)
      return true
    }
  }
  return maybeSendHumanSticker(socket, message)
}
