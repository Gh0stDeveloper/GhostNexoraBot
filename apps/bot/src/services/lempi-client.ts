import { config } from '../config.js'
import { logger } from '../utils/logger.js'
import { recordProviderAttempt } from './provider-health.js'

const MAX_REQUESTS_PER_KEY = 190
const DEFAULT_TIMEOUT_MS = 45_000

export class LempiUnavailableError extends Error {
  constructor(message = 'El servicio de descargas no está disponible por el momento.') {
    super(message)
    this.name = 'LempiUnavailableError'
  }
}

class LempiRequestError extends LempiUnavailableError {
  constructor(public readonly rotateKey: boolean) {
    super()
    this.name = 'LempiRequestError'
  }
}

type KeyState = {
  key: string
  requests: number
  exhausted: boolean
}

type RequestOptions = {
  timeoutMs?: number
}

let states: KeyState[] = []
let cursor = 0
let refreshSignature = ''

function readKeys() {
  const configured = [
    ...config.lempiApiKeys,
    config.lempiApiKey,
  ]
    .flatMap((value) => value.split(/[\n,]+/))
    .map((value) => value.trim())
    .filter(Boolean)

  return [...new Set(configured)]
}

function ensureState() {
  const keys = readKeys()
  const signature = keys.join('\u0000')
  if (signature !== refreshSignature) {
    refreshSignature = signature
    states = keys.map((key) => ({ key, requests: 0, exhausted: false }))
    cursor = 0
  }
  if (!states.length) throw new LempiUnavailableError('El servicio de descargas no está configurado.')
}

function nextAvailableIndex() {
  for (let offset = 0; offset < states.length; offset += 1) {
    const index = (cursor + offset) % states.length
    const state = states[index]!
    if (!state.exhausted && state.requests < MAX_REQUESTS_PER_KEY) return index
  }
  return -1
}

function isQuotaMessage(value: string) {
  return /quota|limit|rate.?limit|too many|exceed|requests left|daily.?limit|credits|l[ií]mite de peticiones|cuota/i.test(value)
}

function payloadMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') return ''
  const record = payload as Record<string, unknown>
  for (const value of [record.message, record.error, record.msg, record.detail, record.code]) {
    if ((typeof value === 'string' || typeof value === 'number') && String(value).trim()) return String(value).trim()
  }
  return ''
}

function shouldRotate(status: number, payload: unknown) {
  if (status === 401 || status === 402 || status === 403 || status === 429) return true
  return isQuotaMessage(payloadMessage(payload))
}

function logicalProviderId(endpoints: string[]) {
  const value = endpoints.join(' ').toLowerCase()
  if (value.includes('tiktok')) return 'tiktok'
  if (value.includes('instagram') || /(^|\/)ig(?:\b|\/)/.test(value)) return 'instagram'
  if (value.includes('happymod')) return 'happymod'
  if (value.includes('likee')) return 'likee'
  if (value.includes('terabox')) return 'terabox'
  if (value.includes('pinterest')) return 'pinterest'
  if (value.includes('deepseek')) return 'deepseek'
  if (value.includes('youtube') || /(^|\/)yt(?:\b|\/)/.test(value)) return 'youtube'
  return 'lempi'
}

function recordHealth(providerId: string, ok: boolean, started: number, errorCode?: string) {
  const latencyMs = Math.max(0, performance.now() - started)
  try {
    recordProviderAttempt('lempi', { ok, latencyMs, errorCode })
    if (providerId !== 'lempi') recordProviderAttempt(providerId, { ok, latencyMs, errorCode })
  } catch (error) {
    logger.debug({ error, providerId }, 'provider health telemetry skipped')
  }
}

