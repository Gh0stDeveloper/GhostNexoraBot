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
import { downloadAptoideApk, getAptoideApp, searchAptoideApps, type AptoideApp } from '../services/aptoide.js'
import { downloadHappyModApk, getHappyModItem, searchHappyMod, type HappyModItem } from '../services/happymod.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

type WebStore = 'uptodown' | 'liteapks'
type WebStoreItem = {
  token: string
  store: WebStore
  name: string
  pageUrl: string
  icon?: string
  version?: string
  sizeLabel?: string
  summary?: string
}

const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 GhostNexoraBot/1.5'
const TTL = 30 * 60_000
const MAX_RESULTS = 8
const webCache = new Map<string, { item: WebStoreItem; expiresAt: number }>()

const storeHosts: Record<WebStore, RegExp> = {
  uptodown: /(^|\.)uptodown\.com$/i,
  liteapks: /(^|\.)liteapks\.com$/i,
}

function normalize(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function queryTerms(query: string) {
  return normalize(query).split(' ').filter((part) => part.length >= 2)
}

function relevance(query: string, name: string, extra = '') {
  const q = normalize(query)
  const n = normalize(name)
  const haystack = normalize(`${name} ${extra}`)
  const terms = queryTerms(query)
  if (!q || !n) return -1
  if (terms.length && !terms.every((term) => haystack.includes(term))) return -1
  let score = 0
  if (n === q) score += 200
  if (n.startsWith(q)) score += 120
  if (n.includes(q)) score += 90
  for (const term of terms) {
    if (n === term) score += 35
    else if (n.startsWith(term)) score += 24
    else if (n.includes(term)) score += 16
    else if (haystack.includes(term)) score += 5
  }
  return score
}

function rankRelevant<T>(query: string, items: T[], fields: (item: T) => { name: string; extra?: string }) {
  return items
    .map((item, index) => ({ item, index, score: relevance(query, fields(item).name, fields(item).extra ?? '') }))
    .filter((row) => row.score >= 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((row) => row.item)
}

function requireQuery(ctx: CommandContext, command: string) {
  const query = ctx.argText.trim()
  if (query.length < 2) throw new Error(`Uso: ${ctx.prefix}${command} <aplicación>`)
  return query.slice(0, 120)
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

function rememberWeb(store: WebStore, input: Omit<WebStoreItem, 'token' | 'store'>) {
  const token = `${store === 'uptodown' ? 'ud' : 'la'}_${createHash('sha256').update(`${store}:${input.pageUrl}`).digest('hex').slice(0, 16)}`
  const item: WebStoreItem = { token, store, ...input }
  webCache.set(token, { item, expiresAt: Date.now() + TTL })
  return item
}

function getWebItem(token: string, expected?: WebStore) {
  const row = webCache.get(token.trim())
  if (!row || row.expiresAt <= Date.now()) {
    webCache.delete(token.trim())
    throw new Error('Ese resultado expiró. Repite la búsqueda en la misma tienda.')
  }
  if (expected && row.item.store !== expected) throw new Error('Ese resultado pertenece a otra tienda.')
  return row.item
}

function webSearchUrls(store: WebStore, query: string) {
  const q = encodeURIComponent(query)
  return store === 'uptodown'
    ? [
        `https://en.uptodown.com/android/search?query=${q}`,
        `https://www.uptodown.com/android/search?query=${q}`,
        `https://en.uptodown.com/android/search/${q}`,
      ]
    : [
        `https://liteapks.com/?s=${q}`,
        `https://liteapks.com/search/${q}`,
      ]
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,*/*', 'accept-language': 'es-MX,es;q=0.9,en;q=0.7' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return { html: await response.text(), finalUrl: response.url }
}

function parseWebResults(store: WebStore, query: string, html: string, baseUrl: string) {
  const $ = cheerio.load(html)
  const candidates: Array<Omit<WebStoreItem, 'token' | 'store'>> = []
  const seen = new Set<string>()

  $('a[href]').each((_index, element) => {
    const pageUrl = absolute(baseUrl, $(element).attr('href'))
    if (!pageUrl || seen.has(pageUrl)) return
    let url: URL
    try { url = new URL(pageUrl) } catch { return }
    if (!storeHosts[store].test(url.hostname)) return
    const pathname = url.pathname.toLowerCase()
    const appLike = store === 'uptodown'
      ? /\/android\//.test(pathname) && !/\/search/.test(pathname)
      : (/\.html?$/.test(pathname) || /\/(?:app|apps|game|games)\b/.test(pathname)) && !/\/(?:search|category|tag|about|contact|privacy|terms)/.test(pathname)
    if (!appLike) return

    const box = $(element).closest('article,li,.card,.item,.post,.app,.search-item,div').first()
    const rawName = ($(element).attr('title') || box.find('h1,h2,h3,.title,.card-title').first().text() || $(element).text()).replace(/\s+/g, ' ').trim()
    const name = rawName.replace(/\s+(?:APK|Mod APK|Download|Descargar)$/i, '').trim().slice(0, 90)
    if (name.length < 2) return
    const summary = box.text().replace(/\s+/g, ' ').trim().slice(0, 220)
    if (relevance(query, name, `${summary} ${pathname.replace(/[-_/]+/g, ' ')}`) < 0) return

    const img = box.find('img').first()
    const icon = absolute(baseUrl, img.attr('data-src') || img.attr('data-lazy-src') || img.attr('src'))
    const version = /\b(?:version|versi[oó]n|v)\s*[:.]?\s*([0-9][\w.+-]*)/i.exec(summary)?.[1]
    const sizeLabel = /\b(\d+(?:[.,]\d+)?\s*(?:KB|MB|GB))\b/i.exec(summary)?.[1]
    seen.add(pageUrl)
    candidates.push({ name, pageUrl, icon, version, sizeLabel, summary })
  })

  return rankRelevant(query, candidates, (item) => ({ name: item.name, extra: `${item.summary ?? ''} ${item.pageUrl}` }))
    .slice(0, MAX_RESULTS)
    .map((item) => rememberWeb(store, item))
}

async function searchWebStore(store: WebStore, query: string) {
  const merged = new Map<string, WebStoreItem>()
  for (const endpoint of webSearchUrls(store, query)) {
    try {
      const page = await fetchHtml(endpoint)
      for (const item of parseWebResults(store, query, page.html, page.finalUrl)) merged.set(item.pageUrl, item)
      if (merged.size >= MAX_RESULTS) break
    } catch {
      // Try the next public search layout.
    }
  }
  return rankRelevant(query, [...merged.values()], (item) => ({ name: item.name, extra: `${item.summary ?? ''} ${item.pageUrl}` })).slice(0, MAX_RESULTS)
}

function packageKind(value: string) {
  return /\.xapk(?:$|[?#])/i.test(value) ? 'XAPK' : /\.apks(?:$|[?#])/i.test(value) ? 'APKS' : 'APK'
}

function looksPackage(value: string) {
  return /\.(?:apk|xapk|apks)(?:$|[?#])/i.test(value)
}

async function resolveWebPackage(item: WebStoreItem) {
  const queue = [item.pageUrl]
  const visited = new Set<string>()
  for (let depth = 0; depth < 8 && queue.length; depth += 1) {
    const current = publicUrl(queue.shift())
    if (!current || visited.has(current)) continue
    visited.add(current)
    try {
      const response = await fetch(current, {
        redirect: 'follow',
        headers: { 'user-agent': UA, accept: 'text/html,application/vnd.android.package-archive,application/octet-stream,*/*', referer: item.pageUrl },
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) continue
      const finalUrl = publicUrl(response.url) || current
      const type = response.headers.get('content-type') || ''
      const disposition = response.headers.get('content-disposition') || ''
      if (looksPackage(finalUrl) || /android\.package-archive|application\/zip/i.test(type) || /\.(?:apk|xapk|apks)(?:["'; ?]|$)/i.test(disposition)) return finalUrl
      if (!/html|text\//i.test(type)) continue

      const $ = cheerio.load(await response.text())
      const candidates: string[] = []
      $('a[href],button[data-href],[data-url],[data-download]').each((_i, el) => {
        const raw = $(el).attr('href') || $(el).attr('data-href') || $(el).attr('data-url') || $(el).attr('data-download')
        const href = absolute(finalUrl, raw)
        if (!href) return
        const label = ($(el).text() || $(el).attr('title') || $(el).attr('aria-label') || '').replace(/\s+/g, ' ').trim()
        if (looksPackage(href) || /download|descargar|get\s*apk|bajar/i.test(label) || /\/download|\/descarga|\/get(?:$|\/)/i.test(href)) candidates.push(href)
      })
      const scriptText = $('script').map((_i, el) => $(el).html() || '').get().join('\n')
      for (const match of scriptText.matchAll(/https?:\/\/[^\s"'<>]+\.(?:apk|xapk|apks)(?:\?[^\s"'<>]*)?/gi)) candidates.push(match[0])
      for (const candidate of [...new Set(candidates)].slice(0, 8)) if (!visited.has(candidate)) queue.push(candidate)
    } catch {
      // Continue with the next candidate.
    }
  }
  throw new Error(`${item.store === 'uptodown' ? 'Uptodown' : 'LiteAPKS'} no expuso un archivo descargable compatible.`)
}

function bytes(value?: number) {
  if (!value || value <= 0) return undefined
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`
  return `${(value / 1024 ** 2).toFixed(1)} MB`
}

function safeFile(value: string) {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9._ -]+/g, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'android-app'
}

async function downloadWebStore(ctx: CommandContext, store: WebStore, token: string) {
  const item = getWebItem(token, store)
  const direct = await resolveWebPackage(item)
  const dir = await mkdtemp(path.join(os.tmpdir(), `ghostnexora-${store}-`))
  const kind = packageKind(direct)
  const filePath = path.join(dir, `${safeFile(item.name)}-${safeFile(item.version ?? 'latest')}.${kind.toLowerCase()}`)
  try {
    const response = await fetch(direct, {
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'application/vnd.android.package-archive,application/octet-stream,*/*', referer: item.pageUrl },
      signal: AbortSignal.timeout(20 * 60_000),
    })
    if (!response.ok || !response.body) throw new Error(`La tienda respondió HTTP ${response.status}.`)
    const declared = Number(response.headers.get('content-length') || 0)
    if (declared > config.maxDownloadBytes) throw new Error(`El archivo supera ${config.maxDownloadMb} MB.`)
    let received = 0
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length
        if (received > config.maxDownloadBytes) callback(new Error(`El archivo supera ${config.maxDownloadMb} MB.`))
        else callback(null, chunk)
      },
    })
    await pipeline(response.body as any, limiter, createWriteStream(filePath, { mode: 0o600 }))
    const info = await stat(filePath)
    if (info.size < 1024) throw new Error('La tienda devolvió un archivo vacío o incompleto.')
    const header = (await readFile(filePath)).subarray(0, 4)
    if (header[0] !== 0x50 || header[1] !== 0x4b) throw new Error('El servidor no devolvió un APK/XAPK/APKS válido.')
    await ctx.socket.sendMessage(ctx.chatId, {
      document: { url: filePath },
      mimetype: kind === 'APK' ? 'application/vnd.android.package-archive' : 'application/octet-stream',
      fileName: path.basename(filePath),
      caption: [
        `📦 *${item.name}*`,
        item.version ? `Versión: ${item.version}` : '',
        `Peso: ${bytes(info.size)}`,
        `Fuente: ${store === 'uptodown' ? 'Uptodown' : 'LiteAPKS'}`,
        `Tipo: ${kind}`,
      ].filter(Boolean).join('\n'),
    }, { quoted: ctx.message })
    recordSubbotDownload(ctx.instanceId, info.size)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

function webCardBody(item: WebStoreItem) {
  return [item.version ? `Versión: ${item.version}` : '', item.sizeLabel ? `Peso: ${item.sizeLabel}` : '', item.summary?.slice(0, 90) ?? '']
    .filter(Boolean).join('\n').slice(0, 130) || 'Aplicación Android'
}

async function showWebStore(ctx: CommandContext, store: WebStore, query: string) {
  const results = await searchWebStore(store, query)
  const label = store === 'uptodown' ? 'UPTODOWN' : 'LITEAPKS'
  if (!results.length) throw new Error(`No encontré resultados realmente relacionados con “${query}” en ${label}.`)
  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: `📦 ${label} · BÚSQUEDA`,
    body: `Resultados relacionados con: ${query}\nDesliza y toca Seleccionar.`,
    footer: `Ghost Nexora Bot · ${label}`,
    cards: results.map((item, index) => ({
      title: `#${index + 1} · ${item.name}`.slice(0, 80),
      body: webCardBody(item),
      imageUrl: item.icon,
      buttons: [{ type: 'reply', text: 'Seleccionar', id: `${ctx.prefix}${store}select ${item.token}` }],
    })),
  })
}

async function selectWebStore(ctx: CommandContext, store: WebStore) {
  const token = ctx.args[0] ?? ''
  if (!token) throw new Error(`Usa primero ${ctx.prefix}${store} <aplicación>.`)
  const item = getWebItem(token, store)
  const label = store === 'uptodown' ? 'Uptodown' : 'LiteAPKS'
  await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
    title: `📦 ${label} · ${item.name}`.slice(0, 80),
    body: [item.version ? `Versión: ${item.version}` : '', item.sizeLabel ? `Peso: ${item.sizeLabel}` : '', item.summary?.slice(0, 220) ?? ''].filter(Boolean).join('\n') || 'Aplicación Android',
    footer: `Ghost Nexora Bot · ${label}`,
    imageUrl: item.icon,
    buttons: [{ type: 'reply', text: '⬇️ Descargar', id: `${ctx.prefix}${store}dl ${item.token}` }],
  })
}

