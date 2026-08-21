import { randomBytes } from 'node:crypto'

export type CommunityYouTubeKind = 'mp3' | 'mp4'

export type CommunityYouTubeResolved = {
  url: string
  provider: string
  fileName?: string
  title?: string
  duration?: number
  thumbnail?: string
  headers?: Record<string, string>
}

const OG_BASE = 'https://api3.apiapi.lat'
const OG_ENDPOINTS = ['https://api5.apiapi.lat', 'https://api.apiapi.lat', 'https://api3.apiapi.lat']
const OG_HEADERS = {
  'content-type': 'application/json',
  origin: 'https://ogmp3.lat',
  referer: 'https://ogmp3.lat/',
  'user-agent': 'Mozilla/5.0 GhostNexoraBot/1.1',
}

function compactError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').slice(0, 180)
}

function validHttpUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function hash() {
  return randomBytes(16).toString('hex')
}

function xorEncode(value: string) {
  let result = ''
  for (let i = 0; i < value.length; i += 1) result += String.fromCharCode(value.charCodeAt(i) ^ 1)
  return result
}

function encodeUrl(value: string) {
  return [...value].map((char) => char.charCodeAt(0)).reverse().join(',')
}

function youtubeId(value: string) {
  try {
    const url = new URL(value)
    if (url.hostname === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0]
    const query = url.searchParams.get('v')
    if (query) return query
    const parts = url.pathname.split('/').filter(Boolean)
    if (['shorts', 'embed', 'live'].includes(parts[0] ?? '')) return parts[1]
  } catch { /* validated by caller */ }
  return undefined
}

async function ogRequest(pathname: string, data: Record<string, unknown>) {
  const errors: string[] = []
  for (const base of OG_ENDPOINTS) {
    try {
      const response = await fetch(`${base}${pathname}`, {
        method: 'POST',
        headers: OG_HEADERS,
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.json() as Record<string, unknown>
    } catch (error) {
      errors.push(`${new URL(base).hostname}: ${compactError(error)}`)
    }
  }
  throw new Error(`OGMP3 no respondió: ${errors.join(' · ')}`)
}

async function ogStatus(jobId: string) {
  return ogRequest(`/${hash()}/status/${encodeURIComponent(xorEncode(jobId))}/${hash()}/`, { data: jobId })
}

export async function resolveOgMp3YouTube(
  youtubeUrl: string,
  kind: CommunityYouTubeKind,
  quality = 720,
): Promise<CommunityYouTubeResolved> {
  const id = youtubeId(youtubeUrl)
  if (!id || id.length !== 11) throw new Error('OGMP3 no pudo identificar el video de YouTube.')

  const audioQuality = '320'
  const videoQuality = String(Math.max(240, Math.min(1080, quality)))
  const payload = {
    data: xorEncode(youtubeUrl),
    format: kind === 'mp3' ? '0' : '1',
    referer: 'https://ogmp3.cc',
    mp3Quality: kind === 'mp3' ? audioQuality : null,
    mp4Quality: kind === 'mp4' ? videoQuality : null,
    userTimeZone: new Date().getTimezoneOffset().toString(),
  }

  const initial = await ogRequest(`/${hash()}/init/${encodeUrl(youtubeUrl)}/${hash()}/`, payload)
  if (initial.le) throw new Error('OGMP3 rechazó el video por duración.')
  if (initial.i === 'blacklisted') throw new Error('OGMP3 alcanzó el límite temporal para esta IP.')
  if (initial.e || initial.i === 'invalid') throw new Error('OGMP3 indicó que el video no está disponible.')

  let completed = initial
  if (initial.s !== 'C') {
    const jobId = typeof initial.i === 'string' ? initial.i : ''
    if (!jobId) throw new Error('OGMP3 no devolvió un identificador de conversión.')
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1_500))
      const status = await ogStatus(jobId)
      if (status.s === 'C') { completed = status; break }
      if (status.s !== 'P') throw new Error('OGMP3 canceló la conversión.')
    }
  }

  if (completed.s !== 'C' || typeof completed.i !== 'string') throw new Error('OGMP3 agotó el tiempo de conversión.')
  const direct = `${OG_BASE}/${hash()}/download/${encodeURIComponent(xorEncode(completed.i))}/${hash()}/`
  return {
    url: direct,
    provider: 'OGMP3',
    title: typeof completed.t === 'string' ? completed.t : undefined,
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    fileName: `${id}.${kind}`,
    headers: {
      origin: 'https://ogmp3.lat',
      referer: 'https://ogmp3.lat/',
    },
  }
}

type JsonRecord = Record<string, unknown>
function record(value: unknown): JsonRecord | undefined {
  return value && typeof value === 'object' ? value as JsonRecord : undefined
}

function extractDirect(payload: JsonRecord) {
  const data = record(payload.data)
  const result = record(payload.result)
  const download = record(result?.download)
  return validHttpUrl(data?.dl)
    ?? validHttpUrl(data?.url)
    ?? validHttpUrl(payload.dl)
    ?? validHttpUrl(payload.url)
    ?? validHttpUrl(download?.url)
    ?? validHttpUrl(result?.url)
}

function extractTitle(payload: JsonRecord) {
  const data = record(payload.data)
  const result = record(payload.result)
  const value = data?.title ?? payload.title ?? result?.title
  return typeof value === 'string' ? value : undefined
}

export async function resolveSiputzxYouTube(youtubeUrl: string, kind: CommunityYouTubeKind): Promise<CommunityYouTubeResolved> {
  const endpoint = new URL(`https://api.siputzx.my.id/api/d/${kind === 'mp3' ? 'ytmp3' : 'ytmp4'}`)
  endpoint.searchParams.set('url', youtubeUrl)
  const response = await fetch(endpoint, {
    headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 GhostNexoraBot/1.1' },
    signal: AbortSignal.timeout(25_000),
  })
  if (!response.ok) throw new Error(`SiputZX respondió HTTP ${response.status}.`)
  const payload = await response.json() as JsonRecord
  const direct = extractDirect(payload)
  if (!direct) throw new Error('SiputZX no devolvió una URL de descarga.')
  return { url: direct, provider: 'SiputZX', title: extractTitle(payload) }
}

export async function resolveApiCausasYouTube(youtubeUrl: string, kind: CommunityYouTubeKind): Promise<CommunityYouTubeResolved> {
  const apiKey = process.env.APICAUSAS_API_KEY?.trim()
  if (!apiKey) throw new Error('ApiCausas no está configurada.')
  const endpoint = new URL('https://rest.apicausas.xyz/api/v1/descargas/youtube')
  endpoint.searchParams.set('apikey', apiKey)
  endpoint.searchParams.set('url', youtubeUrl)
  endpoint.searchParams.set('type', kind === 'mp3' ? 'audio' : 'video')
  const response = await fetch(endpoint, {
    headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 GhostNexoraBot/1.1' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`ApiCausas respondió HTTP ${response.status}.`)
  const payload = await response.json() as JsonRecord
  const data = record(payload.data)
  const download = record(data?.download)
  const direct = validHttpUrl(download?.url)
  if (payload.status !== true || !direct) throw new Error(typeof payload.message === 'string' ? payload.message : 'ApiCausas no devolvió una URL de descarga.')
  const title = typeof data?.title === 'string' ? data.title : undefined
  return { url: direct, provider: 'ApiCausas', title }
}
