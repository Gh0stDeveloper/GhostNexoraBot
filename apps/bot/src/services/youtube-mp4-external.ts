import { logger } from '../utils/logger.js'

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
}

type PipedResponse = {
  videoStreams?: PipedStream[]
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

async function requestInstance(instance: string, videoId: string, quality: number): Promise<ExternalMp4Resolved> {
  const response = await fetch(`${instance}/streams/${encodeURIComponent(videoId)}`, {
    headers: { accept: 'application/json', 'user-agent': 'GhostNexoraBot/1.1' },
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('json')) throw new Error('respuesta no JSON')
  const data = await response.json() as PipedResponse
  if (data.livestream) throw new Error('directo no soportado')
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

export async function resolveExternalYouTubeMp4(youtubeUrl: string, quality = 720): Promise<ExternalMp4Resolved> {
  const id = youtubeVideoId(youtubeUrl)
  if (!id) throw new Error('No pude identificar el ID del video.')
  const providers = instances()
  if (!providers.length) throw new Error('No hay instancias Piped disponibles.')
  try {
    const result = await Promise.any(providers.map(async (provider) => {
      try {
        return await requestInstance(provider, id, quality)
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
      throw new Error(`Piped no pudo resolver MP4: ${details.join(' · ')}`)
    }
    throw error
  }
}
