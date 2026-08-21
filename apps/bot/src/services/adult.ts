import { createWriteStream } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
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
type ProviderCookies = Partial<Record<AdultProvider, Record<string, string>>>

const providerHosts: Record<AdultProvider, string[]> = {
  xvideos: ['xvideos.com', 'www.xvideos.com'],
  xnxx: ['xnxx.com', 'www.xnxx.com'],
  pornhub: ['pornhub.com', 'www.pornhub.com'],
}

const mediaHosts: Record<AdultProvider, string[]> = {
  xvideos: ['xvideos.com', 'xvideos-cdn.com'],
  xnxx: ['xnxx.com', 'xnxx-cdn.com', 'xvideos-cdn.com'],
  pornhub: ['pornhub.com', 'phncdn.com'],
}

const prohibited = /\b(child|children|underage|minor|preteen|pre-teen|niñ[oa]s?|menor(?:es)?)\b/i
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const sessionCookies: ProviderCookies = {}

function safeSearchText(input: string) {
  const value = input.trim()
  if (!value) throw new Error('Indica qué deseas buscar.')
  if (prohibited.test(value)) throw new Error('Esa búsqueda está bloqueada por seguridad.')
  return value
}

function safeFileBase(input: string) {
  const clean = input.normalize('NFKD').replace(/[^a-zA-Z0-9._ -]+/g, '').trim().replace(/\s+/g, '-')
  return clean.slice(0, 90) || 'adult-video'
}

function hostMatches(hostname: string, allowed: string[]) {
  const host = hostname.toLowerCase()
  return allowed.some((candidate) => host === candidate || host.endsWith(`.${candidate}`))
}

function validateAdultUrl(input: string) {
  const url = new URL(input)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL inválida.')
  const match = (Object.entries(providerHosts) as Array<[AdultProvider, string[]]>).find(([, hosts]) => hostMatches(url.hostname, hosts))
  if (!match) throw new Error('Proveedor 18+ no soportado.')
  if (prohibited.test(url.pathname + url.search)) throw new Error('URL bloqueada por seguridad.')
  return { url: url.toString(), provider: match[0] }
}

function validateMediaUrl(provider: AdultProvider, input: string) {
  const url = new URL(input)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('La fuente multimedia usa un protocolo no permitido.')
  if (!hostMatches(url.hostname, mediaHosts[provider])) throw new Error('La fuente multimedia redirigió a un host no permitido.')
  return url.toString()
}

function absolute(base: string, href?: string) {
  if (!href) return null
  try { return new URL(href, base).toString() } catch { return null }
}

function decodeMediaUrl(value: string) {
  return value
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003d/gi, '=')
    .replace(/\\u002f/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/gi, '&')
    .replace(/\\x26/gi, '&')
}

function qualityFrom(value: string, fallback = 0) {
  const matches = [...value.matchAll(/(?:^|[^0-9])(144|240|360|480|540|720|1080|1440|2160)p?(?:[^0-9]|$)/gi)]
  if (!matches.length) return fallback
  return Math.max(...matches.map((match) => Number(match[1] ?? 0)))
}

function addCandidate(provider: AdultProvider, map: Map<string, DirectMedia>, raw: string | undefined, quality = 0) {
  if (!raw) return false
  const decoded = decodeMediaUrl(raw.trim())
  let parsed: URL
  try { parsed = new URL(decoded) } catch { return false }
  if (!['http:', 'https:'].includes(parsed.protocol) || !hostMatches(parsed.hostname, mediaHosts[provider])) return false
  const target = parsed.pathname + parsed.search
  const kind = /\.m3u8(?:$|\?)/i.test(target) ? 'hls' : /\.mp4(?:$|\?)/i.test(target) ? 'mp4' : null
  if (!kind) return false
  const url = parsed.toString()
  map.set(url, { url, kind, quality: Math.max(quality, qualityFrom(url)) })
  return true
}

function parseCookieRow(row: string) {
  const first = row.split(';', 1)[0] ?? ''
  const index = first.indexOf('=')
  if (index <= 0) return null
  const name = first.slice(0, index).trim()
  const value = first.slice(index + 1).trim()
  if (!name) return null
  return { name, value }
}

