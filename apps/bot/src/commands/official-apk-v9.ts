import * as cheerio from 'cheerio'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { BotCommand, CommandContext } from '../types.js'
import { sendCarousel, type InteractiveButton } from '../services/interactive.js'
import { config } from '../config.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

type Source = 'Uptodown' | 'LiteAPKS'
type Item = {
  token: string
  source: Source
  name: string
  url: string
  icon?: string
  version?: string
  sizeLabel?: string
  summary?: string
}

type PageSession = {
  source: Source
  query: string
  page: number
  items: Item[]
  expiresAt: number
}

const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 GhostNexoraBot/1.4'
const TTL = 30 * 60_000
const PAGE_SIZE = 8
const SEARCH_LIMIT = 32
const MAX_RESOLVE = 8
const selected = new Map<string, { item: Item; expiresAt: number }>()
const pages = new Map<string, PageSession>()

const hosts: Record<Source, RegExp> = {
  Uptodown: /(^|\.)uptodown\.com$/i,
  LiteAPKS: /(^|\.)liteapks\.com$/i,
}

function safePublicUrl(value?: string, allowAnyHost = false) {
  if (!value) return undefined
  try {
    const u = new URL(value)
    if (!['http:', 'https:'].includes(u.protocol)) return undefined
    const host = u.hostname.toLowerCase()
    if (host === 'localhost' || host === '0.0.0.0' || host === '::1' || /^127\./.test(host) || /^10\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return undefined
    return allowAnyHost || hosts.Uptodown.test(host) || hosts.LiteAPKS.test(host) ? u.toString() : undefined
  } catch {
    return undefined
  }
}

function absolute(base: string, value?: string) {
  if (!value) return undefined
  try { return safePublicUrl(new URL(value, base).toString(), true) } catch { return undefined }
}

function token(source: Source, url: string) {
  return `${source === 'Uptodown' ? 'ud' : 'la'}_${createHash('sha256').update(`${source}:${url}`).digest('hex').slice(0, 16)}`
}

function remember(item: Omit<Item, 'token'>) {
  const full = { token: token(item.source, item.url), ...item }
  selected.set(full.token, { item: full, expiresAt: Date.now() + TTL })
  return full
}

function getItem(value: string) {
  const row = selected.get(value.trim())
  if (!row || row.expiresAt <= Date.now()) {
    selected.delete(value.trim())
    throw new Error('Ese resultado expiró. Ejecuta nuevamente la búsqueda.')
  }
  return row.item
}

function sessionToken(source: Source, query: string) {
  return `${source.slice(0, 2).toLowerCase()}_${createHash('sha1').update(`${source}:${query}`).digest('hex').slice(0, 10)}`
}

async function getHtml(url: string) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,*/*', 'accept-language': 'es-MX,es;q=0.9,en;q=0.7' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return { html: await response.text(), finalUrl: response.url }
}

function metaText(text: string) {
  return text.replace(/\s+/g, ' ').trim().slice(0, 180)
}

function parseResults(source: Source, html: string, baseUrl: string) {
  const $ = cheerio.load(html)
  const out: Item[] = []
  const seen = new Set<string>()
  $('a[href]').each((_i, el) => {
    if (out.length >= SEARCH_LIMIT) return false
    const href = absolute(baseUrl, $(el).attr('href'))
    if (!href || seen.has(href)) return
    let u: URL
    try { u = new URL(href) } catch { return }
    if (!hosts[source].test(u.hostname)) return

    const p = u.pathname.toLowerCase()
    const appLike = source === 'Uptodown'
      ? /\/android\//.test(p) && !/\/search/.test(p)
      : /\.html?$/.test(p) || /\/(?:app|apps|game|games)\b/.test(p)
    if (!appLike) return

    const box = $(el).closest('article,li,.card,.item,.post,.app,div').first()
    const name = metaText($(el).attr('title') || box.find('h2,h3,.title,.card-title').first().text() || $(el).text())
      .replace(/\s+(APK|Mod APK|Download|Descargar)$/i, '')
    if (name.length < 2) return

    const summary = metaText(box.text())
    const version = /\b(?:version|versi[oó]n|v)\s*[:.]?\s*([0-9][\w.+-]*)/i.exec(summary)?.[1]
    const sizeLabel = /\b(\d+(?:\.\d+)?\s*(?:KB|MB|GB))\b/i.exec(summary)?.[1]
    const img = box.find('img').first()
    const icon = absolute(baseUrl, img.attr('data-src') || img.attr('data-lazy-src') || img.attr('src'))

    seen.add(href)
    out.push(remember({ source, name: name.slice(0, 70), url: href, icon, version, sizeLabel, summary }))
  })
  return out
}

function searchUrls(source: Source, query: string, page: number) {
  const q = encodeURIComponent(query)
  if (source === 'Uptodown') return [
    `https://en.uptodown.com/android/search?query=${q}&page=${page}`,
    `https://www.uptodown.com/android/search?query=${q}&page=${page}`,
    `https://en.uptodown.com/android/search/${q}`,
  ]
  return [
    `https://liteapks.com/?s=${q}&paged=${page}`,
    `https://liteapks.com/page/${page}/?s=${q}`,
    `https://liteapks.com/search/${q}/page/${page}/`,
  ]
}

async function searchSource(source: Source, query: string, page: number) {
  for (const endpoint of searchUrls(source, query, page)) {
    try {
      const result = await getHtml(endpoint)
      const items = parseResults(source, result.html, result.finalUrl)
      if (items.length) return items
    } catch { /* try next layout */ }
  }
  return []
}

