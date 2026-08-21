import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import os from 'node:os'
import path from 'node:path'
import { load } from 'cheerio'
import { config } from '../config.js'

const BASE = 'https://www.erome.com'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const sessionFile = path.join(config.dataDir, 'erome-session.json')
const prohibited = /\b(child|children|underage|minor|preteen|pre-teen|niñ[oa]s?|menor(?:es)?)\b/i
const reservedProfilePaths = new Set([
  'a', 'explore', 'search', 'user', 'faq', 'terms', 'dmca', 'abuse', 'creator', 'feedback',
  'language', 'login', 'register', 'signup', 'signin', 'upload', 'settings', 'notifications',
])

type StoredCookie = { value: string; expiresAt?: number }
type CookieStore = Record<string, StoredCookie>

export type EromeAlbumSummary = {
  id: string
  title: string
  url: string
  thumbnail?: string
  author?: string
  authorUrl?: string
}

export type EromeProfileSummary = {
  username: string
  url: string
  avatar?: string
}

export type EromeProfile = EromeProfileSummary & {
  batch: number
  albums: EromeAlbumSummary[]
  hasNext: boolean
}

export type EromeVideo = {
  index: number
  title: string
  url: string
  poster?: string
}

export type EromeAlbum = {
  id: string
  title: string
  url: string
  author?: string
  authorUrl?: string
  videos: EromeVideo[]
}

let cookiesLoaded = false
let cookieStore: CookieStore = {}

function absolute(base: string, value?: string | null) {
  if (!value) return undefined
  try { return new URL(value, base).toString() } catch { return undefined }
}

function validatePageUrl(input: string) {
  const url = new URL(input, BASE)
  if (url.protocol !== 'https:' || !['erome.com', 'www.erome.com'].includes(url.hostname.toLowerCase())) {
    throw new Error('URL de Erome inválida.')
  }
  return url
}

