import { isIP } from 'node:net'
import { logger } from '../utils/logger.js'

const DIRECTORY_URL = 'https://cobalt.directory/api/working?type=api'
const DIRECTORY_CACHE_MS = 10 * 60_000
const MAX_DIRECTORY_INSTANCES = 8
const REQUEST_TIMEOUT_MS = 20_000

type DirectoryPayload = {
  data?: Record<string, unknown>
}

type CobaltResponse = {
  status?: string
  url?: string
  filename?: string
  error?: { code?: string; context?: unknown }
}

type CobaltInstance = {
  url: string
  custom: boolean
}

export type CobaltResolved = {
  url: string
  fileName?: string
  provider: string
}

let directoryCache: { expiresAt: number; urls: string[] } | null = null
let rotation = 0

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
  return value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')
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

async function directoryInstances() {
  const now = Date.now()
  if (directoryCache && directoryCache.expiresAt > now) return directoryCache.urls

  const response = await fetch(DIRECTORY_URL, {
    headers: { accept: 'application/json', 'user-agent': 'GhostNexoraBot/1.1' },
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error(`cobalt.directory respondió HTTP ${response.status}.`)
  const payload = await response.json() as DirectoryPayload
  const raw = payload.data?.youtube
  const urls = Array.isArray(raw)
    ? raw.map((value) => typeof value === 'string' ? normalizeInstance(value) : null).filter((value): value is string => Boolean(value))
    : []
  if (!urls.length) throw new Error('cobalt.directory no publicó instancias activas para YouTube.')

  directoryCache = { urls: [...new Set(urls)], expiresAt: now + DIRECTORY_CACHE_MS }
  return directoryCache.urls
}

async function candidateInstances(): Promise<CobaltInstance[]> {
  const custom = customInstances()
  let directory: string[] = []
  try {
    directory = await directoryInstances()
  } catch (error) {
    logger.warn({ error }, 'youtube cobalt directory unavailable')
  }

  if (directory.length > 1) {
    const offset = rotation % directory.length
    rotation = (rotation + 1) % directory.length
    directory = [...directory.slice(offset), ...directory.slice(0, offset)]
  }

  const seen = new Set<string>()
  const result: CobaltInstance[] = []
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

function normalizedQuality(value: number) {
  const supported = [144, 240, 360, 480, 720, 1080, 1440, 2160, 4320]
  const target = Math.max(144, Math.min(4320, Number.isFinite(value) ? value : 720))
  return String([...supported].reverse().find((quality) => quality <= target) ?? 720)
}

function cobaltError(data: CobaltResponse) {
  const code = data.error?.code
  return code ? `Cobalt rechazó la solicitud (${code}).` : `Cobalt respondió con estado ${data.status ?? 'desconocido'}.`
}

async function tryInstance(instance: CobaltInstance, youtubeUrl: string, kind: 'mp3' | 'mp4', requestedQuality: number): Promise<CobaltResolved> {
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
      url: youtubeUrl,
      audioBitrate: '128',
      audioFormat: 'mp3',
      downloadMode: kind === 'mp3' ? 'audio' : 'auto',
      filenameStyle: 'pretty',
      videoQuality: normalizedQuality(requestedQuality),
      disableMetadata: false,
      alwaysProxy: true,
      localProcessing: 'disabled',
      youtubeVideoCodec: 'h264',
      youtubeVideoContainer: 'mp4',
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('json')) throw new Error('respuesta no JSON')
  const data = await response.json() as CobaltResponse
  if (data.status !== 'tunnel' || typeof data.url !== 'string') throw new Error(cobaltError(data))

  const tunnel = new URL(data.url)
  const provider = new URL(instance.url)
  if (tunnel.protocol !== 'https:' || tunnel.origin !== provider.origin) {
    throw new Error('la instancia devolvió un túnel fuera de su propio origen')
  }

  return { url: tunnel.toString(), fileName: data.filename, provider: instance.url }
}

export async function resolveCobaltYouTube(youtubeUrl: string, kind: 'mp3' | 'mp4', requestedQuality = 720): Promise<CobaltResolved> {
  const instances = await candidateInstances()
  if (!instances.length) throw new Error('No hay instancias Cobalt disponibles.')

  const failures: string[] = []
  for (const instance of instances) {
    try {
      const result = await tryInstance(instance, youtubeUrl, kind, requestedQuality)
      logger.info({ provider: result.provider, kind }, 'youtube cobalt provider resolved')
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push(`${new URL(instance.url).hostname}: ${message.replace(/\s+/g, ' ').slice(0, 100)}`)
      logger.warn({ error, provider: instance.url, kind }, 'youtube cobalt provider failed')
    }
  }

  throw new Error(`Todas las instancias Cobalt fallaron: ${failures.slice(0, 4).join(' · ')}`)
}