function cookieHeader(provider: AdultProvider) {
  const defaults = provider === 'pornhub'
    ? { accessAgeDisclaimerPH: '1', platform: 'pc' }
    : {}
  const merged = { ...defaults, ...(sessionCookies[provider] ?? {}) }
  return Object.entries(merged).map(([name, value]) => `${name}=${value}`).join('; ')
}

function absorbCookies(provider: AdultProvider, response: Response) {
  const headers = response.headers as unknown as { getSetCookie?: () => string[] }
  const rows = headers.getSetCookie?.() ?? []
  if (!rows.length) return
  const current = sessionCookies[provider] ?? {}
  for (const row of rows) {
    const parsed = parseCookieRow(row)
    if (!parsed) continue
    if (!parsed.value) delete current[parsed.name]
    else current[parsed.name] = parsed.value
  }
  sessionCookies[provider] = current
}

function requestHeaders(provider: AdultProvider, referer: string, accept: string) {
  return {
    'user-agent': userAgent,
    accept,
    'accept-language': 'es-MX,es;q=0.9,en;q=0.7',
    referer,
    cookie: cookieHeader(provider),
  }
}

function sortCandidates(candidates: Iterable<DirectMedia>) {
  return [...candidates].sort((a, b) => {
    const typeDelta = (b.kind === 'mp4' ? 1 : 0) - (a.kind === 'mp4' ? 1 : 0)
    return typeDelta || b.quality - a.quality
  })
}

