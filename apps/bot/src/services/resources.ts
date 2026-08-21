import { createWriteStream } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { load } from 'cheerio'
import { config } from '../config.js'

export type TempDownload = { filePath: string; fileName: string; size: number; contentType: string; cleanup: () => Promise<void> }

async function downloadToTemp(url: string, fallbackName: string): Promise<TempDownload> {
  const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'GhostNexoraBot/1.0 Mozilla/5.0' }, signal: AbortSignal.timeout(60_000) })
  if (!response.ok || !response.body) throw new Error(`Descarga respondió HTTP ${response.status}.`)
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > config.maxDownloadBytes) throw new Error(`El archivo supera ${config.maxDownloadMb} MB.`)
  const disposition = response.headers.get('content-disposition')
  const match = disposition?.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i)
  const fromUrl = decodeURIComponent(new URL(response.url).pathname.split('/').pop() || fallbackName)
  const fileName = (match?.[1] ? decodeURIComponent(match[1]) : fromUrl).replace(/[\\/:*?"<>|]/g, '_') || fallbackName
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-resource-'))
  const filePath = path.join(dir, fileName)
  let total = 0
  const source = Readable.fromWeb(response.body as never)
  source.on('data', (chunk: Buffer) => {
    total += chunk.length
    if (total > config.maxDownloadBytes) source.destroy(new Error(`El archivo supera ${config.maxDownloadMb} MB.`))
  })
  try {
    await pipeline(source, createWriteStream(filePath, { mode: 0o600 }))
    const size = (await stat(filePath)).size
    return { filePath, fileName, size, contentType: response.headers.get('content-type') ?? 'application/octet-stream', cleanup: () => rm(dir, { recursive: true, force: true }) }
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
}

export async function downloadGitHubRepo(input: string) {
  const url = new URL(input)
  if (url.hostname !== 'github.com') throw new Error('Solo se admiten repositorios públicos de GitHub.')
  const [owner, repoRaw] = url.pathname.split('/').filter(Boolean)
  const repo = repoRaw?.replace(/\.git$/, '')
  if (!owner || !repo) throw new Error('URL de repositorio inválida.')
  const meta = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'GhostNexoraBot/1.0' } })
  if (!meta.ok) throw new Error('No pude consultar ese repositorio público.')
  const data = await meta.json() as { default_branch?: string; private?: boolean }
  if (data.private) throw new Error('Solo se admiten repositorios públicos.')
  const branch = data.default_branch ?? 'main'
  return downloadToTemp(`https://github.com/${owner}/${repo}/archive/refs/heads/${encodeURIComponent(branch)}.zip`, `${repo}-${branch}.zip`)
}

function googleDriveId(input: string) {
  const url = new URL(input)
  if (!['drive.google.com', 'docs.google.com'].includes(url.hostname)) throw new Error('URL de Google Drive inválida.')
  return url.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? url.searchParams.get('id')
}

export async function downloadGoogleDrive(input: string) {
  const id = googleDriveId(input)
  if (!id) throw new Error('No pude identificar el ID del archivo de Google Drive.')
  return downloadToTemp(`https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`, `gdrive-${id}`)
}

export async function searchFdroid(input: string, limit = 8) {
  const query = input.trim()
  if (!query) throw new Error('Indica una aplicación para buscar.')
  const response = await fetch(`https://search.f-droid.org/?q=${encodeURIComponent(query)}&lang=es`, { headers: { 'user-agent': 'Mozilla/5.0 GhostNexoraBot/1.0' } })
  if (!response.ok) throw new Error('F-Droid no respondió correctamente.')
  const $ = load(await response.text())
  const results = new Map<string, { title: string; url: string; description: string }>()
  $('a[href*="/packages/"]').each((_, element) => {
    if (results.size >= limit) return
    const href = $(element).attr('href')
    if (!href) return
    const url = new URL(href, 'https://f-droid.org').toString()
    const title = ($(element).find('h4, h3').first().text() || $(element).text()).replace(/\s+/g, ' ').trim()
    if (!title || title.length > 160) return
    const description = $(element).find('p').first().text().replace(/\s+/g, ' ').trim().slice(0, 220)
    results.set(url, { title, url, description })
  })
  return [...results.values()]
}

export async function downloadFdroidApk(input: string) {
  const url = new URL(input)
  if (url.hostname !== 'f-droid.org' || !url.pathname.includes('/packages/')) throw new Error('Solo se admiten páginas de paquete oficiales de F-Droid.')
  const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 GhostNexoraBot/1.0' } })
  if (!response.ok) throw new Error('No pude abrir la página de F-Droid.')
  const $ = load(await response.text())
  const href = $('a[href$=".apk"]').first().attr('href')
  if (!href) throw new Error('No encontré una APK descargable en esa página.')
  return downloadToTemp(new URL(href, url).toString(), 'application.apk')
}

export async function searchAnime(input: string) {
  const response = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(input.trim())}&limit=6&sfw=true`)
  if (!response.ok) throw new Error('Jikan no respondió correctamente.')
  const json = await response.json() as { data?: Array<{ title?: string; title_english?: string; episodes?: number; score?: number; synopsis?: string; url?: string; images?: { jpg?: { large_image_url?: string } } }> }
  return json.data ?? []
}

export async function searchManga(input: string) {
  const params = new URLSearchParams({ title: input.trim(), limit: '8', 'order[relevance]': 'desc', 'includes[]': 'cover_art' })
  const response = await fetch(`https://api.mangadex.org/manga?${params}`)
  if (!response.ok) throw new Error('MangaDex no respondió correctamente.')
  const json = await response.json() as { data?: Array<{ id: string; attributes?: { title?: Record<string, string>; description?: Record<string, string>; status?: string } }> }
  return json.data ?? []
}
