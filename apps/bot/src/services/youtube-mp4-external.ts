import { logger } from '../utils/logger.js'
import {
  resolveApiCausasYouTube,
  resolveOgMp3YouTube,
  resolveSiputzxYouTube,
  type CommunityYouTubeKind,
  type CommunityYouTubeResolved,
} from './youtube-community-providers.js'

const INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.nosebs.ru',
  'https://piped-api.privacy.com.de',
  'https://pipedapi.adminforge.de',
  'https://api.piped.yt',
  'https://pipedapi.drgns.space',
  'https://api.piped.private.coffee',
] as const

const MAX_PARALLEL = 6

type PipedStream = {
  codec?: string
  height?: number
  mimeType?: string
  url?: string
  videoOnly?: boolean
  bitrate?: number
  format?: string
  quality?: string
}

type PipedResponse = {
  videoStreams?: PipedStream[]
  audioStreams?: PipedStream[]
  title?: string
  uploader?: string
  duration?: number
  thumbnailUrl?: string
  livestream?: boolean
}

export type ExternalMp4Resolved = {
  url: string
  title?: string
  author?: string
  duration?: number
  thumbnail?: string
  fileName?: string
  provider: string
}

export type ExternalAudioResolved = {
  url: string
  title?: string
  author?: string
  duration?: number
  thumbnail?: string
  sourceExtension: 'm4a' | 'webm' | 'bin'
  provider: string
}

function compactError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').slice(0, 200)
}

