import { mkdtemp, rm, stat } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { config } from '../config.js'

export type AnimeSearchResult = {
  id: string
  title: string
  image?: string
  score?: number
  status?: string
  type?: string
  episodes?: number
  year?: number
  synopsis?: string
  genres?: string[]
  url?: string
}

export type AnimeInfo = AnimeSearchResult & {
  titleEnglish?: string
  titleJapanese?: string
  duration?: string
}

export type AnimeEpisode = { id: string; number: number; season: number; title?: string }
export type AnimeSource = { url: string; quality: string; type: string }

export type AnimeDownload = {
  filePath: string
  fileName: string
  size: number
  cleanup: () => Promise<void>
}

interface AnimeProvider {
  id: string
  name: string
  search(query: string): Promise<AnimeSearchResult[]>
  episodes(animeId: string): Promise<AnimeEpisode[]>
  sources(episodeId: string): Promise<AnimeSource[]>
}

type JikanAnime = {
  mal_id?: number
  url?: string
  title?: string
  title_english?: string | null
  title_japanese?: string | null
  type?: string | null
  episodes?: number | null
  status?: string | null
  duration?: string | null
  score?: number | null
  synopsis?: string | null
  year?: number | null
  aired?: { prop?: { from?: { year?: number | null } } }
  genres?: Array<{ name?: string | null }>
  images?: {
    jpg?: { image_url?: string | null; large_image_url?: string | null }
    webp?: { image_url?: string | null; large_image_url?: string | null }
  }
}

const jsonRequest = async (url: string, timeoutMs = 15_000) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': 'GhostNexoraBot/2.0' },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json() as unknown
  } finally {
    clearTimeout(timer)
  }
}

async function jikanRequest<T>(url: string): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'GhostNexoraBot/2.0' },
        signal: AbortSignal.timeout(18_000),
      })
      if (response.status === 429) {
        const waitSeconds = Math.max(1, Math.min(5, Number(response.headers.get('retry-after') ?? 1)))
        await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000))
        continue
      }
      if (!response.ok) throw new Error(`Jikan HTTP ${response.status}`)
      return await response.json() as T
    } catch (error) {
      lastError = error
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 650 * (attempt + 1)))
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Jikan no respondió.')
}

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined

const number = (value: unknown, fallback: number) => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const image = (row: Record<string, unknown> | null) => text(row?.image ?? row?.image_url ?? row?.imageUrl ?? row?.thumbnail ?? row?.cover)
const season = (row: Record<string, unknown> | null) => Math.max(1, Math.trunc(number(row?.season ?? row?.seasonNumber ?? row?.season_number ?? row?.temporada, 1)))

class ConsumetProvider implements AnimeProvider {
  id = 'consumet'
  name = 'Consumet'
  baseUrl = 'https://api.consumet.org/anime/gogoanime'

  async search(query: string) {
    const data = record(await jsonRequest(`${this.baseUrl}/${encodeURIComponent(query)}`))
    const rows = Array.isArray(data?.results) ? data.results : []
    return rows.flatMap((item) => {
      const row = record(item)
      const id = text(row?.id)
      const title = text(row?.title)
      return id && title ? [{ id, title, image: image(row) }] : []
    })
  }

  async episodes(animeId: string) {
    const data = record(await jsonRequest(`${this.baseUrl}/info/${encodeURIComponent(animeId)}`))
    const rows = Array.isArray(data?.episodes) ? data.episodes : []
    return rows.flatMap((item, index) => {
      const row = record(item)
      const id = text(row?.id)
      const title = text(row?.title)
      return id ? [{ id, number: number(row?.number, index + 1), season: season(row), title }] : []
    })
  }

  async sources(episodeId: string) {
    const data = record(await jsonRequest(`${this.baseUrl}/watch/${encodeURIComponent(episodeId)}`))
    const rows = Array.isArray(data?.sources) ? data.sources : []
    return rows.flatMap((item) => {
      const row = record(item)
      const url = text(row?.url)
      if (!url) return []
      return [{ url, quality: text(row?.quality) ?? 'unknown', type: text(row?.type) ?? 'mp4' }]
    })
  }
}

class WeebApiProvider implements AnimeProvider {
  id = 'weeb'
  name = 'WeebAPI'
  baseUrl = 'https://weeb-api.vercel.app'

