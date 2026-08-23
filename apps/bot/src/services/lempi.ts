import { createWriteStream } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'

const BASE = (process.env.LEMPI_BASE_URL?.trim() || 'https://api.lempi.lat').replace(/\/$/, '')
const key = () => process.env.LEMPI_API_KEY?.trim() ?? ''

type Kind = 'audio' | 'video' | 'facebook'
type EndpointHit = { direct?: string; response?: Response; payload: unknown }

function normalizeMediaUrl(value: string) {
  try {
    if (/^https?:\/\//i.test(value)) return new URL(value).toString()
    if (value.startsWith('/')) return new URL(value, `${BASE}/`).toString()
  } catch { /* ignore malformed URLs */ }
  return null
}

function urlsFrom(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 8 || value === null || value === undefined) return out
  if (typeof value === 'string') {
    const normalized = normalizeMediaUrl(value.trim())
    if (normalized) out.push(normalized)
    return out
  }
  if (Array.isArray(value)) {
    for (const item of value) urlsFrom(item, out, depth + 1)
    return out
  }
  if (typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) urlsFrom(child, out, depth + 1)
  }
  return out
}

function payloadMessage(value: unknown) {
  if (!value || typeof value !== 'object') return undefined
  const item = value as Record<string, unknown>
  const raw = item.message ?? item.error ?? item.msg ?? item.detail
  return typeof raw === 'string' ? raw.slice(0, 240) : undefined
}

