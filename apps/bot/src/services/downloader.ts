import { createWriteStream } from 'node:fs'
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import os from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
import yts from 'yt-search'
import { config } from '../config.js'

export type DownloadPlatform = 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'twitter'

export interface MediaInfo {
  title: string
  description?: string
  uploader?: string
  duration?: number
  views?: number
  likes?: number
  thumbnail?: string
  webpageUrl?: string
}

export interface DownloadResult {
  filePath: string
  fileName: string
  size: number
  info?: MediaInfo
  cleanup: () => Promise<void>
}

export interface YouTubeFormats extends MediaInfo { videoHeights: number[]; audioBitrates: number[] }
export interface YouTubeSearchResult extends MediaInfo { id: string; channel: string; url: string }

const hosts: Record<DownloadPlatform, string[]> = {
  youtube: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'music.youtube.com'],
  tiktok: ['tiktok.com', 'www.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'],
  instagram: ['instagram.com', 'www.instagram.com'],
  facebook: ['facebook.com', 'www.facebook.com', 'fb.watch', 'm.facebook.com'],
  twitter: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'],
}
const soundCloudHosts = ['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com']
const ytDlpRuntimeArgs = ['--js-runtimes', 'node'] as const
const rubyCoreBase = 'https://ruby-core.vercel.app/api/download/youtube'

