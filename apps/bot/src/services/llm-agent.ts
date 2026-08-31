import type { WAMessage, WASocket } from 'baileys'
import { readFile } from 'node:fs/promises'
import { config } from '../config.js'
import { settings } from '../core/settings.js'
import { digitsFromJid, getContextInfo, getSender } from '../utils/message.js'
import { conversationMemory } from './conversation-memory.js'
import { contextualAnswer } from './llm-contextual-answer.js'
import { globalStickers } from './human-stickers.js'
import { miniLLM } from './mini-llm.js'
import { ollama } from './ollama.js'
import { economy } from './economy.js'

export type AgentAction =
  | { type: 'react'; emoji: string }
  | { type: 'sticker'; filePath: string }
  | { type: 'kick'; targetJid: string; reason?: string }

export type AgentResult = {
  reply: string | null
  actions: AgentAction[]
}

function isStaff(sender: string) {
  const digits = digitsFromJid(sender)
  return config.owners.includes(digits) || settings.isBotAdmin(digits)
}

async function isGroupAdmin(socket: WASocket, chatId: string, sender: string) {
  if (isStaff(sender)) return true
  if (!chatId.endsWith('@g.us')) return false
  const metadata = await socket.groupMetadata(chatId).catch(() => null)
  if (!metadata) return false
  const participant = metadata.participants.find((item) =>
    [item.id, item.phoneNumber, item.lid].filter(Boolean).includes(sender),
  )
  return Boolean(participant?.admin)
}

function pickStickerPath(text: string): string | null {
  try {
    const rows = economy.db
      .prepare('SELECT file_path as filePath, triggers FROM global_stickers ORDER BY id DESC LIMIT 80')
      .all() as Array<{ filePath: string; triggers?: string }>
    if (!rows.length) return null
    const normalize = globalStickers.normalizeTrigger
    const hay = ` ${normalize(text)} `
    const triggered = rows.filter((row) =>
      (row.triggers ?? '')
        .split('|')
        .filter(Boolean)
        .some((t) => hay.includes(` ${normalize(t)} `)),
    )
    const pool = triggered.length ? triggered : rows
    // si pidió sticker explícito o hay trigger → enviar
    const wants =
      /\b(sticker|stiker|pegatina|manda(me)? un sticker|env[ií]a(me)? un sticker)\b/i.test(text) ||
      triggered.length > 0
    if (!wants && Math.random() > 0.12) return null
    if (!wants && !triggered.length) return null
    return pool[Math.floor(Math.random() * pool.length)]!.filePath
  } catch {
    return null
  }
}

function pickReactEmoji(text: string, reply: string | null): string | null {
  const t = `${text} ${reply ?? ''}`.toLowerCase()
  if (/\b(reacciona|reacci[oó]n|pon(le)? un emoji|emoji)\b/i.test(text)) {
    if (/triste|mal|llor/.test(t)) return '😢'
    if (/enojo|enoj|molesto|rage/.test(t)) return '😠'
    if (/amor|beso|love|heart/.test(t)) return '❤️'
    if (/risa|jaja|lol|xd/.test(t)) return '😂'
    if (/ok|vale|listo|bien/.test(t)) return '👍'
    return '✨'
  }
  if (/hola|buenas|hey|holi/.test(t)) return '👋'
  if (/gracias|thank/.test(t)) return '🙏'
  if (/jaja|lol|xd/.test(t)) return '😂'
  if (/hora|fecha/.test(t)) return '🕒'
  if (/genial|excelente|órale|orale|fire/.test(t)) return '🔥'
  return null
}

function resolveKickTarget(message: WAMessage, text: string, metadata: Awaited<ReturnType<WASocket['groupMetadata']>> | null) {
  const ctx = getContextInfo(message)
  const mentioned = (ctx?.mentionedJid ?? []).map(String)
  if (mentioned[0]) return mentioned[0]
  if (ctx?.participant) return String(ctx.participant)
  if (!metadata) return null
  // “expulsa a juan” por número en el texto
  const digits = text.replace(/\D/g, '')
  if (digits.length >= 8 && digits.length <= 15) {
    const jid = `${digits}@s.whatsapp.net`
    const found = metadata.participants.find((p) =>
      [p.id, p.phoneNumber, p.lid].some((id) => id && (id === jid || id.includes(digits))),
    )
    return found?.phoneNumber ?? found?.id ?? jid
  }
  return null
}

function wantsKick(text: string) {
  return /\b(expulsa|expulsar|kick|saca|sacar|banear|banea|quita(lo|la)? del grupo|remove)\b/i.test(text)
}

