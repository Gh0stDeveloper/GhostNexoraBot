import * as cheerio from 'cheerio'

const mobileSearchUrl = 'https://m.youtube.com/results'
const yt1sSearchUrl = 'https://www.yt1s.com/api/ajaxSearch/index'
const yt1sConvertUrl = 'https://www.yt1s.com/api/ajaxConvert/convert'
const browserUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export type MobileYouTubeResult = {
  id: string
  title: string
  channel: string
  url: string
  thumbnail?: string
  description?: string
  duration?: number
  views?: number
}

export type Yt1sDirect = {
  url: string
  title: string
  author?: string
  duration?: number
  quality?: string
  sizeLabel?: string
  fileName?: string
}

function runsText(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  const node = value as { simpleText?: unknown; runs?: Array<{ text?: unknown }>; accessibility?: { accessibilityData?: { label?: unknown } } }
  if (typeof node.simpleText === 'string') return node.simpleText
  const fromRuns = node.runs?.map((run) => typeof run.text === 'string' ? run.text : '').join('').trim()
  if (fromRuns) return fromRuns
  const label = node.accessibility?.accessibilityData?.label
  return typeof label === 'string' ? label : undefined
}

function durationSeconds(value?: string) {
  if (!value) return undefined
  const normalized = value.trim().replace(/\./g, ':')
  if (!/^\d{1,3}(?::\d{1,2}){1,2}$/.test(normalized)) return undefined
  const parts = normalized.split(':').map(Number)
  if (parts.some((part) => !Number.isFinite(part))) return undefined
  return parts.reduce((total, part) => total * 60 + part, 0)
}

function numericViews(value?: string) {
  if (!value) return undefined
  const compact = value.toLowerCase().replace(/,/g, '').replace(/\s+/g, ' ').trim()
  const match = /([\d.]+)\s*([kmb])?/i.exec(compact)
  if (!match) return undefined
  const base = Number(match[1])
  if (!Number.isFinite(base)) return undefined
  const multiplier = match[2]?.toLowerCase() === 'b' ? 1_000_000_000 : match[2]?.toLowerCase() === 'm' ? 1_000_000 : match[2]?.toLowerCase() === 'k' ? 1_000 : 1
  return Math.floor(base * multiplier)
}

function extractJsonObject(source: string, startAt: number) {
  const start = source.indexOf('{', startAt)
  if (start < 0) return null
  let depth = 0
  let quote: '"' | "'" | null = null
  let escaped = false
  for (let index = start; index < source.length; index += 1) {
    const char = source[index]!
    if (quote) {
      if (escaped) { escaped = false; continue }
      if (char === '\\') { escaped = true; continue }
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") { quote = char; continue }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, index + 1)
    }
  }
  return null
}

function parseInitialData(html: string) {
  const $ = cheerio.load(html)
  for (const element of $('script').toArray()) {
    const source = $(element).html()?.trim()
    if (!source) continue
    for (const marker of ['var ytInitialData =', 'ytInitialData =', 'window["ytInitialData"] =', "window['ytInitialData'] ="]) {
      const index = source.indexOf(marker)
      if (index < 0) continue
      const raw = extractJsonObject(source, index + marker.length)
      if (!raw) continue
      try { return JSON.parse(raw) as Record<string, unknown> } catch { /* try next marker/script */ }
    }
  }
  throw new Error('YouTube no expuso un ytInitialData válido en la respuesta móvil.')
}

function collectVideoRenderers(root: unknown) {
  const found: Array<Record<string, unknown>> = []
  const seen = new Set<unknown>()
  const walk = (value: unknown) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return
    seen.add(value)
    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }
    const record = value as Record<string, unknown>
    const renderer = record.videoRenderer
    if (renderer && typeof renderer === 'object') found.push(renderer as Record<string, unknown>)
    for (const child of Object.values(record)) walk(child)
  }
  walk(root)
  return found
}

function thumbnailUrl(renderer: Record<string, unknown>) {
  const thumbnail = renderer.thumbnail as { thumbnails?: Array<{ url?: unknown }> } | undefined
  const candidates = thumbnail?.thumbnails?.filter((item) => typeof item.url === 'string') ?? []
  const url = candidates.at(-1)?.url
  if (typeof url !== 'string') return undefined
  return url.startsWith('//') ? `https:${url}` : url
}