function validateUrl(value: string, platform: DownloadPlatform) {
  let url: URL
  try { url = new URL(value) } catch { throw new Error('URL inválida.') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Solo se permiten URLs HTTP/HTTPS.')
  const host = url.hostname.toLowerCase()
  if (!hosts[platform].some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) throw new Error(`La URL no pertenece a ${platform}.`)
  return url.toString()
}

function validateSoundCloudUrl(value: string) {
  let url: URL
  try { url = new URL(value) } catch { throw new Error('URL de SoundCloud inválida.') }
  const host = url.hostname.toLowerCase()
  if (!soundCloudHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) throw new Error('La URL no pertenece a SoundCloud.')
  return url.toString()
}

function youtubeId(input: string) {
  const value = validateUrl(input, 'youtube')
  const url = new URL(value)
  if (url.hostname === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0]
  const fromQuery = url.searchParams.get('v')
  if (fromQuery) return fromQuery
  const parts = url.pathname.split('/').filter(Boolean)
  if (['shorts', 'embed', 'live'].includes(parts[0] ?? '')) return parts[1]
  return undefined
}

function safeFileBase(value: string) {
  const clean = value.normalize('NFKD').replace(/[^a-zA-Z0-9._ -]+/g, '').trim().replace(/\s+/g, '-')
  return clean.slice(0, 80) || 'youtube'
}

const prepareTempDir = () => mkdtemp(path.join(os.tmpdir(), 'ghostnexora-'))
async function findDownloadedFile(dir: string) {
  const entries = await readdir(dir)
  const candidate = entries.find((entry) => !entry.endsWith('.part') && !entry.endsWith('.ytdl') && !entry.endsWith('.json'))
  if (!candidate) throw new Error('El descargador no produjo un archivo válido.')
  const filePath = path.join(dir, candidate)
  const fileStat = await stat(filePath)
  if (fileStat.size > config.maxDownloadBytes) throw new Error(`El archivo supera el límite configurado de ${config.maxDownloadMb} MB.`)
  return { filePath, fileName: candidate, size: fileStat.size }
}

function infoFrom(data: Record<string, unknown>): MediaInfo {
  return {
    title: String(data.title ?? 'Sin título'),
    description: typeof data.description === 'string' ? data.description : undefined,
    uploader: typeof data.uploader === 'string' ? data.uploader : typeof data.channel === 'string' ? data.channel : undefined,
    duration: typeof data.duration === 'number' ? data.duration : undefined,
    views: typeof data.view_count === 'number' ? data.view_count : undefined,
    likes: typeof data.like_count === 'number' ? data.like_count : undefined,
    thumbnail: typeof data.thumbnail === 'string' ? data.thumbnail : undefined,
    webpageUrl: typeof data.webpage_url === 'string' ? data.webpage_url : undefined,
  }
}

function infoFromYtSearch(video: {
  title?: string
  description?: string
  author?: { name?: string }
  seconds?: number
  views?: number
  thumbnail?: string
  url?: string
}): MediaInfo {
  return {
    title: video.title?.trim() || 'Sin título',
    description: video.description?.trim() || undefined,
    uploader: video.author?.name?.trim() || undefined,
    duration: Number.isFinite(video.seconds) ? video.seconds : undefined,
    views: Number.isFinite(video.views) ? video.views : undefined,
    thumbnail: video.thumbnail || undefined,
    webpageUrl: video.url || undefined,
  }
}

async function runDownload(source: string, args: string[]): Promise<DownloadResult> {
  const dir = await prepareTempDir()
  const output = path.join(dir, '%(title).80s-%(id)s.%(ext)s')
  try {
    const { stdout } = await execa('yt-dlp', [
      ...ytDlpRuntimeArgs, '--no-playlist', '--no-warnings', '--restrict-filenames', '--no-progress', '--print-json',
      '-o', output, ...args, source,
    ], { timeout: 20 * 60_000, maxBuffer: 20 * 1024 * 1024 })
    const result = await findDownloadedFile(dir)
    let info: MediaInfo | undefined
    const lines = stdout.trim().split('\n').filter(Boolean)
    for (let i = lines.length - 1; i >= 0; i--) {
      try { info = infoFrom(JSON.parse(lines[i]!) as Record<string, unknown>); break } catch { /* noop */ }
    }
    return { ...result, info, cleanup: () => rm(dir, { recursive: true, force: true }) }
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
}

const audioArgs = ['-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', '0']
function videoArgs(quality: number) {
  const height = Math.max(144, Math.min(2160, Number.isFinite(quality) ? quality : 720))
  return ['-f', `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${height}][ext=mp4]/best[height<=${height}]`, '--merge-output-format', 'mp4']
}

interface RubyCoreResponse {
  status?: boolean
  download?: { url?: string; filename?: string }
  message?: string
  error?: string
}

async function rubyCoreDownloadUrl(youtubeUrl: string, kind: 'mp3' | 'mp4') {
  const endpoint = new URL(`${rubyCoreBase}/${kind}`)
  endpoint.searchParams.set('url', youtubeUrl)
  const response = await fetch(endpoint, {
    headers: {
      accept: 'application/json',
      'user-agent': 'GhostNexoraBot/1.1',
    },
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`Ruby-core respondió HTTP ${response.status}.`)
  const data = await response.json() as RubyCoreResponse
  const direct = data.download?.url
  if (!data.status || !direct) throw new Error(data.message || data.error || 'Ruby-core no entregó una URL de descarga.')
  const parsed = new URL(direct)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('El proveedor devolvió una URL no válida.')
  return { url: parsed.toString(), fileName: data.download?.filename }
}

async function downloadRemoteMedia(directUrl: string, ext: 'mp3' | 'mp4', info: MediaInfo, providerFileName?: string): Promise<DownloadResult> {
  const dir = await prepareTempDir()
  const fallbackName = `${safeFileBase(info.title)}.${ext}`
  const suggested = providerFileName ? path.basename(providerFileName).replace(/[^a-zA-Z0-9._ -]+/g, '_') : fallbackName
  const fileName = suggested.toLowerCase().endsWith(`.${ext}`) ? suggested : fallbackName
  const filePath = path.join(dir, fileName)
  try {
    const response = await fetch(directUrl, {
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 GhostNexoraBot/1.1' },
      signal: AbortSignal.timeout(15 * 60_000),
    })
    if (!response.ok || !response.body) throw new Error(`El servidor de descarga respondió HTTP ${response.status}.`)
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
    await pipeline(response.body, limiter, createWriteStream(filePath))
    if (size <= 0) throw new Error('El proveedor devolvió un archivo vacío.')
    return { filePath, fileName, size, info, cleanup: () => rm(dir, { recursive: true, force: true }) }
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
}

function compactError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/Sign in to confirm you.re not a bot/i.test(message)) return 'YouTube bloqueó la extracción local de esta IP de VPS.'
  return message.replace(/\s+/g, ' ').slice(0, 280)
}

async function getYouTubeInfoByUrl(input: string): Promise<MediaInfo> {
  const url = validateUrl(input, 'youtube')
  const id = youtubeId(url)
  if (!id) {
    const results = await searchYouTube(url, 1)
    const first = results[0]
    if (!first) throw new Error('No pude identificar ese video de YouTube.')
    return first
  }
  const video = await yts({ videoId: id })
  const raw = video as unknown as {
    title?: string
    description?: string
    author?: { name?: string }
    seconds?: number
    views?: number
    thumbnail?: string
    url?: string
  }
  const info = infoFromYtSearch(raw)
  return { ...info, webpageUrl: info.webpageUrl ?? `https://www.youtube.com/watch?v=${id}` }
}

async function downloadYouTubeViaProviders(input: string, kind: 'mp3' | 'mp4', quality = 720): Promise<DownloadResult> {
  const url = validateUrl(input, 'youtube')
  const info = await getYouTubeInfoByUrl(url).catch((): MediaInfo => ({ title: 'YouTube', webpageUrl: url }))
  let providerError: unknown
  try {
    const direct = await rubyCoreDownloadUrl(url, kind)
    return await downloadRemoteMedia(direct.url, kind, info, direct.fileName)
  } catch (error) {
    providerError = error
  }

  try {
    return await runDownload(url, kind === 'mp3' ? audioArgs : videoArgs(quality))
  } catch (localError) {
    throw new Error(`No fue posible descargar desde YouTube. Proveedor web: ${compactError(providerError)} Fallback local: ${compactError(localError)}`)
  }
}

export async function getMediaInfo(input: string, platform: DownloadPlatform): Promise<MediaInfo> {
  if (platform === 'youtube') return getYouTubeInfoByUrl(input)
  const url = validateUrl(input, platform)
  const { stdout } = await execa('yt-dlp', [...ytDlpRuntimeArgs, '--dump-single-json', '--no-playlist', '--no-warnings', url], { timeout: 90_000, maxBuffer: 20 * 1024 * 1024 })
  return infoFrom(JSON.parse(stdout) as Record<string, unknown>)
}

export async function getYouTubeFormats(input: string): Promise<YouTubeFormats> {
  const info = await getYouTubeInfoByUrl(input)
  // El proveedor HTTP usado como ruta primaria entrega una conversión automática y no expone
  // de forma fiable el manifiesto completo de formatos. Dejamos los arrays vacíos en vez de
  // inventar calidades; yt-dlp sigue siendo únicamente el fallback local de descarga.
  return { ...info, videoHeights: [], audioBitrates: [] }
}

export async function searchYouTube(input: string, limit = 10): Promise<YouTubeSearchResult[]> {
  const query = input.trim()
  if (!query) throw new Error('Debes indicar qué quieres buscar en YouTube.')
  const count = Math.max(1, Math.min(12, limit))
  const search = await yts.search({ query, hl: 'es', gl: 'MX' })
  return search.videos.slice(0, count).map((video) => {
    const info = infoFromYtSearch(video)
    return {
      ...info,
      id: video.videoId,
      channel: video.author?.name || 'Canal desconocido',
      url: video.url || `https://www.youtube.com/watch?v=${video.videoId}`,
    }
  })
}

export function downloadYouTubeAudio(input: string) { return downloadYouTubeViaProviders(input, 'mp3') }
export function downloadYouTubeVideo(input: string, quality = 720) { return downloadYouTubeViaProviders(input, 'mp4', quality) }
export async function downloadYouTubeSearchAudio(input: string) {
  const query = input.trim(); if (!query) throw new Error('Debes indicar una búsqueda.')
  const first = (await searchYouTube(query, 1))[0]
  if (!first) throw new Error('No encontré resultados en YouTube para esa búsqueda.')
  return downloadYouTubeAudio(first.url)
}
export async function downloadYouTubeSearchVideo(input: string, quality = 720) {
  const query = input.trim(); if (!query) throw new Error('Debes indicar una búsqueda.')
  const first = (await searchYouTube(query, 1))[0]
  if (!first) throw new Error('No encontré resultados en YouTube para esa búsqueda.')
  return downloadYouTubeVideo(first.url, quality)
}
export function downloadSoundCloud(input: string) {
  const value = input.trim(); if (!value) throw new Error('Debes indicar una URL o búsqueda de SoundCloud.')
  return runDownload(/^https?:\/\//i.test(value) ? validateSoundCloudUrl(value) : `scsearch1:${value}`, audioArgs)
}
export function downloadSocialVideo(input: string, platform: Exclude<DownloadPlatform, 'youtube'>) {
  return runDownload(validateUrl(input, platform), ['-f', 'bv*+ba/b', '--merge-output-format', 'mp4', '--remux-video', 'mp4'])
}
