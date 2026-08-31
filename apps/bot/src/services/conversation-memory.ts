/** Memoria corta de conversación por chat (grupo o privado). */

export type ChatTurn = {
  role: 'user' | 'bot'
  name: string
  text: string
  at: number
}

const MAX_TURNS = 24
const MAX_AGE_MS = 45 * 60_000
const store = new Map<string, ChatTurn[]>()

function prune(chatId: string) {
  const now = Date.now()
  const list = (store.get(chatId) ?? []).filter((t) => now - t.at <= MAX_AGE_MS)
  if (list.length > MAX_TURNS) list.splice(0, list.length - MAX_TURNS)
  store.set(chatId, list)
  return list
}

export const conversationMemory = {
  pushUser(chatId: string, text: string, name = 'Usuario') {
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, 400)
    if (clean.length < 1) return
    const list = prune(chatId)
    list.push({ role: 'user', name: name.slice(0, 40), text: clean, at: Date.now() })
    store.set(chatId, list)
  },

  pushBot(chatId: string, text: string) {
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, 500)
    if (clean.length < 1) return
    const list = prune(chatId)
    list.push({ role: 'bot', name: 'Bot', text: clean, at: Date.now() })
    store.set(chatId, list)
  },

  /** Últimos turnos (más antiguos primero). */
  recent(chatId: string, limit = 12): ChatTurn[] {
    return prune(chatId).slice(-Math.max(1, limit))
  },

  lastBot(chatId: string): string | null {
    const list = prune(chatId)
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i]!.role === 'bot') return list[i]!.text
    }
    return null
  },

  /** Texto compacto para enriquecer búsqueda / respuesta. */
  contextBlock(chatId: string, limit = 8): string {
    return this.recent(chatId, limit)
      .map((t) => `${t.role === 'bot' ? 'Bot' : t.name}: ${t.text}`)
      .join('\n')
  },

  /** Palabras clave del hilo (sin stopwords). */
  topicKeywords(chatId: string, extra = ''): string[] {
    const raw = `${this.recent(chatId, 10)
      .map((t) => t.text)
      .join(' ')} ${extra}`
      .toLocaleLowerCase('es-MX')
      .normalize('NFKC')
    const stop = new Set([
      'que', 'qué', 'de', 'la', 'el', 'los', 'las', 'un', 'una', 'y', 'o', 'en', 'a', 'por', 'para',
      'con', 'no', 'si', 'sí', 'es', 'son', 'se', 'me', 'te', 'lo', 'le', 'al', 'del', 'como',
      'cómo', 'está', 'esta', 'esto', 'eso', 'hay', 'muy', 'ya', 'pero', 'más', 'mas', 'todo',
      'hola', 'bueno', 'pues', 'aqui', 'aquí', 'alla', 'allá', 'pues', 'nada', 'algo', 'solo',
      'sólo', 'tambien', 'también', 'porque', 'porqué', 'cuando', 'donde', 'dónde', 'quien',
      'quién', 'cual', 'cuál', 'sus', 'mi', 'tu', 'su', 'nos', 'vos', 'les', 'the', 'and',
    ])
    const words = raw.match(/[\p{L}\p{N}]{3,}/gu) ?? []
    const freq = new Map<string, number>()
    for (const w of words) {
      if (stop.has(w)) continue
      freq.set(w, (freq.get(w) ?? 0) + 1)
    }
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14)
      .map(([w]) => w)
  },

  clear(chatId: string) {
    store.delete(chatId)
  },
}
