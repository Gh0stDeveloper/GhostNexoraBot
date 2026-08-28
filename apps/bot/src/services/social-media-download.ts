import { createWriteStream } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import os from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'
import { resolveCobaltMedia } from './cobalt-media.js'
import { resolveExternalSocial } from './social-external.js'
import { downloadInstagramImagesFromPost } from './instagram-image-download-v10.js'

export type SocialMediaKind = 'image' | 'video' | 'gif' | 'audio' | 'unknown'

export type SocialDownloadedFile = {
  kind: SocialMediaKind
  filePath: string
  fileName: string
  size: number
  sourceUrl: string
}

export type SocialDownloadBundle = {
  files: SocialDownloadedFile[]
  provider: string
  cleanup: () => Promise<void>
}

const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').slice(0, 220)
}

function guessKind(url: string, hint?: SocialMediaKind): SocialMediaKind {
  if (hint && hint !== 'unknown') return hint
  const target = url.toLowerCase()
  if (/\.(?:jpe?g|png|webp)(?:$|[?#])/i.test(target)) return 'image'
  if (/\.gif(?:$|[?#])/i.test(target)) return 'gif'
  if (/\.(?:mp3|m4a|ogg|opus|wav)(?:$|[?#])/i.test(target)) return 'audio'
  if (/\.(?:mp4|webm|mov|m4v)(?:$|[?#])/i.test(target)) return 'video'
  return 'video'
}

function safeBase(value: string) {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 60) || 'media'
}

function extensionFor(kind: SocialMediaKind, contentType?: string, url?: string) {
  const type = (contentType ?? '').toLowerCase()
  if (type.includes('png') || kind === 'image' && /\.png/i.test(url ?? '')) return 'png'
  if (type.includes('webp')) return 'webp'
  if (type.includes('gif') || kind === 'gif') return 'gif'
  if (type.includes('jpeg') || type.includes('jpg') || kind === 'image') return 'jpg'
  if (type.includes('mpeg') || type.includes('mp3') || kind === 'audio') return 'mp3'
  if (type.includes('webm')) return 'webm'
  return 'mp4'
}

async function downloadRemoteFile(
  url: string,
  dir: string,
  index: number,
  kindHint?: SocialMediaKind,
  referer?: string,
): Promise<SocialDownloadedFile> {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': UA,
      accept: '*/*',
      ...(referer ? { referer } : {}),
    },
    signal: AbortSignal.timeout(15 * 60_000),
  })
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status} al descargar media.`)

  const contentType = response.headers.get('content-type') ?? ''
  const kind = guessKind(url, kindHint)
  const ext = extensionFor(kind, contentType, url)
  const fileName = `${safeBase(kind)}-${String(index).padStart(2, '0')}.${ext}`
  const filePath = path.join(dir, fileName)

  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > config.maxDownloadBytes) {
    throw new Error(`El archivo supera el límite de ${config.maxDownloadMb} MB.`)
  }

  let size = 0
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length
      if (size > config.maxDownloadBytes) callback(new Error(`El archivo supera el límite de ${config.maxDownloadMb} MB.`))
      else callback(null, chunk)
    },
  })
  await pipeline(response.body as any, limiter, createWriteStream(filePath))
  if (size <= 0) throw new Error('El proveedor devolvió un archivo vacío.')

  return { kind, filePath, fileName, size, sourceUrl: url }
}

async function downloadUrlList(
  urls: Array<{ url: string; kind?: SocialMediaKind }>,
  provider: string,
  referer?: string,
): Promise<SocialDownloadBundle> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-social-'))
  try {
    const files: SocialDownloadedFile[] = []
    for (const [index, item] of urls.slice(0, 12).entries()) {
      try {
        files.push(await downloadRemoteFile(item.url, dir, index + 1, item.kind, referer))
      } catch (error) {
        logger.warn({ errorMessage: errorMessage(error), url: item.url }, 'social media item download failed')
      }
    }
    if (!files.length) throw new Error('No se pudo descargar ningún archivo de media.')
    return { files, provider, cleanup: () => rm(dir, { recursive: true, force: true }) }
  } catch (error) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

function ytDlpCookieArgs() {
  const file = config.ytdlpCookiesFile
  if (!file) return [] as string[]
  return ['--cookies', file]
}

async function downloadInstagramViaYtDlp(url: string): Promise<SocialDownloadBundle> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-ig-ytdlp-'))
  const output = path.join(dir, 'ig-%(autonumber)02d.%(ext)s')
  try {
    await execa('yt-dlp', [
      '--js-runtimes', 'node',
      '--no-playlist',
      '--no-warnings',
      '--no-progress',
      '--restrict-filenames',
      ...ytDlpCookieArgs(),
      '-f', 'bv*+ba/b',
      '--merge-output-format', 'mp4',
      '-o', output,
      url,
    ], { timeout: 12 * 60_000, maxBuffer: 20 * 1024 * 1024 })

    const { readdir } = await import('node:fs/promises')
    const entries = (await readdir(dir)).filter((name) => !name.endsWith('.part') && !name.endsWith('.ytdl'))
    if (!entries.length) throw new Error('yt-dlp no produjo archivos.')

    const files: SocialDownloadedFile[] = []
    for (const [index, name] of entries.entries()) {
      const filePath = path.join(dir, name)
      const fileStat = await stat(filePath)
      if (fileStat.size > config.maxDownloadBytes) throw new Error(`El archivo supera el límite de ${config.maxDownloadMb} MB.`)
      const lower = name.toLowerCase()
      const kind: SocialMediaKind = /\.(?:jpe?g|png|webp)$/i.test(lower)
        ? 'image'
        : /\.gif$/i.test(lower)
          ? 'gif'
          : /\.(?:mp3|m4a)$/i.test(lower)
            ? 'audio'
            : 'video'
      files.push({ kind, filePath, fileName: name, size: fileStat.size, sourceUrl: url })
      if (index >= 11) break
    }
    return { files, provider: 'yt-dlp', cleanup: () => rm(dir, { recursive: true, force: true }) }
  } catch (error) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

function assertInstagramUrl(input: string) {
  let url: URL
  try { url = new URL(input) } catch { throw new Error('URL de Instagram inválida.') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Solo se permiten URLs HTTP/HTTPS.')
  if (!/(^|\.)instagram\.com$/i.test(url.hostname)) throw new Error('La URL no pertenece a Instagram.')
  return url.toString()
}

function assertPinterestUrl(input: string) {
  let url: URL
  try { url = new URL(input) } catch { throw new Error('URL de Pinterest inválida.') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Solo se permiten URLs HTTP/HTTPS.')
  const host = url.hostname.toLowerCase()
  if (!(host === 'pin.it' || host.endsWith('.pinterest.com') || host === 'pinterest.com')) {
    throw new Error('La URL no pertenece a Pinterest.')
  }
  return url.toString()
}

export function pinterestOriginalUrl(url: string) {
  try {
    const parsed = new URL(url)
    if (!/(^|\.)pinimg\.com$/i.test(parsed.hostname)) return url
    parsed.pathname = parsed.pathname.replace(/\/\d+x\//i, '/originals/')
    return parsed.toString()
  } catch {
    return url
  }
}

export async function expandPinterestUrl(input: string) {
  const start = assertPinterestUrl(input)
  const response = await fetch(start, {
    redirect: 'follow',
    headers: { 'user-agent': UA, accept: 'text/html,*/*' },
    signal: AbortSignal.timeout(20_000),
  })
  const finalUrl = response.url || start
  return assertPinterestUrl(finalUrl)
}

async function resolvePinterestPinMedia(pinUrl: string): Promise<Array<{ url: string; kind: SocialMediaKind }>> {
  const html = await fetch(pinUrl, {
    redirect: 'follow',
    headers: {
      'user-agent': UA,
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'es-MX,es;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(25_000),
  }).then(async (response) => {
    if (!response.ok) throw new Error(`Pinterest respondió HTTP ${response.status}.`)
    return response.text()
  })

  const urls = new Set<string>()
  const patterns = [
    /"url"\s*:\s*"(https:\\?\/\\?\/i\.pinimg\.com[^"\\]*(?:\\u002F|\/)originals(?:\\u002F|\/)[^"\\]+)"/gi,
    /"orig"\s*:\s*\{[^}]*"url"\s*:\s*"(https:\\?\/\\?\/[^"\\]+)"/gi,
    /property=["']og:image["'][^>]+content=["']([^"']+)["']/gi,
    /content=["']([^"']+)["'][^>]+property=["']og:image["']/gi,
    /property=["']og:video["'][^>]+content=["']([^"']+)["']/gi,
    /https:\\?\/\\?\/i\.pinimg\.com[^"'\\ \s]+/gi,
    /https:\\?\/\\?\/v1\.pinimg\.com[^"'\\ \s]+/gi,
  ]

  const decode = (raw: string) => raw
    .replace(/\\u0026/g, '&')
    .replace(/\\u002F/g, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const candidate = decode(match[1] ?? match[0] ?? '')
      try {
        const absolute = new URL(candidate).toString()
        if (/pinimg\.com/i.test(absolute) || /\.(?:mp4|webm|mov)(?:$|[?#])/i.test(absolute)) {
          urls.add(pinterestOriginalUrl(absolute))
        }
      } catch { /* ignore */ }
    }
  }

  const ranked = [...urls].sort((a, b) => {
    const score = (value: string) => {
      if (/\/originals\//i.test(value)) return 3
      if (/\/736x\//i.test(value)) return 2
      if (/\/474x\//i.test(value)) return 1
      return 0
    }
    return score(b) - score(a)
  })

  return ranked.slice(0, 10).map((url) => ({
    url,
    kind: /\.(?:mp4|webm|mov)(?:$|[?#])/i.test(url) ? 'video' as const : 'image' as const,
  }))
}

/**
 * Instagram: Cobalt → yt-dlp (+cookies) → instatiktok → scrape HTML de imágenes.
 */
export async function downloadInstagramMedia(input: string, preferImages = false): Promise<SocialDownloadBundle> {
  const url = assertInstagramUrl(input)
  const errors: string[] = []

  try {
    const cobalt = await resolveCobaltMedia(url)
    const mapped = cobalt.items
      .filter((item) => (preferImages ? item.type === 'image' || item.type === 'gif' : true))
      .map((item) => ({ url: item.url, kind: item.type }))
    if (mapped.length) {
      return await downloadUrlList(mapped, `cobalt:${new URL(cobalt.provider).hostname}`, 'https://www.instagram.com/')
    }
  } catch (error) {
    errors.push(`Cobalt: ${errorMessage(error)}`)
  }

  if (!preferImages) {
    try {
      return await downloadInstagramViaYtDlp(url)
    } catch (error) {
      errors.push(`yt-dlp: ${errorMessage(error)}`)
    }

    try {
      const direct = await resolveExternalSocial(url, 'instagram')
      return await downloadUrlList([{ url: direct, kind: 'video' }], 'instatiktok', 'https://www.instagram.com/')
    } catch (error) {
      errors.push(`instatiktok: ${errorMessage(error)}`)
    }
  }

  try {
    const legacy = await downloadInstagramImagesFromPost(url)
    return {
      files: legacy.images.map((image) => ({
        kind: 'image' as const,
        filePath: image.filePath,
        fileName: image.fileName,
        size: image.size,
        sourceUrl: image.sourceUrl,
      })),
      provider: 'instagram-html',
      cleanup: legacy.cleanup,
    }
  } catch (error) {
    errors.push(`HTML: ${errorMessage(error)}`)
  }

  throw new Error(`No pude obtener media de Instagram. ${errors.join(' · ')}`)
}

/**
 * Pinterest (URL de pin / pin.it): Cobalt → expand + HTML/originals → disco.
 */
export async function downloadPinterestMedia(input: string): Promise<SocialDownloadBundle> {
  const expanded = await expandPinterestUrl(input).catch(() => assertPinterestUrl(input))
  const errors: string[] = []

  try {
    const cobalt = await resolveCobaltMedia(expanded)
    const mapped = cobalt.items.map((item) => ({
      url: pinterestOriginalUrl(item.url),
      kind: item.type,
    }))
    return await downloadUrlList(mapped, `cobalt:${new URL(cobalt.provider).hostname}`, 'https://www.pinterest.com/')
  } catch (error) {
    errors.push(`Cobalt: ${errorMessage(error)}`)
  }

  try {
    const items = await resolvePinterestPinMedia(expanded)
    if (!items.length) throw new Error('Pinterest no expuso media pública en el pin.')
    return await downloadUrlList(items, 'pinterest-html', 'https://www.pinterest.com/')
  } catch (error) {
    errors.push(`HTML: ${errorMessage(error)}`)
  }

  throw new Error(`No pude obtener media de Pinterest. ${errors.join(' · ')}`)
}
