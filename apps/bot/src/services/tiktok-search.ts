import { load } from 'cheerio'

const BASE = 'https://www.tiktok.com'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export type TikTokVideoSearchResult = {
  id: string
  title: string
  url: string
  thumbnail?: string
  username?: string
  nickname?: string
  views?: number
  likes?: number
}

export type TikTokProfileSearchResult = {
  username: string
  nickname?: string
  url: string
  avatar?: string
  bio?: string
  followers?: number
  likes?: number
  videos?: number
}

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

function normalizeText(value: string, max = 220) {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function safeQuery(input: string) {
  const value = normalizeText(input, 120)
  if (!value) throw new Error('Indica qué deseas buscar en TikTok.')
  return value
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

function walkJson(value: unknown, visit: (object: JsonRecord) => void) {
  if (Array.isArray(value)) {
    for (const item of value) walkJson(item, visit)
    return
  }
  const obj = record(value)
  if (!obj) return
  visit(obj)
  for (const child of Object.values(obj)) walkJson(child, visit)
}

function embeddedJson(html: string) {
  const $ = load(html)
  const raw = $('script#__UNIVERSAL_DATA_FOR_REHYDRATION__').text().trim()
    || $('script#SIGI_STATE').text().trim()
  if (!raw) return undefined
  try { return JSON.parse(raw) as unknown } catch { return undefined }
}

function usernameFromProfileInput(input: string) {
  const raw = input.trim().replace(/^@/, '')
  if (!raw) throw new Error('Indica un usuario o enlace de perfil de TikTok.')
  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw)
    if (!(url.hostname === 'tiktok.com' || url.hostname.endsWith('.tiktok.com'))) throw new Error('El enlace no corresponde a TikTok.')
    const match = /^\/@([^/?#]+)/.exec(url.pathname)
    if (!match?.[1]) throw new Error('El enlace no corresponde a un perfil de TikTok.')
    return decodeURIComponent(match[1])
  }
  if (!/^[A-Za-z0-9._-]{2,64}$/.test(raw)) throw new Error('Usuario de TikTok inválido.')
  return raw
}

async function fetchTikTokPage(url: string) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'es-MX,es;q=0.9,en;q=0.7',
      referer: `${BASE}/`,
    },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`TikTok respondió HTTP ${response.status}.`)
  return response.text()
}

function collectVideosFromJson(data: unknown, found: Map<string, TikTokVideoSearchResult>, limit: number) {
  walkJson(data, (obj) => {
    if (found.size >= limit) return
    const id = stringValue(obj.id)
    const desc = stringValue(obj.desc)
    const author = record(obj.author)
    const video = record(obj.video)
    if (!/^\d{8,30}$/.test(id) || !author || !video) return
    const username = stringValue(author.uniqueId)
    if (!username) return
    const url = `${BASE}/@${encodeURIComponent(username)}/video/${id}`
    const stats = record(obj.stats)
    const thumbnail = firstHttpUrl(video.cover) ?? firstHttpUrl(video.dynamicCover) ?? firstHttpUrl(video.originCover)
    found.set(url, {
      id,
      title: normalizeText(desc || `Video de @${username}`),
      url,
      thumbnail,
      username,
      nickname: stringValue(author.nickname) || undefined,
      views: numberValue(stats?.playCount),
      likes: numberValue(stats?.diggCount),
    })
  })
}

function collectProfilesFromJson(data: unknown, found: Map<string, TikTokProfileSearchResult>, query: string, limit: number) {
  const needle = query.toLowerCase().replace(/^@/, '')
  walkJson(data, (obj) => {
    if (found.size >= limit) return
    const username = stringValue(obj.uniqueId)
    if (!username || !/^[A-Za-z0-9._-]{2,64}$/.test(username)) return
    const nickname = stringValue(obj.nickname)
    if (needle && !username.toLowerCase().includes(needle) && !nickname.toLowerCase().includes(needle)) return
    const stats = record(obj.stats) ?? record(obj.statsV2)
    const avatar = firstHttpUrl(obj.avatarLarger) ?? firstHttpUrl(obj.avatarMedium) ?? firstHttpUrl(obj.avatarThumb)
    const url = `${BASE}/@${encodeURIComponent(username)}`
    found.set(username.toLowerCase(), {
      username,
      nickname: nickname || undefined,
      url,
      avatar,
      bio: normalizeText(stringValue(obj.signature), 160) || undefined,
      followers: numberValue(stats?.followerCount),
      likes: numberValue(stats?.heartCount) ?? numberValue(stats?.heart),
      videos: numberValue(stats?.videoCount),
    })
  })
}

