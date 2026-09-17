import { downloadYouTubeSearchAudio, searchYouTube, type DownloadResult } from './downloader.js'

export type SpotifyItemKind = 'track' | 'album' | 'playlist' | 'artist' | 'show' | 'episode' | 'unknown'

export type SpotifyTrack = {
  id: string
  kind: SpotifyItemKind
  title: string
  artist?: string
  image?: string
  spotifyUrl?: string
  duration?: number
  downloadQuery: string
}

export type SpotifyAudioResult = {
  track: SpotifyTrack
  download: DownloadResult
}

const SPOTIFY_HOSTS = new Set(['open.spotify.com', 'www.open.spotify.com', 'spotify.link'])
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36 GhostNexoraBot/2.0'

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
}

function meta(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const direct = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i').exec(html)
  if (direct?.[1]) return decodeHtml(direct[1].trim())
  const reverse = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i').exec(html)
  return reverse?.[1] ? decodeHtml(reverse[1].trim()) : undefined
}

function pageTitle(html: string) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  return match?.[1] ? decodeHtml(match[1].replace(/\s+/g, ' ').trim()) : undefined
}

function artistFromTitle(value?: string) {
  if (!value) return undefined
  const patterns = [
    /\s[-–—]\s*song and lyrics by\s+(.+?)\s*\|\s*Spotify/i,
    /\s[-–—]\s*canci[oó]n y letra de\s+(.+?)\s*\|\s*Spotify/i,
    /\s[-–—]\s*m[uú]sica e letra (?:de|por)\s+(.+?)\s*\|\s*Spotify/i,
    /\s[-–—]\s*Musik und Lyrics von\s+(.+?)\s*\|\s*Spotify/i,
    /\s[-–—]\s*chanson et paroles par\s+(.+?)\s*\|\s*Spotify/i,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(value)
    if (match?.[1]) return match[1].trim()
  }
  return undefined
}

function cleanSpotifyUrl(value: string) {
  const url = new URL(value)
  url.search = ''
  url.hash = ''
  return url.toString()
}

