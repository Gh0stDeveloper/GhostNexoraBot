import { createWriteStream } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { config } from '../config.js'

const BASE = (process.env.LEMPI_BASE_URL?.trim() || 'https://api.lempi.lat').replace(/\/$/, '')
const key = () => process.env.LEMPI_API_KEY?.trim() ?? ''

type Kind = 'audio' | 'video' | 'facebook'

function urlsFrom(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 8 || value === null || value === undefined) return out
  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value)) out.push(value)
    return out
  }
  if (Array.isArray(value)) {
    for (const item of value) urlsFrom(item, out, depth + 1)
    return out
  }
  if (typeof value === 'object') for (const child of Object.values(value as Record<string, unknown>)) urlsFrom(child, out, depth + 1)
  return out
}

function scoreUrl(url: string, kind: Kind) {
  const lower = url.toLowerCase()
  let score = 0
  if (kind === 'audio') {
    if (/\.mp3(?:$|[?#])/.test(lower)) score += 100
    if (/\.(?:m4a|aac)(?:$|[?#])/.test(lower)) score += 70
    if (/audio|mp3|m4a/.test(lower)) score += 20
  } else {
    if (/\.mp4(?:$|[?#])/.test(lower)) score += 100
    if (/\.m3u8(?:$|[?#])/.test(lower)) score += 60
    if (/video|mp4|720|1080/.test(lower)) score += 20
  }
  if (/thumbnail|image|jpg|jpeg|webp|avatar/.test(lower)) score -= 100
  return score
}

function endpointCandidates(kind: Kind) {
  const custom = kind === 'audio' ? process.env.LEMPI_YOUTUBE_AUDIO_ENDPOINT : kind === 'video' ? process.env.LEMPI_YOUTUBE_VIDEO_ENDPOINT : process.env.LEMPI_FACEBOOK_ENDPOINT
  const defaults = kind === 'audio'
    ? ['/d/youtube', '/d/ytmp3', '/d/ytaudio']
    : kind === 'video'
      ? ['/d/youtube', '/d/ytmp4', '/d/ytvideo']
      : ['/d/facebook', '/d/fbdl']
  return [...new Set([custom?.trim(), ...defaults].filter((value): value is string => Boolean(value)))]
}

async function callEndpoint(endpoint: string, sourceUrl: string, kind: Kind, quality?: number) {
  const apiKey = key()
  if (!apiKey) throw new Error('LEMPI_API_KEY no está configurada en el servidor.')
  const target = new URL(endpoint, `${BASE}/`)
  target.searchParams.set('url', sourceUrl)
  target.searchParams.set('apikey', apiKey)
  if (kind === 'audio') {
    target.searchParams.set('type', 'audio')
    target.searchParams.set('format', 'mp3')
  } else if (kind === 'video') {
    target.searchParams.set('type', 'video')
    target.searchParams.set('format', 'mp4')
    if (quality) target.searchParams.set('quality', String(quality))
  }
  const response = await fetch(target, {
    headers: { accept: 'application/json,*/*;q=0.8', 'user-agent': 'GhostNexoraBot/2.0' },
    signal: AbortSignal.timeout(60_000),
  })
  if (response.status === 404 || response.status === 405) return null
  if (!response.ok) throw new Error(`API Lempi respondió HTTP ${response.status}.`)
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('json')) {
    const direct = response.url
    if (direct && direct !== target.toString()) return { direct, payload: null as unknown }
    throw new Error('API Lempi respondió un formato inesperado.')
  }
  const payload = await response.json() as unknown
  const candidates = [...new Set(urlsFrom(payload))]
    .map((url) => ({ url, score: scoreUrl(url, kind) }))
    .filter((item) => item.score > -50)
    .sort((a, b) => b.score - a.score)
  if (!candidates.length) throw new Error('API Lempi no devolvió una URL multimedia utilizable.')
  return { direct: candidates[0]!.url, payload }
}

export async function resolveLempi(sourceUrl: string, kind: Kind, quality?: number) {
  let lastError: unknown
  for (const endpoint of endpointCandidates(kind)) {
    try {
      const result = await callEndpoint(endpoint, sourceUrl, kind, quality)
      if (result) return result
    } catch (error) { lastError = error }
  }
  throw lastError instanceof Error ? lastError : new Error('No hay un endpoint Lempi disponible para esta descarga.')
}

function safeName(kind: Kind) {
  const ext = kind === 'audio' ? 'mp3' : 'mp4'
  return `ghostnexora-${kind}-${Date.now()}.${ext}`
}

export async function downloadLempi(sourceUrl: string, kind: Kind, quality?: number) {
  const { direct, payload } = await resolveLempi(sourceUrl, kind, quality)
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-lempi-'))
  const fileName = safeName(kind)
  const filePath = path.join(dir, fileName)
  try {
    const response = await fetch(direct, {
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 GhostNexoraBot/2.0', accept: '*/*' },
      signal: AbortSignal.timeout(30 * 60_000),
    })
    if (!response.ok || !response.body) throw new Error(`El CDN de Lempi respondió HTTP ${response.status}.`)
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
    const finalSize = (await stat(filePath)).size
    if (finalSize <= 0) throw new Error('La descarga de Lempi quedó vacía.')
    return { filePath, fileName, size: finalSize, payload, cleanup: () => rm(dir, { recursive: true, force: true }) }
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
}