  async search(query: string) {
    const data = await jsonRequest(`${this.baseUrl}/search?query=${encodeURIComponent(query)}`)
    const root = record(data)
    const rows = Array.isArray(root?.results) ? root.results : Array.isArray(data) ? data : []
    return rows.flatMap((item) => {
      const row = record(item)
      const id = text(row?.id)
      const title = text(row?.title)
      return id && title ? [{ id, title, image: image(row) }] : []
    })
  }

  async episodes(animeId: string) {
    const data = record(await jsonRequest(`${this.baseUrl}/anime/${encodeURIComponent(animeId)}`))
    const rows = Array.isArray(data?.episodes) ? data.episodes : []
    return rows.flatMap((item, index) => {
      const row = record(item)
      const id = text(row?.id)
      const title = text(row?.title)
      return id ? [{ id, number: number(row?.number, index + 1), season: season(row), title }] : []
    })
  }

  async sources(episodeId: string) {
    const data = record(await jsonRequest(`${this.baseUrl}/episode/${encodeURIComponent(episodeId)}`))
    const rows = Array.isArray(data?.download_links) ? data.download_links : []
    return rows.flatMap((item) => {
      const row = record(item)
      const url = text(row?.url)
      return url ? [{ url, quality: text(row?.quality) ?? 'unknown', type: 'mp4' }] : []
    })
  }
}

class AnimeApiProvider implements AnimeProvider {
  id = 'animeapi'
  name = 'AnimeAPI'
  baseUrl = 'https://anime-api-lyart.vercel.app'

  async search(query: string) {
    const data = record(await jsonRequest(`${this.baseUrl}/search?q=${encodeURIComponent(query)}`))
    const rows = Array.isArray(data?.results) ? data.results : []
    return rows.flatMap((item) => {
      const row = record(item)
      const id = text(row?.id)
      const title = text(row?.title)
      return id && title ? [{ id, title, image: image(row) }] : []
    })
  }

  async episodes(animeId: string) {
    const data = record(await jsonRequest(`${this.baseUrl}/anime/${encodeURIComponent(animeId)}`))
    const rows = Array.isArray(data?.episodes) ? data.episodes : []
    return rows.flatMap((item, index) => {
      const row = record(item)
      const id = text(row?.id)
      const title = text(row?.title)
      return id ? [{ id, number: number(row?.number, index + 1), season: season(row), title }] : []
    })
  }

  async sources(episodeId: string) {
    const data = record(await jsonRequest(`${this.baseUrl}/watch/${encodeURIComponent(episodeId)}`))
    const rows = Array.isArray(data?.sources) ? data.sources : []
    return rows.flatMap((item) => {
      const row = record(item)
      const url = text(row?.url)
      return url ? [{ url, quality: text(row?.quality) ?? 'unknown', type: text(row?.type) ?? 'mp4' }] : []
    })
  }
}

const providers: AnimeProvider[] = [new ConsumetProvider(), new WeebApiProvider(), new AnimeApiProvider()]
const providersById = new Map(providers.map((provider) => [provider.id, provider]))
const QUALITY_RANK: Record<string, number> = { '2160p': 5, '1080p': 4, '720p': 3, '480p': 2, '360p': 1, unknown: 0 }
const targetCache = new Map<string, { expiresAt: number; providerId: string; rawId: string }>()
const infoCache = new Map<string, { expiresAt: number; info: AnimeInfo }>()
const CACHE_TTL = 20 * 60_000

function pack(providerId: string, rawId: string) {
  return `${providerId}:${encodeURIComponent(rawId)}`
}

function unpack(value: string) {
  const separator = value.indexOf(':')
  if (separator <= 0) return null
  const providerId = value.slice(0, separator)
  const provider = providersById.get(providerId)
  if (!provider) return null
  try {
    return { provider, rawId: decodeURIComponent(value.slice(separator + 1)) }
  } catch {
    return null
  }
}

function parseJikanId(value: string) {
  const match = /^jikan:(\d+)$/.exec(value)
  return match?.[1] ? Number(match[1]) : null
}

