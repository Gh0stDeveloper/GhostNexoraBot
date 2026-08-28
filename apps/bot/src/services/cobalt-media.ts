import { isIP } from 'node:net'
import { logger } from '../utils/logger.js'

const DIRECTORY_URL = 'https://cobalt.directory/api/working?type=api'
const DIRECTORY_CACHE_MS = 10 * 60_000
const MAX_DIRECTORY_INSTANCES = 8
const MAX_PARALLEL_INSTANCES = 5
const REQUEST_TIMEOUT_MS = 20_000

type CobaltResponse = {
  status?: string
  url?: string
  filename?: string
  audio?: string
  audioFilename?: string
  picker?: Array<{ type?: string; url?: string; thumb?: string }>
  error?: { code?: string }
}

export type CobaltMediaItem = {
  type: 'image' | 'video' | 'gif' | 'audio' | 'unknown'
  url: string
  fileName?: string
  thumb?: string
}

export type CobaltMediaResult = {
  items: CobaltMediaItem[]
  provider: string
}

let directoryCache: { expiresAt: number; urls: string[] } | null = null
let rotation = 0

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').slice(0, 240)
}

function privateIpv4(host: string) {
  const parts = host.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [a, b] = parts
  return a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b !== undefined && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || a === 0
}

function privateIpv6(host: string) {
  const value = host.toLowerCase()
  return value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd')
    || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')
}

function normalizeInstance(raw: string) {
  try {
    const parsed = new URL(raw.trim())
    if (parsed.protocol !== 'https:') return null
    if (parsed.username || parsed.password) return null
    const host = parsed.hostname.toLowerCase()
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return null
    const ipType = isIP(host)
    if ((ipType === 4 && privateIpv4(host)) || (ipType === 6 && privateIpv6(host))) return null
    parsed.pathname = '/'
    parsed.search = ''
    parsed.hash = ''
    return parsed.origin
  } catch {
    return null
  }
}

function customInstances() {
  return (process.env.COBALT_API_URLS ?? '')
    .split(',')
    .map((value) => normalizeInstance(value))
    .filter((value): value is string => Boolean(value))
}

function collectUrls(value: unknown, output: Set<string>, seen = new Set<unknown>()) {
  if (typeof value === 'string') {
    const normalized = normalizeInstance(value)
    if (normalized) output.add(normalized)
    return
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  if (Array.isArray(value)) {
    for (const item of value) collectUrls(item, output, seen)
    return
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'api' || key === 'url' || key.toLowerCase().includes('api')) {
      if (typeof child === 'string') {
        const normalized = normalizeInstance(child)
        if (normalized) output.add(normalized)
      }
    }
    collectUrls(child, output, seen)
  }
}

