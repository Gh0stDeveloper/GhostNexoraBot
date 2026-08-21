import { config } from '../config.js'
import { logger } from '../utils/logger.js'

export type AiMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type OpenRouterResponse = {
  model?: string
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>
    }
  }>
  error?: { message?: string; code?: string | number }
}

const DEFAULT_MODEL = 'openrouter/free'
const DEFAULT_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'

export function aiConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim())
}

function responseText(payload: OpenRouterResponse) {
  const content = payload.choices?.[0]?.message?.content
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content.map((part) => part.type === 'text' && typeof part.text === 'string' ? part.text : '').join('\n').trim()
  }
  return ''
}

export async function askAI(messages: AiMessage[], maxTokens = 1600) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('La IA todavía no está configurada. El owner debe añadir OPENROUTER_API_KEY en el archivo .env del servidor.')
  }

  const endpoint = process.env.AI_BASE_URL?.trim() || DEFAULT_ENDPOINT
  const model = process.env.AI_MODEL?.trim() || DEFAULT_MODEL
  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json',
    accept: 'application/json',
    'x-title': 'Ghost Nexora Bot',
  }
  if (/^https?:\/\//i.test(config.publicWebUrl)) headers['http-referer'] = config.publicWebUrl

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.45,
      max_tokens: Math.max(256, Math.min(3000, maxTokens)),
      stream: false,
    }),
    signal: AbortSignal.timeout(50_000),
  })

  const type = response.headers.get('content-type') ?? ''
  const payload = type.includes('json')
    ? await response.json() as OpenRouterResponse
    : { error: { message: (await response.text()).slice(0, 400) } }

  if (!response.ok) {
    const detail = payload.error?.message || `HTTP ${response.status}`
    throw new Error(`El proveedor de IA respondió: ${detail}`)
  }

  const text = responseText(payload)
  if (!text) throw new Error('El proveedor de IA no devolvió texto.')
  logger.info({ model: payload.model ?? model }, 'ai response completed')
  return { text, model: payload.model ?? model }
}
