import { mkdtemp, rm, stat } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { config } from '../config.js'
import { trackedProviderCall } from './provider-health.js'

export type AnimeSearchResult = { id: string; title: string; image?: string; source?: string }
export type AnimeEpisode = { id: string; number: number; season: number }
export type AnimeSource = { url: string; quality: string; type: string }
export type AnimeInfo = {
  title: string
  titleJapanese?: string
  synopsis?: string
  status?: string
  score?: number
  episodes?: number
  image?: string
  url?: string
}

export type AnimeDownload = {
  filePath: string
  fileName: string
  size: number
  cleanup: () => Promise<void>
}

interface AnimeProvider {
  key: string
  name: string
  search(query: string): Promise<AnimeSearchResult[]>
  episodes(animeId: string): Promise<AnimeEpisode[]>
  sources(episodeId: string): Promise<AnimeSource[]>
}

function animeProviderId(url: string) {
  try {
    if (config.anime1vApiUrl && url.startsWith(config.anime1vApiUrl)) return 'anime1v'
    if (config.consumetApiUrl && url.startsWith(config.consumetApiUrl)) return 'consumet'
    const host = new URL(url).hostname.toLowerCase()
    if (host === 'api.jikan.moe') return 'jikan'
    if (host.includes('weeb-api')) return 'weeb'
    if (host.includes('anime-api-lyart')) return 'animeapi'
  } catch {}
  return 'anime'
}

const jsonRequest = async (url: string, init: RequestInit = {}, timeoutMs = 18_000) => {
  const providerId = animeProviderId(url)
  return trackedProviderCall(providerId, async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: { accept: 'application/json', 'user-agent': 'GhostNexoraBot/2.0', ...(init.headers ?? {}) },
      })
      if (!response.ok) throw new Error(`${providerId}_http_${response.status}`)
      return await response.json() as unknown
    } finally {
      clearTimeout(timer)
    }
  })
}

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined

const number = (value: unknown, fallback: number) => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const image = (row: Record<string, unknown> | null) =>
  text(row?.image ?? row?.image_url ?? row?.imageUrl ?? row?.thumbnail ?? row?.cover ?? row?.poster)

const season = (row: Record<string, unknown> | null) =>
  Math.max(1, Math.trunc(number(row?.season ?? row?.seasonNumber ?? row?.season_number ?? row?.temporada, 1)))

function collectRecords(value: unknown, out: Record<string, unknown>[] = [], depth = 0) {
  if (depth > 8 || value === null || value === undefined) return out
  if (Array.isArray(value)) {
    for (const item of value) collectRecords(item, out, depth + 1)
    return out
  }
  const row = record(value)
  if (!row) return out
  out.push(row)
  for (const child of Object.values(row)) collectRecords(child, out, depth + 1)
  return out
}

function collectUrls(value: unknown, out: string[] = [], depth = 0) {
  if (depth > 8 || value === null || value === undefined) return out
  if (typeof value === 'string') {
    try {
      const url = new URL(value)
      if (['http:', 'https:'].includes(url.protocol)) out.push(url.toString())
    } catch {
      // not an URL
    }
    return out
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUrls(item, out, depth + 1)
    return out
  }
  const row = record(value)
  if (!row) return out
  for (const child of Object.values(row)) collectUrls(child, out, depth + 1)
  return out
}

function encodeRef(provider: string, rawId: string) {
  return `${provider}:${Buffer.from(rawId, 'utf8').toString('base64url')}`
}

function decodeRef(value: string) {
  const match = value.match(/^([a-z0-9_-]+):([A-Za-z0-9_-]+)$/i)
  if (!match) return null
  try {
    return { provider: match[1]!.toLowerCase(), id: Buffer.from(match[2]!, 'base64url').toString('utf8') }
  } catch {
    return null
  }
}

