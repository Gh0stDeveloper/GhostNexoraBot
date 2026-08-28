import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import os from 'node:os'
import path from 'node:path'
import * as cheerio from 'cheerio'
import { config } from '../config.js'

const UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
const CACHE_TTL_MS = 25 * 60_000
const MAX_REDIRECT_DEPTH = 4
const SEARCH_TIMEOUT_MS = 15_000
const DOWNLOAD_TIMEOUT_MS = 15 * 60_000

export type HappyModItem = {
  token: string
  name: string
  url: string
  icon?: string
  version?: string
  sizeLabel?: string
  category?: string
  summary?: string
}

export type HappyModDownload = HappyModItem & {
  filePath: string
  fileName: string
  size: number
  cleanup: () => Promise<void>
}

type Cached = { item: HappyModItem; expiresAt: number }
const cache = new Map<string, Cached>()

function compact(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function absolute(base: string, href?: string) {
  if (!href) return undefined
  try {
    const url = new URL(href, base)
    if (!['http:', 'https:'].includes(url.protocol)) return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

function publicHttpUrl(value?: string) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return undefined
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    if (
      host === 'localhost'
      || host === '0.0.0.0'
      || host === '::1'
      || /^127\./.test(host)
      || /^10\./.test(host)
      || /^192\.168\./.test(host)
      || /^169\.254\./.test(host)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return undefined
    }
    return url.toString()
  } catch {
    return undefined
  }
}

function isHappyModHost(hostname: string) {
  return /(^|\.)happymod\.com$/i.test(hostname)
}

function tokenFor(url: string) {
  return createHash('sha256').update(`HappyMod:${url}`).digest('hex').slice(0, 18)
}

function remember(input: Omit<HappyModItem, 'token'>) {
  const token = tokenFor(input.url)
  const item: HappyModItem = { token, ...input }
  cache.set(token, { item, expiresAt: Date.now() + CACHE_TTL_MS })
  return item
}

export function getHappyModItem(token: string): HappyModItem {
  const value = cache.get(token.trim())
  if (!value) throw new Error('Ese resultado de HappyMod expiró. Vuelve a ejecutar .happymod <búsqueda>.')
  if (value.expiresAt <= Date.now()) {
    cache.delete(token.trim())
    throw new Error('Ese resultado de HappyMod expiró. Vuelve a ejecutar .happymod <búsqueda>.')
  }
  return value.item
}

async function fetchHtml(url: string, timeoutMs = SEARCH_TIMEOUT_MS) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': UA,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'es-MX,es;q=0.9,en;q=0.7',
    },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`HappyMod respondió HTTP ${response.status}.`)
  const type = response.headers.get('content-type') ?? ''
  if (!/html|text\//i.test(type) && !/application\/xhtml/i.test(type)) {
    throw new Error('HappyMod no devolvió HTML válido.')
  }
  return { html: await response.text(), finalUrl: response.url }
}

function extractVersion(text: string) {
  return (
    /\bv(?:ersion|ersión)?\s*[:.]?\s*([0-9][\w.+-]*)/i.exec(text)?.[1]
    || /\b([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:[.-][\w]+)?)\b/.exec(text)?.[1]
  )
}

function extractSizeLabel(text: string) {
  return text.match(/\b\d+(?:[.,]\d+)?\s*(?:KB|MB|GB)\b/i)?.[0]
}

function looksLikeAppPage(pathname: string) {
  const p = pathname.toLowerCase()
  if (/search|login|register|category|tag|about|contact|privacy|terms/.test(p)) return false
  return /(?:-mod\/?$|\/app-mod\/|\/mod\/|\.html$)/i.test(p) || p.split('/').filter(Boolean).length >= 1
}

