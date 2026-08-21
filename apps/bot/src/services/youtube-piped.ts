import { createWriteStream } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { isIP } from 'node:net'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import os from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'

const DEFAULT_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.nosebs.ru',
  'https://piped-api.privacy.com.de',
  'https://pipedapi.adminforge.de',
  'https://api.piped.yt',
  'https://pipedapi.drgns.space',
  'https://pipedapi.owo.si',
  'https://pipedapi.ducks.party',
  'https://api.piped.private.coffee',
] as const

const MAX_PARALLEL = 6
const API_TIMEOUT_MS = 12_000

type PipedStream = {
  bitrate?: number
  codec?: string
  format?: string
  height?: number
  mimeType?: string
  quality?: string
  url?: string
  videoOnly?: boolean
}

type PipedResponse = {
  audioStreams?: PipedStream[]
  videoStreams?: PipedStream[]
  title?: string
  uploader?: string
  duration?: number
  views?: number
  likes?: number
  thumbnailUrl?: string
  livestream?: boolean
}

export type PipedMediaInfo = {
  title: string
  uploader?: string
  duration?: number
  views?: number
  likes?: number
  thumbnail?: string
  webpageUrl?: string
}

export type PipedDownloadResult = {
  filePath: string
  fileName: string
  size: number
  info: PipedMediaInfo
  cleanup: () => Promise<void>
}

function privateIpv4(host: string) {
  const parts = host.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [a, b] = parts
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b !== undefined && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

function privateIpv6(host: string) {
  const value = host.toLowerCase()
  return value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd') || /^fe[89ab]/.test(value)
}

function safeHttpsUrl(value: string) {
  const parsed = new URL(value)
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('URL externa no segura.')
  const host = parsed.hostname.toLowerCase()
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.localhost')) throw new Error('Host externo no válido.')
  const ip = isIP(host)
  if ((ip === 4 && privateIpv4(host)) || (ip === 6 && privateIpv6(host))) throw new Error('Host externo privado no permitido.')
  return parsed.toString()
}

function youtubeVideoId(input: string) {
  const url = new URL(input)
  if (url.hostname === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0]
  const query = url.searchParams.get('v')
  if (query) return query
  const parts = url.pathname.split('/').filter(Boolean)
  if (['shorts', 'embed', 'live'].includes(parts[0] ?? '')) return parts[1]
  return undefined
}

function safeFileBase(value: string) {
  const clean = value.normalize('NFKD').replace(/[^a-zA-Z0-9._ -]+/g, '').trim().replace(/\s+/g, '-')
  return clean.slice(0, 80) || 'youtube'
}

function apiInstances() {
  const custom = (process.env.PIPED_API_URLS ?? '').split(',').map((value) => value.trim()).filter(Boolean)
  const result: string[] = []
  for (const raw of [...custom, ...DEFAULT_INSTANCES]) {
    try {
      const parsed = new URL(raw)
      if (parsed.protocol !== 'https:') continue
      const normalized = parsed.origin
      if (!result.includes(normalized)) result.push(normalized)
    } catch { /* ignore malformed custom instances */ }
  }
  return result.slice(0, MAX_PARALLEL)
}

async function requestInstance(instance: string, videoId: string) {
  const endpoint = `${instance}/streams/${encodeURIComponent(videoId)}`
  const response = await fetch(endpoint, {
    headers: { accept: 'application/json', 'user-agent': 'GhostNexoraBot/1.1' },
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('json')) throw new Error('respuesta no JSON')
  const payload = await response.json() as PipedResponse
  if (payload.livestream) throw new Error('los directos no se descargan mediante Piped')
  return { instance, payload }
}

async function resolvePiped(input: string) {
  const videoId = youtubeVideoId(input)
  if (!videoId) throw new Error('No pude identificar el ID del video de YouTube.')
  const instances = apiInstances()
  if (!instances.length) throw new Error('No hay instancias Piped configuradas.')

  try {
    return await Promise.any(instances.map(async (instance) => {
      try {
        const result = await requestInstance(instance, videoId)
        if (!(result.payload.audioStreams?.length || result.payload.videoStreams?.length)) throw new Error('sin streams')
        return result
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.warn({ provider: instance, errorMessage }, 'youtube piped provider failed')
        throw new Error(`${new URL(instance).hostname}: ${errorMessage}`)
      }
    }))
  } catch (error) {
    if (error instanceof AggregateError) {
      const details = error.errors.map((item) => item instanceof Error ? item.message : String(item)).slice(0, 4)
      throw new Error(`Piped no pudo resolver el video: ${details.join(' · ')}`)
    }
    throw error
  }
}

function mediaInfo(payload: PipedResponse, input: string): PipedMediaInfo {
  return {
    title: payload.title?.trim() || 'YouTube',
    uploader: payload.uploader?.trim() || undefined,
    duration: Number.isFinite(payload.duration) ? payload.duration : undefined,
    views: Number.isFinite(payload.views) ? payload.views : undefined,
    likes: Number.isFinite(payload.likes) ? payload.likes : undefined,
    thumbnail: payload.thumbnailUrl ? safeHttpsUrl(payload.thumbnailUrl) : undefined,
    webpageUrl: input,
  }
}

async function downloadStream(url: string, target: string) {
  const safeUrl = safeHttpsUrl(url)
  const response = await fetch(safeUrl, {
    redirect: 'follow',
    headers: { 'user-agent': 'Mozilla/5.0 GhostNexoraBot/1.1', accept: '*/*' },
    signal: AbortSignal.timeout(10 * 60_000),
  })
  if (!response.ok || !response.body) throw new Error(`El proxy Piped respondió HTTP ${response.status}.`)
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > config.maxDownloadBytes) throw new Error(`El archivo supera el límite configurado de ${config.maxDownloadMb} MB.`)

  let size = 0
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length
      if (size > config.maxDownloadBytes) callback(new Error(`El archivo supera el límite configurado de ${config.maxDownloadMb} MB.`))
      else callback(null, chunk)
    },
  })
  await pipeline(response.body, limiter, createWriteStream(target))
  if (size <= 0) throw new Error('El proxy Piped devolvió un archivo vacío.')
  return size
}

