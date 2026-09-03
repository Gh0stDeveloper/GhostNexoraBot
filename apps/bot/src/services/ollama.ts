import { config } from '../config.js'
import type { ChatTurn } from './conversation-memory.js'

export type OllamaMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type ChatResponse = {
  message?: { content?: string }
  done?: boolean
  model?: string
}

type TagsResponse = {
  models?: Array<{ name?: string; size?: number; modified_at?: string }>
}

function abortAfter(ms: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  timer.unref?.()
  return { controller, timer }
}

function clean(value: unknown, max = 4000) {
  return typeof value === 'string' ? value.replace(/\u0000/g, '').trim().slice(0, max) : ''
}

let runtimeEnabled = config.ollamaEnabled
let failedUntil = 0

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { controller, timer } = abortAfter(config.ollamaTimeoutMs)
  try {
    const response = await fetch(`${config.ollamaBaseUrl}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
      signal: controller.signal,
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Ollama HTTP ${response.status}${body ? `: ${body.slice(0, 240)}` : ''}`)
    }
    return (await response.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

function historyToMessages(turns: ChatTurn[]) {
  return turns
    .slice(-config.ollamaMaxHistory)
    .map((turn) => ({
      role: (turn.role === 'bot' ? 'assistant' : 'user') as 'assistant' | 'user',
      content: clean(turn.role === 'user' ? `${turn.name}: ${turn.text}` : turn.text, 800),
    }))
    .filter((item) => item.content.length > 0)
}

export const ollama = {
  isEnabled() {
    return runtimeEnabled
  },

  setEnabled(enabled: boolean) {
    runtimeEnabled = enabled
    if (enabled) failedUntil = 0
    return runtimeEnabled
  },

  getConfig() {
    return {
      enabled: runtimeEnabled,
      configured: Boolean(config.ollamaBaseUrl && config.ollamaModel),
      model: config.ollamaModel,
      baseUrl: config.ollamaBaseUrl,
      timeoutMs: config.ollamaTimeoutMs,
    }
  },

  async status() {
    try {
      const data = await request<TagsResponse>('/api/tags', { method: 'GET' })
      const models = (data.models ?? []).map((model) => ({
        name: model.name ?? 'unknown',
        size: model.size ?? 0,
        modifiedAt: model.modified_at ?? null,
      }))
      const modelAvailable = models.some((model) => model.name === config.ollamaModel)
      failedUntil = 0
      return {
        ok: true,
        enabled: runtimeEnabled,
        model: config.ollamaModel,
        modelAvailable,
        models,
      }
    } catch (error) {
      failedUntil = Date.now() + 10_000
      return {
        ok: false,
        enabled: runtimeEnabled,
        model: config.ollamaModel,
        modelAvailable: false,
        models: [],
        error: error instanceof Error ? error.message : 'ollama_unreachable',
      }
    }
  },

  async generate(input: {
    userText: string
    history?: ChatTurn[]
    systemPrompt?: string
  }) {
    if (!runtimeEnabled || Date.now() < failedUntil) return null

    const userText = clean(input.userText, 1400)
    if (userText.length < 2) return null

    const messages: OllamaMessage[] = [
      { role: 'system', content: clean(input.systemPrompt || config.ollamaSystemPrompt, 3000) },
      ...historyToMessages(input.history ?? []),
      { role: 'user', content: userText },
    ]

    try {
      const data = await request<ChatResponse>('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          model: config.ollamaModel,
          messages,
          stream: false,
          options: {
            temperature: config.ollamaTemperature,
            top_p: config.ollamaTopP,
          },
        }),
      })
      const answer = clean(data.message?.content, 4000)
      if (!answer) return null
      failedUntil = 0
      return answer
    } catch {
      failedUntil = Date.now() + 10_000
      return null
    }
  },
}