function aptoideBody(app: AptoideApp) {
  return [
    app.packageName,
    app.version ? `Versión: ${app.version}` : '',
    app.size ? `Peso: ${bytes(app.size)}` : '',
    app.developer ? `Dev: ${app.developer}` : '',
    app.rating !== undefined ? `Rating: ${app.rating.toFixed(1)}` : '',
  ].filter(Boolean).join('\n').slice(0, 130)
}

async function showAptoide(ctx: CommandContext, query: string) {
  const raw = await searchAptoideApps(query, 10)
  const results = rankRelevant(query, raw, (app) => ({ name: app.name, extra: `${app.packageName} ${app.developer ?? ''} ${app.summary ?? ''}` })).slice(0, MAX_RESULTS)
  if (!results.length) throw new Error(`Aptoide no encontró resultados realmente relacionados con “${query}”.`)
  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '📦 APTOIDE · BÚSQUEDA',
    body: `Resultados relacionados con: ${query}\nDesliza y toca Seleccionar.`,
    footer: 'Ghost Nexora Bot · Aptoide',
    cards: results.map((app, index) => ({
      title: `#${index + 1} · ${app.name}`.slice(0, 80),
      body: aptoideBody(app),
      imageUrl: app.graphic ?? app.icon,
      buttons: [{ type: 'reply', text: 'Seleccionar', id: `${ctx.prefix}aptoideselect ${app.id}` }],
    })),
  })
}

