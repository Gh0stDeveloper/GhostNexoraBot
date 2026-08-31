import { conversationMemory } from './conversation-memory.js'
import { ollama } from './ollama.js'
import { asksBotName, formatAssistantResponse } from './response-format.js'

function normalize(s: string) {
  return s
    .toLocaleLowerCase('es-MX')
    .normalize('NFKC')
    .replace(/[¿?¡!.,;:\"'«»“”]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function similar(a: string, b: string) {
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return false
  if (na === nb) return true
  return na.includes(nb.slice(0, Math.min(40, nb.length))) || nb.includes(na.slice(0, Math.min(40, na.length)))
}

/**
 * MainBot-only generative chat.
 * Ollama is the response engine; Mini-LLM/vector corpus is intentionally not used here.
 * Recent conversation memory is still passed as chat context, but no document retrieval
 * or pre-trained local corpus is consulted for the answer.
 */
export async function contextualAnswer(chatId: string, userText: string): Promise<string | null> {
  const text = userText.replace(/\s+/g, ' ').trim()
  if (text.length < 2) return null

  if (asksBotName(text)) return 'Soy Ghost Nexora Bot.'

  const recent = conversationMemory.recent(chatId, 12)
  const lastBot = conversationMemory.lastBot(chatId)
  const history = recent.at(-1)?.role === 'user' && normalize(recent.at(-1)?.text ?? '') === normalize(text)
    ? recent.slice(0, -1)
    : recent

  if (!ollama.isEnabled()) return null

  const generated = await ollama.generate({
    userText: text,
    history,
    systemPrompt: [
      'Eres Ghost Nexora Bot, el asistente oficial del bot principal de WhatsApp.',
      'Tu nombre SIEMPRE es Ghost Nexora Bot.',
      'Si te preguntan tu nombre, identidad, quién eres o cómo te llamas, responde que eres Ghost Nexora Bot.',
      'Responde en el idioma del usuario.',
      'Usa el contexto reciente del chat cuando sea relevante.',
      'No uses ni menciones el corpus, Mini-LLM, documentos de entrenamiento ni sistemas internos.',
      'No inventes datos y no repitas la pregunta.',
      'Cuando el usuario pida código, entrega código en bloques Markdown de triple backtick y especifica el lenguaje cuando sea posible.',
      'Mantén las explicaciones normales fuera de los bloques de código.',
    ].join(' '),
  })

  if (!generated) return null
  if (lastBot && similar(generated, lastBot)) return generated.slice(0, 900)
  return formatAssistantResponse(text, generated.slice(0, 900))
}