export async function youtubeSearchMobile(query: string, limit = 10): Promise<MobileYouTubeResult[]> {
  const text = query.trim()
  if (!text) throw new Error('Debes indicar qué quieres buscar en YouTube.')
  const endpoint = new URL(mobileSearchUrl)
  endpoint.searchParams.set('search_query', text)
  endpoint.searchParams.set('hl', 'es')
  endpoint.searchParams.set('gl', 'MX')

  const response = await fetch(endpoint, {
    headers: {
      'user-agent': browserUserAgent,
      'accept-language': 'es-MX,es;q=0.9,en;q=0.7',
      accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(25_000),
  })
  if (!response.ok) throw new Error(`YouTube móvil respondió HTTP ${response.status}.`)
  const initial = parseInitialData(await response.text())
  const results: MobileYouTubeResult[] = []
  const used = new Set<string>()

  for (const renderer of collectVideoRenderers(initial)) {
    const id = typeof renderer.videoId === 'string' ? renderer.videoId : ''
    if (!id || used.has(id)) continue
    const title = runsText(renderer.title)?.trim()
    if (!title) continue
    const owner = runsText(renderer.ownerText) ?? runsText(renderer.longBylineText) ?? runsText(renderer.shortBylineText) ?? 'Canal desconocido'
    const duration = durationSeconds(runsText(renderer.lengthText))
    const viewsText = runsText(renderer.viewCountText) ?? runsText(renderer.shortViewCountText)
    const metadata = renderer.detailedMetadataSnippets as Array<{ snippetText?: unknown }> | undefined
    const description = metadata?.map((item) => runsText(item.snippetText)).filter(Boolean).join(' ').trim() || undefined
    used.add(id)
    results.push({
      id,
      title,
      channel: owner,
      url: `https://www.youtube.com/watch?v=${id}`,
      thumbnail: thumbnailUrl(renderer),
      description,
      duration,
      views: numericViews(viewsText),
    })
    if (results.length >= Math.max(1, Math.min(12, limit))) break
  }

  if (!results.length) throw new Error('La búsqueda móvil de YouTube no devolvió videos.')
  return results
}

type Yt1sLink = { size?: unknown; f?: unknown; q?: unknown; k?: unknown }
type Yt1sSearchResponse = {
  title?: unknown
  t?: unknown
  a?: unknown
  vid?: unknown
  links?: { mp4?: Record<string, Yt1sLink>; mp3?: Record<string, Yt1sLink> }
  status?: unknown
  mess?: unknown
  message?: unknown
}

function qualityNumber(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return 0
  const match = /\d+/.exec(String(value))
  return match ? Number(match[0]) : 0
}

function chooseLink(links: Yt1sLink[], kind: 'mp3' | 'mp4', requestedQuality: number) {
  const usable = links.filter((item) => typeof item.k === 'string' && item.k)
  if (!usable.length) throw new Error(`yt1s no ofreció formatos ${kind.toUpperCase()}.`)
  const sorted = [...usable].sort((a, b) => qualityNumber(a.q) - qualityNumber(b.q))
  if (kind === 'mp3') return sorted.at(-1)!
  const within = sorted.filter((item) => qualityNumber(item.q) <= requestedQuality)
  return within.at(-1) ?? sorted[0]!
}

async function yt1sConvert(videoId: string, key: string) {
  const response = await fetch(yt1sConvertUrl, {
    method: 'POST',
    headers: {
      'user-agent': browserUserAgent,
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      referer: 'https://www.yt1s.com/',
      origin: 'https://www.yt1s.com',
      accept: 'application/json, text/plain, */*',
    },
    body: new URLSearchParams({ vid: videoId, k: key }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`yt1s convert respondió HTTP ${response.status}.`)
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('json')) throw new Error('yt1s convert no devolvió JSON.')
  const data = await response.json() as { dlink?: unknown; status?: unknown; mess?: unknown; message?: unknown }
  if (typeof data.dlink !== 'string' || !/^https?:\/\//i.test(data.dlink)) {
    throw new Error(typeof data.mess === 'string' ? data.mess : typeof data.message === 'string' ? data.message : 'yt1s no devolvió un enlace de descarga.')
  }
  return data.dlink
}

export async function yt1sResolve(youtubeUrl: string, kind: 'mp3' | 'mp4', requestedQuality = 720): Promise<Yt1sDirect> {
  const response = await fetch(yt1sSearchUrl, {
    method: 'POST',
    headers: {
      'user-agent': browserUserAgent,
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      referer: 'https://www.yt1s.com/',
      origin: 'https://www.yt1s.com',
      accept: 'application/json, text/plain, */*',
    },
    body: new URLSearchParams({ q: youtubeUrl, vt: 'home' }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`yt1s respondió HTTP ${response.status}.`)
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('json')) throw new Error('yt1s no devolvió JSON; posiblemente activó una protección temporal.')
  const data = await response.json() as Yt1sSearchResponse
  const videoId = typeof data.vid === 'string' ? data.vid : ''
  if (!videoId) throw new Error(typeof data.mess === 'string' ? data.mess : typeof data.message === 'string' ? data.message : 'yt1s no identificó el video.')
  const source = kind === 'mp3' ? data.links?.mp3 : data.links?.mp4
  const selected = chooseLink(Object.values(source ?? {}), kind, requestedQuality)
  const direct = await yt1sConvert(videoId, String(selected.k))
  const title = typeof data.title === 'string' && data.title.trim() ? data.title.trim() : 'YouTube'
  const quality = typeof selected.q === 'string' || typeof selected.q === 'number' ? String(selected.q) : undefined
  const extension = kind === 'mp3' ? 'mp3' : 'mp4'
  const safeTitle = title.normalize('NFKD').replace(/[^a-zA-Z0-9._ -]+/g, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'youtube'
  return {
    url: direct,
    title,
    author: typeof data.a === 'string' ? data.a : undefined,
    duration: typeof data.t === 'number' ? data.t : Number.isFinite(Number(data.t)) ? Number(data.t) : undefined,
    quality,
    sizeLabel: typeof selected.size === 'string' ? selected.size : undefined,
    fileName: `${safeTitle}.${extension}`,
  }
}
