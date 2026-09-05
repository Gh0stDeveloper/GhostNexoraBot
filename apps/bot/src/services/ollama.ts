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

type GenerationJob = {
  run: () => Promise<ChatResponse>
  resolve: (value: ChatResponse | null) => void
  reject: (error: unknown) => void
  timer: NodeJS.Timeout
}

// Qwen 1.5B puede tardar bastante en CPU. Aunque una instalación antigua conserve
// OLLAMA_TIMEOUT_MS=45000 en .env, no cortamos una generación local antes de 6 min.
const MIN_GENERATION_TIMEOUT_MS = 360_000
const STATUS_TIMEOUT_MS = 15_000
const MAX_GENERATION_QUEUE = config.ollamaMaxQueue
const GENERATION_QUEUE_WAIT_MS = Math.max(config.ollamaQueueWaitMs, MIN_GENERATION_TIMEOUT_MS)
const generationQueue: GenerationJob[] = []
let generationActive = false

function generationTimeoutMs() {
  return Math.max(config.ollamaTimeoutMs, MIN_GENERATION_TIMEOUT_MS)
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

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = generationTimeoutMs()): Promise<T> {
  const { controller, timer } = abortAfter(timeoutMs)
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

function drainGenerationQueue() {
  if (generationActive) return
  const job = generationQueue.shift()
  if (!job) return

  clearTimeout(job.timer)
  generationActive = true
  void job.run()
    .then(job.resolve, job.reject)
    .finally(() => {
      generationActive = false
      drainGenerationQueue()
    })
}

function enqueueGeneration(run: () => Promise<ChatResponse>): Promise<ChatResponse | null> {
  if (generationQueue.length >= MAX_GENERATION_QUEUE) return Promise.resolve(null)

  return new Promise<ChatResponse | null>((resolve, reject) => {
    const job = {} as GenerationJob
    job.run = run
    job.resolve = resolve
    job.reject = reject
    job.timer = setTimeout(() => {
      const index = generationQueue.indexOf(job)
      if (index < 0) return
      generationQueue.splice(index, 1)
      resolve(null)
    }, GENERATION_QUEUE_WAIT_MS)
    job.timer.unref?.()
    generationQueue.push(job)
    drainGenerationQueue()
  })
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
      configuredTimeoutMs: config.ollamaTimeoutMs,
      timeoutMs: generationTimeoutMs(),
      keepAlive: config.ollamaKeepAlive,
      numPredict: config.ollamaNumPredict,
    }
  },

  getQueueStats() {
    return {
      active: generationActive ? 1 : 0,
      queued: generationQueue.length,
      maxQueued: MAX_GENERATION_QUEUE,
      waitTimeoutMs: GENERATION_QUEUE_WAIT_MS,
    }
  },

  async status() {
    try {
      // El diagnóstico debe fallar rápido si el daemon está caído; el timeout largo
      // se reserva para /api/chat, donde Qwen realmente puede tardar en CPU.
      const data = await request<TagsResponse>('/api/tags', { method: 'GET' }, STATUS_TIMEOUT_MS)
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
    contextText?: string
  }) {
    if (!runtimeEnabled || Date.now() < failedUntil) return null

    const userText = clean(input.userText, 2400)
    if (userText.length < 2) return null

    const messages: OllamaMessage[] = [
      { role: 'system', content: clean(input.systemPrompt || config.ollamaSystemPrompt, 3000) },
    ]
    const contextText = clean(input.contextText, 2400)
    if (contextText) messages.push({ role: 'system', content: contextText })
    messages.push(...historyToMessages(input.history ?? []), { role: 'user', content: userText })

    try {
      const data = await enqueueGeneration(() => request<ChatResponse>('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          model: config.ollamaModel,
          messages,
          stream: false,
          keep_alive: config.ollamaKeepAlive,
          options: {
            temperature: config.ollamaTemperature,
            top_p: config.ollamaTopP,
            num_predict: config.ollamaNumPredict,
          },
        }),
      }, generationTimeoutMs()))
      if (!data) return null
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
