import { createHash } from 'node:crypto'
import * as cheerio from 'cheerio'
import type { BotCommand, CommandContext } from '../types.js'
import { sendCarousel } from '../services/interactive.js'

/**
 * Legacy official APK helpers (v7).
 * Primary user-facing commands for Uptodown / LiteAPKS / HappyMod live in
 * official-apk-v8.ts and happymod.ts. This module only keeps the internal
 * download resolver under non-conflicting names for backwards compatibility.
 */

const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36 GhostNexoraBot/1.2'

type OfficialSource = 'Uptodown' | 'LiteAPKS' | 'HappyMod'
type Result = { token: string; source: OfficialSource; name: string; pageUrl: string; downloadPageUrl?: string; icon?: string; version?: string; summary?: string }

const sourceConfig: Record<OfficialSource, { host: RegExp; search: (q: string) => string[] }> = {
  Uptodown: {
    host: /(^|\.)uptodown\.com$/i,
    search: (q) => [`https://en.uptodown.com/android/search?query=${encodeURIComponent(q)}`, `https://en.uptodown.com/android/search/${encodeURIComponent(q)}`],
  },
  LiteAPKS: {
    host: /(^|\.)liteapks\.com$/i,
    search: (q) => [`https://liteapks.com/?s=${encodeURIComponent(q)}`, `https://liteapks.com/search/${encodeURIComponent(q)}`],
  },
  HappyMod: {
    host: /(^|\.)happymod\.com$/i,
    search: (q) => [`https://www.happymod.com/search.html?q=${encodeURIComponent(q)}`],
  },
}

const cache = new Map<string, Result>()

function absolute(base: string, href?: string) {
  if (!href) return undefined
  try {
    const url = new URL(href, base)
    return /^https?:$/i.test(url.protocol) ? url.toString() : undefined
  } catch { return undefined }
}

function official(url: string, source: OfficialSource) {
  try { return sourceConfig[source].host.test(new URL(url).hostname) ? url : undefined } catch { return undefined }
}

