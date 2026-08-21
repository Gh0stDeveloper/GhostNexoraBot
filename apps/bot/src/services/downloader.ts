import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
import { config } from '../config.js'

export type DownloadPlatform = 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'twitter'

export interface DownloadResult {
  filePath: string
  fileName: string
  size: number
  cleanup: () => Promise<void>
}

export interface YouTubeFormats {
  title: string
  duration?: number
  videoHeights: number[]
  audioBitrates: number[]
}

export interface YouTubeSearchResult {
  id: string
  title: string
  channel: string
  duration?: number
  url: string
}

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
  try {
    url = new URL(value)
  } catch {
    throw new Error('URL inválida.')
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Solo se permiten URLs HTTP/HTTPS.')
  const host = url.hostname.toLowerCase()
  if (!hosts[platform].some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
    throw new Error(`La URL no pertenece a ${platform}.`)
  }
  return url.toString()
}

function validateSoundCloudUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('URL de SoundCloud inválida.')
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Solo se permiten URLs HTTP/HTTPS.')
  const host = url.hostname.toLowerCase()
  if (!soundCloudHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
    throw new Error('La URL no pertenece a SoundCloud.')
  }
  return url.toString()
}

async function prepareTempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'ghostnexora-'))
}

async function findDownloadedFile(dir: string) {
  const entries = await readdir(dir)
  const candidate = entries.find((entry) => !entry.endsWith('.part') && !entry.endsWith('.ytdl'))
  if (!candidate) throw new Error('El descargador no produjo un archivo válido.')
  const filePath = path.join(dir, candidate)
  const fileStat = await stat(filePath)
  if (fileStat.size > config.maxDownloadBytes) {
    throw new Error(`El archivo supera el límite configurado de ${config.maxDownloadMb} MB.`)
  }
  return { filePath, fileName: candidate, size: fileStat.size }
}

async function runDownload(source: string, args: string[]): Promise<DownloadResult> {
  const dir = await prepareTempDir()
  const output = path.join(dir, '%(title).80s-%(id)s.%(ext)s')
  try {
    await execa('yt-dlp', [
      ...ytDlpRuntimeArgs,
      '--no-playlist',
      '--no-warnings',
      '--restrict-filenames',
      '--no-progress',
      '-o', output,
      ...args,
      source,
    ], { timeout: 180_000 })
    const result = await findDownloadedFile(dir)
    return {
      ...result,
      cleanup: () => rm(dir, { recursive: true, force: true }),
    }
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
}

const audioArgs = ['-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', '0']

function videoArgs(quality: number) {
  const height = Math.max(144, Math.min(2160, Number.isFinite(quality) ? quality : 720))
  return [
    '-f',
    `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${height}][ext=mp4]/best[height<=${height}]`,
    '--merge-output-format',
    'mp4',
  ]
}

export async function getYouTubeFormats(input: string): Promise<YouTubeFormats> {
  const url = validateUrl(input, 'youtube')
  const { stdout } = await execa('yt-dlp', [
    ...ytDlpRuntimeArgs,
    '--dump-single-json',
    '--no-playlist',
    '--no-warnings',
    url,
  ], { timeout: 60_000 })
  const data = JSON.parse(stdout) as {
    title?: string
    duration?: number
    formats?: Array<{ height?: number | null; abr?: number | null; vcodec?: string; acodec?: string }>
  }
  const videoHeights = [...new Set((data.formats ?? [])
    .filter((format) => format.vcodec && format.vcodec !== 'none' && format.height)
    .map((format) => Number(format.height)))]
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
  const audioBitrates = [...new Set((data.formats ?? [])
    .filter((format) => format.acodec && format.acodec !== 'none' && format.abr)
    .map((format) => Math.round(Number(format.abr))))]
    .filter(Number.isFinite)
    .sort((a, b) => a - b)

  return { title: data.title ?? 'YouTube', duration: data.duration, videoHeights, audioBitrates }
}

export async function searchYouTube(input: string, limit = 5): Promise<YouTubeSearchResult[]> {
  const query = input.trim()
  if (!query) throw new Error('Debes indicar qué quieres buscar en YouTube.')
  const count = Math.max(1, Math.min(10, limit))
  const { stdout } = await execa('yt-dlp', [
    ...ytDlpRuntimeArgs,
    '--flat-playlist',
    '--dump-single-json',
    '--no-warnings',
    `ytsearch${count}:${query}`,
  ], { timeout: 60_000 })
  const data = JSON.parse(stdout) as {
    entries?: Array<{
      id?: string
      title?: string
      channel?: string
      uploader?: string
      duration?: number
      webpage_url?: string
      url?: string
    }>
  }

  return (data.entries ?? []).flatMap((entry) => {
    if (!entry.id) return []
    return [{
      id: entry.id,
      title: entry.title ?? 'Sin título',
      channel: entry.channel ?? entry.uploader ?? 'Canal desconocido',
      duration: entry.duration,
      url: entry.webpage_url?.startsWith('http') ? entry.webpage_url : `https://www.youtube.com/watch?v=${entry.id}`,
    }]
  })
}

export function downloadYouTubeAudio(input: string) {
  const url = validateUrl(input, 'youtube')
  return runDownload(url, audioArgs)
}

export function downloadYouTubeVideo(input: string, quality = 720) {
  const url = validateUrl(input, 'youtube')
  return runDownload(url, videoArgs(quality))
}

export function downloadYouTubeSearchAudio(input: string) {
  const query = input.trim()
  if (!query) throw new Error('Debes indicar una búsqueda.')
  return runDownload(`ytsearch1:${query}`, audioArgs)
}

export function downloadYouTubeSearchVideo(input: string, quality = 720) {
  const query = input.trim()
  if (!query) throw new Error('Debes indicar una búsqueda.')
  return runDownload(`ytsearch1:${query}`, videoArgs(quality))
}

export function downloadSoundCloud(input: string) {
  const value = input.trim()
  if (!value) throw new Error('Debes indicar una URL o búsqueda de SoundCloud.')
  const source = /^https?:\/\//i.test(value) ? validateSoundCloudUrl(value) : `scsearch1:${value}`
  return runDownload(source, audioArgs)
}

export function downloadSocialVideo(input: string, platform: Exclude<DownloadPlatform, 'youtube'>) {
  const url = validateUrl(input, platform)
  return runDownload(url, ['-f', 'bv*+ba/b', '--merge-output-format', 'mp4', '--remux-video', 'mp4'])
}
