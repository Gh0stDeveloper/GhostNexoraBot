import { createWriteStream } from 'node:fs'
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { load } from 'cheerio'
import { execa } from 'execa'
import { config } from '../config.js'

export type AdultProvider = 'xvideos' | 'xnxx' | 'pornhub'
export type AdultSearchResult = { title: string; url: string; thumbnail?: string }

type DirectMedia = { url: string; kind: 'mp4' | 'hls'; quality: number }

const providerHosts: Record<AdultProvider, string[]> = {
  xvideos: ['xvideos.com', 'www.xvideos.com'],
  xnxx: ['xnxx.com', 'www.xnxx.com'],
  pornhub: ['pornhub.com', 'www.pornhub.com'],
}

const prohibited = /\b(child|children|underage|minor|preteen|pre-teen|niñ[oa]s?|menor(?:es)?)\b/i
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function safeSearchText(input: string) {
  const value = input.trim()
  if (!value) throw new Error('Indica qué deseas buscar.')
  if (prohibited.test(value)) throw new Error('Esa búsqueda está bloqueada por seguridad.')
  return value
}

function validateAdultUrl(input: string) {
  const url = new URL(input)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL inválida.')
  const match = (Object.entries(providerHosts) as Array<[AdultProvider, string[]]>).find(([, hosts]) => hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)))
  if (!match) throw new Error('Proveedor 18+ no soportado.')
  if (prohibited.test(url.pathname + url.search)) throw new Error('URL bloqueada por seguridad.')
  return { url: url.toString(), provider: match[0] }
}

function absolute(base: string, href?: string) {
  if (!href) return null
  try { return new URL(href, base).toString() } catch { return null }
}

function decodeMediaUrl(value: string) {
  return value
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003d/gi, '=')
    .replace(/\\\//g, '/')
    .replace(/&amp;/gi, '&')
    .replace(/\\x26/gi, '&')
}

function qualityFrom(value: string, fallback = 0) {
  const matches = [...value.matchAll(/(?:^|[^0-9])(144|240|360|480|540|720|1080|1440|2160)p?(?:[^0-9]|$)/gi)]
  if (!matches.length) return fallback
  return Math.max(...matches.map((match) => Number(match[1] ?? 0)))
}

function addCandidate(map: Map<string, DirectMedia>, raw: string | undefined, quality = 0) {
  if (!raw) return
  const decoded = decodeMediaUrl(raw.trim())
  let parsed: URL
  try { parsed = new URL(decoded) } catch { return }
  if (!['http:', 'https:'].includes(parsed.protocol)) return
  const kind = /\.m3u8(?:$|\?)/i.test(parsed.pathname + parsed.search) ? 'hls' : /\.mp4(?:$|\?)/i.test(parsed.pathname + parsed.search) ? 'mp4' : null
  if (!kind) return
  const url = parsed.toString()
  map.set(url, { url, kind, quality: Math.max(quality, qualityFrom(url)) })
}