function normalizeTitle(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function titleScore(expected: string, candidate: string) {
  const left = normalizeTitle(expected)
  const right = normalizeTitle(candidate)
  if (!left || !right) return 0
  if (left === right) return 100
  if (left.includes(right) || right.includes(left)) return 80
  const leftTokens = new Set(left.split(/\s+/))
  const rightTokens = new Set(right.split(/\s+/))
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length
  return overlap / Math.max(leftTokens.size, rightTokens.size) * 70
}

function bestProviderMatch(expected: string, rows: AnimeSearchResult[]) {
  return rows
    .map((row) => ({ row, score: titleScore(expected, row.title) }))
    .sort((a, b) => b.score - a.score)[0]?.row
}

function mapJikan(item: JikanAnime): AnimeInfo | null {
  const animeId = Number(item.mal_id ?? 0)
  const title = item.title?.trim()
  if (!animeId || !title) return null
  const genres = (item.genres ?? []).map((genre) => genre.name?.trim()).filter((name): name is string => Boolean(name))
  return {
    id: `jikan:${animeId}`,
    title,
    titleEnglish: item.title_english?.trim() || undefined,
    titleJapanese: item.title_japanese?.trim() || undefined,
    image: item.images?.webp?.large_image_url ?? item.images?.jpg?.large_image_url ?? item.images?.webp?.image_url ?? item.images?.jpg?.image_url ?? undefined,
    score: item.score ?? undefined,
    status: item.status?.trim() || undefined,
    type: item.type?.trim() || undefined,
    episodes: item.episodes ?? undefined,
    year: item.year ?? item.aired?.prop?.from?.year ?? undefined,
    synopsis: item.synopsis?.trim() || undefined,
    genres: genres.length ? genres : undefined,
    duration: item.duration?.trim() || undefined,
    url: item.url ?? `https://myanimelist.net/anime/${animeId}`,
  }
}

async function getJikanInfo(animeId: number) {
  const cacheKey = `jikan:${animeId}`
  const cached = infoCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.info
  const payload = await jikanRequest<{ data?: JikanAnime }>(`https://api.jikan.moe/v4/anime/${animeId}/full`)
  const info = payload.data ? mapJikan(payload.data) : null
  if (!info) throw new Error('No pude obtener la ficha de ese anime.')
  infoCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL, info })
  return info
}

async function resolveJikanTarget(animeId: number) {
  const key = `jikan:${animeId}`
  const cached = targetCache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    const provider = providersById.get(cached.providerId)
    if (provider) return { provider, rawId: cached.rawId }
  }

  const info = await getJikanInfo(animeId)
  const queries = [...new Set([info.titleEnglish, info.title, info.titleJapanese].filter((value): value is string => Boolean(value)))]
  let best: { provider: AnimeProvider; rawId: string; score: number } | null = null

  for (const provider of providers) {
    for (const query of queries.slice(0, 2)) {
      try {
        const rows = await provider.search(query)
        const match = bestProviderMatch(query, rows)
        if (!match) continue
        const score = titleScore(query, match.title)
        if (!best || score > best.score) best = { provider, rawId: match.id, score }
        if (score >= 95) break
      } catch {
        // Sigue con el siguiente proveedor: el orquestador nunca depende de uno solo.
      }
    }
    if (best?.score && best.score >= 95) break
  }

  if (!best) return null
  targetCache.set(key, { expiresAt: Date.now() + CACHE_TTL, providerId: best.provider.id, rawId: best.rawId })
  return { provider: best.provider, rawId: best.rawId }
}

function wrapEpisodes(provider: AnimeProvider, rows: AnimeEpisode[]) {
  return rows.map((episode) => ({ ...episode, id: pack(provider.id, episode.id) }))
    .sort((a, b) => a.season - b.season || a.number - b.number)
}

export async function searchAnime(query: string, maxResults = 8) {
  const clean = query.trim()
  if (!clean) return []
  const limit = Math.max(1, Math.min(20, maxResults))

  try {
    const payload = await jikanRequest<{ data?: JikanAnime[] }>(
      `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(clean)}&limit=${limit}&order_by=members&sort=desc`,
    )
    const rows = (payload.data ?? []).flatMap((item) => {
      const mapped = mapJikan(item)
      if (!mapped) return []
      infoCache.set(mapped.id, { expiresAt: Date.now() + CACHE_TTL, info: mapped })
      return [mapped]
    })
    if (rows.length) return rows.slice(0, limit)
  } catch {
    // Jikan es la fuente de metadata principal; si cae, buscamos directamente en proveedores.
  }

  const seen = new Set<string>()
  const results: AnimeSearchResult[] = []
  for (const provider of providers) {
    try {
      const rows = await provider.search(clean)
      for (const item of rows) {
        const key = normalizeTitle(item.title)
        if (!key || seen.has(key)) continue
        seen.add(key)
        results.push({ ...item, id: pack(provider.id, item.id) })
        if (results.length >= limit) return results
      }
    } catch {
      // fallback silencioso al siguiente proveedor
    }
  }
  return results.slice(0, limit)
}