function extractDirectMedia(provider: AdultProvider, html: string) {
  const candidates = new Map<string, DirectMedia>()
  const decoded = decodeMediaUrl(html)

  if (provider === 'xvideos' || provider === 'xnxx') {
    for (const match of decoded.matchAll(/html5player\.setVideoUrlHigh\((['"])(.*?)\1\)/gi)) addCandidate(provider, candidates, match[2], 720)
    for (const match of decoded.matchAll(/html5player\.setVideoUrlLow\((['"])(.*?)\1\)/gi)) addCandidate(provider, candidates, match[2], 360)
    for (const match of decoded.matchAll(/html5player\.setVideoHLS\((['"])(.*?)\1\)/gi)) addCandidate(provider, candidates, match[2], 720)
  }

  if (provider === 'pornhub') {
    for (const match of decoded.matchAll(/(?:['"])?quality_(\d+)p(?:['"])?\s*:\s*(['"])(.*?)\2/gi)) {
      addCandidate(provider, candidates, match[3], Number(match[1] ?? 0))
    }
    for (const match of decoded.matchAll(/['"]videoUrl['"]\s*:\s*(['"])(.*?)\1/gi)) {
      const windowStart = Math.max(0, (match.index ?? 0) - 160)
      const windowEnd = Math.min(decoded.length, (match.index ?? 0) + match[0].length + 160)
      addCandidate(provider, candidates, match[2], qualityFrom(decoded.slice(windowStart, windowEnd)))
    }
  }

  for (const match of decoded.matchAll(/https?:\/\/[^"'<>\s\\]+?\.(?:mp4|m3u8)(?:\?[^"'<>\s\\]*)?/gi)) {
    addCandidate(provider, candidates, match[0])
  }

  return sortCandidates(candidates.values())
}

function collectJsonMedia(provider: AdultProvider, value: unknown, candidates: Map<string, DirectMedia>, depth = 0) {
  if (depth > 6 || value === null || value === undefined) return
  if (Array.isArray(value)) {
    for (const item of value) collectJsonMedia(provider, item, candidates, depth + 1)
    return
  }
  if (typeof value !== 'object') return
  const record = value as Record<string, unknown>
  const direct = typeof record.videoUrl === 'string'
    ? record.videoUrl
    : typeof record.video_url === 'string'
      ? record.video_url
      : typeof record.url === 'string'
        ? record.url
        : undefined
  const quality = typeof record.quality === 'number'
    ? record.quality
    : typeof record.quality === 'string'
      ? Number.parseInt(record.quality, 10) || qualityFrom(record.quality)
      : typeof record.height === 'number'
        ? record.height
        : 0
  addCandidate(provider, candidates, direct, quality)
  for (const child of Object.values(record)) collectJsonMedia(provider, child, candidates, depth + 1)
}

async function resolvePornhubDefinitionEndpoints(html: string, pageUrl: string, candidates: Map<string, DirectMedia>) {
  const decoded = decodeMediaUrl(html)
  const endpoints = new Set<string>()
  for (const match of decoded.matchAll(/['"]videoUrl['"]\s*:\s*(['"])(.*?)\1/gi)) {
    const raw = match[2]
    if (!raw || addCandidate('pornhub', candidates, raw)) continue
    try {
      const endpoint = new URL(raw)
      if (['http:', 'https:'].includes(endpoint.protocol) && hostMatches(endpoint.hostname, providerHosts.pornhub)) endpoints.add(endpoint.toString())
    } catch { /* ignore malformed definition URL */ }
  }

  for (const endpoint of [...endpoints].slice(0, 6)) {
    try {
      const response = await fetch(endpoint, {
        redirect: 'follow',
        headers: requestHeaders('pornhub', pageUrl, 'application/json,text/plain,*/*'),
        signal: AbortSignal.timeout(20_000),
      })
      absorbCookies('pornhub', response)
      if (!response.ok) continue
      const final = new URL(response.url)
      if (!hostMatches(final.hostname, providerHosts.pornhub)) continue
      const text = await response.text()
      try {
        collectJsonMedia('pornhub', JSON.parse(text) as unknown, candidates)
      } catch {
        for (const match of decodeMediaUrl(text).matchAll(/https?:\/\/[^"'<>\s\\]+?\.(?:mp4|m3u8)(?:\?[^"'<>\s\\]*)?/gi)) {
          addCandidate('pornhub', candidates, match[0])
        }
      }
    } catch { /* try the next media-definition endpoint */ }
  }
}

async function fetchAdultPage(provider: AdultProvider, url: string) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: requestHeaders(provider, new URL(url).origin + '/', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'),
    signal: AbortSignal.timeout(30_000),
  })
  absorbCookies(provider, response)
  if (!response.ok) throw new Error(`${provider} respondió HTTP ${response.status}.`)
  const finalUrl = new URL(response.url)
  if (!hostMatches(finalUrl.hostname, providerHosts[provider])) throw new Error(`${provider} redirigió a un host no permitido.`)
  return { html: await response.text(), url: finalUrl.toString() }
}

async function writeHttpMedia(provider: AdultProvider, url: string, referer: string, filePath: string) {
  const direct = validateMediaUrl(provider, url)
  const response = await fetch(direct, {
    redirect: 'follow',
    headers: requestHeaders(provider, referer, 'video/mp4,video/*;q=0.9,*/*;q=0.5'),
    signal: AbortSignal.timeout(20 * 60_000),
  })
  absorbCookies(provider, response)
  if (!response.ok || !response.body) throw new Error(`El CDN respondió HTTP ${response.status}.`)
  const finalUrl = validateMediaUrl(provider, response.url)
  if (!finalUrl) throw new Error('El CDN redirigió a una fuente inválida.')
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

async function downloadDirect(provider: AdultProvider, candidate: DirectMedia, pageUrl: string, dir: string) {
  const filePath = path.join(dir, 'source.mp4')
  if (candidate.kind === 'mp4') {
    await writeHttpMedia(provider, candidate.url, pageUrl, filePath)
    return filePath
  }

  const headers = [
    `Referer: ${pageUrl}`,
    `User-Agent: ${userAgent}`,
    cookieHeader(provider) ? `Cookie: ${cookieHeader(provider)}` : '',
  ].filter(Boolean).join('\r\n') + '\r\n'

  await execa('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-headers', headers,
    '-i', validateMediaUrl(provider, candidate.url),
    '-map', '0:v:0', '-map', '0:a:0?',
    '-c', 'copy', '-movflags', '+faststart',
    '-fs', String(config.maxDownloadBytes),
    filePath,
  ], { timeout: 20 * 60_000 })
  const info = await stat(filePath)
  if (info.size <= 0) throw new Error('La lista HLS produjo un archivo vacío.')
  if (info.size > config.maxDownloadBytes) throw new Error(`El archivo supera el límite de ${config.maxDownloadMb} MB.`)
  return filePath
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

function pageTitle(provider: AdultProvider, html: string) {
  const $ = load(html)
  const title = ($('meta[property="og:title"]').attr('content') || $('h1').first().text() || $('title').text() || provider)
    .replace(/\s+/g, ' ')
    .trim()
  return prohibited.test(title) ? provider : title.slice(0, 180)
}

export async function searchAdult(provider: AdultProvider, input: string, limit = 12): Promise<AdultSearchResult[]> {
  const query = safeSearchText(input)
  const count = Math.max(1, Math.min(15, limit))
  const searchUrl = provider === 'xvideos'
    ? `https://www.xvideos.com/?k=${encodeURIComponent(query)}`
    : provider === 'xnxx'
      ? `https://www.xnxx.com/search/${encodeURIComponent(query)}`
      : `https://www.pornhub.com/video/search?search=${encodeURIComponent(query)}`

  const page = await fetchAdultPage(provider, searchUrl)
  const $ = load(page.html)
  const found = new Map<string, AdultSearchResult>()

  const selectors = provider === 'pornhub'
    ? '.pcVideoListItem, li.videoblock, .videoBox'
    : '.thumb-block, .mozaique .thumb-block'

  $(selectors).each((_, element) => {
    if (found.size >= count) return
    const node = $(element)
    const anchor = node.find('a[href]').filter((__, a) => /video|viewkey/i.test($(a).attr('href') ?? '')).first()
    const href = absolute(page.url, anchor.attr('href'))
    const title = (anchor.attr('title') ?? node.find('.title a, p.title a, .videoTitle').first().text() ?? '').trim()
    if (!href || !title || prohibited.test(title)) return
    try {
      const validated = validateAdultUrl(href)
      if (validated.provider !== provider) return
      const image = node.find('img').first()
      const thumbnail = absolute(page.url, image.attr('data-src') ?? image.attr('data-thumb_url') ?? image.attr('src')) ?? undefined
      found.set(validated.url, { title: title.slice(0, 180), url: validated.url, thumbnail })
    } catch { /* ignore invalid result links */ }
  })

  return [...found.values()].slice(0, count)
}

export async function downloadAdult(input: string) {
  const { url, provider } = validateAdultUrl(input)
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-adult-'))
  try {
    const page = await fetchAdultPage(provider, url)
    const candidateMap = new Map<string, DirectMedia>()
    for (const candidate of extractDirectMedia(provider, page.html)) candidateMap.set(candidate.url, candidate)
    if (provider === 'pornhub') await resolvePornhubDefinitionEndpoints(page.html, page.url, candidateMap)
    const candidates = sortCandidates(candidateMap.values())
    if (!candidates.length) throw new Error(`${provider} no publicó una fuente directa descargable para este video.`)

    let source: string | null = null
    let lastError: unknown
    for (const candidate of candidates.slice(0, 10)) {
      try {
        source = await downloadDirect(provider, candidate, page.url, dir)
        const downloaded = await stat(source)
        if (downloaded.size > 0) break
        source = null
      } catch (error) {
        lastError = error
        source = null
        await rm(path.join(dir, 'source.mp4'), { force: true }).catch(() => undefined)
      }
    }

    if (!source) {
      if (lastError instanceof Error && /límite de \d+ MB/i.test(lastError.message)) throw lastError
      throw new Error(`${provider} no permitió completar la descarga directa en este momento.`)
    }

    const normalized = await normalizeForWhatsApp(source, dir)
    const title = pageTitle(provider, page.html)
    return {
      filePath: normalized.filePath,
      fileName: `${safeFileBase(title)}.mp4`,
      size: normalized.size,
      cleanup: () => rm(dir, { recursive: true, force: true }),
    }
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
}