function chooseAudio(streams: PipedStream[]) {
  return streams
    .filter((item) => !item.videoOnly && typeof item.url === 'string' && /^audio\//i.test(item.mimeType ?? ''))
    .sort((a, b) => Number(b.bitrate ?? 0) - Number(a.bitrate ?? 0))[0]
}

function chooseVideo(streams: PipedStream[], quality: number) {
  const target = Math.max(144, Math.min(2160, Number.isFinite(quality) ? quality : 720))
  const compatible = streams.filter((item) =>
    !item.videoOnly
    && typeof item.url === 'string'
    && /video\/mp4/i.test(item.mimeType ?? '')
    && (!item.codec || /^avc1/i.test(item.codec)),
  )
  const within = compatible.filter((item) => Number(item.height ?? 0) > 0 && Number(item.height) <= target)
  return (within.length ? within : compatible).sort((a, b) => Number(b.height ?? 0) - Number(a.height ?? 0))[0]
}

export async function downloadYouTubeViaPiped(input: string, kind: 'mp3' | 'mp4', quality = 720): Promise<PipedDownloadResult> {
  const { instance, payload } = await resolvePiped(input)
  const info = mediaInfo(payload, input)
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-piped-'))
  try {
    if (kind === 'mp3') {
      const stream = chooseAudio(payload.audioStreams ?? [])
      if (!stream?.url) throw new Error('Piped no ofreció un stream de audio utilizable.')
      const sourceExt = /webm/i.test(stream.mimeType ?? '') ? 'webm' : 'm4a'
      const source = path.join(dir, `source.${sourceExt}`)
      const output = path.join(dir, `${safeFileBase(info.title)}.mp3`)
      await downloadStream(stream.url, source)
      await execa('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', source, '-vn', '-codec:a', 'libmp3lame', '-b:a', '192k', output], { timeout: 5 * 60_000 })
      const outputStat = await stat(output)
      if (outputStat.size <= 0) throw new Error('FFmpeg produjo un MP3 vacío.')
      if (outputStat.size > config.maxDownloadBytes) throw new Error(`El archivo supera el límite configurado de ${config.maxDownloadMb} MB.`)
      await rm(source, { force: true }).catch(() => undefined)
      logger.info({ provider: instance, kind, size: outputStat.size }, 'youtube piped provider completed')
      return { filePath: output, fileName: path.basename(output), size: outputStat.size, info, cleanup: () => rm(dir, { recursive: true, force: true }) }
    }

    const stream = chooseVideo(payload.videoStreams ?? [], quality)
    if (!stream?.url) throw new Error('Piped no ofreció un MP4 combinado compatible; se usará el siguiente proveedor.')
    const output = path.join(dir, `${safeFileBase(info.title)}.mp4`)
    const size = await downloadStream(stream.url, output)
    logger.info({ provider: instance, kind, size }, 'youtube piped provider completed')
    return { filePath: output, fileName: path.basename(output), size, info, cleanup: () => rm(dir, { recursive: true, force: true }) }
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
}