function parseSearchResults(html: string, base: string, query: string, limit: number): HappyModItem[] {
  const $ = cheerio.load(html)
  const results: HappyModItem[] = []
  const seen = new Set<string>()
  const queryToken = (query.split(/\s+/)[0] || query).toLowerCase()

  const candidates = $('a[href]').toArray()
  for (const element of candidates) {
    if (results.length >= limit) break

    const href = absolute(base, $(element).attr('href'))
    if (!href) continue

    let host: string
    let pathname: string
    try {
      const parsed = new URL(href)
      host = parsed.hostname
      pathname = parsed.pathname
    } catch {
      continue
    }

    if (!isHappyModHost(host)) continue
    if (!looksLikeAppPage(pathname)) continue
    if (seen.has(href)) continue

    const title = compact($(element).attr('title') || $(element).text())
    if (title.length < 2) continue
    if (/^(home|inicio|search|download|mod|apk|login|sign)/i.test(title)) continue

    if (
      queryToken.length >= 2
      && !title.toLowerCase().includes(queryToken)
      && !pathname.toLowerCase().includes(queryToken.replace(/\s+/g, '-'))
    ) {
      continue
    }

    seen.add(href)

    const root = $(element).closest('article,li,.card,.item,.app,.post,.search-item,div').first()
    const text = compact(root.text() || title)
    const icon =
      absolute(base, root.find('img').first().attr('data-src'))
      || absolute(base, root.find('img').first().attr('data-lazy-src'))
      || absolute(base, root.find('img').first().attr('src'))
      || absolute(base, $(element).find('img').first().attr('src'))

    const name = title
      .replace(/\s+(APK|Mod APK|MOD APK|Download|Descargar)$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100)

    results.push(
      remember({
        name: name || 'HappyMod APK',
        url: href,
        icon: publicHttpUrl(icon),
        version: extractVersion(text),
        sizeLabel: extractSizeLabel(text),
        summary: text.slice(0, 240),
      }),
    )
  }

  return results
}

export async function searchHappyMod(query: string, limit = 10): Promise<HappyModItem[]> {
  const text = query.trim()
  if (text.length < 2) throw new Error('Escribe al menos 2 caracteres para buscar en HappyMod.')

  const endpoints = [
    `https://www.happymod.com/search.html?q=${encodeURIComponent(text)}`,
    `https://www.happymod.com/search?q=${encodeURIComponent(text)}`,
  ]

  for (const endpoint of endpoints) {
    try {
      const page = await fetchHtml(endpoint)
      const items = parseSearchResults(page.html, page.finalUrl, text, Math.max(1, Math.min(12, limit)))
      if (items.length) return items
    } catch {
      // Prueba el siguiente endpoint.
    }
  }

  return []
}