function extractDirectMedia(provider: AdultProvider, html: string) {
  const candidates = new Map<string, DirectMedia>()
  const decoded = decodeMediaUrl(html)

  if (provider === 'xvideos' || provider === 'xnxx') {
    for (const match of html.matchAll(/html5player\.setVideoUrlHigh\((['"])(.*?)\1\)/gi)) addCandidate(candidates, match[2], 1080)
    for (const match of html.matchAll(/html5player\.setVideoUrlLow\((['"])(.*?)\1\)/gi)) addCandidate(candidates, match[2], 360)
    for (const match of html.matchAll(/html5player\.setVideoHLS\((['"])(.*?)\1\)/gi)) addCandidate(candidates, match[2], 720)
  }

  for (const match of decoded.matchAll(/https?:\/\/[^"'<>\s\\]+?\.(?:mp4|m3u8)(?:\?[^"'<>\s\\]*)?/gi)) {
    addCandidate(candidates, match[0])
  }

  return [...candidates.values()].sort((a, b) => {
    const typeDelta = (b.kind === 'mp4' ? 1 : 0) - (a.kind === 'mp4' ? 1 : 0)
    return typeDelta || b.quality - a.quality
  })
}

async function fetchAdultPage(url: string) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': userAgent,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'es-MX,es;q=0.9,en;q=0.7',
      referer: new URL(url).origin + '/',
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`La página respondió HTTP ${response.status}.`)
  return response.text()
}

async function writeHttpMedia(url: string, referer: string, filePath: string) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': userAgent, referer, accept: '*/*' },
    signal: AbortSignal.timeout(20 * 60_000),
  })
  if (!response.ok || !response.body) throw new Error(`El CDN respondió HTTP ${response.status}.`)
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > config.maxDownloadBytes) throw new Error(`El archivo supera el límite de ${config.maxDownloadMb} MB.`)

  let total = 0
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length
      if (total > config.maxDownloadBytes) callback(new Error(`El archivo supera el límite de ${config.maxDownloadMb} MB.`))
      else callback(null, chunk)
    },
  })
  await pipeline(Readable.fromWeb(response.body as never), limiter, createWriteStream(filePath, { mode: 0o600 }))
  if (total <= 0) throw new Error('El CDN devolvió un archivo vacío.')
}

async function downloadDirect(candidate: DirectMedia, pageUrl: string, dir: string) {
  const filePath = path.join(dir, 'source.mp4')
  if (candidate.kind === 'mp4') {
    await writeHttpMedia(candidate.url, pageUrl, filePath)
    return filePath
  }

  const headers = `Referer: ${pageUrl}\r\nUser-Agent: ${userAgent}\r\n`
  await execa('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-headers', headers,
    '-i', candidate.url,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-c', 'copy', '-movflags', '+faststart',
    '-fs', String(config.maxDownloadBytes),
    filePath,
  ], { timeout: 20 * 60_000 })
  return filePath
}

async function downloadWithYtDlp(url: string, dir: string) {
  const output = path.join(dir, '%(title).80s-%(id)s.%(ext)s')
  await execa('yt-dlp', [
    '--no-playlist', '--no-warnings', '--restrict-filenames', '--no-progress',
    '--referer', url,
    '--user-agent', userAgent,
    '-f', 'bestvideo[vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    '--merge-output-format', 'mp4', '--remux-video', 'mp4',
    '-o', output, url,
  ], { timeout: 20 * 60_000, maxBuffer: 20 * 1024 * 1024 })
  const entries = await readdir(dir)
  const fileName = entries.find((entry) => !entry.endsWith('.part') && !entry.endsWith('.ytdl') && !entry.endsWith('.json'))
  if (!fileName) throw new Error('No se produjo un archivo descargable.')
  return path.join(dir, fileName)
}

async function inspectCodecs(filePath: string) {
  try {
    const { stdout } = await execa('ffprobe', [
      '-v', 'error', '-show_entries', 'stream=codec_type,codec_name,pix_fmt', '-of', 'json', filePath,
    ], { timeout: 30_000 })
    const json = JSON.parse(stdout) as { streams?: Array<{ codec_type?: string; codec_name?: string; pix_fmt?: string }> }
    const video = json.streams?.find((stream) => stream.codec_type === 'video')
    const audio = json.streams?.find((stream) => stream.codec_type === 'audio')
    return { video: video?.codec_name, pixel: video?.pix_fmt, audio: audio?.codec_name }
  } catch {
    return { video: undefined, pixel: undefined, audio: undefined }
  }
}

async function normalizeForWhatsApp(input: string, dir: string) {
  const output = path.join(dir, 'whatsapp.mp4')
  const codecs = await inspectCodecs(input)
  const videoCompatible = codecs.video === 'h264' && (!codecs.pixel || ['yuv420p', 'yuvj420p'].includes(codecs.pixel))
  const audioCompatible = !codecs.audio || codecs.audio === 'aac'

  try {
    if (videoCompatible && audioCompatible) {
      await execa('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y', '-i', input,
        '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', '-movflags', '+faststart', output,
      ], { timeout: 20 * 60_000 })
    } else {
      await execa('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y', '-i', input,
        '-map', '0:v:0', '-map', '0:a:0?',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
        output,
      ], { timeout: 30 * 60_000 })
    }
  } catch {
    await execa('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y', '-i', input,
      '-map', '0:v:0', '-map', '0:a:0?',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', output,
    ], { timeout: 30 * 60_000 })
  }

  const info = await stat(output)
  if (info.size <= 0) throw new Error('El video convertido quedó vacío.')
  if (info.size > config.maxDownloadBytes) throw new Error(`El video supera el límite de ${config.maxDownloadMb} MB después de convertirlo.`)
  if (input !== output) await rm(input, { force: true }).catch(() => undefined)
  return { filePath: output, size: info.size }
}

export async function searchAdult(provider: AdultProvider, input: string, limit = 12): Promise<AdultSearchResult[]> {
  const query = safeSearchText(input)
  const count = Math.max(1, Math.min(15, limit))
  const searchUrl = provider === 'xvideos'
    ? `https://www.xvideos.com/?k=${encodeURIComponent(query)}`
    : provider === 'xnxx'
      ? `https://www.xnxx.com/search/${encodeURIComponent(query)}`
      : `https://www.pornhub.com/video/search?search=${encodeURIComponent(query)}`

  const response = await fetch(searchUrl, {
    headers: { 'user-agent': userAgent, 'accept-language': 'es-MX,es;q=0.9,en;q=0.7' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`${provider} respondió HTTP ${response.status}.`)
  const html = await response.text()
  const $ = load(html)
  const found = new Map<string, AdultSearchResult>()

  const selectors = provider === 'pornhub'
    ? '.pcVideoListItem, li.videoblock, .videoBox'
    : '.thumb-block, .mozaique .thumb-block'

  $(selectors).each((_, element) => {
    if (found.size >= count) return
    const node = $(element)
    const anchor = node.find('a[href]').filter((__, a) => /video|viewkey/i.test($(a).attr('href') ?? '')).first()
    const href = absolute(searchUrl, anchor.attr('href'))
    const title = (anchor.attr('title') ?? node.find('.title a, p.title a, .videoTitle').first().text() ?? '').trim()
    if (!href || !title || prohibited.test(title)) return
    const image = node.find('img').first()
    const thumbnail = absolute(searchUrl, image.attr('data-src') ?? image.attr('data-thumb_url') ?? image.attr('src')) ?? undefined
    found.set(href, { title: title.slice(0, 180), url: href, thumbnail })
  })

  return [...found.values()].slice(0, count)
}

export async function downloadAdult(input: string) {
  const { url, provider } = validateAdultUrl(input)
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-adult-'))
  try {
    let source: string | null = null

    try {
      const html = await fetchAdultPage(url)
      const candidates = extractDirectMedia(provider, html)
      for (const candidate of candidates.slice(0, 6)) {
        try {
          source = await downloadDirect(candidate, url, dir)
          const downloaded = await stat(source)
          if (downloaded.size > 0) break
        } catch {
          source = null
          await rm(path.join(dir, 'source.mp4'), { force: true }).catch(() => undefined)
        }
      }
    } catch {
      source = null
    }

    if (!source) source = await downloadWithYtDlp(url, dir)
    const normalized = await normalizeForWhatsApp(source, dir)
    return {
      filePath: normalized.filePath,
      fileName: `${provider}-${Date.now()}.mp4`,
      size: normalized.size,
      cleanup: () => rm(dir, { recursive: true, force: true }),
    }
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
}
