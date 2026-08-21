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

const hosts: Record<DownloadPlatform, string[]> = {
  youtube: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'music.youtube.com'],
  tiktok: ['tiktok.com', 'www.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'],
  instagram: ['instagram.com', 'www.instagram.com'],
  facebook: ['facebook.com', 'www.facebook.com', 'fb.watch', 'm.facebook.com'],
  twitter: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'],
}

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

async function runDownload(url: string, args: string[]): Promise<DownloadResult> {
  const dir = await prepareTempDir()
  const output = path.join(dir, '%(title).80s-%(id)s.%(ext)s')
  try {
    await execa('yt-dlp', [
      '--no-playlist',
      '--no-warnings',
      '--restrict-filenames',
      '--no-progress',
      '-o', output,
      ...args,
      url,
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

export async function getYouTubeFormats(input: string): Promise<YouTubeFormats> {
  const url = validateUrl(input, 'youtube')
  const { stdout } = await execa('yt-dlp', ['--dump-single-json', '--no-playlist', '--no-warnings', url], { timeout: 60_000 })
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

export function downloadYouTubeAudio(input: string) {
  const url = validateUrl(input, 'youtube')
  return runDownload(url, ['-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', '0'])
}

export function downloadYouTubeVideo(input: string, quality = 720) {
  const url = validateUrl(input, 'youtube')
  const height = Math.max(144, Math.min(2160, Number.isFinite(quality) ? quality : 720))
  return runDownload(url, [
    '-f',
    `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${height}][ext=mp4]/best[height<=${height}]`,
    '--merge-output-format',
    'mp4',
  ])
}

export function downloadSocialVideo(input: string, platform: Exclude<DownloadPlatform, 'youtube'>) {
  const url = validateUrl(input, platform)
  return runDownload(url, ['-f', 'bv*+ba/b', '--merge-output-format', 'mp4', '--remux-video', 'mp4'])
}
