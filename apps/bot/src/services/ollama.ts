import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'

type OllamaState = {
  enabled: boolean
  model: string
  baseUrl: string
  timeoutMs: number
}

const STATE_FILE = path.resolve(config.dataDir, 'llm', 'ollama.json')

const DEFAULT: OllamaState = {
  enabled: config.ollamaEnabled,
  model: config.ollamaModel,
  baseUrl: config.ollamaBaseUrl,
  timeoutMs: config.ollamaTimeoutMs,
}

function load(): OllamaState {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as Partial<OllamaState>
    return {
      enabled: parsed.enabled ?? DEFAULT.enabled,
      model: typeof parsed.model === 'string' && parsed.model ? parsed.model : DEFAULT.model,
      baseUrl: typeof parsed.baseUrl === 'string' && parsed.baseUrl ? parsed.baseUrl : DEFAULT.baseUrl,
      timeoutMs:
        typeof parsed.timeoutMs === 'number' && parsed.timeoutMs > 0 ? parsed.timeoutMs : DEFAULT.timeoutMs,
    }
  } catch {
    return { ...DEFAULT }
  }
}

function save(state: OllamaState) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true })
  const tmp = `${STATE_FILE}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2))
  fs.renameSync(tmp, STATE_FILE)
}

export type OllamaChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export const ollama = {
  getState() {
    return load()
  },
  setEnabled(enabled: boolean) {
    const state = load()
    state.enabled = enabled
    save(state)
    return enabled
  },
  setModel(model: string) {
    const state = load()
    state.model = model.trim() || DEFAULT.model
    save(state)
    return state.model
  },
  setBaseUrl(url: string) {
    const state = load()
    state.baseUrl = url.replace(/\/$/, '') || DEFAULT.baseUrl
    save(state)
    return state.baseUrl
  },
  async ping() {
    const state = load()
    try {
      const res = await fetch(`${state.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(Math.min(state.timeoutMs, 5_000)),
      })
      if (!res.ok) return { ok: false as const, error: `HTTP ${res.status}` }
      const data = (await res.json()) as { models?: Array<{ name: string }> }
      const models = (data.models ?? []).map((m) => m.name)
      return {
        ok: true as const,
        models,
        hasModel: models.some((n) => n === state.model || n.startsWith(`${state.model}:`) || n.startsWith(state.model.split(':')[0]!)),
        model: state.model,
        baseUrl: state.baseUrl,
      }
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
    }
  },
  async chat(messages: OllamaChatMessage[], opts?: { temperature?: number; numPredict?: number }) {
    const state = load()
    if (!state.enabled) return null
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), state.timeoutMs)
    try {
      const res = await fetch(`${state.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: state.model,
          stream: false,
          options: {
            temperature: opts?.temperature ?? 0.7,
            num_predict: opts?.numPredict ?? 180,
            num_ctx: 2048,
          },
          messages,
        }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`Ollama HTTP ${res.status}: ${body.slice(0, 200)}`)
      }
      const data = (await res.json()) as { message?: { content?: string } }
      const text = data.message?.content?.trim()
      return text && text.length >= 1 ? text.slice(0, 900) : null
    } finally {
      clearTimeout(timer)
    }
  },
  statusLine() {
    const s = load()
    return `ollama=${s.enabled ? 'ON' : 'OFF'} · model=${s.model} · ${s.baseUrl}`
  },
}
