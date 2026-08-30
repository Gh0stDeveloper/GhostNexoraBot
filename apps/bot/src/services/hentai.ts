import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import os from 'node:os'
import path from 'node:path'
import { load } from 'cheerio'
import { execa } from 'execa'
import { config } from '../config.js'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const CACHE_TTL_MS = 25 * 60_000
const prohibited = /\b(child|children|underage|minor|preteen|pre-teen|loli|shota|niñ[oa]s?|menor(?:es)?)\b/i

export type HentaiItem = {
  token: string
  title: string
  url: string
  thumbnail?: string
  duration?: string
  source: string
}

export type HentaiDownload = {
  title: string
  filePath: string
  fileName: string
  size: number
  cleanup: () => Promise<void>
}

type Cached = { item: HentaiItem; expiresAt: number }
const cache = new Map<string, Cached>()

const providerHosts = [
  'hanime.tv',
  'www.hanime.tv',
  'hentaihaven.xxx',
  'www.hentaihaven.xxx',
  'hentaigasm.com',
  'www.hentaigasm.com',
]

function absolute(base: string, href?: string | null) {
  if (!href) return undefined
  try {
    return new URL(href, base).toString()
  } catch {
    return undefined
  }
}

function safeQuery(input: string) {
  const value = input.trim()
  if (!value) throw new Error('Indica qué deseas buscar.')
  if (prohibited.test(value)) throw new Error('Esa búsqueda está bloqueada por seguridad.')
  return value.slice(0, 120)
}

function safeFileBase(input: string) {
  const clean = input.normalize('NFKD').replace(/[^a-zA-Z0-9._ -]+/g, '').trim().replace(/\s+/g, '-')
  return clean.slice(0, 90) || 'hentai-video'
}

function tokenFor(url: string) {
  return `ht_${createHash('sha256').update(url).digest('hex').slice(0, 16)}`
}

function remember(item: Omit<HentaiItem, 'token'>) {
  const token = tokenFor(item.url)
  const full: HentaiItem = { token, ...item }
  cache.set(token, { item: full, expiresAt: Date.now() + CACHE_TTL_MS })
  return full
}

export function getHentaiItem(token: string): HentaiItem {
  const entry = cache.get(token.trim())
  if (!entry) throw new Error('Ese resultado expiró. Vuelve a buscar con .hentai search <texto>.')
  if (entry.expiresAt <= Date.now()) {
    cache.delete(token.trim())
    throw new Error('Ese resultado expiró. Vuelve a buscar con .hentai search <texto>.')
  }
  return entry.item
}

function hostAllowed(hostname: string) {
  const host = hostname.toLowerCase()
  return providerHosts.some((h) => host === h || host.endsWith(`.${h}`))
}

function validateHentaiUrl(input: string) {
  const url = new URL(input)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL inválida.')
  if (!hostAllowed(url.hostname)) throw new Error('Proveedor hentai no soportado.')
  if (prohibited.test(url.pathname + url.search)) throw new Error('URL bloqueada por seguridad.')
  return url.toString()
}

async function fetchPage(url: string, referer?: string) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'es-MX,es;q=0.9,en;q=0.7',
      ...(referer ? { referer } : {}),
    },
    signal: AbortSignal.timeout(25_000),
  })
  if (!response.ok) throw new Error(`El sitio respondió HTTP ${response.status}.`)
  return { html: await response.text(), finalUrl: response.url }
}

