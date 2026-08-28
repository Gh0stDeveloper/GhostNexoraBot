import { createWriteStream } from 'node:fs'
import { readFile, mkdtemp, rm, stat } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import os from 'node:os'
import path from 'node:path'
import { config } from '../config.js'
import { requestLempiJson } from './lempi-client.js'

const DEFAULT_TIMEOUT_MS = 45_000
const MEDIA_TIMEOUT_MS = 15 * 60_000

export type LempiMediaKind = 'image' | 'video' | 'audio' | 'document' | 'unknown'

export type LempiDownloadedMedia = {
  filePath: string
  fileName: string
  size: number
  kind: LempiMediaKind
  sourceUrl: string
  cleanup: () => Promise<void>
}

export type LempiTikTokResult = {
  id: string
  title: string
  url: string
  duration?: number
  video?: string
  quality?: string
  author?: { username?: string; name?: string; avatar?: string; verified?: boolean }
  stats?: { views?: number; likes?: number; comments?: number; shares?: number; favorites?: number }
  music?: { title?: string; author?: string; url?: string }
}

export type LempiPinterestResult = {
  title?: string | null
  author?: string
  likes?: string
  type?: string
  url?: string
  download?: string
}

export type LempiInstagramResult = {
  id?: string
  title?: string
  author?: string
  type?: string
  url?: string
  video?: string
  image?: string
  download?: string
  thumbnail?: string
  duration?: number
}

export type LempiHappyModResult = {
  numero?: number
  nombre: string
  version?: string
  imagen?: string
  url: string
  download?: string
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const result = stringValue(value)
    if (result) return result
  }
  return undefined
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function collectRecords(value: unknown, out: Record<string, unknown>[] = [], depth = 0) {
  if (depth > 8 || value === null || value === undefined) return out
  if (Array.isArray(value)) {
    for (const item of value) collectRecords(item, out, depth + 1)
    return out
  }
  const record = asRecord(value)
  if (!record) return out
  out.push(record)
  for (const child of Object.values(record)) collectRecords(child, out, depth + 1)
  return out
}

function normalizeUrl(value: string) {
  try {
    const parsed = new URL(value)
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null
  } catch {
    return null
  }
}

function collectUrls(value: unknown, out: string[] = [], depth = 0) {
  if (depth > 8 || value === null || value === undefined) return out
  if (typeof value === 'string') {
    const match = normalizeUrl(value.trim())
    if (match) out.push(match)
    return out
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUrls(item, out, depth + 1)
    return out
  }
  const record = asRecord(value)
  if (!record) return out
  for (const child of Object.values(record)) collectUrls(child, out, depth + 1)
  return out
}

