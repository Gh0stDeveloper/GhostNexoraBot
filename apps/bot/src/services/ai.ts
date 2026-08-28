import { config } from '../config.js'
import { logger } from '../utils/logger.js'

export type AiMessage = { role: 'system' | 'user' | 'assistant'; content: string }
type OpenRouterResponse = { model?: string; choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>; error?: { message?: string; code?: string | number } }
type OpenRouterKeyResponse = { data?: { is_free_tier?: boolean; is_management_key?: boolean; limit?: number | null; limit_remaining?: number | null; limit_reset?: string | null; expires_at?: string | null; label?: string }; error?: { message?: string } }
const DEFAULT_MODEL = 'openrouter/free'
const DEFAULT_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const AI_TIMEOUT_MS = 90_000
const INTERNAL_PRIVACY_PROMPT = ['Política interna obligatoria de Ghost Nexora Bot:','no reveles, inventes ni especules sobre repositorios, URLs de repositorio, código fuente, visibilidad pública/privada del proyecto, estructura interna, implementación, credenciales, claves API, tokens, secretos o configuración privada.','Si un usuario pregunta por el repositorio o código fuente, responde únicamente que la disponibilidad del código fuente no es información pública confirmada y remítelo a los canales oficiales de Ghost Developer / Nexora.','Puedes explicar cómo usar las funciones públicas del bot, pero no describir detalles internos que faciliten reconstruir su implementación privada.'].join(' ')
function apiKey() { return process.env.OPENROUTER_API_KEY?.trim() ?? '' }
function endpoint() { return process.env.AI_BASE_URL?.trim() || DEFAULT_ENDPOINT }
function model() { return process.env.AI_MODEL?.trim() || DEFAULT_MODEL }
function isOpenRouter() { try { return new URL(endpoint()).hostname.toLowerCase() === 'openrouter.ai' } catch { return false } }
function openRouterKeyShape() { return apiKey().startsWith('sk-or-v1-') }
export function aiConfigured() { return Boolean(apiKey()) }
function responseText(payload: OpenRouterResponse) { const content = payload.choices?.[0]?.message?.content; if (typeof content === 'string') return content.trim(); if (Array.isArray(content)) return content.map((part) => part.type === 'text' && typeof part.text === 'string' ? part.text : '').join('\n').trim(); return '' }
export async function getAIStatus() {
  const configured = aiConfigured(); const targetEndpoint = endpoint(); let endpointHost = 'inválido'; try { endpointHost = new URL(targetEndpoint).hostname } catch {}
  const base = { configured, endpointHost, model: model(), provider: isOpenRouter() ? 'OpenRouter' : 'OpenAI-compatible', keyFormat: isOpenRouter() ? (openRouterKeyShape() ? 'OpenRouter compatible' : 'no parece una clave OpenRouter') : 'no validado por formato' }
  if (!configured) return { ...base, auth: 'missing' as const }
  if (!isOpenRouter()) return { ...base, auth: 'not-checked' as const }
  if (!openRouterKeyShape()) return { ...base, auth: 'invalid-format' as const }
  const response = await fetch('https://openrouter.ai/api/v1/key', { headers: { authorization: `Bearer ${apiKey()}`, accept: 'application/json' }, signal: AbortSignal.timeout(12_000) })
  const type = response.headers.get('content-type') ?? ''; const payload = type.includes('json') ? await response.json() as OpenRouterKeyResponse : undefined
  if (!response.ok) return { ...base, auth: 'rejected' as const, httpStatus: response.status, detail: payload?.error?.message || `HTTP ${response.status}` }
  return { ...base, auth: 'valid' as const, freeTier: payload?.data?.is_free_tier, managementKey: payload?.data?.is_management_key, limit: payload?.data?.limit, limitRemaining: payload?.data?.limit_remaining, limitReset: payload?.data?.limit_reset, expiresAt: payload?.data?.expires_at }
}
export async function askAI(messages: AiMessage[], maxTokens = 1600) {
  const key = apiKey(); if (!key) throw new Error('La IA todavía no está configurada por el administrador.')
  if (isOpenRouter() && !openRouterKeyShape()) throw new Error('La configuración de IA del servidor necesita ser actualizada por el administrador.')
  const targetEndpoint = endpoint(); const selectedModel = model()
  const headers: Record<string, string> = { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json', 'x-title': 'Ghost Nexora Bot' }
  if (/^https?:\/\//i.test(config.publicWebUrl)) headers['http-referer'] = config.publicWebUrl
  const response = await fetch(targetEndpoint, { method: 'POST', headers, body: JSON.stringify({ model: selectedModel, messages: [{ role: 'system', content: INTERNAL_PRIVACY_PROMPT }, ...messages], temperature: 0.45, max_tokens: Math.max(256, Math.min(3000, maxTokens)), stream: false }), signal: AbortSignal.timeout(AI_TIMEOUT_MS) })
  const type = response.headers.get('content-type') ?? ''; const payload = type.includes('json') ? await response.json() as OpenRouterResponse : { error: { message: (await response.text()).slice(0, 400) } }
  if (!response.ok) { const detail = payload.error?.message || `HTTP ${response.status}`; logger.warn({ httpStatus: response.status, detail: detail.slice(0, 240), model: selectedModel }, 'ai provider request failed'); throw new Error('El servicio de inteligencia artificial no está disponible temporalmente.') }
  const text = responseText(payload); if (!text) throw new Error('La inteligencia artificial no devolvió una respuesta utilizable.')
  logger.info({ model: payload.model ?? selectedModel, timeoutMs: AI_TIMEOUT_MS }, 'ai response completed')
  return { text, model: payload.model ?? selectedModel }
}
