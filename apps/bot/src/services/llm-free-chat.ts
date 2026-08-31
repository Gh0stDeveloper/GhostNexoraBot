import fs from 'node:fs'
import path from 'node:path'
import type { WAMessage, WASocket } from 'baileys'
import { config } from '../config.js'
import { miniLLM } from './mini-llm.js'
import { getContextInfo } from '../utils/message.js'

type State = {
  chats: Record<string, boolean>
  /** grupos permitidos para modo libre (vacío = todos si el chat está enabled / global) */
  groupWhitelist: string[]
  global: boolean
  /** solo responder si mencionan al bot (recomendado en grupos) */
  requireMention: boolean
  learnAlways: boolean
  /** máximo de respuestas por ventana */
  maxRepliesPerWindow: number
  /** ventana anti-spam en ms */
  spamWindowMs: number
  /** cooldown mínimo entre respuestas en el mismo chat */
  cooldownMs: number
  /** reaccionar con emoji simple según el tono */
  reactions: boolean
}

const FILE = path.resolve(config.dataDir, 'llm', 'free-chat.json')
const lastAt = new Map<string, number>()
const windowHits = new Map<string, number[]>()

const DEFAULT: State = {
  chats: {},
  groupWhitelist: [],
  global: false,
  requireMention: true,
  learnAlways: true,
  maxRepliesPerWindow: 8,
  spamWindowMs: 60_000,
  cooldownMs: 2800,
  reactions: true,
}

function load(): State {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8')) as Partial<State>
    return {
      chats: parsed.chats && typeof parsed.chats === 'object' ? parsed.chats : {},
      groupWhitelist: Array.isArray(parsed.groupWhitelist) ? parsed.groupWhitelist.map(String) : [],
      global: Boolean(parsed.global),
      requireMention: parsed.requireMention !== false,
      learnAlways: parsed.learnAlways !== false,
      maxRepliesPerWindow:
        typeof parsed.maxRepliesPerWindow === 'number' ? parsed.maxRepliesPerWindow : DEFAULT.maxRepliesPerWindow,
      spamWindowMs: typeof parsed.spamWindowMs === 'number' ? parsed.spamWindowMs : DEFAULT.spamWindowMs,
      cooldownMs: typeof parsed.cooldownMs === 'number' ? parsed.cooldownMs : DEFAULT.cooldownMs,
      reactions: parsed.reactions !== false,
    }
  } catch {
    return { ...DEFAULT, chats: {}, groupWhitelist: [] }
  }
}