async function resolveCommunity(youtubeUrl: string, kind: CommunityYouTubeKind, quality = 720): Promise<CommunityYouTubeResolved> {
  const attempts: Array<{ name: string; run: () => Promise<CommunityYouTubeResolved> }> = [
    { name: 'OGMP3', run: () => resolveOgMp3YouTube(youtubeUrl, kind, quality) },
    { name: 'SiputZX', run: () => resolveSiputzxYouTube(youtubeUrl, kind) },
  ]
  if (process.env.APICAUSAS_API_KEY?.trim()) {
    attempts.splice(1, 0, { name: 'ApiCausas', run: () => resolveApiCausasYouTube(youtubeUrl, kind) })
  }

  try {
    return await Promise.any(attempts.map(async ({ name, run }) => {
      try {
        const result = await run()
        logger.info({ provider: name, kind }, 'youtube community provider resolved')
        return result
      } catch (error) {
        logger.warn({ provider: name, kind, errorMessage: compactError(error) }, 'youtube community provider failed')
        throw new Error(`${name}: ${compactError(error)}`)
      }
    }))
  } catch (error) {
    if (error instanceof AggregateError) {
      const details = error.errors.map((item) => item instanceof Error ? item.message : String(item)).slice(0, 4)
      throw new Error(`proveedores comunitarios agotados: ${details.join(' · ')}`)
    }
    throw error
  }
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

function instances() {
  const custom = (process.env.PIPED_API_URLS ?? '').split(',').map((value) => value.trim()).filter(Boolean)
  const values: string[] = []
  for (const raw of [...custom, ...INSTANCES]) {
    try {
      const parsed = new URL(raw)
      if (parsed.protocol !== 'https:') continue
      if (!values.includes(parsed.origin)) values.push(parsed.origin)
    } catch { /* ignore malformed custom instance */ }
  }
  return values.slice(0, MAX_PARALLEL)
}

function chooseVideo(streams: PipedStream[], requestedQuality: number) {
  const target = Math.max(144, Math.min(2160, Number.isFinite(requestedQuality) ? requestedQuality : 720))
  const compatible = streams.filter((item) =>
    !item.videoOnly
    && typeof item.url === 'string'
    && /^https:\/\//i.test(item.url)
    && /video\/mp4/i.test(item.mimeType ?? '')
    && (!item.codec || /^avc1/i.test(item.codec)),
  )
  const within = compatible.filter((item) => Number(item.height ?? 0) > 0 && Number(item.height) <= target)
  return (within.length ? within : compatible).sort((a, b) => Number(b.height ?? 0) - Number(a.height ?? 0))[0]
}

function chooseAudio(streams: PipedStream[]) {
  const compatible = streams.filter((item) =>
    typeof item.url === 'string'
    && /^https:\/\//i.test(item.url)
    && (
      /^audio\//i.test(item.mimeType ?? '')
      || /^(?:m4a|webm|mp4)$/i.test(item.format ?? '')
    ),
  )
  return compatible.sort((a, b) => {
    const aMp4 = /audio\/mp4|m4a|mp4/i.test(`${a.mimeType ?? ''} ${a.format ?? ''}`) ? 1 : 0
    const bMp4 = /audio\/mp4|m4a|mp4/i.test(`${b.mimeType ?? ''} ${b.format ?? ''}`) ? 1 : 0
    if (aMp4 !== bMp4) return bMp4 - aMp4
    return Number(b.bitrate ?? 0) - Number(a.bitrate ?? 0)
  })[0]
}

function audioExtension(stream: PipedStream): ExternalAudioResolved['sourceExtension'] {
  const descriptor = `${stream.mimeType ?? ''} ${stream.format ?? ''}`.toLowerCase()
  if (descriptor.includes('mp4') || descriptor.includes('m4a')) return 'm4a'
  if (descriptor.includes('webm')) return 'webm'
  return 'bin'
}

async function fetchStreams(instance: string, videoId: string) {
  const response = await fetch(`${instance}/streams/${encodeURIComponent(videoId)}`, {
    headers: { accept: 'application/json', 'user-agent': 'GhostNexoraBot/1.1' },
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('json')) throw new Error('respuesta no JSON')
  const data = await response.json() as PipedResponse
  if (data.livestream) throw new Error('directo no soportado')
  return data
}

async function requestVideoInstance(instance: string, videoId: string, quality: number): Promise<ExternalMp4Resolved> {
  const data = await fetchStreams(instance, videoId)
  const stream = chooseVideo(data.videoStreams ?? [], quality)
  if (!stream?.url) throw new Error('sin MP4 combinado H.264')
  const direct = new URL(stream.url)
  if (direct.protocol !== 'https:') throw new Error('stream no HTTPS')
  const title = data.title?.trim() || undefined
  return {
    url: direct.toString(),
    title,
    author: data.uploader?.trim() || undefined,
    duration: Number.isFinite(data.duration) ? data.duration : undefined,
    thumbnail: data.thumbnailUrl,
    fileName: `${safeFileBase(title || videoId)}.mp4`,
    provider: instance,
  }
}

async function requestAudioInstance(instance: string, videoId: string): Promise<ExternalAudioResolved> {
  const data = await fetchStreams(instance, videoId)
  const stream = chooseAudio(data.audioStreams ?? [])
  if (!stream?.url) throw new Error('sin stream de audio proxy')
  const direct = new URL(stream.url)
  if (direct.protocol !== 'https:') throw new Error('stream de audio no HTTPS')
  return {
    url: direct.toString(),
    title: data.title?.trim() || undefined,
    author: data.uploader?.trim() || undefined,
    duration: Number.isFinite(data.duration) ? data.duration : undefined,
    thumbnail: data.thumbnailUrl,
    sourceExtension: audioExtension(stream),
    provider: instance,
  }
}

export async function resolveExternalYouTubeMp4(youtubeUrl: string, quality = 720): Promise<ExternalMp4Resolved> {
  let communityError: unknown
  try {
    const direct = await resolveCommunity(youtubeUrl, 'mp4', quality)
    return {
      url: direct.url,
      title: direct.title,
      duration: direct.duration,
      thumbnail: direct.thumbnail,
      fileName: direct.fileName,
      provider: direct.provider,
    }
  } catch (error) {
    communityError = error
    logger.warn({ errorMessage: compactError(error), quality }, 'youtube community mp4 providers exhausted; trying piped')
  }

  const id = youtubeVideoId(youtubeUrl)
  if (!id) throw new Error('No pude identificar el ID del video.')
  const providers = instances()
  if (!providers.length) throw new Error(`No hay instancias Piped disponibles. ${compactError(communityError)}`)
  try {
    const result = await Promise.any(providers.map(async (provider) => {
      try {
        return await requestVideoInstance(provider, id, quality)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        logger.warn({ provider, errorMessage: detail }, 'youtube piped mp4 provider failed')
        throw new Error(`${new URL(provider).hostname}: ${detail}`)
      }
    }))
    logger.info({ provider: result.provider, quality }, 'youtube external mp4 provider resolved')
    return result
  } catch (error) {
    if (error instanceof AggregateError) {
      const details = error.errors.map((item) => item instanceof Error ? item.message : String(item)).slice(0, 4)
      throw new Error(`Comunidad: ${compactError(communityError)} · Piped: ${details.join(' · ')}`)
    }
    throw error
  }
}

export async function resolveExternalYouTubeAudio(youtubeUrl: string): Promise<ExternalAudioResolved> {
  let communityError: unknown
  try {
    const direct = await resolveCommunity(youtubeUrl, 'mp3', 320)
    return {
      url: direct.url,
      title: direct.title,
      duration: direct.duration,
      thumbnail: direct.thumbnail,
      sourceExtension: 'bin',
      provider: direct.provider,
    }
  } catch (error) {
    communityError = error
    logger.warn({ errorMessage: compactError(error) }, 'youtube community audio providers exhausted; trying piped')
  }

  const id = youtubeVideoId(youtubeUrl)
  if (!id) throw new Error('No pude identificar el ID del video.')
  const providers = instances()
  if (!providers.length) throw new Error(`No hay instancias Piped disponibles. ${compactError(communityError)}`)
  try {
    const result = await Promise.any(providers.map(async (provider) => {
      try {
        return await requestAudioInstance(provider, id)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        logger.warn({ provider, errorMessage: detail }, 'youtube piped audio provider failed')
        throw new Error(`${new URL(provider).hostname}: ${detail}`)
      }
    }))
    logger.info({ provider: result.provider }, 'youtube external audio stream resolved')
    return result
  } catch (error) {
    if (error instanceof AggregateError) {
      const details = error.errors.map((item) => item instanceof Error ? item.message : String(item)).slice(0, 4)
      throw new Error(`Comunidad: ${compactError(communityError)} · Piped: ${details.join(' · ')}`)
    }
    throw error
  }
}
