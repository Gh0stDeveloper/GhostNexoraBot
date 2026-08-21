import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
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

export async function getMediaInfo(input: string, platform: DownloadPlatform): Promise<MediaInfo> {
  const url = validateUrl(input, platform)
  const { stdout } = await execa('yt-dlp', [...ytDlpRuntimeArgs, '--dump-single-json', '--no-playlist', '--no-warnings', url], { timeout: 90_000, maxBuffer: 20 * 1024 * 1024 })
  return infoFrom(JSON.parse(stdout) as Record<string, unknown>)
}

export async function getYouTubeFormats(input: string): Promise<YouTubeFormats> {
  const url = validateUrl(input, 'youtube')
  const { stdout } = await execa('yt-dlp', [...ytDlpRuntimeArgs, '--dump-single-json', '--no-playlist', '--no-warnings', url], { timeout: 90_000, maxBuffer: 20 * 1024 * 1024 })
  const data = JSON.parse(stdout) as Record<string, unknown> & { formats?: Array<{ height?: number | null; abr?: number | null; vcodec?: string; acodec?: string }> }
  const videoHeights = [...new Set((data.formats ?? []).filter((format) => format.vcodec && format.vcodec !== 'none' && format.height).map((format) => Number(format.height)))].filter(Number.isFinite).sort((a, b) => a - b)
  const audioBitrates = [...new Set((data.formats ?? []).filter((format) => format.acodec && format.acodec !== 'none' && format.abr).map((format) => Math.round(Number(format.abr))))].filter(Number.isFinite).sort((a, b) => a - b)
  return { ...infoFrom(data), videoHeights, audioBitrates }
}

export async function searchYouTube(input: string, limit = 10): Promise<YouTubeSearchResult[]> {
  const query = input.trim()
  if (!query) throw new Error('Debes indicar qué quieres buscar en YouTube.')
  const count = Math.max(1, Math.min(12, limit))
  const { stdout } = await execa('yt-dlp', [
    ...ytDlpRuntimeArgs, '--dump-single-json', '--skip-download', '--no-warnings', `ytsearch${count}:${query}`,
  ], { timeout: 120_000, maxBuffer: 30 * 1024 * 1024 })
  const data = JSON.parse(stdout) as { entries?: Array<Record<string, unknown> & { id?: string }> }
  return (data.entries ?? []).flatMap((entry) => {
    if (!entry.id) return []
    const info = infoFrom(entry)
    return [{ ...info, id: entry.id, channel: info.uploader ?? 'Canal desconocido', url: info.webpageUrl ?? `https://www.youtube.com/watch?v=${entry.id}` }]
  })
}

export function downloadYouTubeAudio(input: string) { return runDownload(validateUrl(input, 'youtube'), audioArgs) }
export function downloadYouTubeVideo(input: string, quality = 720) { return runDownload(validateUrl(input, 'youtube'), videoArgs(quality)) }
export function downloadYouTubeSearchAudio(input: string) {
  const query = input.trim(); if (!query) throw new Error('Debes indicar una búsqueda.')
  return runDownload(`ytsearch1:${query}`, audioArgs)
}
export function downloadYouTubeSearchVideo(input: string, quality = 720) {
  const query = input.trim(); if (!query) throw new Error('Debes indicar una búsqueda.')
  return runDownload(`ytsearch1:${query}`, videoArgs(quality))
}
export function downloadSoundCloud(input: string) {
  const value = input.trim(); if (!value) throw new Error('Debes indicar una URL o búsqueda de SoundCloud.')
  return runDownload(/^https?:\/\//i.test(value) ? validateSoundCloudUrl(value) : `scsearch1:${value}`, audioArgs)
}
export function downloadSocialVideo(input: string, platform: Exclude<DownloadPlatform, 'youtube'>) {
  return runDownload(validateUrl(input, platform), ['-f', 'bv*+ba/b', '--merge-output-format', 'mp4', '--remux-video', 'mp4'])
}
