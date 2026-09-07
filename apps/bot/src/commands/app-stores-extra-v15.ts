import * as cheerio from 'cheerio'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { BotCommand, CommandContext } from '../types.js'
import { config } from '../config.js'
import { sendCarousel, sendInteractiveCard } from '../services/interactive.js'
import { downloadFdroidApk, searchFdroid } from '../services/resources.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36 GhostNexoraBot/1.5'
const TTL = 30 * 60_000
const MAX_RESULTS = 8

type ExtraStore = 'fdroid' | 'apktools' | 'androforever'
type ExtraItem = {
  token: string
  store: ExtraStore
  name: string
  pageUrl: string
  downloadPageUrl?: string
  icon?: string
  version?: string
  sizeLabel?: string
  summary?: string
}

const cache = new Map<string, { item: ExtraItem; expiresAt: number }>()

function normalize(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
}

function queryTerms(value: string) {
  return normalize(value).split(' ').filter((term) => term.length >= 2)
}

function relevant(query: string, name: string, extra = '') {
  const haystack = normalize(`${name} ${extra}`)
  return queryTerms(query).every((term) => haystack.includes(term))
}

function score(query: string, name: string) {
  const q = normalize(query)
  const n = normalize(name)
  let value = 0
  if (n === q) value += 200
  if (n.startsWith(q)) value += 100
  if (n.includes(q)) value += 70
  for (const term of queryTerms(query)) {
    if (n.startsWith(term)) value += 20
    else if (n.includes(term)) value += 12
  }
  return value
}

function label(store: ExtraStore) {
  if (store === 'fdroid') return 'F-DROID'
  if (store === 'apktools') return 'APK.TOOLS'
  return 'ANDROFOREVER'
}