async function directoryInstances() {
  const now = Date.now()
  if (directoryCache && directoryCache.expiresAt > now) return directoryCache.urls

  const response = await fetch(DIRECTORY_URL, {
    headers: { accept: 'application/json', 'user-agent': 'GhostNexoraBot/1.1' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`cobalt.directory respondió HTTP ${response.status}.`)
  const payload = await response.json() as { data?: unknown }
  const urls = new Set<string>()
  collectUrls(payload.data ?? payload, urls)
  if (!urls.size) throw new Error('cobalt.directory no devolvió instancias utilizables.')

  directoryCache = { urls: [...urls], expiresAt: now + DIRECTORY_CACHE_MS }
  logger.info({ instances: directoryCache.urls.length }, 'cobalt media directory loaded')
  return directoryCache.urls
}

async function candidateInstances() {
  const custom = customInstances()
  let directory: string[] = []
  try {
    directory = await directoryInstances()
  } catch (error) {
    logger.warn({ errorMessage: errorMessage(error) }, 'cobalt media directory unavailable')
  }

  if (directory.length > 1) {
    const offset = rotation % directory.length
    rotation = (rotation + 1) % directory.length
    directory = [...directory.slice(offset), ...directory.slice(0, offset)]
  }

  const seen = new Set<string>()
  const result: Array<{ url: string; custom: boolean }> = []
  for (const url of custom) {
    if (seen.has(url)) continue
    seen.add(url)
    result.push({ url, custom: true })
  }
  for (const url of directory.slice(0, MAX_DIRECTORY_INSTANCES)) {
    if (seen.has(url)) continue
    seen.add(url)
    result.push({ url, custom: false })
  }
  return result
}

function mapPickerType(value?: string): CobaltMediaItem['type'] {
  const type = (value ?? '').toLowerCase()
  if (type === 'photo' || type === 'image') return 'image'
  if (type === 'video') return 'video'
  if (type === 'gif') return 'gif'
  if (type === 'audio') return 'audio'
  return 'unknown'
}

function parseCobaltBody(data: CobaltResponse, provider: string): CobaltMediaResult {
  if (data.status === 'error') {
    const code = data.error?.code ?? 'unknown'
    throw new Error(`Cobalt rechazó la solicitud (${code}).`)
  }

  const items: CobaltMediaItem[] = []

  if (data.status === 'picker' && Array.isArray(data.picker)) {
    for (const entry of data.picker) {
      if (!entry?.url) continue
      items.push({
        type: mapPickerType(entry.type),
        url: entry.url,
        thumb: entry.thumb,
      })
    }
    if (data.audio) {
      items.push({ type: 'audio', url: data.audio, fileName: data.audioFilename })
    }
  } else if ((data.status === 'tunnel' || data.status === 'redirect') && typeof data.url === 'string') {
    const lower = (data.filename ?? data.url).toLowerCase()
    const type: CobaltMediaItem['type'] = /\.(?:jpe?g|png|webp|gif)(?:$|\?)/i.test(lower)
      ? /\.gif(?:$|\?)/i.test(lower) ? 'gif' : 'image'
      : /\.(?:mp3|m4a|ogg|opus|wav)(?:$|\?)/i.test(lower)
        ? 'audio'
        : 'video'
    items.push({ type, url: data.url, fileName: data.filename })
  }

  if (!items.length) {
    throw new Error(`Cobalt respondió con estado ${data.status ?? 'desconocido'} sin media.`)
  }

  return { items, provider }
}

async function tryInstance(instance: { url: string; custom: boolean }, mediaUrl: string): Promise<CobaltMediaResult> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/json',
    'user-agent': 'GhostNexoraBot/1.1',
  }
  const apiKey = process.env.COBALT_API_KEY?.trim()
  if (instance.custom && apiKey) headers.authorization = `Api-Key ${apiKey}`

  const response = await fetch(instance.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      url: mediaUrl,
      downloadMode: 'auto',
      filenameStyle: 'basic',
      videoQuality: '1080',
      disableMetadata: false,
      alwaysProxy: false,
      localProcessing: 'disabled',
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('json')) throw new Error('respuesta no JSON')
  const data = await response.json() as CobaltResponse
  return parseCobaltBody(data, instance.url)
}

/**
 * Resuelve media pública (Instagram, Pinterest, etc.) vía instancias Cobalt.
 * Prioriza COBALT_API_URLS propias; si no hay, prueba directorio comunitario.
 */
export async function resolveCobaltMedia(mediaUrl: string): Promise<CobaltMediaResult> {
  const instances = (await candidateInstances()).slice(0, MAX_PARALLEL_INSTANCES)
  if (!instances.length) throw new Error('No hay instancias Cobalt configuradas ni disponibles.')

  try {
    const result = await Promise.any(instances.map(async (instance) => {
      try {
        return await tryInstance(instance, mediaUrl)
      } catch (error) {
        const detail = errorMessage(error)
        logger.warn({ errorMessage: detail, provider: instance.url }, 'cobalt media provider failed')
        throw new Error(`${new URL(instance.url).hostname}: ${detail.slice(0, 120)}`)
      }
    }))
    logger.info({ provider: result.provider, items: result.items.length }, 'cobalt media resolved')
    return result
  } catch (error) {
    if (error instanceof AggregateError) {
      const failures = error.errors.map((item) => (item instanceof Error ? item.message : String(item))).slice(0, 4)
      throw new Error(`Todas las instancias Cobalt fallaron: ${failures.join(' · ')}`)
    }
    throw error
  }
}
