import { miniLLM } from './mini-llm.js'
import { conversationMemory } from './conversation-memory.js'
import { ollama } from './ollama.js'
import { asksBotName, formatAssistantResponse } from './response-format.js'

function pickOne(list: string[]) {
  return list[Math.floor(Math.random() * list.length)] ?? list[0] ?? ''
}

function normalize(s: string) {
  return s
    .toLocaleLowerCase('es-MX')
    .normalize('NFKC')
    .replace(/[¿?¡!.,;:\"'«»“”]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isFollowUp(text: string) {
  const t = normalize(text)
  if (t.length <= 28) return true
  return /^(y |pero |entonces |por qu[eé]|porque |ok|vale|s[ií]|no |claro|exacto|sigue|contin[uú]a|explica|m[aá]s |y eso|y t[uú]|en serio|de verdad|como as[ií]|cómo así)/i.test(
    t,
  )
}

function isLowValue(text: string | null | undefined) {
  if (!text) return true
  const t = text.trim()
  if (t.length < 2) return true
  if (/todavía no tengo una respuesta clara/i.test(t)) return true
  if (/no tengo conocimiento local suficiente/i.test(t)) return true
  if (/enséñame con más ejemplos/i.test(t)) return true
  if (/dime algo y te respondo/i.test(t)) return true
  if (/checklist|banco grande de pares/i.test(t)) return true
  if (/^(no sé|no se|no puedo ayudarte|como ia no puedo)/i.test(t)) return true
  return false
}

function similar(a: string, b: string) {
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.includes(nb.slice(0, Math.min(40, nb.length))) || nb.includes(na.slice(0, Math.min(40, na.length)))) {
    return true
  }
  return false
}

function softContinue(topic: string[], lastBot: string | null) {
  const topicStr = topic.slice(0, 4).join(', ')
  if (lastBot && topicStr) {
    return pickOne([
      `Siguiendo con lo de ${topicStr}: ${lastBot.slice(0, 180)} ¿Qué más quieres saber?`,
      `Sobre ${topicStr}, ¿quieres que te lo explique más simple o con más detalle?`,
      `Vamos al grano con ${topicStr}. Dime qué parte te interesa.`,
    ])
  }
  if (topicStr) {
    return pickOne([
      `Estaban hablando de ${topicStr}. ¿Quieres que opine o te aclare algo?`,
      `Del tema ${topicStr}: cuéntame qué necesitas y lo vemos.`,
    ])
  }
  return null
}

/**
 * Respuesta coherente con el hilo del chat.
 * Prioriza Ollama cuando está habilitado y mantiene Mini-LLM/vector search como fallback.
 */
export async function contextualAnswer(chatId: string, userText: string): Promise<string | null> {
  const text = userText.replace(/\s+/g, ' ').trim()
  if (text.length < 2) return null

  // Identidad fija: nunca dependemos del modelo para contestar el nombre del bot.
  if (asksBotName(text)) return 'Soy Ghost Nexora Bot.'

  const recent = conversationMemory.recent(chatId, 12)
  const topics = conversationMemory.topicKeywords(chatId, text)
  const lastBot = conversationMemory.lastBot(chatId)
  const followUp = isFollowUp(text)

  // El mensaje actual puede haber sido guardado por rememberIncoming/respond.
  // No lo enviamos dos veces a Ollama: history contiene solo turnos previos.
  const history = recent.at(-1)?.role === 'user' && normalize(recent.at(-1)?.text ?? '') === normalize(text)
    ? recent.slice(0, -1)
    : recent

  // 0) LLM generativo local: conserva contexto real del chat y responde de forma natural.
  if (ollama.isEnabled()) {
    const generated = await ollama.generate({
      userText: text,
      history,
      systemPrompt: 'Eres Ghost Nexora Bot, un asistente de WhatsApp rápido, natural y útil. Tu nombre SIEMPRE es Ghost Nexora Bot. Si te preguntan tu nombre, identidad o quién eres, responde que eres Ghost Nexora Bot. Responde en el idioma del usuario. Sé directo, evita inventar datos y no repitas la pregunta. Cuando entregues código, usa bloques Markdown de triple backtick y especifica el lenguaje cuando sea posible. No envuelvas explicaciones normales en bloques de código.',
    })
    if (generated && !isLowValue(generated) && (!lastBot || !similar(generated, lastBot))) {
      return formatAssistantResponse(text, generated.slice(0, 900))
    }
  }

  // 1) Respuesta directa al mensaje (pares, identidad, hora…)
  let primary = miniLLM.answer(text)
  if (primary && isLowValue(primary)) primary = ''

  // 2) Si es seguimiento o la respuesta es pobre, buscar con tema del chat
  let secondary = ''
  if (followUp || !primary) {
    const topicQuery = [...topics, text].filter(Boolean).join(' ')
    if (topicQuery.length >= 3) {
      try {
        secondary = miniLLM.answer(topicQuery)
        if (isLowValue(secondary)) secondary = ''
      } catch {
        secondary = ''
      }
    }
    if (!secondary) {
      try {
        const hits = miniLLM.search(topicQuery || text, 4)
        const hit = hits.find((h: { text: string; score: number }) => h.score > 0.18 && !isLowValue(h.text))
        if (hit) {
          const sentence =
            hit.text
              .split(/(?<=[.!?])\s+|\n+/)
              .map((s: string) => s.trim())
              .find((s: string) => s.length >= 12 && s.length <= 260) ?? hit.text.slice(0, 260)
          secondary = sentence
        }
      } catch {
        /* ignore */
      }
    }
  }

  let reply = primary || secondary

  if (reply && lastBot && similar(reply, lastBot)) {
    const alt = secondary && !similar(secondary, lastBot) ? secondary : softContinue(topics, lastBot)
    if (alt) reply = alt
  }

  if (!reply || isLowValue(reply)) {
    const soft = softContinue(topics, lastBot)
    if (soft) reply = soft
  }

  if (!reply || isLowValue(reply)) return null

  if (history.length >= 3 && topics.length >= 2 && Math.random() < 0.28 && !/^sobre |siguiendo con/i.test(reply)) {
    const hook = pickOne([
      `Sobre ${topics[0]}: `,
      `En ese tema: `,
      ``,
    ])
    if (hook && !normalize(reply).includes(topics[0]!)) {
      reply = `${hook}${reply}`
    }
  }

  return formatAssistantResponse(text, reply.slice(0, 900))
}