function isDirectApkUrl(url: string) {
  try {
    const parsed = new URL(url)
    const pathAndQuery = `${parsed.pathname}${parsed.search}`
    if (/\.apk(?:$|[?#])/i.test(pathAndQuery)) return true
    const file = parsed.searchParams.get('file') || parsed.searchParams.get('url') || parsed.searchParams.get('path')
    return Boolean(file && /\.apk(?:$|[?#])/i.test(file))
  } catch {
    return false
  }
}

function allowedDownloadHost(hostname: string) {
  const host = hostname.toLowerCase()
  return (
    isHappyModHost(host)
    || /cdn/i.test(host)
    || /download/i.test(host)
    || /happymod/i.test(host)
  )
}

/**
 * Sigue la cadena de páginas de HappyMod hasta un enlace .apk usable.
 */
export async function resolveHappyModApkUrl(item: HappyModItem): Promise<string> {
  const queue: string[] = [item.url]
  const visited = new Set<string>()

  for (let depth = 0; depth < MAX_REDIRECT_DEPTH && queue.length; depth += 1) {
    const current = publicHttpUrl(queue.shift())
    if (!current || visited.has(current)) continue
    visited.add(current)

    if (isDirectApkUrl(current)) return current

    let host: string
    try {
      host = new URL(current).hostname
    } catch {
      continue
    }
    if (!allowedDownloadHost(host) && depth > 0) continue

    try {
      const response = await fetch(current, {
        redirect: 'follow',
        headers: {
          'user-agent': UA,
          accept: 'text/html,application/xhtml+xml,application/vnd.android.package-archive,*/*',
          'accept-language': 'es-MX,es;q=0.9,en;q=0.7',
          referer: item.url,
        },
        signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      })

      if (!response.ok) continue

      const finalUrl = publicHttpUrl(response.url) || current
      const disposition = response.headers.get('content-disposition') ?? ''
      const type = response.headers.get('content-type') ?? ''

      if (/\.apk(?:["'; ]|$)/i.test(disposition) || /android\.package-archive/i.test(type)) {
        return finalUrl
      }

      if (isDirectApkUrl(finalUrl)) return finalUrl
      if (!/html|text\//i.test(type) && !/application\/xhtml/i.test(type)) continue

      const html = await response.text()
      const $ = cheerio.load(html)

      let direct: string | undefined
      const pageCandidates: string[] = []

      $('a[href], button[data-href], [data-url], [data-download]').each((_i, el) => {
        if (direct) return false
        const raw =
          $(el).attr('href')
          || $(el).attr('data-href')
          || $(el).attr('data-url')
          || $(el).attr('data-download')
        const href = absolute(finalUrl, raw)
        if (!href) return

        const label = compact($(el).text() || $(el).attr('title') || $(el).attr('aria-label') || '')
        if (isDirectApkUrl(href)) {
          direct = href
          return false
        }
        if (
          /descargar|download|get\s*apk|mod\s*apk|download\s*now/i.test(label)
          || /\/download|\/down|\/get|\/apk/i.test(href)
        ) {
          pageCandidates.push(href)
        }
      })

      if (!direct) {
        const scriptText = $('script').map((_i, el) => $(el).html() || '').get().join('\n')
        const apkMatch = scriptText.match(/https?:\/\/[^\s"'<>]+\.apk(?:\?[^\s"'<>]*)?/i)
        if (apkMatch?.[0] && publicHttpUrl(apkMatch[0])) direct = apkMatch[0]
      }

      if (direct) return direct

      for (const candidate of pageCandidates.slice(0, 5)) {
        if (!visited.has(candidate)) queue.push(candidate)
      }
    } catch {
      // Siguiente candidato.
    }
  }

  throw new Error(
    'HappyMod no expuso un enlace APK directo recuperable. Abre la fuente desde el carrusel e intenta descargar manualmente.',
  )
}

function safeFileBase(value: string) {
  return (
    value
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9._ -]+/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 80) || 'happymod-app'
  )
}

function isValidApkHeader(header: Buffer) {
  return header[0] === 0x50 && header[1] === 0x4b && [0x03, 0x05, 0x07].includes(header[2] ?? -1)
}

export async function downloadHappyModApk(token: string): Promise<HappyModDownload> {
  const item = getHappyModItem(token)
  const direct = await resolveHappyModApkUrl(item)

  const dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-happymod-'))
  const fileName = `${safeFileBase(item.name)}-${safeFileBase(item.version || 'mod')}.apk`
  const filePath = path.join(dir, fileName)

  try {
    const response = await fetch(direct, {
      redirect: 'follow',
      headers: {
        'user-agent': UA,
        accept: 'application/vnd.android.package-archive,application/octet-stream,*/*',
        referer: item.url,
      },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    })

    if (!response.ok || !response.body) {
      throw new Error(`HappyMod respondió HTTP ${response.status} al descargar la APK.`)
    }

    const declared = Number(response.headers.get('content-length') ?? 0)
    if (declared > 0 && declared > config.maxDownloadBytes) {
      throw new Error(`La APK supera el límite configurado de ${config.maxDownloadMb} MB.`)
    }

    let received = 0
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length
        if (received > config.maxDownloadBytes) {
          callback(new Error(`La APK supera el límite configurado de ${config.maxDownloadMb} MB.`))
        } else {
          callback(null, chunk)
        }
      },
    })

    await pipeline(response.body as any, limiter, createWriteStream(filePath))

    const file = await stat(filePath)
    if (file.size < 1024) throw new Error('HappyMod devolvió un archivo demasiado pequeño.')

    const header = await readFile(filePath).then((buf) => buf.subarray(0, 4))
    if (!isValidApkHeader(header)) {
      throw new Error('HappyMod no devolvió un APK/ZIP válido (posible página de error o captcha).')
    }

    return {
      ...item,
      filePath,
      fileName,
      size: file.size,
      cleanup: () => rm(dir, { recursive: true, force: true }),
    }
  } catch (error) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}
