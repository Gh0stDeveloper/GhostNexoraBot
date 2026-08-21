import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import os from 'node:os'
import path from 'node:path'
import * as cheerio from 'cheerio'
import { config } from '../config.js'
import { downloadAptoideApk, searchAptoideApps } from './aptoide.js'

const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36 GhostNexoraBot/1.1'
const CACHE_TTL_MS = 30 * 60_000

export type ApkSource = 'Aptoide' | 'APK.Tools' | 'AndroForever'

export type UnifiedApkItem = {
  token: string
  source: ApkSource
  sourceId?: string
  name: string
  packageName?: string
  version?: string
  size?: number
  sizeLabel?: string
  icon?: string
  graphic?: string
  developer?: string
  rating?: number
  downloads?: number
  trusted?: boolean
  malwareRank?: string
  summary?: string
  pageUrl?: string
  downloadPageUrl?: string
}

export type UnifiedApkDownload = UnifiedApkItem & {
  filePath: string
  fileName: string
  size: number
  cleanup: () => Promise<void>
}

type Cached = { item: UnifiedApkItem; expiresAt: number }
const cache = new Map<string, Cached>()

function compact(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function absolute(base: string, href?: string) {
  if (!href) return undefined
  try {
    const url = new URL(href, base)
    if (!['http:', 'https:'].includes(url.protocol)) return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

function publicHttpUrl(value?: string) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return undefined
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    if (
      host === 'localhost'
      || host === '0.0.0.0'
      || host === '::1'
      || /^127\./.test(host)
      || /^10\./.test(host)
      || /^192\.168\./.test(host)
      || /^169\.254\./.test(host)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

function tokenFor(source: ApkSource, identity: string) {
  return createHash('sha256').update(`${source}:${identity}`).digest('hex').slice(0, 18)
}

function remember(input: Omit<UnifiedApkItem, 'token'>) {
  const identity = input.sourceId || input.pageUrl || input.downloadPageUrl || input.name
  const token = tokenFor(input.source, identity)
  const item: UnifiedApkItem = { token, ...input }
  cache.set(token, { item, expiresAt: Date.now() + CACHE_TTL_MS })
  return item
}

function cached(token: string) {
  const value = cache.get(token)
  if (!value) return undefined
  if (value.expiresAt <= Date.now()) {
    cache.delete(token)
    return undefined
  }
  return value.item
}

async function fetchHtml(url: string, timeoutMs = 15_000) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': UA,
      accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      'accept-language': 'es-MX,es;q=0.9,en;q=0.7',
    },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`${new URL(url).hostname} respondió HTTP ${response.status}.`)
  const type = response.headers.get('content-type') ?? ''
  if (!/html|text\//i.test(type)) throw new Error(`${new URL(url).hostname} no devolvió HTML.`)
  return { html: await response.text(), finalUrl: response.url }
}

function imageFrom($: cheerio.CheerioAPI, element: cheerio.Element, base: string) {
  const root = $(element).closest('article,li,div').first()
  const raw = root.find('img').first().attr('data-src')
    || root.find('img').first().attr('data-lazy-src')
    || root.find('img').first().attr('src')
  return absolute(base, raw)
}

async function searchApkTools(query: string, limit: number) {
  const endpoints = [
    `https://apk.tools/?s=${encodeURIComponent(query)}`,
    `https://apk.tools/search?q=${encodeURIComponent(query)}`,
  ]
  const results: UnifiedApkItem[] = []
  const used = new Set<string>()

  for (const endpoint of endpoints) {
    try {
      const { html, finalUrl } = await fetchHtml(endpoint, 12_000)
      const $ = cheerio.load(html)
      $('a[href]').each((_index, element) => {
        if (results.length >= limit) return false
        const href = absolute(finalUrl, $(element).attr('href'))
        if (!href || !/apk\.tools\/details-[^?#]+-apk\/?/i.test(href) || used.has(href)) return
        const title = compact($(element).attr('title') || $(element).text())
        if (!title || title.length < 2) return
        used.add(href)
        const container = $(element).closest('article,li,.item,.app,.post,div').first()
        const text = compact(container.text())
        const version = /\bv(?:ersion)?\s*([\w.+-]+)/i.exec(text)?.[1]
        const rating = Number(/(?:★|rating)\s*([0-5](?:\.\d+)?)/i.exec(text)?.[1])
        results.push(remember({
          source: 'APK.Tools',
          name: title.replace(/\s*APK\s*$/i, ''),
          version,
          rating: Number.isFinite(rating) ? rating : undefined,
          icon: imageFrom($, element, finalUrl),
          pageUrl: href,
          summary: text.slice(0, 240),
        }))
      })
      if (results.length) break
    } catch {
      // La fuente es best-effort: Aptoide/AndroForever pueden seguir respondiendo.
    }
  }
  return results.slice(0, limit)
}

function telegramPhoto(style?: string) {
  if (!style) return undefined
  const match = /background-image\s*:\s*url\(['"]?([^'")]+)['"]?\)/i.exec(style)
  return match?.[1]?.replace(/&amp;/g, '&')
}

async function searchAndroForeverTelegram(query: string, limit: number) {
  const endpoint = `https://t.me/s/androforever_oficial?q=${encodeURIComponent(query)}`
  const { html, finalUrl } = await fetchHtml(endpoint, 15_000)
  const $ = cheerio.load(html)
  const results: UnifiedApkItem[] = []
  const used = new Set<string>()

  $('.tgme_widget_message_wrap').each((_index, element) => {
    if (results.length >= limit) return false
    const root = $(element)
    const body = compact(root.find('.tgme_widget_message_text').text() || root.find('.tgme_widget_message_document_title').text())
    if (!body || !body.toLowerCase().includes(query.toLowerCase().split(/\s+/)[0] ?? query.toLowerCase())) return
    const messageUrl = absolute(finalUrl, root.find('.tgme_widget_message_date').attr('href'))
    if (!messageUrl || used.has(messageUrl)) return
    used.add(messageUrl)
    const firstLine = compact(body.split(/\n|━━━━━━━━/)[0] || body).slice(0, 120)
    const version = /\bv(?:er(?:sion|sión)?)?\s*([\d][\w.+-]*)/i.exec(body)?.[1]
    const sizeLabel = root.find('.tgme_widget_message_document_extra').text().match(/\b\d+(?:\.\d+)?\s*(?:KB|MB|GB)\b/i)?.[0]
    let downloadPageUrl: string | undefined
    root.find('a[href]').each((_i, anchor) => {
      const href = absolute(finalUrl, $(anchor).attr('href'))
      if (!href || downloadPageUrl) return
      try {
        const host = new URL(href).hostname.toLowerCase()
        if (!/^(?:t\.me|telegram\.me|play\.google\.com)$/.test(host) && !host.endsWith('.telegram.org')) downloadPageUrl = href
      } catch { /* noop */ }
    })
    const photo = telegramPhoto(root.find('.tgme_widget_message_photo_wrap').attr('style'))
    results.push(remember({
      source: 'AndroForever',
      name: firstLine || 'AndroForever APK',
      version,
      sizeLabel,
      icon: publicHttpUrl(photo),
      pageUrl: messageUrl,
      downloadPageUrl,
      summary: body.slice(0, 300),
    }))
  })
  return results
}

async function searchAndroForeverWeb(query: string, limit: number) {
  const endpoints = [
    `https://androforever.com/?s=${encodeURIComponent(query)}`,
    `https://androforever.com/search/${encodeURIComponent(query)}/`,
  ]
  const results: UnifiedApkItem[] = []
  const used = new Set<string>()
  for (const endpoint of endpoints) {
    try {
      const { html, finalUrl } = await fetchHtml(endpoint, 12_000)
      const $ = cheerio.load(html)
      $('article a[href], h2 a[href], h3 a[href]').each((_index, element) => {
        if (results.length >= limit) return false
        const href = absolute(finalUrl, $(element).attr('href'))
        if (!href || !/androforever\.com/i.test(href) || used.has(href)) return
        const title = compact($(element).attr('title') || $(element).text())
        if (!title || title.length < 2 || /^(home|inicio|categor|contact)/i.test(title)) return
        used.add(href)
        const container = $(element).closest('article,.post,.entry,li,div').first()
        const text = compact(container.text())
        results.push(remember({
          source: 'AndroForever',
          name: title,
          version: /\bv(?:er(?:sion|sión)?)?\s*([\d][\w.+-]*)/i.exec(text)?.[1],
          icon: imageFrom($, element, finalUrl),
          pageUrl: href,
          summary: text.slice(0, 280),
        }))
      })
      if (results.length) break
    } catch {
      // El sitio puede usar protección anti-bot; el canal público es fallback.
    }
  }
  return results
}

async function searchAndroForever(query: string, limit: number) {
  const [web, telegram] = await Promise.allSettled([
    searchAndroForeverWeb(query, limit),
    searchAndroForeverTelegram(query, limit),
  ])
  const values = [
    ...(web.status === 'fulfilled' ? web.value : []),
    ...(telegram.status === 'fulfilled' ? telegram.value : []),
  ]
  const used = new Set<string>()
  return values.filter((item) => {
    const key = `${item.source}:${item.pageUrl || item.name}`
    if (used.has(key)) return false
    used.add(key)
    return true
  }).slice(0, limit)
}

export async function searchAndroidApks(query: string, limit = 12) {
  const text = query.trim()
  if (text.length < 2) throw new Error('Escribe al menos 2 caracteres para buscar una APK.')
  const perSource = Math.max(3, Math.min(6, Math.ceil(limit / 2)))
  const [aptoide, apkTools, androForever] = await Promise.allSettled([
    searchAptoideApps(text, perSource),
    searchApkTools(text, perSource),
    searchAndroForever(text, perSource),
  ])

  const items: UnifiedApkItem[] = []
  if (aptoide.status === 'fulfilled') {
    for (const app of aptoide.value) {
      items.push(remember({
        source: 'Aptoide',
        sourceId: String(app.id),
        name: app.name,
        packageName: app.packageName,
        version: app.version,
        size: app.size,
        icon: app.icon,
        graphic: app.graphic,
        developer: app.developer,
        rating: app.rating,
        downloads: app.downloads,
        trusted: app.trusted,
        malwareRank: app.malwareRank,
        summary: app.summary,
      }))
    }
  }
  if (apkTools.status === 'fulfilled') items.push(...apkTools.value)
  if (androForever.status === 'fulfilled') items.push(...androForever.value)

  const order: Record<ApkSource, number> = { Aptoide: 0, 'APK.Tools': 1, AndroForever: 2 }
  return items
    .sort((a, b) => order[a.source] - order[b.source])
    .slice(0, Math.max(1, Math.min(12, limit)))
}

function directApkLink(base: string, href?: string) {
  const url = publicHttpUrl(absolute(base, href))
  if (!url) return undefined
  const parsed = new URL(url)
  if (/\.apk(?:$|[?#])/i.test(parsed.pathname + parsed.search)) return url
  const file = parsed.searchParams.get('file') || parsed.searchParams.get('url')
  if (file && /\.apk(?:$|[?#])/i.test(file)) return url
  return undefined
}

async function resolveExternalApk(item: UnifiedApkItem) {
  const queue = [item.downloadPageUrl, item.pageUrl].filter((value): value is string => Boolean(value))
  const visited = new Set<string>()
  for (let depth = 0; depth < 3 && queue.length; depth += 1) {
    const url = publicHttpUrl(queue.shift())
    if (!url || visited.has(url)) continue
    visited.add(url)
    const directSelf = directApkLink(url, url)
    if (directSelf) return directSelf
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,*/*' },
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) continue
      const finalUrl = publicHttpUrl(response.url) || url
      const disposition = response.headers.get('content-disposition') ?? ''
      const type = response.headers.get('content-type') ?? ''
      if (/\.apk(?:["'; ]|$)/i.test(disposition) || /android\.package-archive/i.test(type)) return finalUrl
      if (!/html|text\//i.test(type)) continue
      const html = await response.text()
      const $ = cheerio.load(html)
      let direct: string | undefined
      const pageCandidates: string[] = []
      $('a[href]').each((_index, element) => {
        if (direct) return false
        const href = absolute(finalUrl, $(element).attr('href'))
        if (!href) return
        const label = compact($(element).text() || $(element).attr('title') || '')
        const apk = directApkLink(finalUrl, href)
        if (apk) { direct = apk; return false }
        if (/descargar|download|apk/i.test(label) || /\/download|\/descarga/i.test(href)) pageCandidates.push(href)
      })
      if (direct) return direct
      for (const candidate of pageCandidates.slice(0, 4)) if (!visited.has(candidate)) queue.push(candidate)
    } catch {
      // Prueba el siguiente enlace de la cadena.
    }
  }
  throw new Error(`${item.source} no expuso un enlace APK directo utilizable. Abre la fuente desde el carrusel para descargar manualmente.`)
}

function safeFileBase(value: string) {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9._ -]+/g, '').trim().replace(/\s+/g, '-').slice(0, 90) || 'android-app'
}

async function downloadExternal(item: UnifiedApkItem): Promise<UnifiedApkDownload> {
  const direct = await resolveExternalApk(item)
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-apk-ext-'))
  const fileName = `${safeFileBase(item.name)}-${safeFileBase(item.version || 'latest')}.apk`
  const filePath = path.join(dir, fileName)
  try {
    const response = await fetch(direct, {
      redirect: 'follow',
      headers: {
        'user-agent': UA,
        accept: 'application/vnd.android.package-archive,application/octet-stream,*/*',
      },
      signal: AbortSignal.timeout(15 * 60_000),
    })
    if (!response.ok || !response.body) throw new Error(`${item.source} respondió HTTP ${response.status} al descargar.`)
    const declared = Number(response.headers.get('content-length') ?? 0)
    if (declared > config.maxDownloadBytes) throw new Error(`La APK supera el límite configurado de ${config.maxDownloadMb} MB.`)
    let received = 0
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length
        if (received > config.maxDownloadBytes) callback(new Error(`La APK supera el límite configurado de ${config.maxDownloadMb} MB.`))
        else callback(null, chunk)
      },
    })
    await pipeline(response.body, limiter, createWriteStream(filePath))
    const file = await stat(filePath)
    if (file.size < 1024) throw new Error(`${item.source} devolvió un archivo demasiado pequeño.`)
    const header = await readFile(filePath).then((buffer) => buffer.subarray(0, 4))
    if (!(header[0] === 0x50 && header[1] === 0x4b && [0x03, 0x05, 0x07].includes(header[2] ?? -1))) {
      throw new Error(`${item.source} no devolvió un APK/ZIP válido.`)
    }
    return { ...item, filePath, fileName, size: file.size, cleanup: () => rm(dir, { recursive: true, force: true }) }
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
}

export function getAndroidApk(token: string) {
  const item = cached(token.trim())
  if (!item) throw new Error('Ese resultado APK expiró. Vuelve a ejecutar .apk <búsqueda>.')
  return item
}

export async function downloadAndroidApk(token: string): Promise<UnifiedApkDownload> {
  const item = getAndroidApk(token)
  if (item.source === 'Aptoide' && item.sourceId) {
    const result = await downloadAptoideApk(item.sourceId)
    return {
      ...item,
      name: result.name,
      packageName: result.packageName,
      version: result.version,
      trusted: result.trusted,
      malwareRank: result.malwareRank,
      filePath: result.filePath,
      fileName: result.fileName,
      size: result.size,
      cleanup: result.cleanup,
    }
  }
  return downloadExternal(item)
}
