import { createWriteStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import os from 'node:os'
import path from 'node:path'
import { config } from '../config.js'

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
}

function apiKey() {
  const key = config.lempiApiKey.trim()
  if (!key) throw new Error('LEMPI_API_KEY no está configurada en el .env del servidor.')
  return key
}

function endpoint(pathname: string, params: Record<string, string | number | undefined>) {
  const url = new URL(pathname.replace(/^\//, ''), `${config.lempiBaseUrl.replace(/\/$/, '')}/`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && String(value).trim() !== '') url.searchParams.set(key, String(value))
  }
  url.searchParams.set('apikey', apiKey())
  return url
}

async function requestJson<T>(pathname: string, params: Record<string, string | number | undefined>, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const response = await fetch(endpoint(pathname, params), {
    method: 'GET',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  })

  const text = await response.text()
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error(`API Lempi devolvió una respuesta no válida (HTTP ${response.status}).`)
  }

  if (!response.ok) throw new Error(`API Lempi respondió HTTP ${response.status}.`)
  if (!payload || typeof payload !== 'object') throw new Error('API Lempi devolvió un formato inesperado.')
  if ('status' in payload && (payload as { status?: boolean }).status === false) {
    const detail = 'message' in payload ? String((payload as { message?: unknown }).message ?? '') : ''
    throw new Error(detail || 'API Lempi rechazó la solicitud.')
  }

  return payload as T
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const result = stringValue(value)
    if (result) return result
  }
  return undefined
}

function mediaKindFrom(value?: string, url?: string): LempiMediaKind {
  const input = `${value ?? ''} ${url ?? ''}`.toLowerCase()
  if (/gif|jpe?g|png|webp|avif/.test(input)) return 'image'
  if (/mp4|webm|mov|m4v/.test(input)) return 'video'
  if (/mp3|m4a|ogg|opus|wav/.test(input)) return 'audio'
  if (/\.apk(?:$|[?#])/.test(input)) return 'document'
  return 'unknown'
}

function normalizeTikTok(raw: Record<string, unknown>): LempiTikTokResult | null {
  const video = firstString(raw.video, raw.download, raw.descarga)
  const url = firstString(raw.url, raw.link)
  if (!url || !video) return null
  const author = raw.autor && typeof raw.autor === 'object' ? raw.autor as Record<string, unknown> : {}
  const stats = raw.estadisticas && typeof raw.estadisticas === 'object' ? raw.estadisticas as Record<string, unknown> : {}
  const music = raw.musica && typeof raw.musica === 'object' ? raw.musica as Record<string, unknown> : {}
  return {
    id: firstString(raw.id) ?? url,
    title: firstString(raw.titulo, raw.title, raw.description) ?? 'TikTok',
    url,
    duration: numberValue(raw.duracion),
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
  const download = firstString(raw.descarga, raw.download, raw.image, raw.imagen)
  if (!download) return null
  return {
    title: stringValue(raw.titulo) ?? stringValue(raw.title),
    author: firstString(raw.autor, raw.author),
    likes: firstString(raw.likes),
    type: firstString(raw.tipo, raw.type),
    url: firstString(raw.url, raw.link),
    download,
  }
}

function normalizeInstagram(raw: Record<string, unknown>): LempiInstagramResult | null {
  const video = firstString(raw.video, raw.mp4)
  const image = firstString(raw.imagen, raw.image, raw.foto, raw.photo)
  const download = firstString(raw.descarga, raw.download, raw.media, raw.direct)
  const url = firstString(raw.url, raw.link)
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
    duration: numberValue(raw.duracion),
  }
}

export async function searchLempiTikTok(query: string): Promise<LempiTikTokResult[]> {
  const payload = await requestJson<{ resultados?: unknown[] }>('/s/tiktok', { q: query })
  const rows = Array.isArray(payload.resultados) ? payload.resultados : []
  return rows
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map(normalizeTikTok)
    .filter((item): item is LempiTikTokResult => Boolean(item))
    .slice(0, 20)
}

export async function searchLempiPinterest(query: string, limit = 20): Promise<LempiPinterestResult[]> {
  const payload = await requestJson<{ results?: unknown[] }>('/s/pin', { q: query, limit })
  const rows = Array.isArray(payload.results) ? payload.results : []
  return rows
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map(normalizePinterest)
    .filter((item): item is LempiPinterestResult => Boolean(item))
    .slice(0, Math.max(1, Math.min(20, limit)))
}

export async function searchLempiInstagram(query: string, limit = 10): Promise<LempiInstagramResult[]> {
  const endpoints = ['/s/instagram', '/s/ig']
  let lastError: unknown
  for (const pathname of endpoints) {
    try {
      const payload = await requestJson<{ resultados?: unknown[]; results?: unknown[] }>(pathname, { q: query, limit })
      const rows = Array.isArray(payload.resultados) ? payload.resultados : Array.isArray(payload.results) ? payload.results : []
      const normalized = rows
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map(normalizeInstagram)
        .filter((item): item is LempiInstagramResult => Boolean(item))
        .slice(0, Math.max(1, Math.min(20, limit)))
      if (normalized.length) return normalized
    } catch (error) {
      lastError = error
    }
  }
  if (lastError instanceof Error) throw lastError
  return []
}

export async function searchLempiHappyMod(query: string, limit = 10): Promise<LempiHappyModResult[]> {
  const payload = await requestJson<{ data?: { resultados?: unknown[] } }>('/search/happymod', { q: query })
  const rows = Array.isArray(payload.data?.resultados) ? payload.data.resultados : []
  return rows
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => {
      const name = firstString(item.nombre, item.name)
      const url = firstString(item.url, item.link)
      if (!name || !url) return null
      return {
        numero: numberValue(item.numero),
        nombre: name,
        version: firstString(item.version),
        imagen: firstString(item.imagen, item.image, item.icon),
        url,
      } satisfies LempiHappyModResult
    })
    .filter((item): item is LempiHappyModResult => Boolean(item))
    .slice(0, Math.max(1, Math.min(20, limit)))
}

export async function askLempiDeepSeek(query: string): Promise<string> {
  const payload = await requestJson<{ resultado?: { respuesta?: unknown }; respuesta?: unknown }>('/ai/deepseek', { q: query }, 120_000)
  const response = payload.resultado?.respuesta ?? payload.respuesta
  if (typeof response !== 'string' || !response.trim()) throw new Error('DeepSeek no devolvió una respuesta utilizable.')
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
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9._ -]+/g, '').trim().replace(/\s+/g, '-').slice(0, 90) || 'lemppi-media'
}