function parseSearchResults(html: string, baseUrl: string, limit: number): HentaiItem[] {
  const $ = load(html)
  const found = new Map<string, HentaiItem>()
  const cap = Math.max(1, Math.min(10, limit))

  $('a[href]').each((_, el) => {
    if (found.size >= cap) return
    const anchor = $(el)
    const href = absolute(baseUrl, anchor.attr('href'))
    if (!href) return
    let parsed: URL
    try {
      parsed = new URL(href)
    } catch {
      return
    }
    if (!hostAllowed(parsed.hostname)) return

    const path = parsed.pathname.toLowerCase()
    const looksVideo =
      /\/(videos?|watch|hentai|anime)\//i.test(path)
      || /\/videos\//i.test(path)
      || /-episode-/i.test(path)
    if (!looksVideo) return
    if (/\/(search|login|register|tag|category|about|contact|dmca)/i.test(path)) return

    const box = anchor.closest('article,li,.card,.item,.video,.post,div').first()
    const title = (
      anchor.attr('title')
      || box.find('.title,h2,h3,.card-title').first().text()
      || anchor.text()
      || ''
    )
      .replace(/\s+/g, ' ')
      .trim()
    if (title.length < 2 || prohibited.test(title)) return

    const key = parsed.origin + parsed.pathname
    if (found.has(key)) return

    const img = box.find('img').first()
    const thumbnail = absolute(
      baseUrl,
      img.attr('data-src') || img.attr('data-lazy-src') || img.attr('src'),
    )
    const duration = box.text().match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/)?.[0]

    found.set(
      key,
      remember({
        title: title.slice(0, 160),
        url: key,
        thumbnail,
        duration,
        source: parsed.hostname.replace(/^www\./, ''),
      }),
    )
  })

  return [...found.values()].slice(0, cap)
}

export async function searchHentai(query: string, page = 1, limit = 8): Promise<{ query: string; page: number; items: HentaiItem[] }> {
  const text = safeQuery(query)
  const safePage = Math.max(1, Math.min(50, Math.floor(page) || 1))
  const endpoints = [
    `https://hanime.tv/search?q=${encodeURIComponent(text)}${safePage > 1 ? `&page=${safePage}` : ''}`,
    `https://www.hentaihaven.xxx/?s=${encodeURIComponent(text)}`,
    `https://hentaigasm.com/?s=${encodeURIComponent(text)}`,
  ]

  const all: HentaiItem[] = []
  const seen = new Set<string>()

  for (const endpoint of endpoints) {
    if (all.length >= limit) break
    try {
      const pageData = await fetchPage(endpoint)
      const items = parseSearchResults(pageData.html, pageData.finalUrl, limit)
      for (const item of items) {
        if (seen.has(item.url)) continue
        seen.add(item.url)
        all.push(item)
        if (all.length >= limit) break
      }
    } catch {
      // best-effort multi-source
    }
  }

  return { query: text, page: safePage, items: all.slice(0, limit) }
}

export async function exploreHentai(mode: 'hot' | 'new' = 'hot', page = 1, limit = 8) {
  const safePage = Math.max(1, Math.min(50, Math.floor(page) || 1))
  const endpoints =
    mode === 'new'
      ? [
          `https://hanime.tv/browse/latest${safePage > 1 ? `?page=${safePage}` : ''}`,
          'https://www.hentaihaven.xxx/',
        ]
      : [
          `https://hanime.tv/browse/trending${safePage > 1 ? `?page=${safePage}` : ''}`,
          'https://hentaigasm.com/',
        ]

  const all: HentaiItem[] = []
  const seen = new Set<string>()
  for (const endpoint of endpoints) {
    if (all.length >= limit) break
    try {
      const pageData = await fetchPage(endpoint)
      const items = parseSearchResults(pageData.html, pageData.finalUrl, limit)
      for (const item of items) {
        if (seen.has(item.url)) continue
        seen.add(item.url)
        all.push(item)
        if (all.length >= limit) break
      }
    } catch {
      // continue
    }
  }
  return { mode, page: safePage, items: all.slice(0, limit) }
}

