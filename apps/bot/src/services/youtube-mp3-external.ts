import { logger } from '../utils/logger.js'

const ENDPOINT = 'https://ytmp3.ge/api/convert'

type Ytmp3GeResponse = {
  success?: boolean
  videoId?: string
  title?: string
  thumbnail?: string
  duration?: string
  viewCount?: number
  size?: number
  downloadUrl?: string
  error?: string
}

export type ExternalMp3Resolved = {
  url: string
  title?: string
  thumbnail?: string
  duration?: number
  views?: number
  size?: number
  fileName?: string
  provider: string
}

function durationSeconds(value?: string) {
  if (!value || !/^\d{1,3}(?::\d{1,2}){1,2}$/.test(value.trim())) return undefined
  const parts = value.trim().split(':').map(Number)
  if (parts.some((part) => !Number.isFinite(part))) return undefined
  return parts.reduce((total, part) => total * 60 + part, 0)
}

function safeFileBase(value: string) {
  const clean = value.normalize('NFKD').replace(/[^a-zA-Z0-9._ -]+/g, '').trim().replace(/\s+/g, '-')
  return clean.slice(0, 80) || 'youtube'
}

export async function resolveExternalYouTubeMp3(youtubeUrl: string): Promise<ExternalMp3Resolved> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'user-agent': 'GhostNexoraBot/1.1',
    },
    body: new URLSearchParams({ youtube_url: youtubeUrl, quality: '192' }),
    signal: AbortSignal.timeout(35_000),
  })
  if (!response.ok) throw new Error(`YTMP3.GE respondió HTTP ${response.status}.`)
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('json')) throw new Error('YTMP3.GE no devolvió JSON.')
  const data = await response.json() as Ytmp3GeResponse
  if (!data.success || typeof data.downloadUrl !== 'string') {
    throw new Error(data.error || 'YTMP3.GE no entregó un enlace MP3.')
  }
  const direct = new URL(data.downloadUrl)
  if (!['http:', 'https:'].includes(direct.protocol)) throw new Error('YTMP3.GE devolvió una URL no válida.')
  const title = data.title?.trim() || undefined
  logger.info({ provider: 'ytmp3.ge', size: data.size }, 'youtube external mp3 provider resolved')
  return {
    url: direct.toString(),
    title,
    thumbnail: data.thumbnail,
    duration: durationSeconds(data.duration),
    views: Number.isFinite(data.viewCount) ? data.viewCount : undefined,
    size: Number.isFinite(data.size) ? data.size : undefined,
    fileName: `${safeFileBase(title || data.videoId || 'youtube')}.mp3`,
    provider: 'ytmp3.ge',
  }
}
