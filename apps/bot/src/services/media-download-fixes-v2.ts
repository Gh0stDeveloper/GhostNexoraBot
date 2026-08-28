import * as cheerio from 'cheerio'
import { config } from '../config.js'
import {
  downloadLempiMedia,
  searchLempiPinterest,
  type LempiDownloadedMedia,
  type LempiHappyModResult,
} from './lempi-api.js'
import { requestLempiJson } from './lempi-client.js'

const MEDIA_TIMEOUT_MS = 90_000
const MAX_HAPPYMOD_RESULTS = 20
const MAX_INSTAGRAM_RESULTS = 12
const MAX_REDIRECT_DEPTH = 5

export type InstagramDirectMedia = {
  url: string
  kind: 'video' | 'image'
  score: number
}

export type HappyModDirectResult = LempiHappyModResult & {
  tokenKey: string
}

const happyModCache = new Map<string, HappyModDirectResult>()

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeUrl(value: unknown) {
  const text = stringValue(value)
  if (!text) return undefined
  try {
    const url = new URL(text)
    if (!['http:', 'https:'].includes(url.protocol)) return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

function urlKind(url: string, hint = ''): 'video' | 'image' | 'unknown' {
  const input = `${hint} ${url}`.toLowerCase()
  if (/video|mp4|webm|mov|m4v|reel|clip/.test(input)) return 'video'
  if (/image|imagen|photo|foto|jpg|jpeg|png|webp|avif/.test(input)) return 'image'
  return 'unknown'
}

function collectInstagramMedia(value: unknown, hint = '', out: InstagramDirectMedia[] = [], seen = new Set<string>(), depth = 0) {
  if (depth > 10 || value === null || value === undefined) return out

  const direct = normalizeUrl(value)
  if (direct) {
    if (seen.has(direct)) return out
    seen.add(direct)
    const kind = urlKind(direct, hint)
    let score = 0
    if (kind === 'video') score += 500
    if (kind === 'image') score += 300
    if (/download|descarga|direct|media|video|mp4/i.test(hint)) score += 250
    if (/\.mp4(?:$|[?#])/i.test(direct)) score += 300
    if (/\.jpe?g|\.png|\.webp|\.avif(?:$|[?#])/i.test(direct)) score += 200
    if (/thumbnail|thumb|avatar/i.test(hint)) score -= 250
    out.push({ url: direct, kind: kind === 'video' ? 'video' : 'image', score })
    return out
  }

  if (Array.isArray(value)) {
    for (const item of value) collectInstagramMedia(item, hint, out, seen, depth + 1)
    return out
  }

  const record = asRecord(value)
  if (!record) return out
  for (const [key, child] of Object.entries(record)) {
    collectInstagramMedia(child, key, out, seen, depth + 1)
  }
  return out
}

function uniqueMedia(items: InstagramDirectMedia[], preferred?: 'video' | 'image') {
  const filtered = preferred
    ? items.filter((item) => item.kind === preferred)
    : items
  const pool = filtered.length ? filtered : items
  return [...new Map(
    pool
      .sort((a, b) => b.score - a.score)
      .map((item) => [item.url, item]),
  ).values()].slice(0, MAX_INSTAGRAM_RESULTS)
}

export async function downloadInstagramDirect(sourceUrl: string, imagesOnly = false): Promise<LempiDownloadedMedia[]> {
  const payload = await requestLempiJson<unknown>(
    config.lempiInstagramEndpoints.length
      ? config.lempiInstagramEndpoints
      : ['/d/instagram', '/d/ig', '/d/igdl', '/d/igimg', '/download/instagram', '/download/ig'],
    { url: sourceUrl },
    { timeoutMs: MEDIA_TIMEOUT_MS },
  )

  const candidates = uniqueMedia(collectInstagramMedia(payload), imagesOnly ? 'image' : 'video')
  if (!candidates.length) {
    const fallback = uniqueMedia(collectInstagramMedia(payload), imagesOnly ? undefined : 'image')
    if (!fallback.length) throw new Error('No se pudo obtener contenido multimedia de Instagram.')
    candidates.push(...fallback)
  }

  const results: LempiDownloadedMedia[] = []
  for (const [index, candidate] of candidates.entries()) {
    try {
      results.push(await downloadLempiMedia(candidate.url, {
        kind: candidate.kind,
        baseName: `instagram-${index + 1}`,
      }))
    } catch {
      // Continue with the next candidate.
    }
  }

  if (!results.length) throw new Error('No se pudo descargar el contenido de Instagram.')
  return results
}

function normalizeHappyMod(raw: unknown): LempiHappyModResult | null {
  const record = asRecord(raw)
  if (!record) return null
  const name = stringValue(record.nombre ?? record.name ?? record.title ?? record.app)
  const url = normalizeUrl(record.url ?? record.link ?? record.page ?? record.source)
  if (!name || !url) return null

  const version = stringValue(record.version ?? record.ver)
  const imagen = normalizeUrl(record.imagen ?? record.image ?? record.icon ?? record.logo)
  return {
    numero: typeof record.numero === 'number' ? record.numero : Number.isFinite(Number(record.numero)) ? Number(record.numero) : undefined,
    nombre: name,
    version,
    imagen,
    url,
    download: normalizeUrl(record.descarga ?? record.download ?? record.apk ?? record.apk_url ?? record.apkUrl ?? record.direct),
  }
}

export async function searchHappyModDirect(query: string, limit = 20): Promise<HappyModDirectResult[]> {
  const payload = await requestLempiJson<unknown>(
    ['/search/happymod'],
    { q: query, limit: Math.max(1, Math.min(MAX_HAPPYMOD_RESULTS, limit)) },
  )

  const root = asRecord(payload)
  const data = asRecord(root?.data)
  const rows = Array.isArray(data?.resultados)
    ? data.resultados
    : Array.isArray(root?.resultados)
      ? root.resultados
      : []

  const normalized = rows
    .map(normalizeHappyMod)
    .filter((item): item is LempiHappyModResult => Boolean(item))
    .slice(0, Math.max(1, Math.min(MAX_HAPPYMOD_RESULTS, limit)))

  if (!normalized.length) throw new Error('No encontré aplicaciones para esa búsqueda.')

  return normalized.map((item) => {
    const tokenKey = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const result: HappyModDirectResult = { ...item, tokenKey }
    happyModCache.set(tokenKey, result)
    return result
  })
}

export function getHappyModDirect(token: string) {
  const item = happyModCache.get(token.trim())
  if (!item) throw new Error('Ese resultado expiró. Vuelve a realizar la búsqueda.')
  return item
}

function isLikelyApkResponse(contentType: string, url: string, disposition: string) {
  return /android\.package-archive|application\/zip|application\/octet-stream/i.test(contentType)
    || /\.apk(?:$|[?#])/i.test(url)
    || /\.apk(?:["'; ]|$)/i.test(disposition)
}

function extractDownloadLinks(html: string, baseUrl: string) {
  const $ = cheerio.load(html)
  const urls: string[] = []
  const seen = new Set<string>()

  $('a[href],button[data-href],[data-url],[data-download]').each((_index, element) => {
    const raw = $(element).attr('href')
      ?? $(element).attr('data-href')
      ?? $(element).attr('data-url')
      ?? $(element).attr('data-download')
    if (!raw) return

    try {
      const url = new URL(raw, baseUrl)
      if (!['http:', 'https:'].includes(url.protocol)) return
      const value = url.toString()
      if (!seen.has(value)) {
        seen.add(value)
        urls.push(value)
      }
    } catch {
      // Ignore malformed links.
    }
  })

  const scriptText = $('script').map((_index, element) => $(element).html() || '').get().join('\n')
  for (const match of scriptText.matchAll(/https?:\/\/[^\s"'<>]+/g)) {
    const url = normalizeUrl(match[0])
    if (url && !seen.has(url)) {
      seen.add(url)
      urls.push(url)
    }
  }

  return urls
}

export async function resolveHappyModDirectUrl(sourceUrl: string) {
  let current = sourceUrl
  const visited = new Set<string>()

  for (let depth = 0; depth < MAX_REDIRECT_DEPTH; depth += 1) {
    const url = normalizeUrl(current)
    if (!url || visited.has(url)) break
    visited.add(url)

    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'user-agent': 'GhostNexoraBot',
        accept: 'application/vnd.android.package-archive,application/octet-stream,text/html,application/xhtml+xml,*/*',
      },
      signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS),
    })

    const finalUrl = response.url || url
    const contentType = response.headers.get('content-type') ?? ''
    const disposition = response.headers.get('content-disposition') ?? ''

    if (response.ok && isLikelyApkResponse(contentType, finalUrl, disposition)) {
      return finalUrl
    }

    if (!response.ok) continue
    if (!/html|xhtml|text\//i.test(contentType)) continue

    const html = await response.text()
    const links = extractDownloadLinks(html, finalUrl)
      .sort((a, b) => {
        const score = (value: string) => {
          let total = 0
          if (/\.apk(?:$|[?#])/i.test(value)) total += 1000
          if (/download|descarga|apk|mod/i.test(value)) total += 100
          if (/api\.lempi\.lat/i.test(value)) total += 50
          return total
        }
        return score(b) - score(a)
      })

    const candidate = links.find((value) => !visited.has(value))
    if (!candidate) break
    current = candidate
  }

  return normalizeUrl(sourceUrl)
}

export async function downloadHappyModDirect(item: HappyModDirectResult): Promise<LempiDownloadedMedia> {
  const source = item.download ?? item.url
  const direct = await resolveHappyModDirectUrl(source)
  if (!direct) throw new Error('No se pudo resolver el archivo de la aplicación.')

  return downloadLempiMedia(direct, {
    kind: 'document',
    baseName: `happymod-${item.nombre}-${item.version ?? 'mod'}`,
  })
}

export async function searchPinterestDirect(query: string, limit = 12) {
  return searchLempiPinterest(query, Math.max(2, Math.min(20, limit)))
}