function collectVideoAnchors(html: string, baseUrl: string, found: Map<string, TikTokVideoSearchResult>, limit: number) {
  const $ = load(html)
  $('a[href*="/video/"]').each((_, element) => {
    if (found.size >= limit) return
    const anchor = $(element)
    let url: URL
    try { url = new URL(anchor.attr('href') ?? '', baseUrl) } catch { return }
    if (!(url.hostname === 'tiktok.com' || url.hostname.endsWith('.tiktok.com'))) return
    const match = /^\/@([^/]+)\/video\/(\d+)/.exec(url.pathname)
    if (!match?.[1] || !match[2]) return
    const username = decodeURIComponent(match[1])
    const id = match[2]
    const container = anchor.closest('div, article, li')
    const title = normalizeText(anchor.attr('title') ?? container.text() ?? '') || `Video de @${username}`
    const image = container.find('img').first()
    const thumbnail = image.attr('src') ?? image.attr('data-src') ?? undefined
    const canonical = `${BASE}/@${encodeURIComponent(username)}/video/${id}`
    found.set(canonical, { id, title, url: canonical, thumbnail, username })
  })
}

function collectProfileAnchors(html: string, baseUrl: string, found: Map<string, TikTokProfileSearchResult>, query: string, limit: number) {
  const $ = load(html)
  const needle = query.toLowerCase().replace(/^@/, '')
  $('a[href*="/@"]').each((_, element) => {
    if (found.size >= limit) return
    const anchor = $(element)
    let url: URL
    try { url = new URL(anchor.attr('href') ?? '', baseUrl) } catch { return }
    if (!(url.hostname === 'tiktok.com' || url.hostname.endsWith('.tiktok.com')) || /\/video\//.test(url.pathname)) return
    const match = /^\/@([^/?#]+)/.exec(url.pathname)
    if (!match?.[1]) return
    const username = decodeURIComponent(match[1])
    const label = normalizeText(anchor.text())
    if (needle && !username.toLowerCase().includes(needle) && !label.toLowerCase().includes(needle)) return
    const container = anchor.closest('div, article, li')
    const image = container.find('img').first()
    const avatar = image.attr('src') ?? image.attr('data-src') ?? undefined
    found.set(username.toLowerCase(), {
      username,
      nickname: label && label !== `@${username}` ? label : undefined,
      url: `${BASE}/@${encodeURIComponent(username)}`,
      avatar,
    })
  })
}

export async function searchTikTokVideos(input: string, limit = 10): Promise<TikTokVideoSearchResult[]> {
  const query = safeQuery(input)
  const count = Math.max(1, Math.min(12, limit))
  const urls = [
    `${BASE}/search/video?q=${encodeURIComponent(query)}`,
    `${BASE}/search?q=${encodeURIComponent(query)}`,
  ]
  const found = new Map<string, TikTokVideoSearchResult>()
  let lastError: unknown

  for (const url of urls) {
    if (found.size >= count) break
    try {
      const html = await fetchTikTokPage(url)
      collectVideoAnchors(html, url, found, count)
      const data = embeddedJson(html)
      if (data) collectVideosFromJson(data, found, count)
    } catch (error) {
      lastError = error
    }
  }

  if (!found.size && lastError) throw lastError
  return [...found.values()].slice(0, count)
}

export async function searchTikTokProfiles(input: string, limit = 8): Promise<TikTokProfileSearchResult[]> {
  const query = safeQuery(input)
  const count = Math.max(1, Math.min(10, limit))
  const urls = [
    `${BASE}/search/user?q=${encodeURIComponent(query)}`,
    `${BASE}/search?q=${encodeURIComponent(query)}`,
  ]
  const found = new Map<string, TikTokProfileSearchResult>()
  let lastError: unknown

  for (const url of urls) {
    if (found.size >= count) break
    try {
      const html = await fetchTikTokPage(url)
      collectProfileAnchors(html, url, found, query, count)
      const data = embeddedJson(html)
      if (data) collectProfilesFromJson(data, found, query, count)
    } catch (error) {
      lastError = error
    }
  }

  if (!found.size && lastError) throw lastError
  return [...found.values()].slice(0, count)
}

export async function getTikTokProfile(input: string): Promise<TikTokProfileSearchResult> {
  const username = usernameFromProfileInput(input)
  const url = `${BASE}/@${encodeURIComponent(username)}`
  const html = await fetchTikTokPage(url)
  const data = embeddedJson(html)
  const found = new Map<string, TikTokProfileSearchResult>()
  if (data) collectProfilesFromJson(data, found, username, 20)
  const exact = found.get(username.toLowerCase())
  if (exact) return exact

  const $ = load(html)
  const title = normalizeText($('meta[property="og:title"]').attr('content') ?? '')
  const description = normalizeText($('meta[property="og:description"]').attr('content') ?? '', 160)
  const avatar = $('meta[property="og:image"]').attr('content') ?? undefined
  if (!title && !avatar) throw new Error('TikTok no expuso los datos públicos de ese perfil.')
  return {
    username,
    nickname: title.replace(/\s*\(@[^)]+\).*$/, '').trim() || undefined,
    url,
    avatar,
    bio: description || undefined,
  }
}
