import type { WAMessage, WASocket } from 'baileys'
import { getMessageText } from '../utils/message.js'

const cooldown = new Map<string, number>()
const MIN_INTERVAL_MS = 90_000
const CHANCE = 0.045

type ReplyRule = { pattern: RegExp; replies: readonly string[] }

const rules: readonly ReplyRule[] = [
  { pattern: /^(hola|holi|holaa+|hey|buenas)\b/i, replies: ['👋 ¿Qué pasó?', '👻 Aquí andamos.', '😎 ¿Qué se arma?', '✨ Presente.'] },
  { pattern: /\b(jajaja+|jeje+|jiji+|xd+|lol)\b/i, replies: ['😂 JAJA', '💀 ya valió', '🤣', '👻 jajaja'] },
  { pattern: /\b(gracias|thank you|thanks)\b/i, replies: ['🫶 De nada.', '✨ Para eso estamos.', '👻 Cuando quieras.', '💜 Con gusto.'] },
  { pattern: /\b(adiós|adios|bye|nos vemos)\b/i, replies: ['👋 Nos vemos.', '✨ Cuídate.', '👻 Hasta la próxima.'] },
  { pattern: /\b(qué hacen|que hacen|qué andan haciendo|que andan haciendo)\b/i, replies: ['👀 Aquí viendo qué pasa.', '😎 Vigilando el grupo.', '👻 Nada sospechoso por aquí.'] },
  { pattern: /\b(aburrid[oa]|aburrimiento)\b/i, replies: ['🎮 ¿Un juego?', '🎲 Usa .menu y busca algo.', '👻 El aburrimiento se combate con caos.'] },
  { pattern: /\b(tengo hambre|hambre)\b/i, replies: ['🌮 Eso suena a tacos.', '🍕 Hora de comer entonces.', '😋 No me antojes.'] },
  { pattern: /\b(nexora|ghost nexora)\b/i, replies: ['👻 Reportándome.', '🤖 Nexora en línea.', '⚡ ¿Qué se necesita?'] },
]

function random<T>(values: readonly T[]) { return values[Math.floor(Math.random() * values.length)]! }

export async function maybeHumanReply(socket: WASocket, message: WAMessage): Promise<boolean> {
  if (message.key.fromMe || !message.key.remoteJid) return false
  const text = getMessageText(message).trim()
  if (!text || text.startsWith('.')) return false
  if (Math.random() > CHANCE) return false
  const chatId = message.key.remoteJid
  const now = Date.now()
  const last = cooldown.get(chatId) ?? 0
  if (now - last < MIN_INTERVAL_MS) return false
  const matched = rules.find((rule) => rule.pattern.test(text))
  if (!matched) return false
  cooldown.set(chatId, now)
  await socket.sendMessage(chatId, { text: random(matched.replies) }, { quoted: message })
  return true
}