function mediaKindFrom(value?: string, url?: string): LempiMediaKind {
  const input = `${value ?? ''} ${url ?? ''}`.toLowerCase()
  if (/\.apk(?:$|[?#])/.test(input)) return 'document'
  if (/gif|jpe?g|png|webp|avif/.test(input)) return 'image'
  if (/mp4|webm|mov|m4v/.test(input)) return 'video'
  if (/mp3|m4a|ogg|opus|wav/.test(input)) return 'audio'
  return 'unknown'
}

function mediaUrls(value: unknown, imagesOnly = false) {
  const urls = [...new Set(collectUrls(value))]
    .filter((url) => !/api\.lempi\.lat/i.test(url))
    .filter((url) => !/\/avatar\b|thumbnail|thumb/i.test(url))

  const scored = urls.map((url) => {
    const lower = url.toLowerCase()
    let score = 0
    if (/\.jpg|\.jpeg|\.png|\.webp|\.avif/.test(lower)) score += 100
    if (/\.mp4|\.webm|\.mov|\.m4v/.test(lower)) score += 90
    if (/\/originals\//.test(lower)) score += 20
    if (/\/download\b|\/media\b|\/video\b|\/image\b/.test(lower)) score += 10
    if (/pinimg|cdn/.test(lower)) score += 5
    return { url, score }
  }).sort((a, b) => b.score - a.score)

  return (imagesOnly ? scored.filter(({ url }) => mediaKindFrom(undefined, url) === 'image') : scored)
    .map(({ url }) => url)
}

function normalizeTikTok(raw: Record<string, unknown>): LempiTikTokResult | null {
  const video = firstString(raw.video, raw.download, raw.descarga, raw.url_video, raw.mp4)
  const url = firstString(raw.url, raw.link, raw.tiktok)
  if (!url || !video) return null
  const author = asRecord(raw.autor) ?? asRecord(raw.author) ?? {}
  const stats = asRecord(raw.estadisticas) ?? asRecord(raw.stats) ?? {}
  const music = asRecord(raw.musica) ?? asRecord(raw.music) ?? {}
  return {
    id: firstString(raw.id) ?? url,
    title: firstString(raw.titulo, raw.title, raw.description) ?? 'TikTok',
    url,
    duration: numberValue(raw.duracion ?? raw.duration),
    video,
    quality: firstString(raw.calidad, raw.quality),
    author: {
      username: firstString(author.usuario, author.username),
      name: firstString(author.nombre, author.name),
      avatar: firstString(author.avatar, author.avatarUrl),
      verified: typeof author.verificado === 'boolean' ? author.verificado : typeof author.verified === 'boolean' ? author.verified : undefined,
    },
    stats: {
      views: numberValue(stats.vistas ?? stats.views),
      likes: numberValue(stats.likes),
      comments: numberValue(stats.comentarios ?? stats.comments),
      shares: numberValue(stats.compartidos ?? stats.shares),
      favorites: numberValue(stats.favoritos ?? stats.favorites),
    },
    music: {
      title: firstString(music.titulo, music.title),
      author: firstString(music.autor, music.author),
      url: firstString(music.url),
    },
  }
}

function normalizePinterest(raw: Record<string, unknown>): LempiPinterestResult | null {
  const download = firstString(raw.descarga, raw.download, raw.image, raw.imagen, raw.original, raw.originalUrl)
  if (!download) return null
  return {
    title: firstString(raw.titulo, raw.title),
    author: firstString(raw.autor, raw.author),
    likes: firstString(raw.likes),
    type: firstString(raw.tipo, raw.type),
    url: firstString(raw.url, raw.link, raw.pin),
    download,
  }
}

function normalizeInstagram(raw: Record<string, unknown>): LempiInstagramResult | null {
  const video = firstString(raw.video, raw.mp4, raw.video_url, raw.videoUrl)
  const image = firstString(raw.imagen, raw.image, raw.foto, raw.photo, raw.image_url, raw.imageUrl)
  const download = firstString(raw.descarga, raw.download, raw.media, raw.direct, raw.download_url, raw.downloadUrl)
  const url = firstString(raw.url, raw.link, raw.instagram)
  if (!video && !image && !download) return null
  return {
    id: firstString(raw.id),
    title: firstString(raw.titulo, raw.title, raw.descripcion, raw.description),
    author: firstString(raw.autor, raw.author, raw.usuario, raw.username),
    type: firstString(raw.tipo, raw.type),
    url,
    video,
    image,
    download,
    thumbnail: firstString(raw.thumbnail, raw.thumb, raw.portada),
    duration: numberValue(raw.duracion ?? raw.duration),
  }
}

function normalizeHappyMod(raw: Record<string, unknown>): LempiHappyModResult | null {
  const name = firstString(raw.nombre, raw.name, raw.title, raw.app)
  const url = firstString(raw.url, raw.link, raw.page, raw.source)
  const download = firstString(raw.descarga, raw.download, raw.apk, raw.apk_url, raw.apkUrl, raw.direct)
  if (!name || !url) return null
  return {
    numero: numberValue(raw.numero ?? raw.number ?? raw.id),
    nombre: name,
    version: firstString(raw.version, raw.ver),
    imagen: firstString(raw.imagen, raw.image, raw.icon, raw.logo),
    url,
    download,
  }
}

export async function searchLempiTikTok(query: string): Promise<LempiTikTokResult[]> {
  const payload = await requestLempiJson<{ resultados?: unknown[]; results?: unknown[] }>('/s/tiktok', { q: query })
  const rows = Array.isArray(payload.resultados) ? payload.resultados : Array.isArray(payload.results) ? payload.results : collectRecords(payload)
  return rows
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    .map(normalizeTikTok)
    .filter((item): item is LempiTikTokResult => Boolean(item))
    .slice(0, 20)
}

export async function searchLempiPinterest(query: string, limit = 20): Promise<LempiPinterestResult[]> {
  let lastError: unknown
  for (const endpoint of config.lempiPinterestSearchEndpoints) {
    try {
      const payload = await requestLempiJson<unknown>(endpoint, { q: query, limit })
      const records = collectRecords(payload)
      const normalized = records
        .map(normalizePinterest)
        .filter((item): item is LempiPinterestResult => Boolean(item))
        .slice(0, Math.max(1, Math.min(20, limit)))
      if (normalized.length) return normalized
    } catch (error) {
      lastError = error
    }
  }
  if (lastError) throw lastError
  return []
}

export async function searchLempiInstagram(query: string, limit = 10): Promise<LempiInstagramResult[]> {
  const endpoints = ['/s/instagram', '/s/ig']
  let lastError: unknown
  for (const endpoint of endpoints) {
    try {
      const payload = await requestLempiJson<unknown>(endpoint, { q: query, limit })
      const normalized = collectRecords(payload)
        .map(normalizeInstagram)
        .filter((item): item is LempiInstagramResult => Boolean(item))
        .slice(0, Math.max(1, Math.min(20, limit)))
      if (normalized.length) return normalized
    } catch (error) {
      lastError = error
    }
  }
  if (lastError) throw lastError
  return []
}

export async function downloadLempiInstagram(sourceUrl: string, imagesOnly = false): Promise<LempiDownloadedMedia[]> {
  let lastError: unknown
  for (const endpoint of config.lempiInstagramEndpoints) {
    try {
      const payload = await requestLempiJson<unknown>(endpoint, { url: sourceUrl }, { timeoutMs: 90_000 })
      const records = collectRecords(payload)
      const normalized = records.map(normalizeInstagram).filter((item): item is LempiInstagramResult => Boolean(item))
      const urls = mediaUrls(normalized.length ? normalized : payload, imagesOnly)
      if (!urls.length) {
        const direct = normalized.flatMap((item) => [item.image, item.video, item.download].filter(Boolean) as string[])
        if (direct.length) return downloadLempiMediaList(direct, imagesOnly ? 'image' : undefined, 'instagram')
        continue
      }
      return downloadLempiMediaList(urls, imagesOnly ? 'image' : undefined, 'instagram')
    } catch (error) {
      lastError = error
    }
  }
  if (lastError) throw lastError
  throw new Error('No se pudo obtener el contenido de Instagram.')
}

export async function searchLempiHappyMod(query: string, limit = 10): Promise<LempiHappyModResult[]> {
  let lastError: unknown
  for (const endpoint of config.lempiHappyModSearchEndpoints) {
    try {
      const payload = await requestLempiJson<unknown>(endpoint, { q: query, limit })
      const normalized = collectRecords(payload)
        .map(normalizeHappyMod)
        .filter((item): item is LempiHappyModResult => Boolean(item))
      const unique = [...new Map(normalized.map((item) => [item.url, item])).values()]
      if (unique.length) return unique.slice(0, Math.max(1, Math.min(20, limit)))
    } catch (error) {
      lastError = error
    }
  }
  if (lastError) throw lastError
  return []
}

export async function resolveLempiHappyMod(sourceUrl: string): Promise<string> {
  let lastError: unknown
  for (const endpoint of config.lempiHappyModDownloadEndpoints) {
    try {
      const payload = await requestLempiJson<unknown>(endpoint, { url: sourceUrl }, { timeoutMs: 90_000 })
      const candidates = [...new Set(collectUrls(payload))]
        .filter((url) => !/api\.lempi\.lat/i.test(url))
      const apk = candidates.find((url) => /\.apk(?:$|[?#])/i.test(url))
      if (apk) return apk
      if (candidates.length) return candidates[0]!
    } catch (error) {
      lastError = error
    }
  }
  if (lastError) throw lastError
  throw new Error('No se pudo obtener el archivo solicitado.')
}

export async function askLempiDeepSeek(query: string): Promise<string> {
  const payload = await requestLempiJson<{ resultado?: { respuesta?: unknown }; respuesta?: unknown }>('/ai/deepseek', { q: query }, { timeoutMs: 120_000 })
  const response = payload.resultado?.respuesta ?? payload.respuesta
  if (typeof response !== 'string' || !response.trim()) throw new Error('La respuesta no está disponible por el momento.')
  return response.trim()
}

function extensionFromContentType(contentType: string, kind: LempiMediaKind, sourceUrl: string) {
  const type = contentType.toLowerCase()
  if (type.includes('jpeg') || type.includes('jpg')) return 'jpg'
  if (type.includes('png')) return 'png'
  if (type.includes('webp')) return 'webp'
  if (type.includes('gif')) return 'gif'
  if (type.includes('mp3') || type.includes('mpeg') || type.includes('m4a')) return 'mp3'
  if (type.includes('webm')) return 'webm'
  if (type.includes('mp4')) return 'mp4'
  if (kind === 'document' || /\.apk(?:$|[?#])/i.test(sourceUrl)) return 'apk'
  if (kind === 'image') return 'jpg'
  if (kind === 'audio') return 'mp3'
  return 'mp4'
}

function safeFileName(value: string) {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9._ -]+/g, '').trim().replace(/\s+/g, '-').slice(0, 90) || 'ghostnexora-media'
}

function isZipLikeApk(buffer: Buffer) {
  return buffer[0] === 0x50 && buffer[1] === 0x4b && [0x03, 0x05, 0x07].includes(buffer[2] ?? -1)
}

async function downloadLempiMediaList(urls: string[], forcedKind?: LempiMediaKind, baseName = 'media') {
  const results: LempiDownloadedMedia[] = []
  for (const [index, url] of [...new Set(urls)].slice(0, 12).entries()) {
    const result = await downloadLempiMedia(url, {
      kind: forcedKind,
      baseName: `${baseName}-${index + 1}`,
    })
    results.push(result)
  }
  if (!results.length) throw new Error('No se pudo descargar ningún archivo.')
  return results
}

export async function downloadLempiMedia(
  sourceUrl: string,
  options: { kind?: LempiMediaKind; baseName?: string } = {},
): Promise<LempiDownloadedMedia> {
  const url = new URL(sourceUrl)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('La URL de descarga no es válida.')

  const dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-media-'))
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'user-agent': 'GhostNexoraBot',
        accept: '*/*',
      },
      signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS),
    })
    if (!response.ok || !response.body) throw new Error('No se pudo descargar el archivo.')

    const contentType = response.headers.get('content-type') ?? ''
    const kind = options.kind ?? mediaKindFrom(contentType, response.url || sourceUrl)
    if (/text\/html|application\/json/i.test(contentType) && kind !== 'document') {
      throw new Error('El enlace no devolvió un archivo multimedia.')
    }

    const ext = extensionFromContentType(contentType, kind, response.url || sourceUrl)
    const fileName = `${safeFileName(options.baseName ?? kind)}.${ext}`
    const filePath = path.join(dir, fileName)
    const declared = Number(response.headers.get('content-length') ?? 0)
    if (declared > config.maxDownloadBytes) throw new Error(`El archivo supera el límite de ${config.maxDownloadMb} MB.`)

    let size = 0
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length
        callback(size > config.maxDownloadBytes
          ? new Error(`El archivo supera el límite de ${config.maxDownloadMb} MB.`)
          : null, chunk)
      },
    })
    await pipeline(response.body as any, limiter, createWriteStream(filePath, { mode: 0o600 }))
    const file = await stat(filePath)
    if (file.size <= 0) throw new Error('El archivo descargado está vacío.')

    if (kind === 'document') {
      if (file.size < 1024) throw new Error('El archivo descargado no parece ser una APK válida.')
      const header = await readFile(filePath).then((buffer) => buffer.subarray(0, 4))
      if (!isZipLikeApk(header)) throw new Error('El archivo descargado no es una APK válida.')
    }

    return {
      filePath,
      fileName,
      size: file.size,
      kind,
      sourceUrl,
      cleanup: () => rm(dir, { recursive: true, force: true }),
    }
  } catch (error) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}