async function selectAptoide(ctx: CommandContext) {
  const id = ctx.args[0] ?? ''
  if (!id) throw new Error(`Usa primero ${ctx.prefix}aptoide <aplicación>.`)
  const app = await getAptoideApp(id)
  await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
    title: `📦 Aptoide · ${app.name}`.slice(0, 80),
    body: [aptoideBody(app), app.summary?.slice(0, 220) ?? '', app.trusted ? 'Verificación: TRUSTED' : app.malwareRank ? `Verificación: ${app.malwareRank}` : 'Verificación: sin clasificación'].filter(Boolean).join('\n'),
    footer: 'Ghost Nexora Bot · Aptoide',
    imageUrl: app.graphic ?? app.icon,
    buttons: [{ type: 'reply', text: '⬇️ Descargar', id: `${ctx.prefix}aptoidedl ${app.id}` }],
  })
}

async function downloadAptoide(ctx: CommandContext) {
  const id = ctx.args[0] ?? ''
  if (!id) throw new Error(`Usa primero ${ctx.prefix}aptoide <aplicación>.`)
  const result = await downloadAptoideApk(id)
  try {
    if (result.malwareRank && !result.trusted && /(?:critical|malware|virus|infected)/i.test(result.malwareRank)) throw new Error(`Aptoide marcó esta APK como ${result.malwareRank}; envío bloqueado.`)
    await ctx.socket.sendMessage(ctx.chatId, {
      document: { url: result.filePath },
      mimetype: 'application/vnd.android.package-archive',
      fileName: result.fileName,
      caption: [`📦 *${result.name}*`, result.version ? `Versión: ${result.version}` : '', `Peso: ${bytes(result.size)}`, 'Fuente: Aptoide', result.trusted ? 'Verificación: TRUSTED' : result.malwareRank ? `Verificación: ${result.malwareRank}` : ''].filter(Boolean).join('\n'),
    }, { quoted: ctx.message })
    recordSubbotDownload(ctx.instanceId, result.size)
  } finally { await result.cleanup() }
}