function publicUrl(value?: string) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return undefined
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    if (host === 'localhost' || host === '0.0.0.0' || host === '::1' || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

function absolute(base: string, value?: string) {
  if (!value) return undefined
  try { return publicUrl(new URL(value, base).toString()) } catch { return undefined }
}

function remember(store: ExtraStore, input: Omit<ExtraItem, 'token' | 'store'>) {
  const token = `${store.slice(0, 3)}_${createHash('sha256').update(`${store}:${input.pageUrl}`).digest('hex').slice(0, 15)}`
  const item: ExtraItem = { token, store, ...input }
  cache.set(token, { item, expiresAt: Date.now() + TTL })
  return item
}

function getItem(token: string, expected?: ExtraStore) {
  const row = cache.get(token.trim())
  if (!row || row.expiresAt <= Date.now()) {
    cache.delete(token.trim())
    throw new Error('Ese resultado expiró. Repite la búsqueda en la misma tienda.')
  }
  if (expected && row.item.store !== expected) throw new Error('Ese resultado pertenece a otra tienda.')
  return row.item
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,*/*', 'accept-language': 'es-MX,es;q=0.9,en;q=0.7' },
    signal: AbortSignal.timeout(18_000),
  })
  if (!response.ok) throw new Error(`${new URL(url).hostname} respondió HTTP ${response.status}.`)
  return { html: await response.text(), finalUrl: response.url }
}

async function searchFdroidStore(query: string) {
  const raw = await searchFdroid(query, 12)
  return raw
    .filter((item) => relevant(query, item.title, `${item.description} ${item.url}`))
    .sort((a, b) => score(query, b.title) - score(query, a.title))
    .slice(0, MAX_RESULTS)
    .map((item) => remember('fdroid', { name: item.title, pageUrl: item.url, summary: item.description }))
}

async function searchApkTools(query: string) {
  const endpoints = [
    `https://apk.tools/?s=${encodeURIComponent(query)}`,
    `https://apk.tools/search?q=${encodeURIComponent(query)}`,
  ]
  const found = new Map<string, Omit<ExtraItem, 'token' | 'store'>>()
  for (const endpoint of endpoints) {
    try {
      const page = await fetchHtml(endpoint)
      const $ = cheerio.load(page.html)
      $('a[href]').each((_index, element) => {
        const href = absolute(page.finalUrl, $(element).attr('href'))
        if (!href || found.has(href) || !/apk\.tools\/details-[^?#]+-apk\/?/i.test(href)) return
        const container = $(element).closest('article,li,.item,.app,.post,div').first()
        const title = ($(element).attr('title') || $(element).text()).replace(/\s+/g, ' ').trim().replace(/\s*APK\s*$/i, '').slice(0, 100)
        const text = container.text().replace(/\s+/g, ' ').trim()
        if (title.length < 2 || !relevant(query, title, `${text} ${href}`)) return
        const image = container.find('img').first()
        found.set(href, {
          name: title,
          pageUrl: href,
          icon: absolute(page.finalUrl, image.attr('data-src') || image.attr('data-lazy-src') || image.attr('src')),
          version: /\bv(?:ersion)?\s*[:.]?\s*([\w.+-]+)/i.exec(text)?.[1],
          sizeLabel: /\b\d+(?:[.,]\d+)?\s*(?:KB|MB|GB)\b/i.exec(text)?.[0],
          summary: text.slice(0, 220),
        })
      })
      if (found.size >= MAX_RESULTS) break
    } catch {
      // Siguiente layout público.
    }
  }
  return [...found.values()]
    .sort((a, b) => score(query, b.name) - score(query, a.name))
    .slice(0, MAX_RESULTS)
    .map((item) => remember('apktools', item))
}

function telegramPhoto(style?: string) {
  if (!style) return undefined
  const match = /background-image\s*:\s*url\(['"]?([^'")]+)['"]?\)/i.exec(style)
  return match?.[1]?.replace(/&amp;/g, '&')
}

async function searchAndroForeverWeb(query: string) {
  const found = new Map<string, Omit<ExtraItem, 'token' | 'store'>>()
  for (const endpoint of [`https://androforever.com/?s=${encodeURIComponent(query)}`, `https://androforever.com/search/${encodeURIComponent(query)}/`]) {
    try {
      const page = await fetchHtml(endpoint)
      const $ = cheerio.load(page.html)
      $('article a[href],h2 a[href],h3 a[href]').each((_index, element) => {
        const href = absolute(page.finalUrl, $(element).attr('href'))
        if (!href || found.has(href) || !/(^|\.)androforever\.com$/i.test(new URL(href).hostname)) return
        const container = $(element).closest('article,.post,.entry,li,div').first()
        const title = ($(element).attr('title') || $(element).text()).replace(/\s+/g, ' ').trim().slice(0, 100)
        const text = container.text().replace(/\s+/g, ' ').trim()
        if (title.length < 2 || /^(home|inicio|categor|contact)/i.test(title) || !relevant(query, title, `${text} ${href}`)) return
        const image = container.find('img').first()
        found.set(href, {
          name: title,
          pageUrl: href,
          icon: absolute(page.finalUrl, image.attr('data-src') || image.attr('data-lazy-src') || image.attr('src')),
          version: /\bv(?:er(?:sion|sión)?)?\s*[:.]?\s*([\d][\w.+-]*)/i.exec(text)?.[1],
          sizeLabel: /\b\d+(?:[.,]\d+)?\s*(?:KB|MB|GB)\b/i.exec(text)?.[0],
          summary: text.slice(0, 220),
        })
      })
      if (found.size >= MAX_RESULTS) break
    } catch {
      // El sitio puede usar protección anti-bot; Telegram es fallback.
    }
  }
  return [...found.values()]
}

async function searchAndroForeverTelegram(query: string) {
  const endpoint = `https://t.me/s/androforever_oficial?q=${encodeURIComponent(query)}`
  try {
    const page = await fetchHtml(endpoint)
    const $ = cheerio.load(page.html)
    const out: Array<Omit<ExtraItem, 'token' | 'store'>> = []
    $('.tgme_widget_message_wrap').each((_index, element) => {
      if (out.length >= MAX_RESULTS) return false
      const root = $(element)
      const body = (root.find('.tgme_widget_message_text').text() || root.find('.tgme_widget_message_document_title').text()).replace(/\s+/g, ' ').trim()
      const pageUrl = absolute(page.finalUrl, root.find('.tgme_widget_message_date').attr('href'))
      if (!body || !pageUrl) return
      const name = (body.split(/━━━━━━━━|\|/)[0] || body).trim().slice(0, 100)
      if (!relevant(query, name, body)) return
      let downloadPageUrl: string | undefined
      root.find('a[href]').each((_i, anchor) => {
        const href = absolute(page.finalUrl, $(anchor).attr('href'))
        if (!href || downloadPageUrl) return
        try {
          const host = new URL(href).hostname.toLowerCase()
          if (!['t.me', 'telegram.me', 'play.google.com'].includes(host) && !host.endsWith('.telegram.org')) downloadPageUrl = href
        } catch { /* ignore */ }
      })
      out.push({
        name,
        pageUrl,
        downloadPageUrl,
        icon: publicUrl(telegramPhoto(root.find('.tgme_widget_message_photo_wrap').attr('style'))),
        version: /\bv(?:er(?:sion|sión)?)?\s*[:.]?\s*([\d][\w.+-]*)/i.exec(body)?.[1],
        sizeLabel: root.find('.tgme_widget_message_document_extra').text().match(/\b\d+(?:\.\d+)?\s*(?:KB|MB|GB)\b/i)?.[0],
        summary: body.slice(0, 220),
      })
    })
    return out
  } catch {
    return []
  }
}