function save(state: State) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  const tmp = `${FILE}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2))
  fs.renameSync(tmp, FILE)
}

function looksLikeCommand(text: string, prefix: string) {
  const t = text.trim()
  if (!t) return true
  if (t.startsWith(prefix)) return true
  if (/^(\.[a-z]|\/[a-z])/i.test(t)) return true
  return false
}

function isLowValueReply(text: string) {
  const t = text.trim().toLowerCase()
  if (t.length < 2) return true
  if (/todavía no tengo una respuesta clara|no tengo conocimiento local suficiente/i.test(t)) return true
  return false
}

/** Filtro de aprendizaje: no guardar basura / links / flood / +18 genérico */
export function shouldLearnText(text: string) {
  const t = text.trim()
  if (t.length < 2 || t.length > 1200) return false
  if (looksLikeCommand(t, '.')) return false
  if (/https?:\/\/|www\./i.test(t)) return false
  if (/(.)\1{6,}/.test(t)) return false // flood de caracteres
  if (/^[@#]\S+$/.test(t)) return false
  // términos sensibles básicos (sin adultmode no se aprende)
  if (/\b(porn|xxx|hentai|nsfw|onlyfans)\b/i.test(t)) return false
  if (/\b(kill yourself|suicidio)\b/i.test(t)) return false
  return true
}

function botJids(socket: WASocket): string[] {
  const id = socket.user?.id
  if (!id) return []
  const base = id.split(':')[0] ?? id
  return [id, base, `${base.split('@')[0]}@s.whatsapp.net`].filter(Boolean)
}

function isBotMentioned(message: WAMessage, socket: WASocket, text: string) {
  const ctx = getContextInfo(message)
  const mentioned = (ctx?.mentionedJid ?? []).map(String)
  const bots = botJids(socket)
  if (mentioned.some((jid) => bots.some((b) => jid === b || jid.startsWith(b.split('@')[0] ?? '')))) return true
  // texto tipo @123456 o nombre del bot
  const lower = text.toLowerCase()
  if (/\b(ghost\s*nexora|nexora\s*bot|@bot)\b/i.test(lower)) return true
  const digits = (socket.user?.id ?? '').split('@')[0]?.split(':')[0]?.replace(/\D/g, '') ?? ''
  if (digits && lower.includes(`@${digits}`)) return true
  return false
}

function withinSpamLimit(chatId: string, state: State) {
  const now = Date.now()
  const hits = (windowHits.get(chatId) ?? []).filter((t) => now - t < state.spamWindowMs)
  if (hits.length >= state.maxRepliesPerWindow) {
    windowHits.set(chatId, hits)
    return false
  }
  hits.push(now)
  windowHits.set(chatId, hits)
  return true
}

function pickReaction(userText: string, answer: string): string | null {
  const t = `${userText} ${answer}`.toLowerCase()
  if (/hola|buenas|hey|holi/.test(t)) return '👋'
  if (/gracias|thank/.test(t)) return '🙏'
  if (/jaja|lol|xd/.test(t)) return '😂'
  if (/triste|ánimo|animo|mal día/.test(t)) return '💪'
  if (/hora|fecha|día|dia/.test(t)) return '🕒'
  if (/fire|genial|excelente|órale|orale/.test(t)) return '🔥'
  if (/ok|vale|listo|perfecto/.test(t)) return '👍'
  return '✨'
}

export const llmFreeChat = {
  getState() {
    return load()
  },
  isEnabled(chatId: string) {
    const state = load()
    if (state.global) return true
    return state.chats[chatId] === true
  },
  setChat(chatId: string, enabled: boolean) {
    const state = load()
    if (enabled) state.chats[chatId] = true
    else delete state.chats[chatId]
    save(state)
    return enabled
  },
  setGlobal(enabled: boolean) {
    const state = load()
    state.global = enabled
    save(state)
    return enabled
  },
  setRequireMention(enabled: boolean) {
    const state = load()
    state.requireMention = enabled
    save(state)
    return enabled
  },
  setReactions(enabled: boolean) {
    const state = load()
    state.reactions = enabled
    save(state)
    return enabled
  },
  addGroup(groupId: string) {
    const state = load()
    if (!state.groupWhitelist.includes(groupId)) state.groupWhitelist.push(groupId)
    save(state)
    return state.groupWhitelist
  },
  removeGroup(groupId: string) {
    const state = load()
    state.groupWhitelist = state.groupWhitelist.filter((id) => id !== groupId)
    save(state)
    return state.groupWhitelist
  },
  clearGroupWhitelist() {
    const state = load()
    state.groupWhitelist = []
    save(state)
  },
  isGroupAllowed(chatId: string) {
    const state = load()
    if (!chatId.endsWith('@g.us')) return true // privados siempre si el chat está enabled
    if (!state.groupWhitelist.length) return true // sin lista = todos los grupos enabled
    return state.groupWhitelist.includes(chatId)
  },
  canRespond(chatId: string) {
    const state = load()
    const now = Date.now()
    const last = lastAt.get(chatId) ?? 0
    if (now - last < state.cooldownMs) return false
    if (!withinSpamLimit(chatId, state)) return false
    lastAt.set(chatId, now)
    return true
  },
  shouldHandle(opts: {
    chatId: string
    text: string
    prefix: string
    message: WAMessage
    socket: WASocket
  }) {
    const { chatId, text, prefix, message, socket } = opts
    if (!this.isEnabled(chatId)) return false
    if (!this.isGroupAllowed(chatId)) return false
    if (looksLikeCommand(text, prefix)) return false
    if (text.trim().length < 2) return false
    const state = load()
    if (state.requireMention && chatId.endsWith('@g.us')) {
      if (!isBotMentioned(message, socket, text)) return false
    }
    if (!this.canRespond(chatId)) return false
    return true
  },
  respond(text: string) {
    const answer = miniLLM.answer(text)
    if (!answer || isLowValueReply(answer)) return null
    return answer.slice(0, 900)
  },
  async maybeReact(socket: WASocket, message: WAMessage, userText: string, answer: string) {
    const state = load()
    if (!state.reactions) return
    const emoji = pickReaction(userText, answer)
    if (!emoji || !message.key) return
    try {
      await socket.sendMessage(message.key.remoteJid!, {
        react: { text: emoji, key: message.key },
      })
    } catch {
      // ignore
    }
  },
  statusLine() {
    const s = load()
    const chats = Object.keys(s.chats).length
    return `global=${s.global ? 'ON' : 'OFF'} · chats=${chats} · mention=${s.requireMention ? 'ON' : 'OFF'} · groups=${s.groupWhitelist.length || 'all'} · spam≤${s.maxRepliesPerWindow}/min · react=${s.reactions ? 'ON' : 'OFF'}`
  },
}