async function html(url: string) {
  const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,*/*;q=0.8' }, signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`La fuente respondió HTTP ${response.status}.`)
  return { html: await response.text(), finalUrl: response.url }
}

function token(source: OfficialSource, url: string) { return createHash('sha256').update(`v7:${source}:${url}`).digest('hex').slice(0, 18) }

function save(result: Omit<Result, 'token'>) {
  const item = { ...result, token: token(result.source, result.pageUrl) }
  cache.set(item.token, item)
  return item
}

function sourceLinks($: cheerio.CheerioAPI, source: OfficialSource, base: string, query: string) {
  const out: Result[] = []
  const seen = new Set<string>()
  $('a[href]').each((_i, el) => {
    if (out.length >= 8) return false
    const href = official(absolute(base, $(el).attr('href')) || '', source)
    if (!href || seen.has(href)) return
    const text = ($(el).attr('title') || $(el).text() || '').replace(/\s+/g, ' ').trim()
    if (text.length < 2) return
    const path = new URL(href).pathname.toLowerCase()
    const likelyApp = source === 'HappyMod'
      ? /(?:-mod\/|\/app-mod\/|\.html$)/.test(path) && !/search|new\.html|top\.html|faq|dmca/.test(path)
      : source === 'LiteAPKS'
        ? /\/(?:app|games|apps?)\b|\.html?$/.test(path) && !/^\/?(?:about|contact|privacy|terms)/.test(path)
        : /\.(?:en|es|pt)\.uptodown\.com\//.test(new URL(href).hostname) || /\/android\//.test(path)
    if (!likelyApp) return
    if (text.toLowerCase().includes(query.toLowerCase()) || source !== 'HappyMod') {
      seen.add(href)
      const root = $(el).closest('article,li,.item,.app,.post,.card,div').first()
      const summary = root.text().replace(/\s+/g, ' ').trim().slice(0, 220)
      const icon = absolute(base, root.find('img').first().attr('data-src') || root.find('img').first().attr('src'))
      const version = /\bv(?:ersion|ersión)?\s*[:.]?\s*([0-9][\w.+-]*)/i.exec(summary)?.[1]
      out.push(save({ source, name: text.replace(/\s+(APK|Mod APK|download)$/i, '').slice(0, 100), pageUrl: href, icon, version, summary }))
    }
  })
  return out
}

async function searchSource(source: OfficialSource, query: string) {
  const failures: string[] = []
  for (const endpoint of sourceConfig[source].search(query)) {
    try {
      const { html: body, finalUrl } = await html(endpoint)
      const $ = cheerio.load(body)
      const results = sourceLinks($, source, finalUrl, query)
      if (results.length) return results
      failures.push(`${endpoint}: sin resultados`)
    } catch (error) { failures.push(`${endpoint}: ${error instanceof Error ? error.message : 'error'}`) }
  }
  if (failures.length) throw new Error('No encontré resultados en la página oficial de esa fuente.')
  return []
}

async function resolveDownload(item: Result) {
  const queue = [item.downloadPageUrl, item.pageUrl].filter((v): v is string => Boolean(v))
  const visited = new Set<string>()
  for (let depth = 0; depth < 4 && queue.length; depth += 1) {
    const page = official(queue.shift() || '', item.source)
    if (!page || visited.has(page)) continue
    visited.add(page)
    if (/\.apk(?:$|[?#])/i.test(page)) return page
    const { html: body, finalUrl } = await html(page)
    const $ = cheerio.load(body)
    let direct: string | undefined
    $('a[href]').each((_i, el) => {
      if (direct) return false
      const href = absolute(finalUrl, $(el).attr('href'))
      const label = ($(el).text() || $(el).attr('title') || '').replace(/\s+/g, ' ').trim()
      if (!href || !official(href, item.source)) return
      if (/\.apk(?:$|[?#])/i.test(href) || /download|descargar/i.test(label) || /\/download(?:ing)?(?:\.html)?\/?$/i.test(new URL(href).pathname)) {
        if (!visited.has(href)) queue.push(href)
        if (/\.apk(?:$|[?#])/i.test(href)) direct = href
      }
    })
    if (direct) return direct
    if (new URL(finalUrl).pathname !== new URL(page).pathname) {
      const final = official(finalUrl, item.source)
      if (final && /\.apk(?:$|[?#])/i.test(final)) return final
    }
  }
  throw new Error('No pude resolver el archivo APK desde la página oficial.')
}

const selected = new Map<string, Result>()

function buttons(ctx: CommandContext, item: Result) {
  selected.set(item.token, item)
  return [
    { type: 'reply' as const, text: '⬇️ Descargar', id: `${ctx.prefix}apkofficialdl ${item.token}` },
    { type: 'url' as const, text: '🌐 Página oficial', url: item.pageUrl },
  ]
}

async function searchCommand(ctx: CommandContext, source: OfficialSource) {
  const query = ctx.argText.trim()
  if (query.length < 2) throw new Error(`Uso: ${ctx.prefix}apkofficialv7 <aplicación> (legacy). Prefer ${ctx.prefix}apk / ${ctx.prefix}happymod.`)
  const results = await searchSource(source, query)
  if (!results.length) throw new Error('No encontré resultados en la página oficial.')
  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: `📦 ${source.toUpperCase()} · APK (legacy v7)`,
    body: `Resultados oficiales para: *${query}*\nPrefer ${ctx.prefix}apk / ${ctx.prefix}happymod para la versión actualizada.`,
    footer: `Fuente: ${source} · Ghost Nexora Bot`,
    cards: results.map((item) => ({ title: item.name, body: [item.version ? `🔄 Versión: ${item.version}` : '', item.summary || '', '✅ Resultado obtenido desde la web oficial.'].filter(Boolean).join('\n'), imageUrl: item.icon, buttons: buttons(ctx, item) })),
  })
}

async function downloadCommand(ctx: CommandContext) {
  const item = selected.get(ctx.args[0] || '')
  if (!item) throw new Error(`Selecciona primero una APK con el flujo actual: ${ctx.prefix}apk, ${ctx.prefix}uptodown, ${ctx.prefix}liteapks o ${ctx.prefix}happymod.`)
  const direct = await resolveDownload(item)
  const response = await fetch(direct, { redirect: 'follow', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error('La página oficial no pudo entregar el archivo.')
  const type = response.headers.get('content-type') || ''
  if (!/android\.package-archive|application\/octet-stream|application\/zip/i.test(type) && !/\.apk(?:$|[?#])/i.test(response.url)) throw new Error('La respuesta oficial no parece ser un APK.')
  const data = Buffer.from(await response.arrayBuffer())
  if (!data.length || data.length > 1900 * 1024 * 1024) throw new Error('El APK supera el límite de descarga configurado.')
  const name = `${item.name.replace(/[^\w.-]+/g, '-').slice(0, 60)}.apk`
  await ctx.reply(`⬇️ *${item.name}*\n━━━━━━━━━━━━━━\nFuente oficial: *${item.source}*\n📏 Preparando ${Math.round(data.length / 1024 / 1024)} MB…`)
  await ctx.socket.sendMessage(ctx.chatId, { document: data, mimetype: 'application/vnd.android.package-archive', fileName: name, caption: [`📦 *${item.name}*`, `🌐 Fuente: ${item.source}`, item.version ? `🔄 Versión: ${item.version}` : '', `📏 Peso: ${(data.length / 1024 / 1024).toFixed(1)} MB`, item.pageUrl].filter(Boolean).join('\n') }, { quoted: ctx.message })
}

/** Non-conflicting legacy commands only — no uptodown/liteapks/happymod names. */
export const officialApkV7Commands: BotCommand[] = [
  {
    name: 'apkofficialv7',
    aliases: ['officialsearchv7'],
    category: 'downloads',
    description: 'Legacy: busca APKs en Uptodown (prefer .apk / .uptodown).',
    usage: 'apkofficialv7 <aplicación>',
    handler: (ctx) => searchCommand(ctx, 'Uptodown'),
  },
  {
    name: 'apkofficialdl',
    aliases: [],
    category: 'downloads',
    description: 'Legacy: descarga token v7 (prefer .officialapkdl / .happymoddl).',
    usage: 'apkofficialdl <token>',
    handler: downloadCommand,
  },
]