async function searchAndroForever(query: string) {
  const [web, telegram] = await Promise.all([searchAndroForeverWeb(query), searchAndroForeverTelegram(query)])
  const merged = new Map<string, Omit<ExtraItem, 'token' | 'store'>>()
  for (const item of [...web, ...telegram]) merged.set(item.pageUrl, item)
  return [...merged.values()]
    .sort((a, b) => score(query, b.name) - score(query, a.name))
    .slice(0, MAX_RESULTS)
    .map((item) => remember('androforever', item))
}

function looksApk(value: string) {
  return /\.apk(?:$|[?#])/i.test(value)
}

async function resolveExternalApk(item: ExtraItem) {
  const queue = [item.downloadPageUrl, item.pageUrl].filter((value): value is string => Boolean(value))
  const visited = new Set<string>()
  for (let depth = 0; depth < 6 && queue.length; depth += 1) {
    const current = publicUrl(queue.shift())
    if (!current || visited.has(current)) continue
    visited.add(current)
    if (looksApk(current)) return current
    try {
      const response = await fetch(current, {
        redirect: 'follow',
        headers: { 'user-agent': UA, accept: 'text/html,application/vnd.android.package-archive,application/octet-stream,*/*', referer: item.pageUrl },
        signal: AbortSignal.timeout(18_000),
      })
      if (!response.ok) continue
      const finalUrl = publicUrl(response.url) || current
      const type = response.headers.get('content-type') || ''
      const disposition = response.headers.get('content-disposition') || ''
      if (looksApk(finalUrl) || /android\.package-archive/i.test(type) || /\.apk(?:["'; ?]|$)/i.test(disposition)) return finalUrl
      if (!/html|text\//i.test(type)) continue
      const $ = cheerio.load(await response.text())
      const candidates: string[] = []
      $('a[href],button[data-href],[data-url],[data-download]').each((_i, el) => {
        const raw = $(el).attr('href') || $(el).attr('data-href') || $(el).attr('data-url') || $(el).attr('data-download')
        const href = absolute(finalUrl, raw)
        if (!href) return
        const text = ($(el).text() || $(el).attr('title') || '').replace(/\s+/g, ' ').trim()
        if (looksApk(href) || /download|descargar|apk/i.test(text) || /\/download|\/descarga/i.test(href)) candidates.push(href)
      })
      const scripts = $('script').map((_i, el) => $(el).html() || '').get().join('\n')
      for (const match of scripts.matchAll(/https?:\/\/[^\s"'<>]+\.apk(?:\?[^\s"'<>]*)?/gi)) candidates.push(match[0])
      for (const candidate of [...new Set(candidates)].slice(0, 8)) if (!visited.has(candidate)) queue.push(candidate)
    } catch {
      // Siguiente candidato.
    }
  }
  throw new Error(`${label(item.store)} no expuso una APK descargable compatible.`)
}

function safeFile(value: string) {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9._ -]+/g, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'android-app'
}

function bytes(value: number) {
  return value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(2)} GB` : `${(value / 1024 ** 2).toFixed(1)} MB`
}

async function downloadExternal(ctx: CommandContext, store: ExtraStore, token: string) {
  const item = getItem(token, store)
  if (store === 'fdroid') {
    const file = await downloadFdroidApk(item.pageUrl)
    try {
      await ctx.socket.sendMessage(ctx.chatId, {
        document: { url: file.filePath },
        mimetype: 'application/vnd.android.package-archive',
        fileName: file.fileName.endsWith('.apk') ? file.fileName : `${file.fileName}.apk`,
        caption: [`📦 *${item.name}*`, `Peso: ${bytes(file.size)}`, 'Fuente: F-Droid'].join('\n'),
      }, { quoted: ctx.message })
      recordSubbotDownload(ctx.instanceId, file.size)
    } finally { await file.cleanup() }
    return
  }

  const direct = await resolveExternalApk(item)
  const dir = await mkdtemp(path.join(os.tmpdir(), `ghostnexora-${store}-`))
  const filePath = path.join(dir, `${safeFile(item.name)}-${safeFile(item.version ?? 'latest')}.apk`)
  try {
    const response = await fetch(direct, {
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'application/vnd.android.package-archive,application/octet-stream,*/*', referer: item.pageUrl },
      signal: AbortSignal.timeout(15 * 60_000),
    })
    if (!response.ok || !response.body) throw new Error(`${label(store)} respondió HTTP ${response.status}.`)
    const declared = Number(response.headers.get('content-length') || 0)
    if (declared > config.maxDownloadBytes) throw new Error(`La APK supera ${config.maxDownloadMb} MB.`)
    let received = 0
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length
        if (received > config.maxDownloadBytes) callback(new Error(`La APK supera ${config.maxDownloadMb} MB.`))
        else callback(null, chunk)
      },
    })
    await pipeline(response.body as any, limiter, createWriteStream(filePath, { mode: 0o600 }))
    const info = await stat(filePath)
    if (info.size < 1024) throw new Error('La fuente devolvió un archivo vacío o incompleto.')
    const header = (await readFile(filePath)).subarray(0, 4)
    if (!(header[0] === 0x50 && header[1] === 0x4b && [0x03, 0x05, 0x07].includes(header[2] ?? -1))) throw new Error('La fuente no devolvió un APK/ZIP válido.')
    await ctx.socket.sendMessage(ctx.chatId, {
      document: { url: filePath },
      mimetype: 'application/vnd.android.package-archive',
      fileName: path.basename(filePath),
      caption: [`📦 *${item.name}*`, item.version ? `Versión: ${item.version}` : '', `Peso: ${bytes(info.size)}`, `Fuente: ${label(store)}`].filter(Boolean).join('\n'),
    }, { quoted: ctx.message })
    recordSubbotDownload(ctx.instanceId, info.size)
  } finally { await rm(dir, { recursive: true, force: true }).catch(() => undefined) }
}

function body(item: ExtraItem) {
  return [item.version ? `Versión: ${item.version}` : '', item.sizeLabel ? `Peso: ${item.sizeLabel}` : '', item.summary?.slice(0, 100) ?? ''].filter(Boolean).join('\n').slice(0, 135) || 'Aplicación Android'
}

async function showStore(ctx: CommandContext, store: ExtraStore, query: string) {
  const results = store === 'fdroid' ? await searchFdroidStore(query) : store === 'apktools' ? await searchApkTools(query) : await searchAndroForever(query)
  if (!results.length) throw new Error(`${label(store)} no encontró resultados realmente relacionados con “${query}”.`)
  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: `📦 ${label(store)} · BÚSQUEDA`,
    body: `Resultados relacionados con: ${query}\nDesliza y toca Seleccionar.`,
    footer: `Ghost Nexora Bot · ${label(store)}`,
    cards: results.map((item, index) => ({
      title: `#${index + 1} · ${item.name}`.slice(0, 80),
      body: body(item),
      imageUrl: item.icon,
      buttons: [{ type: 'reply' as const, text: 'Seleccionar', id: `${ctx.prefix}${store}select ${item.token}` }],
    })),
  })
}

async function selectStore(ctx: CommandContext, store: ExtraStore) {
  const token = ctx.args[0] ?? ''
  if (!token) throw new Error(`Usa primero ${ctx.prefix}${store} <aplicación>.`)
  const item = getItem(token, store)
  await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
    title: `📦 ${label(store)} · ${item.name}`.slice(0, 80),
    body: body(item),
    footer: `Ghost Nexora Bot · ${label(store)}`,
    imageUrl: item.icon,
    buttons: [{ type: 'reply', text: '⬇️ Descargar', id: `${ctx.prefix}${store}dl ${item.token}` }],
  })
}

