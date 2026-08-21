import { load } from 'cheerio'

const BASE = 'https://www.erome.com'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const prohibited = /\b(child|children|underage|minor|preteen|pre-teen|niñ[oa]s?|menor(?:es)?)\b/i
const reserved = new Set(['a', 'explore', 'search', 'user', 'faq', 'terms', 'dmca', 'abuse', 'creator', 'feedback', 'language', 'login', 'register', 'signup', 'signin', 'upload', 'settings', 'notifications'])

export type PublicEromeAlbum = {
  id: string
  title: string
  url: string
  thumbnail?: string
  author?: string
  authorUrl?: string
}

export type PublicEromeProfileSummary = {
  username: string
  url: string
  avatar?: string
}

export type PublicEromeProfile = PublicEromeProfileSummary & {
  batch: number
  albums: PublicEromeAlbum[]
  hasNext: boolean
}

function absolute(base: string, value?: string | null) {
  if (!value) return undefined
  try { return new URL(value, base).toString() } catch { return undefined }
}

function normalizeUsername(input: string) {
  const raw = input.trim()
  if (!raw) throw new Error('Indica un usuario o enlace de perfil Erome.')
  let username = raw
  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw)
    if (!['erome.com', 'www.erome.com'].includes(url.hostname.toLowerCase())) throw new Error('El enlace no pertenece a Erome.')
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length !== 1) throw new Error('El enlace no corresponde a un perfil Erome.')
    username = parts[0]!
  }
  username = decodeURIComponent(username).replace(/^@/, '').trim()
  if (!username || username.length > 100 || reserved.has(username.toLowerCase()) || prohibited.test(username)) throw new Error('Usuario de Erome inválido.')
  return username
}

function profileUrl(username: string) { return `${BASE}/${encodeURIComponent(username)}` }

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'accept-language': 'es-MX,es;q=0.9,en;q=0.7',
      cookie: 'disclaimer=1; collapse=0',
      referer: `${BASE}/explore`,
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(25_000),
  })
  if (!response.ok) throw new Error(`Erome respondió HTTP ${response.status}.`)
  const final = new URL(response.url)
  if (final.pathname.startsWith('/user/login')) throw new Error('Erome redirigió al login.')
  return { html: await response.text(), finalUrl: final.toString() }
}

function albumIdFromHref(href: string, baseUrl: string) {
  try {
    const url = new URL(href, baseUrl)
    if (!['erome.com', 'www.erome.com'].includes(url.hostname.toLowerCase())) return undefined
    return /^\/a\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname)?.[1]
  } catch { return undefined }
}

function parseAlbums(html: string, baseUrl: string, username: string) {
  const $ = load(html)
  const found = new Map<string, PublicEromeAlbum>()
  const add = (id: string, anchor?: ReturnType<typeof $>) => {
    if (!id || found.has(id)) return
    const box = anchor?.closest('.album, article, .card, .post, .media, div')
    const title = (
      box?.find('.album-title, .title, h2, h3').first().text() ||
      anchor?.attr('title') || anchor?.text() ||
      box?.find('img').first().attr('alt') || id
    ).replace(/\s+/g, ' ').trim()
    if (!title || prohibited.test(title)) return
    const image = box?.find('img').first()
    const thumbnail = absolute(baseUrl, image?.attr('data-src') ?? image?.attr('data-original') ?? image?.attr('src'))
    found.set(id, {
      id,
      title: title.slice(0, 180),
      url: `${BASE}/a/${id}`,
      thumbnail,
      author: username,
      authorUrl: profileUrl(username),
    })
  }

  $('a[href]').each((_, element) => {
    const anchor = $(element)
    const id = albumIdFromHref(anchor.attr('href') ?? '', baseUrl)
    if (id) add(id, anchor)
  })

  const patterns = [
    /(?:https?:\\?\/\\?\/(?:www\.)?erome\.com)?\\?\/a\\?\/([A-Za-z0-9_-]+)/gi,
    /["']\/a\/([A-Za-z0-9_-]+)(?:[?#][^"']*)?["']/gi,
  ]
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) add(match[1]!)
  }

  return [...found.values()]
}

function profileIdentity(html: string, fallback: string, baseUrl: string) {
  const $ = load(html)
  const h1 = $('h1').first().text().replace(/\s+/g, ' ').trim()
  const title = $('meta[property="og:title"]').attr('content')?.replace(/\s+-\s+.*$/, '').trim()
  const username = h1 || title || fallback
  const avatarNode = $('img[src*="avatar.erome.com"], img[data-src*="avatar.erome.com"]').first()
  const avatar = absolute(baseUrl, avatarNode.attr('data-src') ?? avatarNode.attr('src') ?? $('meta[property="og:image"]').attr('content'))
  return { username, avatar }
}

