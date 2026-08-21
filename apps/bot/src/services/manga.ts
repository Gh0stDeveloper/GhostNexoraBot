import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { execa } from 'execa'
import { config } from '../config.js'

export type MangaChapter = {
  id: string
  chapter: string | null
  title: string | null
  language: string
  pages: number
  volume: string | null
  publishedAt: string | null
}

type ChapterApiRow = {
  id: string
  attributes?: {
    chapter?: string | null
    title?: string | null
    translatedLanguage?: string
    pages?: number
    volume?: string | null
    publishAt?: string
  }
}

function mangaId(input: string) {
  const value = input.trim()
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)) return value
  try {
    const url = new URL(value)
    if (!['mangadex.org', 'www.mangadex.org'].includes(url.hostname)) throw new Error('host')
    const match = /^\/title\/([0-9a-f-]+)/i.exec(url.pathname)
    if (match?.[1]) return match[1]
  } catch { /* handled below */ }
  throw new Error('Indica un ID o enlace de MangaDex válido.')
}

function safeName(value: string) {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9._ -]+/g, '').trim().replace(/\s+/g, '-').slice(0, 90) || 'manga'
}

async function mangaTitle(id: string) {
  const response = await fetch(`https://api.mangadex.org/manga/${id}`, {
    headers: { accept: 'application/json', 'user-agent': 'GhostNexoraBot/1.1' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) return 'MangaDex'
  const json = await response.json() as { data?: { attributes?: { title?: Record<string, string> } } }
  const title = json.data?.attributes?.title ?? {}
  return title.es ?? title.en ?? Object.values(title)[0] ?? 'MangaDex'
}

function mapChapter(row: ChapterApiRow): MangaChapter {
  return {
    id: row.id,
    chapter: row.attributes?.chapter ?? null,
    title: row.attributes?.title ?? null,
    language: row.attributes?.translatedLanguage ?? 'N/D',
    pages: Number(row.attributes?.pages ?? 0),
    volume: row.attributes?.volume ?? null,
    publishedAt: row.attributes?.publishAt ?? null,
  }
}

export async function listMangaChapters(input: string, language = 'es', limit = 30) {
  const id = mangaId(input)
  const params = new URLSearchParams()
  params.append('translatedLanguage[]', language)
  params.set('order[chapter]', 'desc')
  params.set('limit', String(Math.max(1, Math.min(100, limit))))
  params.set('includeFutureUpdates', '0')
  const response = await fetch(`https://api.mangadex.org/manga/${id}/feed?${params}`, {
    headers: { accept: 'application/json', 'user-agent': 'GhostNexoraBot/1.1' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`MangaDex respondió HTTP ${response.status}.`)
  const json = await response.json() as { data?: ChapterApiRow[] }
  return { mangaId: id, chapters: (json.data ?? []).map(mapChapter) }
}

async function chooseChapter(input: string, selector: string, language: string) {
  const listed = await listMangaChapters(input, language, 100)
  if (!listed.chapters.length && language !== 'en') return chooseChapter(input, selector, 'en')
  if (!listed.chapters.length) throw new Error('No encontré capítulos públicos disponibles para ese manga.')

  const wanted = selector.trim().toLowerCase() || 'latest'
  const selected = wanted === 'latest' || wanted === 'ultimo' || wanted === 'último'
    ? listed.chapters.find((chapter) => chapter.pages > 0) ?? listed.chapters[0]
    : listed.chapters.find((chapter) => chapter.id.toLowerCase() === wanted || chapter.chapter?.toLowerCase() === wanted)
  if (!selected) throw new Error(`No encontré el capítulo ${selector} en el idioma ${language}.`)
  return { mangaId: listed.mangaId, chapter: selected }
}

async function downloadPage(url: string, target: string, budget: { total: number }) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'GhostNexoraBot/1.1', referer: 'https://mangadex.org/' },
    signal: AbortSignal.timeout(90_000),
  })
  if (!response.ok || !response.body) throw new Error(`Una página del capítulo respondió HTTP ${response.status}.`)
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > 0 && budget.total + declared > config.maxDownloadBytes) throw new Error(`El capítulo supera el límite de ${config.maxDownloadMb} MB.`)

  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      budget.total += chunk.length
      if (budget.total > config.maxDownloadBytes) callback(new Error(`El capítulo supera el límite de ${config.maxDownloadMb} MB.`))
      else callback(null, chunk)
    },
  })
  await pipeline(Readable.fromWeb(response.body as never), limiter, createWriteStream(target, { mode: 0o600 }))
}

export async function downloadMangaChapter(input: string, selector = 'latest', language = 'es') {
  const { mangaId: id, chapter } = await chooseChapter(input, selector, language)
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-manga-'))
  const pagesDir = path.join(dir, 'pages')
  await mkdir(pagesDir, { recursive: true, mode: 0o700 })

  try {
    const atHome = await fetch(`https://api.mangadex.org/at-home/server/${chapter.id}`, {
      headers: { accept: 'application/json', 'user-agent': 'GhostNexoraBot/1.1' },
      signal: AbortSignal.timeout(30_000),
    })
    if (!atHome.ok) throw new Error(`MangaDex At-Home respondió HTTP ${atHome.status}.`)
    const json = await atHome.json() as {
      baseUrl?: string
      chapter?: { hash?: string; data?: string[]; dataSaver?: string[] }
    }
    const baseUrl = json.baseUrl
    const hash = json.chapter?.hash
    const files = json.chapter?.data ?? []
    if (!baseUrl || !hash || !files.length) throw new Error('MangaDex no entregó las páginas del capítulo.')

    const budget = { total: 0 }
    const width = Math.max(3, String(files.length).length)
    for (let index = 0; index < files.length; index++) {
      const source = files[index]!
      const ext = path.extname(source).replace(/[^.a-zA-Z0-9]/g, '') || '.jpg'
      const target = path.join(pagesDir, `${String(index + 1).padStart(width, '0')}${ext}`)
      await downloadPage(`${baseUrl}/data/${hash}/${source}`, target, budget)
    }

    const title = await mangaTitle(id)
    const chapterLabel = chapter.chapter ? `cap-${chapter.chapter}` : `chapter-${chapter.id.slice(0, 8)}`
    const fileName = `${safeName(title)}-${safeName(chapterLabel)}-${chapter.language}.cbz`
    const filePath = path.join(dir, fileName)
    const pageFiles = (await readdir(pagesDir)).sort()
    if (!pageFiles.length) throw new Error('No se descargó ninguna página.')

    await execa('zip', ['-q', '-0', filePath, ...pageFiles], { cwd: pagesDir, timeout: 5 * 60_000 })
    await rm(pagesDir, { recursive: true, force: true })
    const size = (await stat(filePath)).size
    if (size > config.maxDownloadBytes) throw new Error(`El CBZ supera el límite de ${config.maxDownloadMb} MB.`)

    return {
      filePath,
      fileName,
      size,
      title,
      chapter,
      mangaId: id,
      cleanup: () => rm(dir, { recursive: true, force: true }),
    }
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
}