export function isSpotifyUrl(value: string) {
  try {
    const url = new URL(value.trim())
    return ['http:', 'https:'].includes(url.protocol) && SPOTIFY_HOSTS.has(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

function spotifyPath(value: string) {
  const url = new URL(value)
  const parts = url.pathname.split('/').filter(Boolean)
  const localized = parts[0]?.startsWith('intl-') ? parts.slice(1) : parts
  const kind = (localized[0] ?? 'unknown') as SpotifyItemKind
  const id = localized[1] ?? ''
  return {
    kind: ['track', 'album', 'playlist', 'artist', 'show', 'episode'].includes(kind) ? kind : 'unknown' as SpotifyItemKind,
    id,
  }
}

async function requestText(url: string, timeoutMs = 18_000) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': UA },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`Spotify respondió HTTP ${response.status}.`)
  return { html: await response.text(), finalUrl: response.url || url }
}

async function resolveShortSpotifyUrl(input: string) {
  const parsed = new URL(input)
  if (parsed.hostname.toLowerCase() !== 'spotify.link') return cleanSpotifyUrl(input)
  const response = await fetch(input, {
    redirect: 'follow',
    headers: { 'user-agent': UA },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Spotify respondió HTTP ${response.status}.`)
  if (!SPOTIFY_HOSTS.has(new URL(response.url).hostname.toLowerCase())) throw new Error('El enlace corto no redirigió a Spotify.')
  return cleanSpotifyUrl(response.url)
}

async function oEmbed(url: string) {
  try {
    const response = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, {
      headers: { accept: 'application/json', 'user-agent': UA },
      signal: AbortSignal.timeout(12_000),
    })
    if (!response.ok) return null
    return await response.json() as { title?: string; thumbnail_url?: string }
  } catch {
    return null
  }
}

export async function resolveSpotifyItem(input: string): Promise<SpotifyTrack> {
  if (!isSpotifyUrl(input)) throw new Error('El enlace no pertenece a Spotify.')
  const spotifyUrl = await resolveShortSpotifyUrl(input.trim())
  const path = spotifyPath(spotifyUrl)
  let html = ''
  let finalUrl = spotifyUrl
  try {
    const page = await requestText(spotifyUrl)
    html = page.html
    finalUrl = cleanSpotifyUrl(page.finalUrl)
  } catch {
    // oEmbed funciona como fallback cuando el frontend web de Spotify rechaza la VPS.
  }

  const embed = await oEmbed(finalUrl)
  const ogTitle = meta(html, 'og:title')
  const title = ogTitle || embed?.title?.trim() || (path.kind === 'track' ? 'Pista de Spotify' : 'Contenido de Spotify')
  const titleTag = pageTitle(html)
  const artist = artistFromTitle(titleTag)
    ?? meta(html, 'music:musician')?.replace(/^https?:\/\/open\.spotify\.com\/artist\//i, '')
    ?? undefined
  const image = meta(html, 'og:image') || embed?.thumbnail_url
  const id = path.id || `url:${Buffer.from(finalUrl).toString('base64url').slice(0, 22)}`
  const downloadQuery = [artist, title, path.kind === 'track' ? 'official audio' : ''].filter(Boolean).join(' ')

  return {
    id,
    kind: path.kind,
    title,
    artist: artist && !SPOTIFY_ID.test(artist) ? artist : undefined,
    image,
    spotifyUrl: finalUrl,
    downloadQuery,
  }
}

function extractTrackIds(html: string) {
  const seen = new Set<string>()
  const ids: string[] = []
  const regex = /\\?\/track\\?\/([A-Za-z0-9]{22})/g
  for (const match of html.matchAll(regex)) {
    const id = match[1]
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

async function spotifyWebSearch(query: string, limit: number) {
  const searchUrl = `https://open.spotify.com/search/${encodeURIComponent(query)}`
  const { html } = await requestText(searchUrl)
  const ids = extractTrackIds(html).slice(0, Math.max(1, Math.min(8, limit)))
  const tracks: SpotifyTrack[] = []
  for (const id of ids) {
    try {
      const item = await resolveSpotifyItem(`https://open.spotify.com/track/${id}`)
      if (item.kind === 'track') tracks.push(item)
    } catch {
      // Un resultado roto no debe invalidar el resto de la búsqueda.
    }
  }
  return tracks
}

function youtubeFallback(query: string, limit: number) {
  return searchYouTube(query, limit).then((rows) => rows.map((row) => ({
    id: `music:${row.id}`,
    kind: 'track' as const,
    title: row.title,
    artist: row.channel,
    image: row.thumbnail,
    duration: row.duration,
    spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(`${row.title} ${row.channel}`)}`,
    downloadQuery: `${row.title} ${row.channel}`,
  })))
}

export async function searchSpotify(query: string, limit = 5) {
  const clean = query.trim()
  if (!clean) throw new Error('Indica una canción, artista o enlace de Spotify.')
  if (isSpotifyUrl(clean)) return [await resolveSpotifyItem(clean)]
  const max = Math.max(1, Math.min(8, limit))
  try {
    const tracks = await spotifyWebSearch(clean, max)
    if (tracks.length) return tracks.slice(0, max)
  } catch {
    // El buscador web de Spotify cambia con frecuencia; mantenemos un fallback musical funcional.
  }
  return youtubeFallback(clean, max)
}

export async function downloadSpotifyAudio(input: string): Promise<SpotifyAudioResult> {
  const clean = input.trim()
  if (!clean) throw new Error('Indica una canción o enlace de Spotify.')

  let track: SpotifyTrack
  if (isSpotifyUrl(clean)) {
    track = await resolveSpotifyItem(clean)
    if (track.kind !== 'track') throw new Error('La descarga directa solo está disponible para pistas individuales de Spotify.')
  } else {
    const first = (await searchSpotify(clean, 1))[0]
    if (!first) throw new Error('No encontré esa canción.')
    track = first
  }

  const download = await downloadYouTubeSearchAudio(track.downloadQuery || [track.artist, track.title].filter(Boolean).join(' '))
  return { track, download }
}
