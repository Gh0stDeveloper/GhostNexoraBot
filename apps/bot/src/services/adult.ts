import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { load } from 'cheerio'
import { execa } from 'execa'
import { config } from '../config.js'

export type AdultProvider = 'xvideos' | 'xnxx' | 'pornhub'
export type AdultSearchResult = { title: string; url: string; thumbnail?: string }

const providerHosts: Record<AdultProvider, string[]> = {
  xvideos: ['xvideos.com', 'www.xvideos.com'],
  xnxx: ['xnxx.com', 'www.xnxx.com'],
  pornhub: ['pornhub.com', 'www.pornhub.com'],
}

const prohibited = /\b(child|children|underage|minor|preteen|pre-teen|niñ[oa]s?|menor(?:es)?)\b/i

function safeSearchText(input: string) {
  const value = input.trim()
  if (!value) throw new Error('Indica qué deseas buscar.')
  if (prohibited.test(value)) throw new Error('Esa búsqueda está bloqueada por seguridad.')
  return value
}

function validateAdultUrl(input: string) {
  const url = new URL(input)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL inválida.')
  const match = (Object.entries(providerHosts) as Array<[AdultProvider, string[]]>).find(([, hosts]) => hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)))
  if (!match) throw new Error('Proveedor 18+ no soportado.')
  if (prohibited.test(url.pathname + url.search)) throw new Error('URL bloqueada por seguridad.')
  return { url: url.toString(), provider: match[0] }
}

function absolute(base: string, href?: string) {
  if (!href) return null
  try { return new URL(href, base).toString() } catch { return null }
}

export async function searchAdult(provider: AdultProvider, input: string, limit = 12): Promise<AdultSearchResult[]> {
  const query = safeSearchText(input)
  const count = Math.max(1, Math.min(15, limit))
  const searchUrl = provider === 'xvideos'
    ? `https://www.xvideos.com/?k=${encodeURIComponent(query)}`
    : provider === 'xnxx'
      ? `https://www.xnxx.com/search/${encodeURIComponent(query)}`
      : `https://www.pornhub.com/video/search?search=${encodeURIComponent(query)}`

  const response = await fetch(searchUrl, {
    headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`${provider} respondió HTTP ${response.status}.`)
  const html = await response.text()
  const $ = load(html)
  const found = new Map<string, AdultSearchResult>()

  const selectors = provider === 'pornhub'
    ? '.pcVideoListItem, li.videoblock, .videoBox'
    : '.thumb-block, .mozaique .thumb-block'

  $(selectors).each((_, element) => {
    if (found.size >= count) return
    const node = $(element)
    const anchor = node.find('a[href]').filter((__, a) => /video|viewkey/i.test($(a).attr('href') ?? '')).first()
    const href = absolute(searchUrl, anchor.attr('href'))
    const title = (anchor.attr('title') ?? node.find('.title a, p.title a, .videoTitle').first().text() ?? '').trim()
    if (!href || !title || prohibited.test(title)) return
    const image = node.find('img').first()
    const thumbnail = absolute(searchUrl, image.attr('data-src') ?? image.attr('data-thumb_url') ?? image.attr('src')) ?? undefined
    found.set(href, { title: title.slice(0, 180), url: href, thumbnail })
  })

  return [...found.values()].slice(0, count)
}

export async function downloadAdult(input: string) {
  const { url } = validateAdultUrl(input)
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-adult-'))
  const output = path.join(dir, '%(title).90s-%(id)s.%(ext)s')
  try {
    await execa('yt-dlp', [
      '--no-playlist', '--no-warnings', '--restrict-filenames', '--no-progress',
      '-f', 'bv*+ba/b', '--merge-output-format', 'mp4', '--remux-video', 'mp4',
      '-o', output, url,
    ], { timeout: 20 * 60_000 })
    const entries = await readdir(dir)
    const fileName = entries.find((entry) => !entry.endsWith('.part') && !entry.endsWith('.ytdl'))
    if (!fileName) throw new Error('No se produjo un archivo descargable.')
    const filePath = path.join(dir, fileName)
    const size = (await stat(filePath)).size
    if (size > config.maxDownloadBytes) throw new Error(`El archivo supera el límite de ${config.maxDownloadMb} MB.`)
    return { filePath, fileName, size, cleanup: () => rm(dir, { recursive: true, force: true }) }
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
}
