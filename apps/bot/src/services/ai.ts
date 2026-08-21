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

type OpenRouterKeyResponse = {
  data?: {
    is_free_tier?: boolean
    is_management_key?: boolean
    limit?: number | null
    limit_remaining?: number | null
    limit_reset?: string | null
    expires_at?: string | null
    label?: string
  }
  error?: { message?: string }
}

const DEFAULT_MODEL = 'openrouter/free'
const DEFAULT_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'

function apiKey() { return process.env.OPENROUTER_API_KEY?.trim() ?? '' }
function endpoint() { return process.env.AI_BASE_URL?.trim() || DEFAULT_ENDPOINT }
function model() { return process.env.AI_MODEL?.trim() || DEFAULT_MODEL }
function isOpenRouter() {
  try { return new URL(endpoint()).hostname.toLowerCase() === 'openrouter.ai' } catch { return false }
}
function openRouterKeyShape() { return apiKey().startsWith('sk-or-v1-') }

export function aiConfigured() {
  return Boolean(apiKey())
}

function responseText(payload: OpenRouterResponse) {
  const content = payload.choices?.[0]?.message?.content
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content.map((part) => part.type === 'text' && typeof part.text === 'string' ? part.text : '').join('\n').trim()
  }
  return ''
}

export async function getAIStatus() {
  const configured = aiConfigured()
  const targetEndpoint = endpoint()
  let endpointHost = 'inválido'
  try { endpointHost = new URL(targetEndpoint).hostname } catch { /* reported below */ }
  const base = {
    configured,
    endpointHost,
    model: model(),
    provider: isOpenRouter() ? 'OpenRouter' : 'OpenAI-compatible',
    keyFormat: isOpenRouter() ? (openRouterKeyShape() ? 'OpenRouter compatible' : 'no parece una clave OpenRouter') : 'no validado por formato',
  }
  if (!configured) return { ...base, auth: 'missing' as const }
  if (!isOpenRouter()) return { ...base, auth: 'not-checked' as const }
  if (!openRouterKeyShape()) return { ...base, auth: 'invalid-format' as const }

  const response = await fetch('https://openrouter.ai/api/v1/key', {
    headers: { authorization: `Bearer ${apiKey()}`, accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  })
  const type = response.headers.get('content-type') ?? ''
  const payload = type.includes('json') ? await response.json() as OpenRouterKeyResponse : undefined
  if (!response.ok) {
    return {
      ...base,
      auth: 'rejected' as const,
      httpStatus: response.status,
      detail: payload?.error?.message || `HTTP ${response.status}`,
    }
  }
  return {
    ...base,
    auth: 'valid' as const,
    freeTier: payload?.data?.is_free_tier,
    managementKey: payload?.data?.is_management_key,
    limit: payload?.data?.limit,
    limitRemaining: payload?.data?.limit_remaining,
    limitReset: payload?.data?.limit_reset,
    expiresAt: payload?.data?.expires_at,
  }
}

export async function askAI(messages: AiMessage[], maxTokens = 1600) {
  const key = apiKey()
  if (!key) {
    throw new Error('La IA todavía no está configurada. El owner debe añadir OPENROUTER_API_KEY en el archivo .env del servidor.')
  }
  if (isOpenRouter() && !openRouterKeyShape()) {
    throw new Error('AI_BASE_URL apunta a OpenRouter, pero OPENROUTER_API_KEY no tiene el formato actual de una clave OpenRouter (sk-or-v1-...). Revoca la clave expuesta y crea una nueva desde OpenRouter.')
  }

  const targetEndpoint = endpoint()
  const selectedModel = model()
  const headers: Record<string, string> = {
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
    accept: 'application/json',
    'x-title': 'Ghost Nexora Bot',
  }
  if (/^https?:\/\//i.test(config.publicWebUrl)) headers['http-referer'] = config.publicWebUrl

  const response = await fetch(targetEndpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: selectedModel,
      messages,
      temperature: 0.45,
      max_tokens: Math.max(256, Math.min(3000, maxTokens)),
      stream: false,
    }),
    signal: AbortSignal.timeout(35_000),
  })

  const type = response.headers.get('content-type') ?? ''
  const payload = type.includes('json')
    ? await response.json() as OpenRouterResponse
    : { error: { message: (await response.text()).slice(0, 400) } }

  if (!response.ok) {
    const detail = payload.error?.message || `HTTP ${response.status}`
    logger.warn({ httpStatus: response.status, detail: detail.slice(0, 240), model: selectedModel }, 'ai provider request failed')
    throw new Error(`El proveedor de IA respondió HTTP ${response.status}: ${detail}`)
  }

  const text = responseText(payload)
  if (!text) throw new Error('El proveedor de IA no devolvió texto.')
  logger.info({ model: payload.model ?? selectedModel }, 'ai response completed')
  return { text, model: payload.model ?? selectedModel }
}
