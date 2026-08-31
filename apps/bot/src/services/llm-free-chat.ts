import fs from 'node:fs'
import path from 'node:path'
import type { WAMessage, WASocket } from 'baileys'
import { config } from '../config.js'
import { getContextInfo } from '../utils/message.js'
import { conversationMemory } from './conversation-memory.js'
import { contextualAnswer } from './llm-contextual-answer.js'

type State = {
  chats: Record<string, boolean>
  groupWhitelist: string[]
  global: boolean
  requireMention: boolean
  learnAlways: boolean
  maxRepliesPerWindow: number
  spamWindowMs: number
  antispamEnabled: boolean
  cooldownMs: number
  cooldownEnabled: boolean
  reactions: boolean
  slangEnabled: boolean
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
  antispamEnabled: true,
  cooldownMs: 2800,
  cooldownEnabled: true,
  reactions: true,
  slangEnabled: true,
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
      antispamEnabled: parsed.antispamEnabled !== false,
      cooldownMs: typeof parsed.cooldownMs === 'number' ? parsed.cooldownMs : DEFAULT.cooldownMs,
      cooldownEnabled: parsed.cooldownEnabled !== false,
      reactions: parsed.reactions !== false,
      slangEnabled: parsed.slangEnabled !== false,
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

export function shouldLearnText(text: string) {
  const t = text.trim()
  if (t.length < 2 || t.length > 1200) return false
  if (looksLikeCommand(t, '.')) return false
  if (/https?:\/\/|www\./i.test(t)) return false
  if (/(.)\1{6,}/.test(t)) return false
  if (/^[@#]\S+$/.test(t)) return false
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
  const lower = text.toLowerCase()
  if (/\b(ghost\s*nexora|nexora\s*bot|@bot)\b/i.test(lower)) return true
  const digits = (socket.user?.id ?? '').split('@')[0]?.split(':')[0]?.replace(/\D/g, '') ?? ''
  if (digits && lower.includes(`@${digits}`)) return true
  return false
}

function withinSpamLimit(chatId: string, state: State) {
  if (!state.antispamEnabled) return true
  const now = Date.now()
  const hits = (windowHits.get(chatId) ?? []).filter((t) => now - t < state.spamWindowMs)
  if (hits.length >= state.maxRepliesPerWindow) {
    windowHits.set(chatId, hits)
    return false
  }
  return true
}

function commitRateLimit(chatId: string, state: State) {
  const now = Date.now()
  if (state.antispamEnabled) {
    const hits = (windowHits.get(chatId) ?? []).filter((t) => now - t < state.spamWindowMs)
    hits.push(now)
    windowHits.set(chatId, hits)
  }
  lastAt.set(chatId, now)
}

function pickOne(list: string[]) {
  return list[Math.floor(Math.random() * list.length)] ?? list[0] ?? ''
}

function slangReply(text: string): string | null {
  const t = text.toLocaleLowerCase('es-MX').normalize('NFKC')
  const heavy =
    /\b(pendejo|pendeja|idiota|est[uú]pid[oa]|imb[eé]cil|culero|culera|cabr[oó]n|cabrona|puto|puta|pinche|verga|alv|nmms|nms|ctm|ctmr|chinga|chingado|mierda|basura|in[uú]til|joto|maric[oó]n|mam[oó]n|tarado|hocico)\b/i.test(
      t,
    ) ||
    /vete a la verga|a la verga|a la chingada|chinga tu madre|no mames|vales verga|me caes mal|te odio|callate|c[aá]llate/i.test(
      t,
    )
  if (!heavy) return null
  return pickOne([
    'Jajaja ok pendejo, ya desfogaste. ¿Qué quieres en serio?',
    'Orale cabrón, con ese tono también se habla. Tira la duda.',
    'Pinche energía la tuya. Igual te escucho, no mames.',
    'Te la paso wey. Ahora sí: ¿qué ocupas?',
    'A la verga, qué agresivo. Dime el punto y ya.',
    'Nmms, relájate. Aquí sigo si quieres algo útil.',
    'Puedes hablarme feo, no me apago. ¿Qué pedo entonces?',
    'Jaja qué pendejada. Cuando termines, pregunta en serio.',
  ])
}

function pickReaction(userText: string, answer: string): string | null {
  const t = `${userText} ${answer}`.toLowerCase()
  if (/hola|buenas|hey|holi/.test(t)) return '👋'
  if (/gracias|thank/.test(t)) return '🙏'
  if (/jaja|lol|xd|pendejo|verga|alv|nmms/.test(t)) return '😂'
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
  setCooldownEnabled(enabled: boolean) {
    const state = load()
    state.cooldownEnabled = enabled
    save(state)
    return enabled
  },
  setCooldownMs(ms: number) {
    const state = load()
    state.cooldownMs = Math.max(0, Math.min(120_000, Math.floor(ms)))
    save(state)
    return state.cooldownMs
  },
  setAntispamEnabled(enabled: boolean) {
    const state = load()
    state.antispamEnabled = enabled
    save(state)
    return enabled
  },
  setMaxRepliesPerWindow(n: number) {
    const state = load()
    state.maxRepliesPerWindow = Math.max(1, Math.min(60, Math.floor(n)))
    save(state)
    return state.maxRepliesPerWindow
  },
  setSpamWindowMs(ms: number) {
    const state = load()
    state.spamWindowMs = Math.max(5_000, Math.min(600_000, Math.floor(ms)))
    save(state)
    return state.spamWindowMs
  },
  setSlangEnabled(enabled: boolean) {
    const state = load()
    state.slangEnabled = enabled
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
    if (!chatId.endsWith('@g.us')) return true
    if (!state.groupWhitelist.length) return true
    return state.groupWhitelist.includes(chatId)
  },
  canRespond(chatId: string) {
    const state = load()
    const now = Date.now()
    const last = lastAt.get(chatId) ?? 0
    if (state.cooldownEnabled && state.cooldownMs > 0 && now - last < state.cooldownMs) return false
    if (!withinSpamLimit(chatId, state)) return false
    return true
  },
  commitRespond(chatId: string) {
    commitRateLimit(chatId, load())
  },

  /** Guarda mensajes del grupo/chat aunque el bot no responda (contexto). */
  rememberIncoming(chatId: string, text: string, pushName?: string) {
    if (!this.isEnabled(chatId)) return
    if (!this.isGroupAllowed(chatId)) return
    if (!shouldLearnText(text) && text.trim().length < 2) return
    if (looksLikeCommand(text, '.')) return
    conversationMemory.pushUser(chatId, text, pushName || 'Usuario')
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

  /** Respuesta con contexto del chat y LLM generativo local cuando está habilitado. */
  async respond(text: string, chatId: string, pushName?: string) {
    try {
      conversationMemory.pushUser(chatId, text, pushName || 'Usuario')
      const state = load()
      if (state.slangEnabled) {
        const slang = slangReply(text)
        if (slang) {
          conversationMemory.pushBot(chatId, slang)
          return slang
        }
      }
      const answer = await contextualAnswer(chatId, text)
      if (!answer) return null
      conversationMemory.pushBot(chatId, answer)
      return answer.slice(0, 900)
    } catch {
      return null
    }
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
    const cd = s.cooldownEnabled ? `${s.cooldownMs}ms` : 'OFF'
    const spam = s.antispamEnabled ? `≤${s.maxRepliesPerWindow}/${Math.round(s.spamWindowMs / 1000)}s` : 'OFF'
    return `global=${s.global ? 'ON' : 'OFF'} · chats=${chats} · mention=${s.requireMention ? 'ON' : 'OFF'} · groups=${s.groupWhitelist.length || 'all'} · cd=${cd} · spam=${spam} · slang=${s.slangEnabled ? 'ON' : 'OFF'} · react=${s.reactions ? 'ON' : 'OFF'} · ctx=ON`
  },
}
