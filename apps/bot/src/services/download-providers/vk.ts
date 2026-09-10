import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
import { config } from '../../config.js'
import { downloadProviderFile } from './http.js'
import { withProviderTelemetry } from './runtime.js'

const VK_INPUT_HOSTS = [
  /^(?:m\.|www\.)?vk\.com$/i,
  /^(?:www\.)?vkvideo\.ru$/i,
  /^live\.vkvideo\.ru$/i,
]
const VK_MEDIA_HOSTS = [
  /(^|\.)userapi\.com$/i,
  /(^|\.)vkusercdn\.ru$/i,
  /(^|\.)vkuser\.net$/i,
  /(^|\.)vkuseraudio\.net$/i,
  /(^|\.)mycdn\.me$/i,
  /(^|\.)vk\.com$/i,
  /(^|\.)vkvideo\.ru$/i,
]

function validateVkUrl(input: string) {
  let url: URL
  try { url = new URL(input) } catch { throw new Error('URL de VK inválida.') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Solo se permiten URLs HTTP/HTTPS.')
  if (!VK_INPUT_HOSTS.some((pattern) => pattern.test(url.hostname))) throw new Error('La URL no pertenece a VK/VK Video.')
  return url.toString()
}

export function vkVideoRefFromUrl(input: string) {
  const url = new URL(validateVkUrl(input))
  const source = `${url.pathname}${url.search}`
  const match = /(?:video|clip)(-?\d+)_(\d+)/i.exec(source)
  if (!match) return undefined
  return { ownerId: match[1]!, videoId: match[2]!, id: `${match[1]}_${match[2]}` }
}

type VkApiResponse = {
  response?: {
    count?: number
    items?: Array<{
      id?: number
      owner_id?: number
      title?: string
      duration?: number
      player?: string
      files?: Record<string, string | undefined>
    }>
  }
  error?: { error_code?: number; error_msg?: string }
}

const QUALITY_ORDER = [4320, 2560, 2160, 1440, 1080, 720, 480, 360, 240, 144]

export function chooseVkMp4(files: Record<string, string | undefined>) {
  for (const quality of QUALITY_ORDER) {
    const url = files[`mp4_${quality}`]
    if (url) return { url, quality }
  }
  const fallback = Object.entries(files)
    .filter(([key, value]) => /^mp4_\d+$/i.test(key) && Boolean(value))
    .map(([key, value]) => ({ url: value!, quality: Number(key.replace(/\D/g, '')) || 0 }))
    .sort((a, b) => b.quality - a.quality)[0]
  return fallback
}

export async function resolveVkOfficial(input: string) {
  const url = validateVkUrl(input)
  const ref = vkVideoRefFromUrl(url)
  if (!ref) throw new Error('La URL no contiene un identificador owner_id/video_id compatible con video.get.')
  if (!config.vkAccessToken) throw new Error('VK_ACCESS_TOKEN no está configurado.')

  return withProviderTelemetry('vk-official', 'resolve', async () => {
    const endpoint = new URL('https://api.vk.com/method/video.get')
    endpoint.searchParams.set('videos', ref.id)
    endpoint.searchParams.set('access_token', config.vkAccessToken)
    endpoint.searchParams.set('v', '5.199')
    const response = await fetch(endpoint, {
      headers: { accept: 'application/json', 'user-agent': 'GhostNexoraBot/2.0' },
      signal: AbortSignal.timeout(25_000),
    })
    const payload = await response.json().catch(() => ({})) as VkApiResponse
    if (!response.ok) throw new Error(`VK API HTTP ${response.status}.`)
    if (payload.error) throw new Error(`VK API ${payload.error.error_code ?? 'error'}: ${payload.error.error_msg ?? 'sin detalle'}`)
    const item = payload.response?.items?.[0]
    if (!item) throw new Error('VK video.get no devolvió el video solicitado.')
    const selected = chooseVkMp4(item.files ?? {})
    if (!selected?.url) throw new Error('VK video.get no expuso una variante MP4 descargable para este video.')
    return {
      url: selected.url,
      quality: selected.quality,
      title: item.title?.trim() || 'VK Video',
      duration: item.duration,
      ownerId: item.owner_id,
      videoId: item.id,
    }
  })
}

export type VkDownloadBundle = {
  filePath: string
  fileName: string
  size: number
  provider: 'vk-official' | 'vk-ytdlp'
  quality?: number
  cleanup: () => Promise<void>
}

async function downloadVkViaYtDlp(url: string): Promise<Omit<VkDownloadBundle, 'provider'>> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-vk-ytdlp-'))
  const output = path.join(dir, 'vk-%(id)s.%(ext)s')
  try {
    await execa('yt-dlp', [
      '--js-runtimes', 'node',
      '--no-playlist',
      '--no-warnings',
      '--no-progress',
      '--restrict-filenames',
      ...(config.ytdlpCookiesFile ? ['--cookies', config.ytdlpCookiesFile] : []),
      '-f', 'bv*+ba/b',
      '--merge-output-format', 'mp4',
      '--remux-video', 'mp4',
      '-o', output,
      url,
    ], { timeout: 20 * 60_000, maxBuffer: 20 * 1024 * 1024 })

    const entries = (await readdir(dir)).filter((entry) => !entry.endsWith('.part') && !entry.endsWith('.ytdl') && !entry.endsWith('.json'))
    const fileName = entries[0]
    if (!fileName) throw new Error('yt-dlp no produjo un archivo para VK.')
    const filePath = path.join(dir, fileName)
    const info = await stat(filePath)
    if (info.size <= 0) throw new Error('yt-dlp produjo un archivo vacío para VK.')
    if (info.size > config.maxDownloadBytes) throw new Error(`El video supera el límite configurado de ${config.maxDownloadMb} MB.`)
    return { filePath, fileName, size: info.size, cleanup: () => rm(dir, { recursive: true, force: true }) }
  } catch (error) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

export async function downloadVkVideo(input: string): Promise<VkDownloadBundle> {
  const url = validateVkUrl(input)
  const officialErrors: string[] = []

  if (config.vkAccessToken && vkVideoRefFromUrl(url)) {
    try {
      const resolved = await resolveVkOfficial(url)
      const file = await withProviderTelemetry('vk-official', 'download', () => downloadProviderFile(resolved.url, {
        allowedHosts: VK_MEDIA_HOSTS,
        provider: 'vk-official',
        fileBase: `vk-${resolved.ownerId ?? 'video'}-${resolved.videoId ?? 'media'}`,
        extension: 'mp4',
        referer: url,
      }))
      return { filePath: file.filePath, fileName: file.fileName, size: file.size, provider: 'vk-official', quality: resolved.quality, cleanup: file.cleanup }
    } catch (error) {
      officialErrors.push(error instanceof Error ? error.message : String(error))
    }
  }

  try {
    const result = await withProviderTelemetry('vk-ytdlp', 'download', () => downloadVkViaYtDlp(url))
    return { ...result, provider: 'vk-ytdlp' }
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error)
    const official = officialErrors.length ? `${officialErrors.join(' · ')} · ` : ''
    throw new Error(`No pude descargar el video público de VK. ${official}${fallback}`)
  }
}