function scoreUrl(url: string, kind: Kind) {
  const lower = url.toLowerCase()
  let score = 0
  if (kind === 'audio') {
    if (/\.mp3(?:$|[?#])/.test(lower)) score += 120
    if (/\.(?:m4a|aac)(?:$|[?#])/.test(lower)) score += 90
    if (/audio|mp3|m4a/.test(lower)) score += 25
  } else {
    if (/\.mp4(?:$|[?#])/.test(lower)) score += 120
    if (/\.m3u8(?:$|[?#])/.test(lower)) score += 70
    if (/video|mp4|720|1080|download|cdn|media/.test(lower)) score += 25
  }
  if (/thumbnail|image|jpg|jpeg|webp|avatar/.test(lower)) score -= 150
  if (/youtube\.com|youtu\.be|facebook\.com|fb\.watch/.test(lower)) score -= 80
  return score
}

function endpointCandidates(kind: Kind) {
  const custom = kind === 'audio'
    ? process.env.LEMPI_YOUTUBE_AUDIO_ENDPOINT
    : kind === 'video'
      ? process.env.LEMPI_YOUTUBE_VIDEO_ENDPOINT
      : process.env.LEMPI_FACEBOOK_ENDPOINT

  // Rutas actuales documentadas por API Lempi. Los alias antiguos quedan al final
  // solo como compatibilidad por si una instalación usa un proxy/versión previa.
  const defaults = kind === 'audio'
    ? ['/dl/yta', '/d/youtube', '/d/ytmp3', '/d/ytaudio']
    : kind === 'video'
      ? ['/dl/ytv', '/d/youtube', '/d/ytmp4', '/d/ytvideo']
      : ['/dl/facebook', '/d/facebook', '/d/fbdl']

  return [...new Set([custom?.trim(), ...defaults].filter((value): value is string => Boolean(value)))]
}

function addParams(target: URL, sourceUrl: string, kind: Kind, quality?: number) {
  target.searchParams.set('apikey', key())
  target.searchParams.set('url', sourceUrl)
  // /dl/yta y /dl/ytv ya definen el formato en el propio endpoint.
  // No enviamos type/format para no depender de parámetros no documentados.
  if (kind === 'video' && quality) target.searchParams.set('quality', String(quality))
}

async function parseResponse(response: Response, endpoint: string, target: URL, kind: Kind): Promise<EndpointHit | null> {
  logger.info({ endpoint, status: response.status, contentType: response.headers.get('content-type') ?? '' }, 'Lempi endpoint response')
  if (response.status === 404) return null
  if (!response.ok) {
    const detail = await response.clone().json().catch(() => null) as unknown
    const message = payloadMessage(detail)
    throw new Error(`API Lempi respondió HTTP ${response.status} en ${endpoint}${message ? `: ${message}` : '.'}`)
  }

  const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
  if (contentType.includes('audio/') || contentType.includes('video/') || contentType.includes('application/octet-stream')) {
    if (!response.body) throw new Error('API Lempi respondió un archivo vacío.')
    return { response, payload: null }
  }

  if (contentType.includes('json')) {
    const payload = await response.json() as unknown
    if (payload && typeof payload === 'object') {
      const record = payload as Record<string, unknown>
      if (record.status === false || record.success === false || record.ok === false) {
        throw new Error(`API Lempi rechazó la solicitud${payloadMessage(payload) ? `: ${payloadMessage(payload)}` : '.'}`)
      }
    }
    const candidates = [...new Set(urlsFrom(payload))]
      .map((url) => ({ url, score: scoreUrl(url, kind) }))
      .filter((item) => item.score > -60)
      .sort((a, b) => b.score - a.score)
    if (!candidates.length) throw new Error(`API Lempi no devolvió una URL multimedia utilizable en ${endpoint}.`)
    return { direct: candidates[0]!.url, payload }
  }

  if (response.url && response.url !== target.toString()) return { direct: response.url, payload: null }

  const text = await response.text().catch(() => '')
  const candidates = [...new Set(urlsFrom(text))]
  if (candidates.length) return { direct: candidates.sort((a, b) => scoreUrl(b, kind) - scoreUrl(a, kind))[0], payload: text }
  throw new Error(`API Lempi respondió un formato inesperado en ${endpoint}.`)
}

async function callEndpoint(endpoint: string, sourceUrl: string, kind: Kind, quality?: number) {
  const apiKey = key()
  if (!apiKey) throw new Error('LEMPI_API_KEY no está configurada en el servidor.')

  const headers = {
    accept: 'application/json,audio/*,video/*,application/octet-stream,*/*;q=0.6',
    'content-type': 'application/json',
    'user-agent': 'GhostNexoraBot/2.2',
    'x-api-key': apiKey,
  }

  const target = new URL(endpoint, `${BASE}/`)
  addParams(target, sourceUrl, kind, quality)
  let response = await fetch(target, {
    method: 'GET',
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
  })

  // El playground actual de Lempi muestra GET. Conservamos POST únicamente
  // como compatibilidad si un endpoint personalizado responde Method Not Allowed.
  if (response.status === 405) {
    const postTarget = new URL(endpoint, `${BASE}/`)
    postTarget.searchParams.set('apikey', apiKey)
    response = await fetch(postTarget, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        url: sourceUrl,
        ...(kind === 'video' && quality ? { quality } : {}),
      }),
      redirect: 'follow',
      signal: AbortSignal.timeout(60_000),
    })
    return parseResponse(response, `${endpoint} [POST]`, postTarget, kind)
  }

  return parseResponse(response, endpoint, target, kind)
}

export async function resolveLempi(sourceUrl: string, kind: Kind, quality?: number) {
  let lastError: unknown
  for (const endpoint of endpointCandidates(kind)) {
    try {
      const result = await callEndpoint(endpoint, sourceUrl, kind, quality)
      if (result) return result
    } catch (error) {
      lastError = error
      logger.warn({ error, endpoint, kind }, 'Lempi endpoint attempt failed')
    }
  }
  throw lastError instanceof Error ? lastError : new Error('No hay un endpoint Lempi disponible para esta descarga.')
}

function safeName(kind: Kind) {
  const ext = kind === 'audio' ? 'mp3' : 'mp4'
  return `ghostnexora-${kind}-${Date.now()}.${ext}`
}

async function streamToFile(response: Response, filePath: string) {
  if (!response.ok || !response.body) throw new Error(`El servidor multimedia respondió HTTP ${response.status}.`)
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > config.maxDownloadBytes) throw new Error(`El archivo supera el límite de ${config.maxDownloadMb} MB.`)
  let size = 0
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length
      if (size > config.maxDownloadBytes) callback(new Error(`El archivo supera el límite de ${config.maxDownloadMb} MB.`))
      else callback(null, chunk)
    },
  })
  await pipeline(response.body, limiter, createWriteStream(filePath, { mode: 0o600 }))
}

export async function downloadLempi(sourceUrl: string, kind: Kind, quality?: number) {
  const resolved = await resolveLempi(sourceUrl, kind, quality)
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-lempi-'))
  const fileName = safeName(kind)
  const filePath = path.join(dir, fileName)
  try {
    const response = resolved.response ?? await fetch(resolved.direct!, {
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 GhostNexoraBot/2.2', accept: '*/*' },
      signal: AbortSignal.timeout(30 * 60_000),
    })
    await streamToFile(response, filePath)
    const finalSize = (await stat(filePath)).size
    if (finalSize <= 0) throw new Error('La descarga de Lempi quedó vacía.')
    return {
      filePath,
      fileName,
      size: finalSize,
      payload: resolved.payload,
      cleanup: () => rm(dir, { recursive: true, force: true }),
    }
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
}
