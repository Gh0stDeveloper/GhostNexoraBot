import { config } from '../config.js'
import { trackedProviderCall } from './provider-health.js'

export type SpotifyTrack = {
  id: string
  name: string
  artists: string[]
  album: string
  durationMs: number
  image?: string
  url: string
}

let tokenCache: { value: string; expiresAt: number } | null = null

function requireCredentials() {
  if (!config.spotifyClientId || !config.spotifyClientSecret) {
    throw new Error(
      'Spotify no está configurado. Añade SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET desde Spotify Developer Dashboard o ejecuta ghostnexora configure en Windows.',
    )
  }
}

async function spotifyToken() {
  requireCredentials()
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.value

  const body = new URLSearchParams({ grant_type: 'client_credentials' })
  const auth = Buffer.from(`${config.spotifyClientId}:${config.spotifyClientSecret}`).toString('base64')
  const payload = await trackedProviderCall('spotify', async () => {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        authorization: `Basic ${auth}`,
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body,
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      throw new Error(`spotify_token_http_${response.status}`)
    }
    return await response.json() as { access_token?: unknown; expires_in?: unknown }
  }, { label: 'Spotify' })
  const value = typeof payload.access_token === 'string' ? payload.access_token.trim() : ''
  if (!value) throw new Error('Spotify no devolvió un access token válido.')
  const expiresIn = Number(payload.expires_in ?? 3600)
  tokenCache = {
    value,
    expiresAt: Date.now() + (Number.isFinite(expiresIn) ? Math.max(60, expiresIn) : 3600) * 1000,
  }
  return value
}

async function spotifyRequest<T>(path: string): Promise<T> {
  const token = await spotifyToken()
  return trackedProviderCall('spotify', async () => {
    const response = await fetch(`https://api.spotify.com${path}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    if (response.status === 401) {
      tokenCache = null
      const retryToken = await spotifyToken()
      const retry = await fetch(`https://api.spotify.com${path}`, {
        headers: { authorization: `Bearer ${retryToken}`, accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      })
      if (!retry.ok) throw new Error(`spotify_api_http_${retry.status}`)
      return await retry.json() as T
    }
    if (!response.ok) throw new Error(`spotify_api_http_${response.status}`)
    return await response.json() as T
  }, { label: 'Spotify' })
}

function normalizeTrack(value: unknown): SpotifyTrack | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  if (!id || !name) return null

  const artists = Array.isArray(row.artists)
    ? row.artists.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return []
        const artist = (item as Record<string, unknown>).name
        return typeof artist === 'string' && artist.trim() ? [artist.trim()] : []
      })
    : []

  const albumRow = row.album && typeof row.album === 'object' && !Array.isArray(row.album)
    ? row.album as Record<string, unknown>
    : null
  const album = typeof albumRow?.name === 'string' ? albumRow.name.trim() : ''
  const images = Array.isArray(albumRow?.images) ? albumRow.images : []
  const image = images.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const url = (item as Record<string, unknown>).url
    return typeof url === 'string' && url.trim() ? [url.trim()] : []
  })[0]

  const external = row.external_urls && typeof row.external_urls === 'object' && !Array.isArray(row.external_urls)
    ? row.external_urls as Record<string, unknown>
    : null
  const url = typeof external?.spotify === 'string' && external.spotify.trim()
    ? external.spotify.trim()
    : `https://open.spotify.com/track/${id}`

  return {
    id,
    name,
    artists,
    album,
    durationMs: Math.max(0, Number(row.duration_ms ?? 0) || 0),
    image,
    url,
  }
}

export function spotifyTrackId(input: string) {
  const value = input.trim()
  if (/^[A-Za-z0-9]{22}$/.test(value)) return value
  try {
    const url = new URL(value)
    if (!/(^|\.)open\.spotify\.com$/i.test(url.hostname)) return null
    const match = url.pathname.match(/^\/track\/([A-Za-z0-9]{22})(?:\/|$)/i)
    return match?.[1] ?? null
  } catch {
    const match = value.match(/^spotify:track:([A-Za-z0-9]{22})$/i)
    return match?.[1] ?? null
  }
}

export async function getSpotifyTrack(input: string) {
  const id = spotifyTrackId(input)
  if (!id) throw new Error('Indica un enlace, URI o ID válido de una canción de Spotify.')
  const payload = await spotifyRequest<unknown>(`/v1/tracks/${encodeURIComponent(id)}`)
  const track = normalizeTrack(payload)
  if (!track) throw new Error('Spotify devolvió datos incompletos para esa canción.')
  return track
}

export async function searchSpotifyTracks(query: string, limit = 8) {
  const clean = query.trim()
  if (clean.length < 2) throw new Error('Escribe al menos 2 caracteres para buscar en Spotify.')
  const safeLimit = Math.max(1, Math.min(10, Math.trunc(limit)))
  const payload = await spotifyRequest<{ tracks?: { items?: unknown[] } }>(
    `/v1/search?type=track&limit=${safeLimit}&q=${encodeURIComponent(clean)}`,
  )
  return (payload.tracks?.items ?? [])
    .map(normalizeTrack)
    .filter((track): track is SpotifyTrack => Boolean(track))
}