function validateMediaUrl(input: string) {
  const url = new URL(input)
  const host = url.hostname.toLowerCase()
  if (url.protocol !== 'https:' || !(host === 'erome.com' || host.endsWith('.erome.com'))) {
    throw new Error('El video no pertenece al CDN de Erome.')
  }
  if (!/\.mp4(?:$|[?#])/i.test(url.toString())) throw new Error('La fuente encontrada no es un video MP4.')
  return url.toString()
}

function safeQuery(input: string) {
  const value = input.trim()
  if (!value) throw new Error('Indica qué deseas buscar en Erome.')
  if (prohibited.test(value)) throw new Error('Esa búsqueda está bloqueada por seguridad.')
  return value.slice(0, 120)
}

function safeFileBase(input: string) {
  const clean = input.normalize('NFKD').replace(/[^a-zA-Z0-9._ -]+/g, '').trim().replace(/\s+/g, '-')
  return clean.slice(0, 90) || 'erome-video'
}

function profileNameFromUrl(url: URL) {
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length !== 1) return undefined
  let username = parts[0]!
  try { username = decodeURIComponent(username) } catch { /* keep encoded value */ }
  username = username.trim()
  if (!username || reservedProfilePaths.has(username.toLowerCase()) || prohibited.test(username)) return undefined
  return username
}

function profileName(input: string) {
  const raw = input.trim()
  if (!raw) throw new Error('Indica un usuario o enlace de perfil Erome.')
  if (/^https?:\/\//i.test(raw)) {
    const url = validatePageUrl(raw)
    const username = profileNameFromUrl(url)
    if (!username) throw new Error('El enlace no corresponde a un perfil Erome.')
    return username
  }
  let username = raw
  try { username = decodeURIComponent(username) } catch { /* keep raw value */ }
  if (!username || /[\s/?#]/.test(username) || username.length > 80 || reservedProfilePaths.has(username.toLowerCase()) || prohibited.test(username)) {
    throw new Error('Usuario de Erome inválido.')
  }
  return username
}

function publicProfileUrl(username: string) {
  return `${BASE}/${encodeURIComponent(username)}`
}

function parseCookieString(value: string) {
  const result: Record<string, string> = {}
  for (const part of value.split(';')) {
    const index = part.indexOf('=')
    if (index <= 0) continue
    const name = part.slice(0, index).trim()
    const cookieValue = part.slice(index + 1).trim()
    if (name && cookieValue) result[name] = cookieValue
  }
  return result
}

async function loadCookies() {
  if (cookiesLoaded) return
  cookiesLoaded = true
  if (!existsSync(sessionFile)) return
  try {
    const parsed = JSON.parse(await readFile(sessionFile, 'utf8')) as CookieStore
    if (parsed && typeof parsed === 'object') cookieStore = parsed
  } catch {
    cookieStore = {}
  }
}

async function saveCookies() {
  await mkdir(path.dirname(sessionFile), { recursive: true })
  await writeFile(sessionFile, `${JSON.stringify(cookieStore, null, 2)}\n`, { mode: 0o600 })
}

async function cookieHeader() {
  await loadCookies()
  const now = Date.now()
  for (const [name, item] of Object.entries(cookieStore)) {
    if (item.expiresAt && item.expiresAt <= now) delete cookieStore[name]
  }
  const merged: Record<string, string> = { disclaimer: '1', collapse: '0' }
  Object.assign(merged, parseCookieString(config.eromeCookie))
  for (const [name, item] of Object.entries(cookieStore)) merged[name] = item.value
  return Object.entries(merged).map(([name, value]) => `${name}=${value}`).join('; ')
}

async function absorbCookies(response: Response) {
  const headers = response.headers as unknown as { getSetCookie?: () => string[] }
  const rows = headers.getSetCookie?.() ?? []
  if (!rows.length) return
  await loadCookies()
  let changed = false
  for (const row of rows) {
    const parts = row.split(';').map((item) => item.trim())
    const first = parts.shift() ?? ''
    const index = first.indexOf('=')
    if (index <= 0) continue
    const name = first.slice(0, index).trim()
    const value = first.slice(index + 1).trim()
    const maxAge = parts.find((item) => /^max-age=/i.test(item))?.split('=')[1]
    const expires = parts.find((item) => /^expires=/i.test(item))?.slice(8)
    if (!value || maxAge === '0') {
      if (cookieStore[name]) { delete cookieStore[name]; changed = true }
      continue
    }
    let expiresAt: number | undefined
    if (maxAge && Number.isFinite(Number(maxAge))) expiresAt = Date.now() + Number(maxAge) * 1000
    else if (expires) {
      const parsed = Date.parse(expires)
      if (Number.isFinite(parsed)) expiresAt = parsed
    }
    cookieStore[name] = { value, expiresAt }
    changed = true
  }
  if (changed) await saveCookies()
}

async function requestErome(input: string, referer = `${BASE}/`) {
  const url = validatePageUrl(input)
  const response = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'accept-language': 'es-MX,es;q=0.9,en;q=0.7',
      referer,
      cookie: await cookieHeader(),
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(25_000),
  })
  await absorbCookies(response)
  if (!response.ok) throw new Error(`Erome respondió HTTP ${response.status}.`)
  const finalUrl = new URL(response.url)
  if (finalUrl.pathname.startsWith('/user/login')) throw new Error('Erome redirigió al login. La sesión configurada expiró o este contenido requiere autenticación.')
  return response
}

function parseAlbumList(html: string, baseUrl: string, limit = 10): EromeAlbumSummary[] {
  const $ = load(html)
  const found = new Map<string, EromeAlbumSummary>()
  const cappedLimit = Math.max(1, Math.min(60, limit))
  $('a[href]').each((_, element) => {
    if (found.size >= cappedLimit) return
    const anchor = $(element)
    const href = absolute(baseUrl, anchor.attr('href'))
    if (!href) return
    let parsed: URL
    try { parsed = validatePageUrl(href) } catch { return }
    const match = /^\/a\/([A-Za-z0-9_-]+)\/?$/.exec(parsed.pathname)
    if (!match) return
    const id = match[1]!
    if (found.has(id)) return
    const box = anchor.closest('.album').length ? anchor.closest('.album') : anchor.closest('div')
    const title = (box.find('.album-title').first().text() || anchor.attr('title') || anchor.text() || box.find('img').first().attr('alt') || id).trim()
    if (!title || prohibited.test(title)) return
    const image = box.find('img').first()
    const thumbnail = absolute(baseUrl, image.attr('data-src') ?? image.attr('data-original') ?? image.attr('src'))

    let author: string | undefined
    let authorUrl: string | undefined
    box.find('a[href]').each((__, authorElement) => {
      if (authorUrl) return
      const candidate = absolute(baseUrl, $(authorElement).attr('href'))
      if (!candidate) return
      try {
        const candidateUrl = validatePageUrl(candidate)
        const username = profileNameFromUrl(candidateUrl)
        if (!username) return
        author = ($(authorElement).text() || username).trim() || username
        authorUrl = publicProfileUrl(username)
      } catch { /* ignore non-profile links */ }
    })
    if (!author) author = (box.find('.album-user, .username, .user-name').first().text() || '').trim() || undefined

    found.set(id, { id, title: title.slice(0, 180), url: `${BASE}/a/${id}`, thumbnail, author, authorUrl })
  })
  return [...found.values()]
}

function parseProfileSummaries(html: string, baseUrl: string, query: string, limit = 5): EromeProfileSummary[] {
  const $ = load(html)
  const found = new Map<string, EromeProfileSummary>()
  const needle = query.trim().toLowerCase()
  $('a[href]').each((_, element) => {
    if (found.size >= Math.max(1, Math.min(10, limit))) return
    const anchor = $(element)
    const href = absolute(baseUrl, anchor.attr('href'))
    if (!href) return
    let parsed: URL
    try { parsed = validatePageUrl(href) } catch { return }
    const username = profileNameFromUrl(parsed)
    if (!username) return
    const label = (anchor.text() || username).replace(/\s+/g, ' ').trim()
    if (needle && !username.toLowerCase().includes(needle) && !label.toLowerCase().includes(needle)) return
    const key = username.toLowerCase()
    if (found.has(key)) return
    const box = anchor.closest('div, li, article')
    const image = box.find('img').first()
    const avatar = absolute(baseUrl, image.attr('data-src') ?? image.attr('data-original') ?? image.attr('src'))
    found.set(key, { username, url: publicProfileUrl(username), avatar })
  })
  return [...found.values()]
}

async function fetchProfilePage(username: string, page: number) {
  const endpoint = new URL(publicProfileUrl(username))
  endpoint.searchParams.set('t', 'posts')
  if (page > 1) endpoint.searchParams.set('page', String(page))
  const response = await requestErome(endpoint.toString())
  const html = await response.text()
  const $ = load(html)
  const resolvedUsername = ($('h1').first().text() || username).replace(/\s+/g, ' ').trim() || username
  if (prohibited.test(resolvedUsername)) throw new Error('Ese perfil está bloqueado por seguridad.')
  const avatarNode = $('img[src*="avatar.erome.com"], img[data-src*="avatar.erome.com"]').first()
  const avatar = absolute(endpoint.toString(), avatarNode.attr('data-src') ?? avatarNode.attr('src') ?? $('meta[property="og:image"]').attr('content'))
  const albums = parseAlbumList(html, endpoint.toString(), 60)
  return { username: resolvedUsername, url: publicProfileUrl(username), avatar, albums }
}

export async function exploreErome(mode: 'hot' | 'new' = 'hot', page = 1, limit = 10) {
  const safePage = Math.max(1, Math.min(500, Math.floor(page) || 1))
  const pathName = mode === 'new' ? '/explore/new' : '/explore'
  const endpoint = new URL(`${BASE}${pathName}`)
  if (safePage > 1) endpoint.searchParams.set('page', String(safePage))
  const response = await requestErome(endpoint.toString())
  const albums = parseAlbumList(await response.text(), endpoint.toString(), limit)
  return { mode, page: safePage, albums }
}

export async function searchErome(query: string, page = 1, limit = 10) {
  const text = safeQuery(query)
  const safePage = Math.max(1, Math.min(500, Math.floor(page) || 1))
  const endpoint = new URL(`${BASE}/search`)
  endpoint.searchParams.set('q', text)
  if (safePage > 1) endpoint.searchParams.set('page', String(safePage))
  const response = await requestErome(endpoint.toString())
  const albums = parseAlbumList(await response.text(), endpoint.toString(), limit)
  return { query: text, page: safePage, albums }
}

export async function searchEromeProfiles(query: string, page = 1, limit = 5) {
  const text = safeQuery(query)
  const safePage = Math.max(1, Math.min(200, Math.floor(page) || 1))
  const endpoint = new URL(`${BASE}/search`)
  endpoint.searchParams.set('q', text)
  if (safePage > 1) endpoint.searchParams.set('page', String(safePage))
  const response = await requestErome(endpoint.toString())
  const html = await response.text()
  let profiles = parseProfileSummaries(html, endpoint.toString(), text, limit)

  if (!profiles.length && safePage === 1 && !/[\s/?#]/.test(text)) {
    try {
      const direct = await getEromeProfile(text, 1, 1)
      profiles = [{ username: direct.username, url: direct.url, avatar: direct.avatar }]
    } catch { /* no direct profile match */ }
  }

  return { query: text, page: safePage, profiles }
}

export async function getEromeProfile(input: string, batch = 1, limit = 10): Promise<EromeProfile> {
  const username = profileName(input)
  const safeBatch = Math.max(1, Math.min(200, Math.floor(batch) || 1))
  const safeLimit = Math.max(1, Math.min(10, Math.floor(limit) || 10))
  const first = await fetchProfilePage(username, 1)
  if (!first.albums.length) return { ...first, batch: safeBatch, albums: [], hasNext: false }

  const sitePageSize = first.albums.length
  const start = (safeBatch - 1) * safeLimit
  const sitePage = Math.floor(start / sitePageSize) + 1
  const localOffset = start % sitePageSize
  const current = sitePage === 1 ? first : await fetchProfilePage(username, sitePage)
  const pool = current.albums.slice(localOffset)

  if (pool.length < safeLimit && current.albums.length >= sitePageSize) {
    try {
      const next = await fetchProfilePage(username, sitePage + 1)
      pool.push(...next.albums)
    } catch { /* current page remains usable */ }
  }

  const albums = pool.slice(0, safeLimit)
  const hasNext = pool.length > safeLimit || (albums.length === safeLimit && current.albums.length >= sitePageSize)
  return { username: first.username, url: first.url, avatar: first.avatar, batch: safeBatch, albums, hasNext }
}

function albumId(input: string) {
  const raw = input.trim()
  if (/^[A-Za-z0-9_-]{5,30}$/.test(raw)) return raw
  const url = validatePageUrl(raw)
  const match = /^\/a\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname)
  if (!match) throw new Error('Indica un ID o enlace de álbum Erome válido.')
  return match[1]!
}

export async function getEromeAlbum(input: string): Promise<EromeAlbum> {
  const id = albumId(input)
  const url = `${BASE}/a/${id}`
  const response = await requestErome(url)
  const html = await response.text()
  const $ = load(html)
  const title = ($('meta[property="og:title"]').attr('content') || $('h1').first().text() || `Álbum ${id}`).trim().slice(0, 180)
  if (prohibited.test(title)) throw new Error('Este álbum está bloqueado por seguridad.')

  let author: string | undefined
  let authorUrl: string | undefined
  $('a[href]').each((_, element) => {
    if (authorUrl) return
    const candidate = absolute(url, $(element).attr('href'))
    if (!candidate) return
    try {
      const candidateUrl = validatePageUrl(candidate)
      const username = profileNameFromUrl(candidateUrl)
      if (!username) return
      author = ($(element).text() || username).trim() || username
      authorUrl = publicProfileUrl(username)
    } catch { /* ignore */ }
  })
  if (!author) author = ($('.username, .user-name').first().text() || '').trim() || undefined

  const videoMap = new Map<string, { poster?: string }>()

  $('video').each((_, element) => {
    const video = $(element)
    const poster = absolute(url, video.attr('poster'))
    const candidates = [video.attr('src'), video.attr('data-src')]
    video.find('source').each((__, sourceElement) => {
      const source = $(sourceElement)
      candidates.push(source.attr('src'), source.attr('data-src'))
    })
    for (const candidate of candidates) {
      const absoluteUrl = absolute(url, candidate)
      if (!absoluteUrl) continue
      try {
        const media = validateMediaUrl(absoluteUrl)
        if (!videoMap.has(media)) videoMap.set(media, { poster })
      } catch { /* images and unsupported sources are intentionally ignored */ }
    }
  })

  const regex = /https:\/\/[^"'\s<>]+\.erome\.com\/[^"'\s<>]+\.mp4(?:\?[^"'\s<>]*)?/gi
  for (const match of html.match(regex) ?? []) {
    try {
      const media = validateMediaUrl(match.replaceAll('&amp;', '&'))
      if (!videoMap.has(media)) videoMap.set(media, {})
    } catch { /* ignore */ }
  }

  const videos = [...videoMap.entries()].map(([videoUrl, meta], index) => ({
    index: index + 1,
    title: videoMap.size > 1 ? `${title} · Video ${index + 1}` : title,
    url: videoUrl,
    poster: meta.poster,
  }))

  return { id, title, url, author, authorUrl, videos }
}

