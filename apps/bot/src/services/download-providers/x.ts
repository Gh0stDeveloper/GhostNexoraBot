import { downloadSocialVideo } from '../downloader.js'
import { downloadProviderFile } from './http.js'
import { withProviderTelemetry } from './runtime.js'

const X_INPUT_HOSTS = [/^(?:www\.)?x\.com$/i, /^(?:www\.)?twitter\.com$/i]
const X_MEDIA_HOSTS = [/^(?:video|pbs)\.twimg\.com$/i, /\.twimg\.com$/i]
const xBearerToken = () => process.env.X_BEARER_TOKEN?.trim() ?? ''

export type XResolvedMedia = {
  kind: 'video' | 'image'
  url: string
  preview?: string
  width?: number
  height?: number
  durationMs?: number
  bitrate?: number
}

export type XDownloadBundle = {
  files: Array<{
    kind: 'video' | 'image'
    filePath: string
    fileName: string
    size: number
  }>
  provider: 'x-official' | 'x-ytdlp'
  cleanup: () => Promise<void>
}

function validateXUrl(input: string) {
  let url: URL
  try { url = new URL(input) } catch { throw new Error('URL de X/Twitter inválida.') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Solo se permiten URLs HTTP/HTTPS.')
  if (!X_INPUT_HOSTS.some((pattern) => pattern.test(url.hostname))) throw new Error('La URL no pertenece a X/Twitter.')
  return url.toString()
}

export function xPostIdFromUrl(input: string) {
  const url = new URL(validateXUrl(input))
  const match = /\/(?:status|statuses)\/(\d{5,25})(?:\/|$)/i.exec(url.pathname)
  return match?.[1]
}

type XApiResponse = {
  data?: { id?: string; text?: string; attachments?: { media_keys?: string[] } }
  includes?: {
    media?: Array<{
      media_key?: string
      type?: 'photo' | 'video' | 'animated_gif' | string
      url?: string
      preview_image_url?: string
      duration_ms?: number
      width?: number
      height?: number
      variants?: Array<{ bit_rate?: number; content_type?: string; url?: string }>
    }>
  }
  errors?: Array<{ title?: string; detail?: string }>
}

type XMedia = NonNullable<NonNullable<XApiResponse['includes']>['media']>[number]
type XVideoVariant = NonNullable<XMedia['variants']>[number]

function chooseVideoVariant(variants: XVideoVariant[]) {
  return variants
    .filter((item) => item.url && /video\/mp4/i.test(item.content_type ?? ''))
    .sort((a, b) => (b.bit_rate ?? 0) - (a.bit_rate ?? 0))[0]
}

export async function resolveXOfficial(input: string): Promise<XResolvedMedia[]> {
  const url = validateXUrl(input)
  const postId = xPostIdFromUrl(url)
  if (!postId) throw new Error('No pude extraer el ID del Post de X.')
  const token = xBearerToken()
  if (!token) throw new Error('X_BEARER_TOKEN no está configurado.')

  return withProviderTelemetry('x-official', 'resolve', async () => {
    const endpoint = new URL(`https://api.x.com/2/tweets/${postId}`)
    endpoint.searchParams.set('tweet.fields', 'attachments,author_id,created_at,text')
    endpoint.searchParams.set('expansions', 'attachments.media_keys')
    endpoint.searchParams.set('media.fields', 'duration_ms,height,media_key,preview_image_url,type,url,variants,width')

    const response = await fetch(endpoint, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        'user-agent': 'GhostNexoraBot/2.0',
      },
      signal: AbortSignal.timeout(25_000),
    })
    const payload = await response.json().catch(() => ({})) as XApiResponse
    if (!response.ok) {
      const detail = payload.errors?.[0]?.detail || payload.errors?.[0]?.title
      throw new Error(`X API HTTP ${response.status}${detail ? `: ${detail}` : ''}`)
    }

    const keys = new Set(payload.data?.attachments?.media_keys ?? [])
    const media = (payload.includes?.media ?? []).filter((item) => !keys.size || (item.media_key && keys.has(item.media_key)))
    const resolved: XResolvedMedia[] = []
    for (const item of media) {
      if (item.type === 'photo' && item.url) {
        resolved.push({ kind: 'image', url: item.url, preview: item.url, width: item.width, height: item.height })
        continue
      }
      if (item.type === 'video' || item.type === 'animated_gif') {
        const variant = chooseVideoVariant(item.variants ?? [])
        if (variant?.url) {
          resolved.push({
            kind: 'video',
            url: variant.url,
            preview: item.preview_image_url,
            width: item.width,
            height: item.height,
            durationMs: item.duration_ms,
            bitrate: variant.bit_rate,
          })
        }
      }
    }
    if (!resolved.length) throw new Error('X API no devolvió media descargable para este Post.')
    return resolved
  })
}

export async function downloadXMedia(input: string): Promise<XDownloadBundle> {
  const url = validateXUrl(input)
  const officialErrors: string[] = []

  if (xBearerToken()) {
    try {
      const resolved = await resolveXOfficial(url)
      const downloads = [] as Array<Awaited<ReturnType<typeof downloadProviderFile>> & { kind: 'video' | 'image' }>
      try {
        for (const [index, item] of resolved.slice(0, 8).entries()) {
          const extension = item.kind === 'image' ? (/\.png(?:$|[?#])/i.test(item.url) ? 'png' : 'jpg') : 'mp4'
          const file = await withProviderTelemetry('x-official', 'download', () => downloadProviderFile(item.url, {
            allowedHosts: X_MEDIA_HOSTS,
            provider: 'x-official',
            fileBase: `x-${xPostIdFromUrl(url) ?? 'post'}-${index + 1}`,
            extension,
            referer: url,
          }))
          downloads.push({ ...file, kind: item.kind })
        }
        return {
          files: downloads.map((item) => ({ kind: item.kind, filePath: item.filePath, fileName: item.fileName, size: item.size })),
          provider: 'x-official',
          cleanup: async () => { await Promise.all(downloads.map((item) => item.cleanup())) },
        }
      } catch (error) {
        await Promise.all(downloads.map((item) => item.cleanup())).catch(() => undefined)
        throw error
      }
    } catch (error) {
      officialErrors.push(error instanceof Error ? error.message : String(error))
    }
  }

  try {
    const result = await withProviderTelemetry('x-ytdlp', 'download', () => downloadSocialVideo(url, 'twitter'))
    return {
      files: [{ kind: 'video', filePath: result.filePath, fileName: result.fileName, size: result.size }],
      provider: 'x-ytdlp',
      cleanup: result.cleanup,
    }
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error)
    const prefix = officialErrors.length ? `${officialErrors.join(' · ')} · ` : ''
    throw new Error(`No pude descargar el Post público de X/Twitter. ${prefix}${fallback}`)
  }
}
