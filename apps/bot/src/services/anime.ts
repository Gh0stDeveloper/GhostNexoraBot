import { mkdtemp, rm, stat } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { config } from '../config.js'

export type AnimeSearchResult = { id: string; title: string }
export type AnimeEpisode = { id: string; number: number }
export type AnimeSource = { url: string; quality: string; type: string }

export type AnimeDownload = {
  filePath: string
  fileName: string
  size: number
  cleanup: () => Promise<void>
}

interface AnimeProvider {
  name: string
  search(query: string): Promise<AnimeSearchResult[]>
  episodes(animeId: string): Promise<AnimeEpisode[]>
  sources(episodeId: string): Promise<AnimeSource[]>
}

const jsonRequest = async (url: string, timeoutMs = 15_000) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json() as unknown
  } finally {
    clearTimeout(timer)
  }
}

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined

const number = (value: unknown, fallback: number) => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

class ConsumetProvider implements AnimeProvider {
  name = 'Consumet'
  baseUrl = 'https://api.consumet.org/anime/gogoanime'

  async search(query: string) {
    const data = record(await jsonRequest(`${this.baseUrl}/${encodeURIComponent(query)}`))
    const rows = Array.isArray(data?.results) ? data.results : []
    return rows.flatMap((item) => {
      const row = record(item)
      const id = text(row?.id)
      const title = text(row?.title)
      return id && title ? [{ id, title }] : []
    })
  }

  async episodes(animeId: string) {
    const data = record(await jsonRequest(`${this.baseUrl}/info/${encodeURIComponent(animeId)}`))
    const rows = Array.isArray(data?.episodes) ? data.episodes : []
    return rows.flatMap((item, index) => {
      const row = record(item)
      const id = text(row?.id)
      return id ? [{ id, number: number(row?.number, index + 1) }] : []
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
      return id && title ? [{ id, title }] : []
    })
  }

  async episodes(animeId: string) {
    const data = record(await jsonRequest(`${this.baseUrl}/anime/${encodeURIComponent(animeId)}`))
    const rows = Array.isArray(data?.episodes) ? data.episodes : []
    return rows.flatMap((item, index) => {
      const row = record(item)
      const id = text(row?.id)
      return id ? [{ id, number: number(row?.number, index + 1) }] : []
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
  name = 'AnimeAPI'
  baseUrl = 'https://anime-api-lyart.vercel.app'

  async search(query: string) {
    const data = record(await jsonRequest(`${this.baseUrl}/search?q=${encodeURIComponent(query)}`))
    const rows = Array.isArray(data?.results) ? data.results : []
    return rows.flatMap((item) => {
      const row = record(item)
      const id = text(row?.id)
      const title = text(row?.title)
      return id && title ? [{ id, title }] : []
    })
  }

  async episodes(animeId: string) {
    const data = record(await jsonRequest(`${this.baseUrl}/anime/${encodeURIComponent(animeId)}`))
    const rows = Array.isArray(data?.episodes) ? data.episodes : []
    return rows.flatMap((item, index) => {
      const row = record(item)
      const id = text(row?.id)
      return id ? [{ id, number: number(row?.number, index + 1) }] : []
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

const QUALITY_RANK: Record<string, number> = { '1080p': 4, '720p': 3, '480p': 2, '360p': 1, unknown: 0 }

export async function searchAnime(query: string, maxResults = 8) {
  const seen = new Set<string>()
  const results: AnimeSearchResult[] = []

  for (const provider of providers) {
    try {
      const rows = await provider.search(query)
      for (const item of rows) {
        if (seen.has(item.id)) continue
        seen.add(item.id)
        results.push(item)
        if (results.length >= maxResults) break
      }
    } catch {
      // fallback silencioso al siguiente proveedor
    }
    if (results.length >= maxResults) break
  }
  return results.slice(0, maxResults)
}

export async function getAnimeEpisodes(animeId: string) {
  for (const provider of providers) {
    try {
      const rows = await provider.episodes(animeId)
      if (rows.length) return rows
    } catch {
      // fallback silencioso
    }
  }
  return []
}

export async function getAnimeSources(episodeId: string) {
  for (const provider of providers) {
    try {
      const rows = await provider.sources(episodeId)
      if (rows.length) return rows.sort((a, b) => (QUALITY_RANK[b.quality] ?? 0) - (QUALITY_RANK[a.quality] ?? 0))
    } catch {
      // fallback silencioso
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