function isZipLikeApk(buffer: Buffer) {
  return buffer[0] === 0x50 && buffer[1] === 0x4b && [0x03, 0x05, 0x07].includes(buffer[2] ?? -1)
}

export async function downloadLempiMedia(
  sourceUrl: string,
  options: { kind?: LempiMediaKind; baseName?: string } = {},
): Promise<LempiDownloadedMedia> {
  const url = new URL(sourceUrl)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('La URL de media no usa HTTP/HTTPS.')

  const dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-lempi-'))
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'user-agent': 'GhostNexoraBot/1.1 (+https://api.lempi.lat)',
        accept: '*/*',
      },
      signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS),
    })
    if (!response.ok || !response.body) throw new Error(`No se pudo descargar media (HTTP ${response.status}).`)

    const contentType = response.headers.get('content-type') ?? ''
    const kind = options.kind ?? mediaKindFrom(contentType, response.url || sourceUrl)
    if (/text\/html|application\/json/i.test(contentType) && kind !== 'document') {
      throw new Error('La URL no devolvió un archivo multimedia directo.')
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
    await pipeline(response.body as any, limiter, createWriteStream(filePath))
    const file = await stat(filePath)
    if (file.size <= 0) throw new Error('El proveedor devolvió un archivo vacío.')

    if (kind === 'document') {
      if (file.size < 1024) throw new Error('La descarga no parece ser una APK válida.')
      const header = await readFile(filePath).then((buffer) => buffer.subarray(0, 4))
      if (!isZipLikeApk(header)) throw new Error('HappyMod no devolvió un APK/ZIP válido; se recibió otro tipo de archivo.')
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
