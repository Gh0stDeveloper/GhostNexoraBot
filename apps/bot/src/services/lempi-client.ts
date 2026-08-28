import { config } from '../config.js'
import { logger } from '../utils/logger.js'

const MAX_REQUESTS_PER_KEY = 190
const DEFAULT_TIMEOUT_MS = 45_000

export class LempiUnavailableError extends Error {
  constructor(message = 'El servicio de descargas no está disponible por el momento.') {
    super(message)
    this.name = 'LempiUnavailableError'
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
let rotationTail: Promise<void> = Promise.resolve()

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

async function withRotationLock<T>(task: () => Promise<T>): Promise<T> {
  const previous = rotationTail
  let release!: () => void
  rotationTail = new Promise<void>((resolve) => { release = resolve })
  await previous
  try {
    return await task()
  } finally {
    release()
  }
}

function isQuotaResponse(status: number, payload: unknown) {
  if (status === 402 || status === 403 || status === 429) return true
  if (!payload || typeof payload !== 'object') return false
  const record = payload as Record<string, unknown>
  const message = [record.message, record.error, record.msg, record.detail, record.code]
    .filter((value) => typeof value === 'string' || typeof value === 'number')
    .join(' ')
    .toLowerCase()
  return /quota|limit|rate.?limit|too many|exceed|requests left|daily.?limit|credits/.test(message)
}

function payloadMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') return ''
  const record = payload as Record<string, unknown>
  for (const value of [record.message, record.error, record.msg, record.detail]) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

export type LempiRequestResult<T> = {
  payload: T
  keyIndex: number
}

async function requestOnce<T>(pathname: string, params: Record<string, string | number | undefined>, keyIndex: number, options: RequestOptions = {}) {
  const state = states[keyIndex]
  if (!state) throw new LempiUnavailableError()

  if (state.requests >= MAX_REQUESTS_PER_KEY) {
    state.exhausted = true
    throw new LempiUnavailableError()
  }

  const url = new URL(pathname.replace(/^\//, ''), `${config.lempiBaseUrl.replace(/\/$/, '')}/`)
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && String(value).trim() !== '') url.searchParams.set(name, String(value))
  }
  url.searchParams.set('apikey', state.key)

  state.requests += 1
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json, text/plain;q=0.8, */*;q=0.5',
      'user-agent': 'GhostNexoraBot',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  })

  const text = await response.text()
  let payload: unknown = undefined
  try {
    payload = text ? JSON.parse(text) : undefined
  } catch {
    if (!response.ok) {
      if (isQuotaResponse(response.status, text)) state.exhausted = true
      throw new LempiUnavailableError()
    }
    throw new LempiUnavailableError('El servicio de descargas devolvió una respuesta inesperada.')
  }

  if (isQuotaResponse(response.status, payload)) {
    state.exhausted = true
    logger.warn({ keyIndex, status: response.status }, 'Lempi API key rotated after quota response')
    throw new LempiUnavailableError()
  }

  if (!response.ok) {
    logger.warn({ keyIndex, status: response.status, endpoint: pathname, detail: payloadMessage(payload) }, 'Lempi request failed')
    throw new LempiUnavailableError()
  }

  if (!payload || typeof payload !== 'object') {
    throw new LempiUnavailableError('El servicio de descargas devolvió una respuesta inesperada.')
  }

  const record = payload as Record<string, unknown>
  if (record.status === false || record.success === false || record.ok === false) {
    const detail = payloadMessage(payload)
    if (/quota|limit|rate.?limit|too many|exceed|credits/i.test(detail)) state.exhausted = true
    throw new LempiUnavailableError()
  }

  return { payload: payload as T, keyIndex }
}

export async function requestLempiJson<T>(
  endpoints: string[],
  params: Record<string, string | number | undefined>,
  options: RequestOptions = {},
): Promise<T> {
  return withRotationLock(async () => {
    ensureState()
    let endpointError = false

    for (let keyAttempts = 0; keyAttempts < states.length; keyAttempts += 1) {
      const keyIndex = nextAvailableIndex()
      if (keyIndex < 0) break
      cursor = keyIndex

      for (const endpoint of [...new Set(endpoints.filter(Boolean))]) {
        try {
          const result = await requestOnce<T>(endpoint, params, keyIndex, options)
          return result.payload
        } catch (error) {
          if (error instanceof LempiUnavailableError) {
            const state = states[keyIndex]!
            if (state.exhausted) {
              cursor = (keyIndex + 1) % states.length
              break
            }
            endpointError = true
            continue
          }
          throw error
        }
      }

      if (!endpointError) break
      endpointError = false
    }

    throw new LempiUnavailableError()
  })
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