function requireQuery(ctx: CommandContext, command: string) {
  const query = ctx.argText.trim()
  if (query.length < 2) throw new Error(`Uso: ${ctx.prefix}${command} <aplicación>`)
  return query.slice(0, 120)
}

export const appStoresExtraV15Commands: BotCommand[] = [
  { name: 'fdroid', aliases: ['f-droid'], category: 'downloads', description: 'Busca aplicaciones exclusivamente en F-Droid.', usage: 'fdroid <aplicación>', handler: (ctx) => showStore(ctx, 'fdroid', requireQuery(ctx, 'fdroid')) },
  { name: 'fdroidselect', aliases: [], category: 'downloads', description: 'Selecciona un resultado de F-Droid.', handler: (ctx) => selectStore(ctx, 'fdroid') },
  { name: 'fdroiddl', aliases: [], category: 'downloads', description: 'Descarga un resultado seleccionado de F-Droid.', handler: (ctx) => downloadExternal(ctx, 'fdroid', ctx.args[0] ?? '') },
  { name: 'apktools', aliases: ['apktoolsearch'], category: 'downloads', description: 'Busca aplicaciones exclusivamente en APK.Tools.', usage: 'apktools <aplicación>', handler: (ctx) => showStore(ctx, 'apktools', requireQuery(ctx, 'apktools')) },
  { name: 'apktoolsselect', aliases: [], category: 'downloads', description: 'Selecciona un resultado de APK.Tools.', handler: (ctx) => selectStore(ctx, 'apktools') },
  { name: 'apktoolsdl', aliases: [], category: 'downloads', description: 'Descarga un resultado seleccionado de APK.Tools.', handler: (ctx) => downloadExternal(ctx, 'apktools', ctx.args[0] ?? '') },
  { name: 'androforever', aliases: ['andro'], category: 'downloads', description: 'Busca aplicaciones exclusivamente en AndroForever.', usage: 'androforever <aplicación>', handler: (ctx) => showStore(ctx, 'androforever', requireQuery(ctx, 'androforever')) },
  { name: 'androforeverselect', aliases: [], category: 'downloads', description: 'Selecciona un resultado de AndroForever.', handler: (ctx) => selectStore(ctx, 'androforever') },
  { name: 'androforeverdl', aliases: [], category: 'downloads', description: 'Descarga un resultado seleccionado de AndroForever.', handler: (ctx) => downloadExternal(ctx, 'androforever', ctx.args[0] ?? '') },
]