function happyBody(item: HappyModItem) {
  return [item.version ? `Versión: ${item.version}` : '', item.sizeLabel ? `Peso: ${item.sizeLabel}` : '', item.summary?.slice(0, 90) ?? ''].filter(Boolean).join('\n').slice(0, 130) || 'HappyMod'
}

async function showHappyMod(ctx: CommandContext, query: string) {
  const raw = await searchHappyMod(query, 12)
  const results = rankRelevant(query, raw, (item) => ({ name: item.name, extra: `${item.summary ?? ''} ${item.url}` })).slice(0, MAX_RESULTS)
  if (!results.length) throw new Error(`HappyMod no encontró resultados realmente relacionados con “${query}”.`)
  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '📦 HAPPYMOD · BÚSQUEDA',
    body: `Resultados relacionados con: ${query}\nDesliza y toca Seleccionar.`,
    footer: 'Ghost Nexora Bot · HappyMod',
    cards: results.map((item, index) => ({
      title: `#${index + 1} · ${item.name}`.slice(0, 80),
      body: happyBody(item),
      imageUrl: item.icon,
      buttons: [{ type: 'reply', text: 'Seleccionar', id: `${ctx.prefix}happymodselect ${item.token}` }],
    })),
  })
}

async function selectHappyMod(ctx: CommandContext) {
  const token = ctx.args[0] ?? ''
  if (!token) throw new Error(`Usa primero ${ctx.prefix}happymod <aplicación>.`)
  const item = getHappyModItem(token)
  await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
    title: `📦 HappyMod · ${item.name}`.slice(0, 80),
    body: [happyBody(item), 'APK modificada: revisa permisos y procedencia antes de instalar.'].filter(Boolean).join('\n'),
    footer: 'Ghost Nexora Bot · HappyMod',
    imageUrl: item.icon,
    buttons: [{ type: 'reply', text: '⬇️ Descargar', id: `${ctx.prefix}happymoddl ${item.token}` }],
  })
}