async function fetchProfilePage(username: string, page: number) {
  const url = new URL(profileUrl(username))
  url.searchParams.set('t', 'posts')
  if (page > 1) url.searchParams.set('page', String(page))
  const { html, finalUrl } = await fetchHtml(url.toString())
  const identity = profileIdentity(html, username, finalUrl)
  const albums = parseAlbums(html, finalUrl, identity.username)
  const text = load(html).text().replace(/\s+/g, ' ')
  if (!albums.length && /page not found|user not found|profile not found|404/i.test(text)) throw new Error('Ese perfil de Erome no existe o ya no es público.')
  return { username: identity.username, url: profileUrl(username), avatar: identity.avatar, albums }
}

export async function getEromePublicProfile(input: string, batch = 1, limit = 10): Promise<PublicEromeProfile> {
  const username = normalizeUsername(input)
  const safeBatch = Math.max(1, Math.min(200, Math.floor(batch) || 1))
  const safeLimit = Math.max(1, Math.min(10, Math.floor(limit) || 10))
  const first = await fetchProfilePage(username, 1)
  if (!first.albums.length) return { ...first, batch: safeBatch, albums: [], hasNext: false }

  const pageSize = first.albums.length
  const start = (safeBatch - 1) * safeLimit
  const sitePage = Math.floor(start / pageSize) + 1
  const offset = start % pageSize
  const current = sitePage === 1 ? first : await fetchProfilePage(username, sitePage)
  const pool = [...current.albums.slice(offset)]

  if (pool.length <= safeLimit && current.albums.length >= pageSize) {
    const next = await fetchProfilePage(username, sitePage + 1).catch(() => null)
    if (next) pool.push(...next.albums)
  }

  const albums = pool.slice(0, safeLimit)
  return {
    username: first.username,
    url: first.url,
    avatar: first.avatar,
    batch: safeBatch,
    albums,
    hasNext: pool.length > safeLimit || albums.length === safeLimit,
  }
}

function parseProfileLinks(html: string, baseUrl: string, query: string, limit: number) {
  const $ = load(html)
  const needle = query.toLowerCase()
  const found = new Map<string, PublicEromeProfileSummary>()
  $('a[href]').each((_, element) => {
    if (found.size >= limit) return
    const anchor = $(element)
    const href = absolute(baseUrl, anchor.attr('href'))
    if (!href) return
    let url: URL
    try { url = new URL(href) } catch { return }
    if (!['erome.com', 'www.erome.com'].includes(url.hostname.toLowerCase())) return
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length !== 1) return
    const username = decodeURIComponent(parts[0]!).replace(/^@/, '').trim()
    if (!username || reserved.has(username.toLowerCase()) || prohibited.test(username)) return
    const label = anchor.text().replace(/\s+/g, ' ').trim()
    if (needle && !username.toLowerCase().includes(needle) && !label.toLowerCase().includes(needle)) return
    const box = anchor.closest('article, .album, .card, .post, div')
    const image = box.find('img').first()
    const avatar = absolute(baseUrl, image.attr('data-src') ?? image.attr('src'))
    found.set(username.toLowerCase(), { username, url: profileUrl(username), avatar })
  })
  return [...found.values()]
}

export async function searchEromePublicProfiles(query: string, page = 1, limit = 5) {
  const text = query.trim().replace(/^@/, '')
  if (!text || prohibited.test(text)) throw new Error('Indica un usuario válido para buscar en Erome.')
  const safePage = Math.max(1, Math.min(200, Math.floor(page) || 1))
  const endpoint = new URL(`${BASE}/search`)
  endpoint.searchParams.set('q', text)
  if (safePage > 1) endpoint.searchParams.set('page', String(safePage))
  const { html, finalUrl } = await fetchHtml(endpoint.toString())
  let profiles = parseProfileLinks(html, finalUrl, text, Math.max(1, Math.min(10, limit)))
  if (!profiles.length && safePage === 1 && !/\s/.test(text)) {
    const direct = await getEromePublicProfile(text, 1, 1).catch(() => null)
    if (direct) profiles = [{ username: direct.username, url: direct.url, avatar: direct.avatar }]
  }
  return { query: text, page: safePage, profiles }
}