function extractMediaCandidates(html: string, pageUrl: string): string[] {
  const candidates = new Set<string>()
  const decoded = html
    .replace(/\\u0026/gi, '&')
    .replace(/\\u002f/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/gi, '&')

  for (const match of decoded.matchAll(/https?:\/\/[^"'<>\s\\]+?\.(?:mp4|m3u8)(?:\?[^"'<>\s\\]*)?/gi)) {
    try {
      const u = new URL(match[0])
      if (['http:', 'https:'].includes(u.protocol)) candidates.add(u.toString())
    } catch {
      /* ignore */
    }
  }

  const $ = load(html)
  $('video source, video, a[href]').each((_, el) => {
    const href = absolute(pageUrl, $(el).attr('src') || $(el).attr('data-src') || $(el).attr('href'))
    if (!href) return
    if (/\.(?:mp4|m3u8)(?:$|[?#])/i.test(href)) candidates.add(href)
  })

  return [...candidates]
}

async function downloadDirect(url: string, referer: string, filePath: string) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': USER_AGENT,
      accept: 'video/mp4,video/*;q=0.9,*/*;q=0.5',
      referer,
    },
    signal: AbortSignal.timeout(20 * 60_000),
  })
  if (!response.ok || !response.body) throw new Error(`CDN respondió HTTP ${response.status}.`)

  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > config.maxDownloadBytes) {
    throw new Error(`El video supera el límite de ${config.maxDownloadMb} MB.`)
  }

  let total = 0
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length
      if (total > config.maxDownloadBytes) {
        callback(new Error(`El video supera el límite de ${config.maxDownloadMb} MB.`))
      } else {
        callback(null, chunk)
      }
    },
  })
  await pipeline(response.body as any, limiter, createWriteStream(filePath))
  if (total <= 0) throw new Error('Archivo vacío.')
}

async function downloadHls(url: string, referer: string, filePath: string) {
  const headers = [`Referer: ${referer}`, `User-Agent: ${USER_AGENT}`].join('\r\n') + '\r\n'
  await execa(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-headers',
      headers,
      '-i',
      url,
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      '-fs',
      String(config.maxDownloadBytes),
      filePath,
    ],
    { timeout: 20 * 60_000 },
  )
  const info = await stat(filePath)
  if (info.size <= 0) throw new Error('HLS vacío.')
  if (info.size > config.maxDownloadBytes) {
    throw new Error(`El video supera el límite de ${config.maxDownloadMb} MB.`)
  }
}

export async function downloadHentai(tokenOrUrl: string): Promise<HentaiDownload> {
  let pageUrl: string
  let title: string

  if (/^ht_[a-f0-9]{16}$/i.test(tokenOrUrl.trim())) {
    const item = getHentaiItem(tokenOrUrl.trim())
    pageUrl = item.url
    title = item.title
  } else {
    pageUrl = validateHentaiUrl(tokenOrUrl.trim())
    title = 'Hentai'
  }

  const page = await fetchPage(pageUrl)
  const $ = load(page.html)
  const pageTitle = ($('meta[property="og:title"]').attr('content') || $('h1').first().text() || title)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
  if (prohibited.test(pageTitle)) throw new Error('Contenido bloqueado por seguridad.')

  const candidates = extractMediaCandidates(page.html, page.finalUrl)
  if (!candidates.length) {
    throw new Error('No se encontró una fuente de video descargable en esa página.')
  }

  const dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-hentai-'))
  const fileName = `${safeFileBase(pageTitle)}.mp4`
  const filePath = path.join(dir, fileName)

  try {
    let lastError: unknown
    for (const candidate of candidates.slice(0, 8)) {
      try {
        if (/\.m3u8(?:$|\?)/i.test(candidate)) {
          await downloadHls(candidate, page.finalUrl, filePath)
        } else {
          await downloadDirect(candidate, page.finalUrl, filePath)
        }
        const size = (await stat(filePath)).size
        if (size > 0) {
          return {
            title: pageTitle,
            filePath,
            fileName,
            size,
            cleanup: () => rm(dir, { recursive: true, force: true }),
          }
        }
      } catch (error) {
        lastError = error
        await rm(filePath, { force: true }).catch(() => undefined)
      }
    }
    if (lastError instanceof Error) throw lastError
    throw new Error('No se pudo completar la descarga del video hentai.')
  } catch (error) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}