function buildRagContext(chatId: string, userText: string) {
  const recent = conversationMemory.recent(chatId, 10)
  const history = recent
    .map((t) => `${t.role === 'bot' ? 'Bot' : t.name}: ${t.text}`)
    .join('\n')
  let knowledge = ''
  try {
    const hits = miniLLM.search(userText, 4) as Array<{ text: string; score: number }>
    knowledge = hits
      .filter((h) => h.score > 0.12)
      .map((h) => h.text.slice(0, 280))
      .join('\n---\n')
  } catch {
    /* ignore */
  }
  return { history, knowledge }
}

const SYSTEM_PROMPT = `Eres Ghost Nexora Bot, bot de WhatsApp de Nexora (dueño: Ghost Developer).
Responde SIEMPRE en español mexicano, corto y natural (1-4 frases).
No inventes comandos técnicos largos. No digas que eres ChatGPT.
Si el contexto del grupo habla de un tema, sigue ese tema.
Si no sabes, dilo en una frase y pregunta.
No uses markdown pesado ni listas enormes.`

async function ollamaReply(chatId: string, userText: string): Promise<string | null> {
  const state = ollama.getState()
  if (!state.enabled) return null
  const { history, knowledge } = buildRagContext(chatId, userText)
  const userBlock = [
    history ? `Conversación reciente:\n${history}` : '',
    knowledge ? `Memoria / documentos útiles:\n${knowledge}` : '',
    `Usuario: ${userText}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  try {
    return await ollama.chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userBlock },
      ],
      { temperature: 0.65, numPredict: 160 },
    )
  } catch {
    return null
  }
}

/**
 * Agente libre: Ollama (si está) + fallback Mini-LLM + acciones.
 */
export async function runLlmAgent(opts: {
  socket: WASocket
  message: WAMessage
  chatId: string
  text: string
  pushName?: string
}): Promise<AgentResult> {
  const { socket, message, chatId, text, pushName } = opts
  conversationMemory.pushUser(chatId, text, pushName || 'Usuario')

  const actions: AgentAction[] = []
  const sender = getSender(message)

  // --- Intención: kick (solo admin/staff, grupo) ---
  if (chatId.endsWith('@g.us') && wantsKick(text)) {
    const admin = await isGroupAdmin(socket, chatId, sender)
    if (admin) {
      const metadata = await socket.groupMetadata(chatId).catch(() => null)
      const target = resolveKickTarget(message, text, metadata)
      if (target) {
        const botIds = [socket.user?.id, socket.user?.lid].filter(Boolean) as string[]
        if (!botIds.includes(target) && target !== sender) {
          actions.push({ type: 'kick', targetJid: target })
        }
      }
    }
  }

  // --- Intención: sticker ---
  const stickerPath = pickStickerPath(text)
  if (stickerPath) actions.push({ type: 'sticker', filePath: stickerPath })

  // --- Texto: Ollama → fallback contextual Mini-LLM ---
  let reply = await ollamaReply(chatId, text)
  if (!reply) {
    reply = contextualAnswer(chatId, text)
  }

  // Si solo hay acción kick sin texto
  if (!reply && actions.some((a) => a.type === 'kick')) {
    reply = 'Listo, lo saco del grupo.'
  }
  if (!reply && actions.some((a) => a.type === 'sticker')) {
    reply = null // solo sticker está bien
  }

  // --- Reacción emoji ---
  const emoji = pickReactEmoji(text, reply)
  if (emoji) actions.push({ type: 'react', emoji })

  if (reply) conversationMemory.pushBot(chatId, reply)

  return { reply: reply ? reply.slice(0, 900) : null, actions }
}

export async function executeAgentActions(
  socket: WASocket,
  message: WAMessage,
  chatId: string,
  actions: AgentAction[],
) {
  for (const action of actions) {
    try {
      if (action.type === 'react' && message.key) {
        await socket.sendMessage(chatId, { react: { text: action.emoji, key: message.key } })
      }
      if (action.type === 'sticker') {
        const buf = await readFile(action.filePath)
        await socket.sendMessage(chatId, { sticker: buf }, { quoted: message })
      }
      if (action.type === 'kick') {
        await socket.groupParticipantsUpdate(chatId, [action.targetJid], 'remove')
        await socket.sendMessage(
          chatId,
          {
            text: `🚫 Expulsado: @${action.targetJid.split('@')[0]}`,
            mentions: [action.targetJid],
          },
          { quoted: message },
        )
      }
    } catch {
      // no tumbar el flujo por una acción fallida
    }
  }
}
