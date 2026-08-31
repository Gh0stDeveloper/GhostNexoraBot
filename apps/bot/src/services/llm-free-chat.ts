import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { miniLLM } from './mini-llm.js'

type State = {
  /** chats donde el mini-LLM responde sin prefijo */
  chats: Record<string, boolean>
  /** si true, todos los chats (con cooldown) */
  global: boolean
  /** aprender de mensajes aunque no responda */
  learnAlways: boolean
  /** solo responder si hay confianza mínima de memoria */
  minScore: number
}

const FILE = path.resolve(config.dataDir, 'llm', 'free-chat.json')
const COOLDOWN_MS = 2800
const lastAt = new Map<string, number>()

const DEFAULT: State = {
  chats: {},
  global: false,
  learnAlways: true,
  minScore: 0.22,
}

function load(): State {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8')) as Partial<State>
    return {
      chats: parsed.chats && typeof parsed.chats === 'object' ? parsed.chats : {},
      global: Boolean(parsed.global),
      learnAlways: parsed.learnAlways !== false,
      minScore: typeof parsed.minScore === 'number' ? parsed.minScore : DEFAULT.minScore,
    }
  } catch {
    return { ...DEFAULT, chats: {} }
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
  // evita responder a comandos sin prefijo raros
  if (/^(\.[a-z]|\/[a-z])/i.test(t)) return true
  return false
}

function isLowValueReply(text: string) {
  const t = text.trim().toLowerCase()
  if (t.length < 2) return true
  if (/todavía no tengo una respuesta clara|no tengo conocimiento local suficiente/i.test(t)) return true
  if (/^\d+\.\s/.test(t) && t.length > 400) return true // dump de search crudo
  return false
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
  setLearnAlways(enabled: boolean) {
    const state = load()
    state.learnAlways = enabled
    save(state)
    return enabled
  },
  canRespond(chatId: string) {
    const now = Date.now()
    const last = lastAt.get(chatId) ?? 0
    if (now - last < COOLDOWN_MS) return false
    lastAt.set(chatId, now)
    return true
  },
  shouldHandle(chatId: string, text: string, prefix: string) {
    if (!this.isEnabled(chatId)) return false
    if (looksLikeCommand(text, prefix)) return false
    if (text.trim().length < 2) return false
    if (!this.canRespond(chatId)) return false
    return true
  },
  /**
   * Responde solo si hay algo útil. Siempre encola aprendizaje vía live queue en index.
   */
  respond(text: string) {
    const answer = miniLLM.answer(text)
    if (!answer || isLowValueReply(answer)) return null
    return answer.slice(0, 900)
  },
  statusLine() {
    const s = load()
    const chats = Object.keys(s.chats).length
    return `global=${s.global ? 'ON' : 'OFF'} · chats=${chats} · learn=${s.learnAlways ? 'ON' : 'OFF'}`
  },
}