export async function getAnimeInfo(animeId: string): Promise<AnimeInfo> {
  const malId = parseJikanId(animeId)
  if (malId) return getJikanInfo(malId)
  const cached = infoCache.get(animeId)
  if (cached && cached.expiresAt > Date.now()) return cached.info
  const packed = unpack(animeId)
  if (packed) {
    return {
      id: animeId,
      title: packed.rawId.replace(/[-_]+/g, ' '),
      status: `Disponible mediante ${packed.provider.name}`,
    }
  }
  return { id: animeId, title: animeId.replace(/[-_]+/g, ' ') }
}

export async function getAnimeEpisodes(animeId: string) {
  const packed = unpack(animeId)
  if (packed) {
    try {
      const rows = await packed.provider.episodes(packed.rawId)
      return wrapEpisodes(packed.provider, rows)
    } catch {
      return []
    }
  }

  const malId = parseJikanId(animeId)
  if (malId) {
    const target = await resolveJikanTarget(malId)
    if (!target) return []
    try {
      return wrapEpisodes(target.provider, await target.provider.episodes(target.rawId))
    } catch {
      return []
    }
  }

  // Compatibilidad con IDs históricos guardados antes del enrutamiento por proveedor.
  for (const provider of providers) {
    try {
      const rows = await provider.episodes(animeId)
      if (rows.length) return wrapEpisodes(provider, rows)
    } catch {
      // fallback silencioso
    }
  }
  return []
}

export async function getAnimeSeasons(animeId: string) {
  const episodes = await getAnimeEpisodes(animeId)
  return [...new Set(episodes.map((episode) => episode.season))].sort((a, b) => a - b)
}

export async function getAnimeEpisodesBySeason(animeId: string, seasonNumber: number) {
  const episodes = await getAnimeEpisodes(animeId)
  return episodes.filter((episode) => episode.season === seasonNumber)
}

export async function getAnimeSources(episodeId: string) {
  const packed = unpack(episodeId)
  if (packed) {
    try {
      const rows = await packed.provider.sources(packed.rawId)
      return rows.sort((a, b) => (QUALITY_RANK[b.quality] ?? 0) - (QUALITY_RANK[a.quality] ?? 0))
    } catch {
      return []
    }
  }

  for (const provider of providers) {
    try {
      const rows = await provider.sources(episodeId)
      if (rows.length) return rows.sort((a, b) => (QUALITY_RANK[b.quality] ?? 0) - (QUALITY_RANK[a.quality] ?? 0))
    } catch {
      // compatibilidad con IDs antiguos
    }
  }
  return []
}

async function commandExists(command: string) {
  return new Promise<boolean>((resolve) => {
    const child = spawn('sh', ['-lc', `command -v ${command}`], { stdio: 'ignore' })
    child.once('close', (code) => resolve(code === 0))
    child.once('error', () => resolve(false))
  })
}

function runYtDlp(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('yt-dlp', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim().slice(-1200) || `yt-dlp terminó con código ${code ?? 'desconocido'}`))
    })
  })
}

function safeName(value: string) {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9._ -]+/g, '').trim().replace(/\s+/g, '-').slice(0, 100) || 'anime'
}

export async function downloadAnimeEpisode(source: AnimeSource, animeTitle: string, episodeNumber: number): Promise<AnimeDownload> {
  if (!(await commandExists('yt-dlp'))) throw new Error('El descargador de vídeo no está disponible en el servidor.')

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ghost-anime-'))
  const base = safeName(`${animeTitle}-ep${episodeNumber}`)
  const output = path.join(tempDir, `${base}.mp4`)
  const args = [
    '--no-playlist',
    '--format', 'bestvideo*+bestaudio/best',
    '--merge-output-format', 'mp4',
    '--output', output,
    '--no-warnings',
  ]
  if (config.ytdlpCookiesFile) args.push('--cookies', config.ytdlpCookiesFile)
  args.push(source.url)

  try {
    await runYtDlp(args)
    const info = await stat(output)
    if (!info.isFile() || info.size <= 0) throw new Error('La descarga no produjo un archivo válido.')
    if (info.size > config.maxDownloadBytes) throw new Error(`El episodio supera el límite de ${config.maxDownloadMb} MB.`)

    const fileName = `${base}.mp4`
    return {
      filePath: output,
      fileName,
      size: info.size,
      cleanup: async () => { await rm(tempDir, { recursive: true, force: true }) },
    }
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}