async function resolveDownload(item: Item) {
  const queue = [item.url]
  const visited = new Set<string>()
  for (let depth = 0; depth < MAX_RESOLVE && queue.length; depth += 1) {
    const current = safePublicUrl(queue.shift(), true)
    if (!current || visited.has(current)) continue
    visited.add(current)
    try {
      const response = await fetch(current, {
        redirect: 'follow',
        headers: { 'user-agent': UA, accept: 'text/html,application/vnd.android.package-archive,application/octet-stream,*/*', referer: item.url },
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) continue
      const finalUrl = safePublicUrl(response.url, true) || current
      const type = response.headers.get('content-type') || ''
      const disposition = response.headers.get('content-disposition') || ''
      const looksPackage = /android\.package-archive|application\/zip/i.test(type) || /\.(?:apk|xapk|apks)(?:["'; ?]|$)/i.test(disposition) || /\.(?:apk|xapk|apks)(?:[?#]|$)/i.test(finalUrl)
      if (looksPackage) return finalUrl
      if (!/html|text\//i.test(type)) continue

      const html = await response.text()
      const $ = cheerio.load(html)
      const candidates: string[] = []
      $('a[href],button[data-href],[data-url],[data-download]').each((_i, el) => {
        const raw = $(el).attr('href') || $(el).attr('data-href') || $(el).attr('data-url') || $(el).attr('data-download')
        const href = absolute(finalUrl, raw)
        if (!href) return
        const label = metaText($(el).text() || $(el).attr('title') || $(el).attr('aria-label') || '')
        if (/\.(?:apk|xapk|apks)(?:[?#]|$)/i.test(href) || /download|descargar|apk/i.test(label) || /\/download|\/descarga|\/get(?:$|\/)/i.test(href)) candidates.push(href)
      })
      const scriptText = $('script').map((_i, el) => $(el).html() || '').get().join('\n')
      for (const match of scriptText.matchAll(/https?:\/\/[^\s"'<>]+\.(?:apk|xapk|apks)(?:\?[^\s"'<>]*)?/gi)) candidates.push(match[0])
      for (const candidate of [...new Set(candidates)].slice(0, 8)) {
        if (!visited.has(candidate)) queue.push(candidate)
      }
    } catch { /* next hop */ }
  }
  throw new Error(`${item.source} no pudo encontrar un archivo descargable.`)
}

function formatBytes(value: number) {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024).toFixed(1)} KB`
}

function packageKind(url: string) {
  return /\.xapk(?:$|[?#])/i.test(url) ? 'XAPK' : /\.apks(?:$|[?#])/i.test(url) ? 'APKS' : 'APK'
}

async function editMessage(ctx: CommandContext, statusMessage: unknown, text: string) {
  const key = (statusMessage as { key?: unknown } | null)?.key
  if (!key) return
  try { await ctx.socket.sendMessage(ctx.chatId, { text }, { edit: key as never }) } catch { /* best effort */ }
}

async function downloadAndSend(ctx: CommandContext, item: Item) {
  const status = await ctx.reply(`⬇️ *DESCARGANDO*\n${item.name}\nFuente: ${item.source}\nPreparando enlace…`)
  let dir: string | undefined
  try {
    const direct = await resolveDownload(item)
    dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-apk-'))
    const ext = packageKind(direct).toLowerCase()
    const filePath = path.join(dir, `${item.name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 70) || 'app'}.${ext}`)
    const response = await fetch(direct, {
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'application/octet-stream,application/vnd.android.package-archive,*/*', referer: item.url },
      signal: AbortSignal.timeout(20 * 60_000),
    })
    if (!response.ok || !response.body) throw new Error(`el servidor respondió HTTP ${response.status}`)

    const declared = Number(response.headers.get('content-length') || 0)
    if (declared > config.maxDownloadBytes) throw new Error(`el archivo supera ${config.maxDownloadMb} MB`)
    let received = 0
    let lastReport = 0
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length
        const now = Date.now()
        if (now - lastReport >= 1500) {
          lastReport = now
          const progress = declared > 0 ? `\nProgreso: ${Math.min(100, Math.round(received / declared * 100))}% · ${formatBytes(received)} / ${formatBytes(declared)}` : `\nDescargado: ${formatBytes(received)}`
          void editMessage(ctx, status, `⬇️ *DESCARGANDO*\n${item.name}\nFuente: ${item.source}${progress}`)
        }
        if (received > config.maxDownloadBytes) callback(new Error(`el archivo supera ${config.maxDownloadMb} MB`))
        else callback(null, chunk)
      },
    })
    await pipeline(response.body as any, limiter, createWriteStream(filePath, { mode: 0o600 }))
    const info = await stat(filePath)
    if (info.size < 1024) throw new Error('se recibió un archivo vacío o incompleto')
    const header = (await readFile(filePath)).subarray(0, 4)
    if (header[0] !== 0x50 || header[1] !== 0x4b) throw new Error('el servidor no devolvió una aplicación válida')

    const kind = packageKind(response.url || direct)
    await editMessage(ctx, status, `✅ *DESCARGA COMPLETADA*\n${item.name}\n${formatBytes(info.size)} · ${kind}\n📤 *Enviando a WhatsApp…*`)
    await ctx.socket.sendMessage(ctx.chatId, {
      document: { url: filePath },
      mimetype: kind === 'APK' ? 'application/vnd.android.package-archive' : 'application/octet-stream',
      fileName: path.basename(filePath),
      caption: [
        `📦 *${item.name}*`,
        item.version ? `Versión: ${item.version}` : '',
        `Peso: ${formatBytes(info.size)}`,
        `Fuente: ${item.source}`,
        `Tipo: ${kind}`,
      ].filter(Boolean).join('\n'),
    }, { quoted: ctx.message })
    recordSubbotDownload(ctx.instanceId, info.size)
    await editMessage(ctx, status, `✅ *ENVIADO A WHATSAPP*\n${item.name}\n${formatBytes(info.size)} · ${kind}\nFuente: ${item.source}`)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    await editMessage(ctx, status, `❌ *NO SE PUDO DESCARGAR*\n${item.name}\nLa descarga no pudo completarse. Inténtalo nuevamente.`)
    void detail
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function showPage(ctx: CommandContext, source: Source, query: string, page: number) {
  const items = await searchSource(source, query, page)
  if (!items.length) throw new Error(`No encontré más resultados de ${source}.`)
  const allForPage = items.slice(0, PAGE_SIZE)
  const key = sessionToken(source, query)
  pages.set(`${key}:${page}`, { source, query, page, items, expiresAt: Date.now() + TTL })

  const cards = allForPage.map((item, index) => {
    const buttons: InteractiveButton[] = [
      { type: 'reply', text: '⬇️ Descargar', id: `${ctx.prefix}officialapkdl ${item.token}` },
      { type: 'reply', text: 'ℹ️ Detalles', id: `${ctx.prefix}officialapkinfo ${item.token}` },
    ]
    if (index === allForPage.length - 1 && (page < 50)) buttons.push({ type: 'reply', text: 'Siguiente ▶️', id: `${ctx.prefix}officialapkpage ${source === 'Uptodown' ? 'ud' : 'la'} ${page + 1} ${key}` })
    return {
      title: `#${index + 1} · ${item.name}`.slice(0, 80),
      body: [item.version ? `v${item.version}` : '', item.sizeLabel || 'Tamaño al descargar'].filter(Boolean).join(' · ').slice(0, 100),
      imageUrl: item.icon,
      footer: item.source,
      buttons,
    }
  })

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: `📦 ${source} · ${page}`,
    body: `Resultados para: ${query}`,
    footer: 'Ghost Nexora Bot · 8 resultados por página',
    cards,
  })
}

export const officialApkV9Commands: BotCommand[] = [
  {
    name: 'uptodown',
    aliases: ['upto', 'udown'],
    category: 'downloads',
    description: 'Busca y descarga APKs desde Uptodown en carrusel paginado.',
    usage: 'uptodown <aplicación>',
    async handler(ctx) {
      const query = ctx.argText.trim()
      if (query.length < 2) throw new Error(`Uso: ${ctx.prefix}uptodown <aplicación>`)
      await showPage(ctx, 'Uptodown', query, 1)
    },
  },
  {
    name: 'liteapks',
    aliases: ['liteapk', 'lapks'],
    category: 'downloads',
    description: 'Busca y descarga APKs desde LiteAPKS en carrusel paginado.',
    usage: 'liteapks <aplicación>',
    async handler(ctx) {
      const query = ctx.argText.trim()
      if (query.length < 2) throw new Error(`Uso: ${ctx.prefix}liteapks <aplicación>`)
      await showPage(ctx, 'LiteAPKS', query, 1)
    },
  },
  {
    name: 'officialapkpage',
    aliases: ['apkpage', 'officialpage'],
    category: 'downloads',
    description: 'Abre otra página de resultados del buscador oficial de APK.',
    usage: 'officialapkpage <ud|la> <página> <clave>',
    async handler(ctx) {
      const source = ctx.args[0]?.toLowerCase() === 'la' ? 'LiteAPKS' : 'Uptodown'
      const page = Math.max(1, Math.min(50, Number(ctx.args[1]) || 1))
      const key = ctx.args[2]
      const session = key ? pages.get(`${key}:${page}`) : undefined
      if (session && session.expiresAt > Date.now()) {
        await showPage(ctx, session.source, session.query, page)
        return
      }
      throw new Error(`La página expiró. Ejecuta nuevamente ${ctx.prefix}${source.toLowerCase()} <aplicación>.`)
    },
  },
  {
    name: 'officialapkinfo',
    aliases: ['apkinfo'],
    category: 'downloads',
    description: 'Muestra los detalles del resultado seleccionado.',
    usage: 'officialapkinfo <token>',
    async handler(ctx) {
      const item = getItem(ctx.args[0] || '')
      await ctx.reply([
        `📦 *${item.name}*`,
        `Fuente: *${item.source}*`,
        item.version ? `Versión: *${item.version}*` : '',
        item.sizeLabel ? `Peso indicado: *${item.sizeLabel}*` : 'Peso: se calculará durante la descarga',
        `Descarga: ${ctx.prefix}officialapkdl ${item.token}`,
      ].filter(Boolean).join('\n'))
    },
  },
  {
    name: 'officialapkdl',
    aliases: ['apkdl', 'webapkdl'],
    category: 'downloads',
    description: 'Descarga el resultado seleccionado y actualiza un único mensaje de progreso.',
    usage: 'officialapkdl <token>',
    async handler(ctx) {
      const item = getItem(ctx.args[0] || '')
      await downloadAndSend(ctx, item)
    },
  },
]