async function downloadHappyMod(ctx: CommandContext) {
  const token = ctx.args[0] ?? ''
  if (!token) throw new Error(`Usa primero ${ctx.prefix}happymod <aplicación>.`)
  const result = await downloadHappyModApk(token)
  try {
    await ctx.socket.sendMessage(ctx.chatId, {
      document: { url: result.filePath },
      mimetype: 'application/vnd.android.package-archive',
      fileName: result.fileName,
      caption: [`📦 *${result.name}*`, result.version ? `Versión: ${result.version}` : '', `Peso: ${bytes(result.size)}`, 'Fuente: HappyMod'].filter(Boolean).join('\n'),
    }, { quoted: ctx.message })
    recordSubbotDownload(ctx.instanceId, result.size)
  } finally { await result.cleanup() }
}

export const appStoresV15Commands: BotCommand[] = [
  { name: 'uptodown', aliases: ['upto', 'udown'], category: 'downloads', description: 'Busca aplicaciones exclusivamente en Uptodown.', usage: 'uptodown <aplicación>', handler: (ctx) => showWebStore(ctx, 'uptodown', requireQuery(ctx, 'uptodown')) },
  { name: 'uptodownselect', aliases: [], category: 'downloads', description: 'Selecciona un resultado de Uptodown.', handler: (ctx) => selectWebStore(ctx, 'uptodown') },
  { name: 'uptodowndl', aliases: ['uddl'], category: 'downloads', description: 'Descarga un resultado seleccionado de Uptodown.', handler: (ctx) => downloadWebStore(ctx, 'uptodown', ctx.args[0] ?? '') },
  { name: 'liteapks', aliases: ['liteapk', 'lapks'], category: 'downloads', description: 'Busca aplicaciones exclusivamente en LiteAPKS.', usage: 'liteapks <aplicación>', handler: (ctx) => showWebStore(ctx, 'liteapks', requireQuery(ctx, 'liteapks')) },
  { name: 'liteapksselect', aliases: [], category: 'downloads', description: 'Selecciona un resultado de LiteAPKS.', handler: (ctx) => selectWebStore(ctx, 'liteapks') },
  { name: 'liteapksdl', aliases: ['ladl'], category: 'downloads', description: 'Descarga un resultado seleccionado de LiteAPKS.', handler: (ctx) => downloadWebStore(ctx, 'liteapks', ctx.args[0] ?? '') },
  { name: 'aptoide', aliases: ['apt'], category: 'downloads', description: 'Busca aplicaciones exclusivamente en Aptoide.', usage: 'aptoide <aplicación>', handler: (ctx) => showAptoide(ctx, requireQuery(ctx, 'aptoide')) },
  { name: 'aptoideselect', aliases: [], category: 'downloads', description: 'Selecciona un resultado de Aptoide.', handler: selectAptoide },
  { name: 'aptoidedl', aliases: ['aptdl'], category: 'downloads', description: 'Descarga un resultado seleccionado de Aptoide.', handler: downloadAptoide },
  { name: 'happymod', aliases: ['hm', 'hmod'], category: 'downloads', description: 'Busca aplicaciones exclusivamente en HappyMod.', usage: 'happymod <aplicación>', handler: (ctx) => showHappyMod(ctx, requireQuery(ctx, 'happymod')) },
  { name: 'happymodselect', aliases: [], category: 'downloads', description: 'Selecciona un resultado de HappyMod.', handler: selectHappyMod },
  { name: 'happymoddl', aliases: ['hmdl'], category: 'downloads', description: 'Descarga un resultado seleccionado de HappyMod.', handler: downloadHappyMod },
]
