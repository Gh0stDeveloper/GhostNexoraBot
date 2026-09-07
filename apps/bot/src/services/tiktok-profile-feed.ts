import { load } from 'cheerio'
import type { TikTokVideoSearchResult } from './tiktok-search.js'

const BASE = 'https://www.tiktok.com'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

type JsonRecord = Record<string, unknown>

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function firstHttpUrl(value: unknown): string | undefined {
  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value)) return value.replace(/\\u0026/gi, '&').replace(/\\\//g, '/')
    return undefined
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstHttpUrl(item)
      if (found) return found
    }
    return undefined
  }
  const obj = record(value)
  if (!obj) return undefined
  for (const key of ['UrlList', 'urlList', 'url', 'src', 'uri']) {
    const found = firstHttpUrl(obj[key])
    if (found) return found
  }
  return undefined
}

function normalizeText(value: string, max = 220) {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function usernameFromInput(input: string) {
  const raw = input.trim()
  if (!raw) throw new Error('Indica un usuario de TikTok.')
  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw)
    const host = url.hostname.toLowerCase()
    if (!(host === 'tiktok.com' || host.endsWith('.tiktok.com'))) throw new Error('El enlace no corresponde a TikTok.')
    const match = /^\/@([^/?#]+)/.exec(url.pathname)
    if (!match?.[1]) throw new Error('El enlace no corresponde a un perfil de TikTok.')
    return decodeURIComponent(match[1])
  }
  const username = raw.replace(/^@/, '')
  if (!/^[A-Za-z0-9._-]{2,64}$/.test(username)) throw new Error('Usuario de TikTok inválido.')
  return username
}

function embeddedJson(html: string) {
  const $ = load(html)
  const raw = $('script#__UNIVERSAL_DATA_FOR_REHYDRATION__').text().trim()
    || $('script#SIGI_STATE').text().trim()
  if (!raw) return undefined
  try { return JSON.parse(raw) as unknown } catch { return undefined }
}

function walkJson(value: unknown, visit: (obj: JsonRecord) => void) {
  if (Array.isArray(value)) {
    for (const child of value) walkJson(child, visit)
    return
  }
  const obj = record(value)
  if (!obj) return
  visit(obj)
  for (const child of Object.values(obj)) walkJson(child, visit)
}

function collectJsonVideos(data: unknown, username: string, out: Map<string, TikTokVideoSearchResult>, limit: number) {
  const wanted = username.toLowerCase()
  walkJson(data, (obj) => {
    if (out.size >= limit) return
    const id = stringValue(obj.id)
    const author = record(obj.author)
    const video = record(obj.video)
    if (!/^\d{8,30}$/.test(id) || !author || !video) return
    const authorUsername = stringValue(author.uniqueId)
    if (!authorUsername || authorUsername.toLowerCase() !== wanted) return
    const stats = record(obj.stats)
    const url = `${BASE}/@${encodeURIComponent(authorUsername)}/video/${id}`
    out.set(url, {
      id,
      title: normalizeText(stringValue(obj.desc) || `Video de @${authorUsername}`),
      url,
      thumbnail: firstHttpUrl(video.cover) ?? firstHttpUrl(video.dynamicCover) ?? firstHttpUrl(video.originCover),
      username: authorUsername,
      nickname: stringValue(author.nickname) || undefined,
      views: numberValue(stats?.playCount),
      likes: numberValue(stats?.diggCount),
    })
  })
}

function collectAnchorVideos(html: string, username: string, out: Map<string, TikTokVideoSearchResult>, limit: number) {
  const $ = load(html)
  const wanted = username.toLowerCase()
  $('a[href*="/video/"]').each((_index, element) => {
    if (out.size >= limit) return
    const anchor = $(element)
    let url: URL
    try { url = new URL(anchor.attr('href') ?? '', BASE) } catch { return }
    const host = url.hostname.toLowerCase()
    if (!(host === 'tiktok.com' || host.endsWith('.tiktok.com'))) return
    const match = /^\/@([^/]+)\/video\/(\d+)/.exec(url.pathname)
    if (!match?.[1] || !match[2]) return
    const authorUsername = decodeURIComponent(match[1])
    if (authorUsername.toLowerCase() !== wanted) return
    const container = anchor.closest('article,li,div')
    const image = container.find('img').first()
    const canonical = `${BASE}/@${encodeURIComponent(authorUsername)}/video/${match[2]}`
    out.set(canonical, {
      id: match[2],
      title: normalizeText(anchor.attr('title') || container.text() || `Video de @${authorUsername}`),
      url: canonical,
      thumbnail: image.attr('src') || image.attr('data-src') || undefined,
      username: authorUsername,
    })
  })
}

export async function getTikTokProfileVideos(input: string, limit = 10): Promise<TikTokVideoSearchResult[]> {
  const username = usernameFromInput(input)
  const count = Math.max(1, Math.min(12, limit))
  const profileUrl = `${BASE}/@${encodeURIComponent(username)}`
  const response = await fetch(profileUrl, {
    redirect: 'follow',
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'es-MX,es;q=0.9,en;q=0.7',
      referer: `${BASE}/`,
    },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`TikTok respondió HTTP ${response.status} al abrir el perfil.`)
  const html = await response.text()
  const found = new Map<string, TikTokVideoSearchResult>()
  collectAnchorVideos(html, username, found, count)
  const data = embeddedJson(html)
  if (data) collectJsonVideos(data, username, found, count)
  return [...found.values()].slice(0, count)
}
