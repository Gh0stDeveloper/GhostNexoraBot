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

type StoredCookie = { value: string; expiresAt?: number }
type CookieStore = Record<string, StoredCookie>

export type EromeAlbumSummary = {
  id: string
  title: string
  url: string
  thumbnail?: string
  author?: string
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
  $('a[href]').each((_, element) => {
    if (found.size >= Math.max(1, Math.min(12, limit))) return
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
    const author = (box.find('.album-user, .username, .user-name').first().text() || '').trim() || undefined
    found.set(id, { id, title: title.slice(0, 180), url: `${BASE}/a/${id}`, thumbnail, author })
  })
  return [...found.values()]
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
  const author = ($('a[href*="/u/"], .username, .user-name').first().text() || '').trim() || undefined
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

  return { id, title, url, author, videos }
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