export async function downloadEromeVideo(albumInput: string, videoIndex: number) {
  const album = await getEromeAlbum(albumInput)
  if (!album.videos.length) throw new Error('Ese álbum no contiene videos descargables; las imágenes se omiten.')
  const index = Math.floor(videoIndex)
  if (!Number.isInteger(index) || index < 1 || index > album.videos.length) throw new Error(`Elige un video entre 1 y ${album.videos.length}.`)
  const video = album.videos[index - 1]!
  const direct = validateMediaUrl(video.url)
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-erome-'))
  const fileName = `${safeFileBase(album.title)}-${index}.mp4`
  const filePath = path.join(dir, fileName)

  try {
    const response = await fetch(direct, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'video/mp4,video/*;q=0.9,*/*;q=0.5',
        referer: album.url,
        cookie: await cookieHeader(),
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20 * 60_000),
    })
    await absorbCookies(response)
    if (!response.ok || !response.body) throw new Error(`El CDN de Erome respondió HTTP ${response.status}.`)
    const finalHost = new URL(response.url).hostname.toLowerCase()
    if (!(finalHost === 'erome.com' || finalHost.endsWith('.erome.com'))) throw new Error('Erome redirigió la descarga a un host no permitido.')
    const declared = Number(response.headers.get('content-length') ?? 0)
    if (declared > config.maxDownloadBytes) throw new Error(`El video supera el límite de ${config.maxDownloadMb} MB.`)

    let size = 0
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length
        if (size > config.maxDownloadBytes) callback(new Error(`El video supera el límite de ${config.maxDownloadMb} MB.`))
        else callback(null, chunk)
      },
    })
    await pipeline(response.body, limiter, createWriteStream(filePath))
    const finalSize = (await stat(filePath)).size
    if (finalSize <= 0) throw new Error('Erome devolvió un archivo vacío.')
    return { album, video, filePath, fileName, size: finalSize, cleanup: () => rm(dir, { recursive: true, force: true }) }
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
}

export async function eromeSessionStatus() {
  await loadCookies()
  const activeStored = Object.values(cookieStore).filter((item) => !item.expiresAt || item.expiresAt > Date.now()).length
  return {
    envCookieConfigured: Boolean(config.eromeCookie.trim()),
    storedCookies: activeStored,
    mode: config.eromeCookie.trim() || activeStored > 2 ? 'cookie-session' as const : 'anonymous' as const,
  }
}