function normalizedTitle(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function inferEpisodeNumber(row: Record<string, unknown>, index: number) {
  const direct = number(row.number ?? row.episode ?? row.episodeNumber ?? row.episode_number ?? row.capitulo, NaN)
  if (Number.isFinite(direct)) return Math.max(1, Math.trunc(direct))
  const label = text(row.title ?? row.name ?? row.label ?? row.episode)
  const found = label?.match(/(?:ep(?:isode|isodio)?|cap(?:itulo)?)[^0-9]*(\d+)/i)?.[1]
  return found ? Math.max(1, Number(found)) : index + 1
}

class Anime1vProvider implements AnimeProvider {
  key = 'anime1v'
  name = 'Anime1v'
  constructor(private readonly baseUrl: string) {}

  async search(query: string) {
    const data = await jsonRequest(`${this.baseUrl}/api/v1/anime/search?q=${encodeURIComponent(query)}`)
    const rows = collectRecords(data)
    const found = rows.flatMap((row) => {
      const id = text(row.url ?? row.link ?? row.href)
      const title = text(row.title ?? row.name ?? row.nombre)
      if (!id || !title || !/^https?:\/\//i.test(id)) return []
      return [{ id, title, image: image(row), source: this.name }]
    })
    return [...new Map(found.map((item) => [item.id, item])).values()].slice(0, 20)
  }

  async episodes(animeId: string) {
    const data = await jsonRequest(`${this.baseUrl}/api/v1/anime/info?url=${encodeURIComponent(animeId)}`)
    const rows = collectRecords(data)
    const candidates = rows.flatMap((row, index) => {
      const id = text(row.url ?? row.link ?? row.href ?? row.episodeUrl ?? row.episode_url)
      if (!id || !/^https?:\/\//i.test(id) || id === animeId) return []
      const label = `${text(row.title ?? row.name ?? row.label) ?? ''} ${id}`
      if (!/(episod|capitulo|chapter|\/ver\/|\/episode\/|\bep[-_ ]?\d+)/i.test(label)) return []
      return [{ id, number: inferEpisodeNumber(row, index), season: season(row) }]
    })
    return [...new Map(candidates.map((item) => [item.id, item])).values()]
  }

  async sources(episodeId: string) {
    const data = await jsonRequest(`${this.baseUrl}/api/v1/anime/episode?url=${encodeURIComponent(episodeId)}`)
    const rows = collectRecords(data)
    const structured = rows.flatMap((row) => {
      const url = text(row.url ?? row.link ?? row.file ?? row.src ?? row.download)
      if (!url || !/^https?:\/\//i.test(url) || url === episodeId) return []
      return [{
        url,
        quality: text(row.quality ?? row.resolution ?? row.label) ?? 'unknown',
        type: text(row.type ?? row.format) ?? (/\.m3u8(?:$|[?#])/i.test(url) ? 'hls' : 'video'),
      }]
    })
    const fallback = collectUrls(data)
      .filter((url) => url !== episodeId)
      .map((url) => ({ url, quality: 'unknown', type: /\.m3u8(?:$|[?#])/i.test(url) ? 'hls' : 'video' }))
    return [...new Map([...structured, ...fallback].map((item) => [item.url, item])).values()]
  }
}

class ConsumetProvider implements AnimeProvider {
  key = 'consumet'
  name = 'Consumet'
  constructor(private readonly baseUrl: string) {}

  async search(query: string) {
    const data = record(await jsonRequest(`${this.baseUrl}/anime/gogoanime/${encodeURIComponent(query)}`))
    const rows = Array.isArray(data?.results) ? data.results : []
    return rows.flatMap((item) => {
      const row = record(item)
      const id = text(row?.id)
      const title = text(row?.title)
      return id && title ? [{ id, title, image: image(row), source: this.name }] : []
    })
  }

  async episodes(animeId: string) {
    const data = record(await jsonRequest(`${this.baseUrl}/anime/gogoanime/info/${encodeURIComponent(animeId)}`))
    const rows = Array.isArray(data?.episodes) ? data.episodes : []
    return rows.flatMap((item, index) => {
      const row = record(item)
      const id = text(row?.id)
      return id ? [{ id, number: number(row?.number, index + 1), season: season(row) }] : []
    })
  }

  async sources(episodeId: string) {
    const data = record(await jsonRequest(`${this.baseUrl}/anime/gogoanime/watch/${encodeURIComponent(episodeId)}`))
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
  key = 'weeb'
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
      return id && title ? [{ id, title, image: image(row), source: this.name }] : []
    })
  }

  async episodes(animeId: string) {
    const data = record(await jsonRequest(`${this.baseUrl}/anime/${encodeURIComponent(animeId)}`))
    const rows = Array.isArray(data?.episodes) ? data.episodes : []
    return rows.flatMap((item, index) => {
      const row = record(item)
      const id = text(row?.id)
      return id ? [{ id, number: number(row?.number, index + 1), season: season(row) }] : []
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
  key = 'animeapi'
  name = 'AnimeAPI'
  baseUrl = 'https://anime-api-lyart.vercel.app'

  async search(query: string) {
    const data = record(await jsonRequest(`${this.baseUrl}/search?q=${encodeURIComponent(query)}`))
    const rows = Array.isArray(data?.results) ? data.results : []
    return rows.flatMap((item) => {
      const row = record(item)
      const id = text(row?.id)
      const title = text(row?.title)
      return id && title ? [{ id, title, image: image(row), source: this.name }] : []
    })
  }

  async episodes(animeId: string) {
    const data = record(await jsonRequest(`${this.baseUrl}/anime/${encodeURIComponent(animeId)}`))
    const rows = Array.isArray(data?.episodes) ? data.episodes : []
    return rows.flatMap((item, index) => {
      const row = record(item)
      const id = text(row?.id)
      return id ? [{ id, number: number(row?.number, index + 1), season: season(row) }] : []
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

async function searchJikan(query: string, limit = 10) {
  const data = record(await jsonRequest(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=${Math.max(1, Math.min(15, limit))}&sfw=true`))
  const rows = Array.isArray(data?.data) ? data.data : []
  return rows.flatMap((item) => {
    const row = record(item)
    const id = number(row?.mal_id, 0)
    const title = text(row?.title_english ?? row?.title ?? row?.title_japanese)
    if (!id || !title) return []
    const images = record(row?.images)
    const jpg = record(images?.jpg)
    return [{
      id: String(id),
      title,
      image: text(jpg?.large_image_url ?? jpg?.image_url),
      source: 'Jikan',
    }]
  })
}

async function jikanInfoById(id: string): Promise<AnimeInfo | null> {
  try {
    const payload = record(await jsonRequest(`https://api.jikan.moe/v4/anime/${encodeURIComponent(id)}/full`))
    const row = record(payload?.data)
    if (!row) return null
    const images = record(row.images)
    const jpg = record(images?.jpg)
    return {
      title: text(row.title_english ?? row.title) ?? 'Anime',
      titleJapanese: text(row.title_japanese),
      synopsis: text(row.synopsis),
      status: text(row.status),
      score: number(row.score, 0) || undefined,
      episodes: number(row.episodes, 0) || undefined,
      image: text(jpg?.large_image_url ?? jpg?.image_url),
      url: text(row.url),
    }
  } catch {
    return null
  }
}

const providers: AnimeProvider[] = [
  ...(config.anime1vApiUrl ? [new Anime1vProvider(config.anime1vApiUrl)] : []),
  new WeebApiProvider(),
  new AnimeApiProvider(),
  ...(config.consumetApiUrl ? [new ConsumetProvider(config.consumetApiUrl)] : []),
]

const providerMap = new Map(providers.map((provider) => [provider.key, provider]))
const animeTitleCache = new Map<string, { title: string; expiresAt: number }>()
const QUALITY_RANK: Record<string, number> = { '2160p': 6, '1440p': 5, '1080p': 4, '720p': 3, '480p': 2, '360p': 1, unknown: 0 }

function cacheTitle(id: string, title: string) {
  animeTitleCache.set(id, { title, expiresAt: Date.now() + 60 * 60_000 })
}

function cachedTitle(id: string) {
  const row = animeTitleCache.get(id)
  if (!row || row.expiresAt <= Date.now()) {
    animeTitleCache.delete(id)
    return undefined
  }
  return row.title
}

async function providerSearches(query: string) {
  const settled = await Promise.allSettled(providers.map(async (provider) => {
    const rows = await provider.search(query)
    return rows.map((row) => {
      const id = encodeRef(provider.key, row.id)
      cacheTitle(id, row.title)
      return { ...row, id, source: provider.name }
    })
  }))
  return settled.flatMap((result) => result.status === 'fulfilled' ? result.value : [])
}

function titleScore(wanted: string, candidate: string) {
  const a = normalizedTitle(wanted)
  const b = normalizedTitle(candidate)
  if (a === b) return 100
  if (a && b && (a.includes(b) || b.includes(a))) return 80
  const terms = a.split(' ').filter((part) => part.length > 2)
  if (!terms.length) return 0
  return Math.round(60 * terms.filter((term) => b.includes(term)).length / terms.length)
}

async function resolveJikanToProvider(jikanId: string) {
  const info = await jikanInfoById(jikanId)
  if (!info) return null
  const rows = await providerSearches(info.title)
  const best = rows
    .map((row) => ({ row, score: titleScore(info.title, row.title) }))
    .sort((a, b) => b.score - a.score)[0]
  return best && best.score >= 45 ? best.row.id : null
}

export async function searchAnime(query: string, maxResults = 8) {
  const [metadata, streams] = await Promise.all([
    searchJikan(query, Math.max(8, maxResults)).catch(() => []),
    providerSearches(query),
  ])

  const streamByTitle = new Map<string, AnimeSearchResult>()
  for (const item of streams) {
    const key = normalizedTitle(item.title)
    if (key && !streamByTitle.has(key)) streamByTitle.set(key, item)
  }

  const results: AnimeSearchResult[] = []
  const seen = new Set<string>()
  for (const meta of metadata) {
    const exact = streamByTitle.get(normalizedTitle(meta.title))
    const id = exact?.id ?? encodeRef('jikan', meta.id)
    cacheTitle(id, meta.title)
    const key = normalizedTitle(meta.title)
    if (seen.has(key)) continue
    seen.add(key)
    results.push({ id, title: meta.title, image: meta.image ?? exact?.image, source: exact?.source ?? 'Jikan' })
    if (results.length >= maxResults) return results
  }
  for (const item of streams) {
    const key = normalizedTitle(item.title)
    if (!key || seen.has(key)) continue
    seen.add(key)
    results.push(item)
    if (results.length >= maxResults) break
  }
  return results
}

async function resolveAnimeRef(animeId: string) {
  const decoded = decodeRef(animeId)
  if (!decoded) return { provider: undefined, rawId: animeId }
  if (decoded.provider === 'jikan') {
    const replacement = await resolveJikanToProvider(decoded.id)
    if (!replacement) return { provider: undefined, rawId: animeId }
    const next = decodeRef(replacement)
    return next ? { provider: providerMap.get(next.provider), rawId: next.id } : { provider: undefined, rawId: replacement }
  }
  return { provider: providerMap.get(decoded.provider), rawId: decoded.id }
}

export async function getAnimeEpisodes(animeId: string) {
  const resolved = await resolveAnimeRef(animeId)
  if (resolved.provider) {
    try {
      const rows = await resolved.provider.episodes(resolved.rawId)
      return rows
        .map((row) => ({ ...row, id: encodeRef(resolved.provider!.key, row.id) }))
        .sort((a, b) => a.season - b.season || a.number - b.number)
    } catch {
      return []
    }
  }

  // Compatibilidad con IDs antiguos guardados antes de introducir provenance.
  for (const provider of providers) {
    try {
      const rows = await provider.episodes(animeId)
      if (rows.length) {
        return rows
          .map((row) => ({ ...row, id: encodeRef(provider.key, row.id) }))
          .sort((a, b) => a.season - b.season || a.number - b.number)
      }
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
  const decoded = decodeRef(episodeId)
  if (decoded && decoded.provider !== 'jikan') {
    const provider = providerMap.get(decoded.provider)
    if (!provider) return []
    try {
      const rows = await provider.sources(decoded.id)
      return rows.sort((a, b) => (QUALITY_RANK[b.quality.toLowerCase()] ?? 0) - (QUALITY_RANK[a.quality.toLowerCase()] ?? 0))
    } catch {
      return []
    }
  }

  for (const provider of providers) {
    try {
      const rows = await provider.sources(episodeId)
      if (rows.length) return rows.sort((a, b) => (QUALITY_RANK[b.quality.toLowerCase()] ?? 0) - (QUALITY_RANK[a.quality.toLowerCase()] ?? 0))
    } catch {
      // fallback legacy
    }
  }
  return []
}

export async function getAnimeInfo(animeId: string): Promise<AnimeInfo | null> {
  const decoded = decodeRef(animeId)
  if (decoded?.provider === 'jikan') return jikanInfoById(decoded.id)

  const title = cachedTitle(animeId)
  if (title) {
    try {
      const matches = await searchJikan(title, 3)
      const best = matches
        .map((row) => ({ row, score: titleScore(title, row.title) }))
        .sort((a, b) => b.score - a.score)[0]
      if (best && best.score >= 45) return jikanInfoById(best.row.id)
    } catch {
      // metadata is optional
    }
  }
  return null
}

async function commandExists(command: string) {
  return new Promise<boolean>((resolve) => {
    const child = spawn(command, ['--version'], { stdio: 'ignore', windowsHide: true })
    child.once('close', (code) => resolve(code === 0))
    child.once('error', () => resolve(false))
  })
}

function runYtDlp(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('yt-dlp', args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
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

    return {
      filePath: output,
      fileName: `${base}.mp4`,
      size: info.size,
      cleanup: async () => { await rm(tempDir, { recursive: true, force: true }) },
    }
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}