async function requestOnce<T>(pathname: string, params: Record<string, string | number | undefined>, keyIndex: number, options: RequestOptions = {}) {
  const state = states[keyIndex]
  if (!state) throw new LempiRequestError(true)

  if (state.requests >= MAX_REQUESTS_PER_KEY) {
    state.exhausted = true
    throw new LempiRequestError(true)
  }

  const url = new URL(pathname.replace(/^\//, ''), `${config.lempiBaseUrl.replace(/\/$/, '')}/`)
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && String(value).trim() !== '') url.searchParams.set(name, String(value))
  }
  url.searchParams.set('apikey', state.key)

  state.requests += 1
  let response: Response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json, text/plain;q=0.8, */*;q=0.5',
        'user-agent': 'GhostNexoraBot',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    })
  } catch (error) {
    logger.warn({ keyIndex, endpoint: pathname, error }, 'Lempi request network failure')
    throw new LempiRequestError(false)
  }

  const text = await response.text()
  let payload: unknown
  try {
    payload = text ? JSON.parse(text) : undefined
  } catch {
    if (shouldRotate(response.status, text)) {
      state.exhausted = true
      logger.warn({ keyIndex, status: response.status }, 'Lempi API key exhausted')
      throw new LempiRequestError(true)
    }
    throw new LempiRequestError(false)
  }

  if (shouldRotate(response.status, payload)) {
    state.exhausted = true
    logger.warn({ keyIndex, status: response.status }, 'Lempi API key exhausted')
    throw new LempiRequestError(true)
  }

  if (!response.ok) {
    logger.warn({ keyIndex, status: response.status, endpoint: pathname, detail: payloadMessage(payload) }, 'Lempi endpoint request failed')
    throw new LempiRequestError(false)
  }

  if (!payload || typeof payload !== 'object') throw new LempiRequestError(false)

  const record = payload as Record<string, unknown>
  if (record.status === false || record.success === false || record.ok === false) {
    const detail = payloadMessage(payload)
    if (isQuotaMessage(detail)) {
      state.exhausted = true
      throw new LempiRequestError(true)
    }
    throw new LempiRequestError(false)
  }

  return payload as T
}

export async function requestLempiJson<T>(
  endpoints: string | string[],
  params: Record<string, string | number | undefined>,
  options: RequestOptions = {},
): Promise<T> {
  const endpointList = Array.isArray(endpoints) ? endpoints : [endpoints]
  const candidates = [...new Set(endpointList.map((item) => item.trim()).filter(Boolean))]
  const providerId = logicalProviderId(candidates)
  const started = performance.now()

  try {
    ensureState()
    if (!candidates.length) throw new LempiUnavailableError()

    let lastError: LempiRequestError | null = null
    for (let keyRound = 0; keyRound < states.length; keyRound += 1) {
      const keyIndex = nextAvailableIndex()
      if (keyIndex < 0) break
      cursor = keyIndex

      for (const endpoint of candidates) {
        try {
          const payload = await requestOnce<T>(endpoint, params, keyIndex, options)
          recordHealth(providerId, true, started)
          return payload
        } catch (error) {
          if (!(error instanceof LempiRequestError)) throw error
          lastError = error
          if (error.rotateKey) {
            cursor = (keyIndex + 1) % states.length
            break
          }
        }
      }

      if (!states[keyIndex]?.exhausted) break
    }

    recordHealth(providerId, false, started, lastError?.rotateKey ? 'quota_or_auth' : 'request_failed')
    throw new LempiUnavailableError()
  } catch (error) {
    if (!(error instanceof LempiUnavailableError)) {
      recordHealth(providerId, false, started, 'unexpected_failure')
      throw error
    }
    if (!states.length || !candidates.length) recordHealth(providerId, false, started, !states.length ? 'not_configured' : 'invalid_endpoint')
    throw error
  }
}

export function resetLempiKeyStateForTests() {
  states = []
  cursor = 0
  refreshSignature = ''
}

export function getLempiKeyStateForTests() {
  ensureState()
  return states.map(({ requests, exhausted }) => ({ requests, exhausted }))
}
