import * as cheerio from 'cheerio'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import os from 'node:os'
import path from 'node:path'
import type { BotCommand, CommandContext } from '../types.js'
import { sendCarousel } from '../services/interactive.js'
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
  summary?: string
}

const UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 GhostNexoraBot/1.3'
const CACHE_TTL_MS = 30 * 60_000
const MAX_RESOLVE_DEPTH = 5

const cfg: Record<Source, { host: RegExp; queries: (q: string) => string[] }> = {
  Uptodown: {
    host: /(^|\.)uptodown\.com$/i,
    queries: (q) => [
      `https://en.uptodown.com/android/search?query=${encodeURIComponent(q)}`,
      `https://en.uptodown.com/android/search/${encodeURIComponent(q)}`,
      `https://www.uptodown.com/android/search?query=${encodeURIComponent(q)}`,
    ],
  },
  LiteAPKS: {
    host: /(^|\.)liteapks\.com$/i,
    queries: (q) => [
      `https://liteapks.com/?s=${encodeURIComponent(q)}`,
      `https://liteapks.com/search/${encodeURIComponent(q)}`,
    ],
  },
}

type Cached = { item: Item; expiresAt: number }
const selected = new Map<string, Cached>()

function absolute(base: string, value?: string) {
  if (!value) return undefined
  try {
    const u = new URL(value, base)
    return /^https?:$/i.test(u.protocol) ? u.toString() : undefined
  } catch {
    return undefined
  }
}

function official(url: string, source: Source) {
  try {
    return cfg[source].host.test(new URL(url).hostname) ? url : undefined
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
    ) {
      return undefined
    }
    return url.toString()
  } catch {
    return undefined
  }
}

function token(source: Source, url: string) {
  const prefix = source === 'Uptodown' ? 'ud' : 'la'
  return `${prefix}_${createHash('sha256').update(`${source}:${url}`).digest('hex').slice(0, 16)}`
}

function remember(item: Item) {
  selected.set(item.token, { item, expiresAt: Date.now() + CACHE_TTL_MS })
  return item
}

function getSelected(tokenValue: string): Item {
  const entry = selected.get(tokenValue.trim())
  if (!entry) {
    throw new Error(
      `Ese resultado expiró o no existe. Vuelve a buscar con ${tokenValue.startsWith('la_') ? '.liteapks' : '.uptodown'} / .apk <aplicación>.`,
    )
  }
  if (entry.expiresAt <= Date.now()) {
    selected.delete(tokenValue.trim())
    throw new Error('Ese resultado expiró. Vuelve a ejecutar la búsqueda.')
  }
  return entry.item
}

async function getHtml(url: string, timeoutMs = 15_000) {
  const r = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': UA,
      accept: 'text/html,application/xhtml+xml,*/*',
      'accept-language': 'es-MX,es;q=0.9,en;q=0.7',
    },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return { html: await r.text(), finalUrl: r.url }
}

function parse($: cheerio.CheerioAPI, source: Source, base: string, _query: string) {
  const result: Item[] = []
  const seen = new Set<string>()

  $('a[href]').each((_i, el) => {
    if (result.length >= 10) return false
    const href = official(absolute(base, $(el).attr('href')) || '', source)
    if (!href || seen.has(href)) return

    const text = ($(el).attr('title') || $(el).text() || '').replace(/\s+/g, ' ').trim()
    if (text.length < 2) return
    if (/^(home|inicio|search|login|sign|about|contact|privacy)/i.test(text)) return

    const p = new URL(href).pathname.toLowerCase()
    const appLike =
      source === 'Uptodown'
        ? /\/android\//.test(p) && !/search/.test(p)
        : /\/(?:app|games|apps?)\b|\.html?$/.test(p) && !/\/(?:about|contact|privacy|terms)/.test(p)
    if (!appLike) return

    seen.add(href)
    const root = $(el).closest('article,li,.card,.item,.app,.post,div').first()
    const summary = root.text().replace(/\s+/g, ' ').trim().slice(0, 220)
    const icon = absolute(
      base,
      root.find('img').first().attr('data-src')
        || root.find('img').first().attr('data-lazy-src')
        || root.find('img').first().attr('src'),
    )
    const version = /\bv(?:ersion|ersión)?\s*[:.]?\s*([0-9][\w.+-]*)/i.exec(summary)?.[1]
    result.push(
      remember({
        token: token(source, href),
        source,
        name: text.replace(/\s+(APK|Mod APK|download|Descargar)$/i, '').slice(0, 100),
        url: href,
        icon: publicHttpUrl(icon),
        version,
        summary,
      }),
    )
  })

  return result
}

async function search(source: Source, q: string) {
  for (const endpoint of cfg[source].queries(q)) {
    try {
      const page = await getHtml(endpoint)
      const items = parse(cheerio.load(page.html), source, page.finalUrl, q)
      if (items.length) return items
    } catch {
      // best-effort por endpoint
    }
  }
  return []
}

function isDirectApkUrl(url: string) {
  try {
    const parsed = new URL(url)
    const pathAndQuery = `${parsed.pathname}${parsed.search}`
    if (/\.apk(?:$|[?#])/i.test(pathAndQuery)) return true
    const file = parsed.searchParams.get('file') || parsed.searchParams.get('url') || parsed.searchParams.get('path')
    return Boolean(file && /\.apk(?:$|[?#])/i.test(file))
  } catch {
    return false
  }
}

async function resolveOfficialApk(item: Item): Promise<string> {
  const queue: string[] = [item.url]
  const visited = new Set<string>()

  for (let depth = 0; depth < MAX_RESOLVE_DEPTH && queue.length; depth += 1) {
    const current = publicHttpUrl(queue.shift())
    if (!current || visited.has(current)) continue
    visited.add(current)

    if (isDirectApkUrl(current) && official(current, item.source)) return current

    try {
      const response = await fetch(current, {
        redirect: 'follow',
        headers: {
          'user-agent': UA,
          accept: 'text/html,application/xhtml+xml,application/vnd.android.package-archive,*/*',
          referer: item.url,
        },
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) continue

      const finalUrl = publicHttpUrl(response.url) || current
      const disposition = response.headers.get('content-disposition') ?? ''
      const type = response.headers.get('content-type') ?? ''

      if (/\.apk(?:["'; ]|$)/i.test(disposition) || /android\.package-archive/i.test(type)) {
        return finalUrl
      }
      if (isDirectApkUrl(finalUrl)) return finalUrl
      if (!/html|text\//i.test(type)) continue

      const html = await response.text()
      const $ = cheerio.load(html)
      let direct: string | undefined
      const pageCandidates: string[] = []

      $('a[href], button[data-href], [data-url], [data-download]').each((_i, el) => {
        if (direct) return false
        const raw =
          $(el).attr('href')
          || $(el).attr('data-href')
          || $(el).attr('data-url')
          || $(el).attr('data-download')
        const href = absolute(finalUrl, raw)
        if (!href) return
        const label = ($(el).text() || $(el).attr('title') || $(el).attr('aria-label') || '').replace(/\s+/g, ' ').trim()

        if (isDirectApkUrl(href)) {
          direct = href
          return false
        }
        if (
          /descargar|download|get\s*apk|download\s*now|bajar/i.test(label)
          || /\/download|\/descarga|\/get|\/apk/i.test(href)
        ) {
          if (official(href, item.source) || isDirectApkUrl(href)) pageCandidates.push(href)
        }
      })

      if (!direct) {
        const scriptText = $('script').map((_i, el) => $(el).html() || '').get().join('\n')
        const apkMatch = scriptText.match(/https?:\/\/[^\s"'<>]+\.apk(?:\?[^\s"'<>]*)?/i)
        if (apkMatch?.[0] && publicHttpUrl(apkMatch[0])) direct = apkMatch[0]
      }

      if (direct) return direct
      for (const candidate of pageCandidates.slice(0, 6)) {
        if (!visited.has(candidate)) queue.push(candidate)
      }
    } catch {
      // siguiente candidato
    }
  }

  throw new Error(
    `${item.source} no expuso un enlace APK directo recuperable. Abre la fuente desde el carrusel e intenta descargar manualmente.`,
  )
}

function safeFileBase(value: string) {
  return (
    value
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9._ -]+/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 80) || 'android-app'
  )
}

function isValidApkHeader(header: Buffer) {
  return header[0] === 0x50 && header[1] === 0x4b && [0x03, 0x05, 0x07].includes(header[2] ?? -1)
}

function bytes(value?: number) {
  if (!value || value <= 0) return undefined
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`
  return `${(value / 1024 ** 2).toFixed(1)} MB`
}

async function downloadOfficialApk(item: Item) {
  const direct = await resolveOfficialApk(item)
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-official-apk-'))
  const fileName = `${safeFileBase(item.name)}-${safeFileBase(item.version || 'latest')}.apk`
  const filePath = path.join(dir, fileName)

  try {
    const response = await fetch(direct, {
      redirect: 'follow',
      headers: {
        'user-agent': UA,
        accept: 'application/vnd.android.package-archive,application/octet-stream,*/*',
        referer: item.url,
      },
      signal: AbortSignal.timeout(15 * 60_000),
    })

    if (!response.ok || !response.body) {
      throw new Error(`${item.source} respondió HTTP ${response.status} al descargar.`)
    }

    const declared = Number(response.headers.get('content-length') ?? 0)
    if (declared > 0 && declared > config.maxDownloadBytes) {
      throw new Error(`La APK supera el límite configurado de ${config.maxDownloadMb} MB.`)
    }

    let received = 0
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length
        if (received > config.maxDownloadBytes) {
          callback(new Error(`La APK supera el límite configurado de ${config.maxDownloadMb} MB.`))
        } else {
          callback(null, chunk)
        }
      },
    })

    await pipeline(response.body as any, limiter, createWriteStream(filePath))

    const file = await stat(filePath)
    if (file.size < 1024) throw new Error(`${item.source} devolvió un archivo demasiado pequeño.`)

    const header = await readFile(filePath).then((buf) => buf.subarray(0, 4))
    if (!isValidApkHeader(header)) {
      throw new Error(`${item.source} no devolvió un APK/ZIP válido (posible página de error o captcha).`)
    }

    return {
      filePath,
      fileName,
      size: file.size,
      cleanup: () => rm(dir, { recursive: true, force: true }),
    }
  } catch (error) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

async function searchSource(ctx: CommandContext, source: Source, query: string) {
  const text = query.trim()
  if (text.length < 2) throw new Error(`Uso: ${ctx.prefix}${source.toLowerCase()} <aplicación>`)

  await ctx.reply(
    [
      `📦 *${source.toUpperCase()} · BUSCANDO*`,
      '━━━━━━━━━━━━━━',
      `🔎 ${text}`,
      '⏳ Consultando la web oficial...',
    ].join('\n'),
  )

  const items = await search(source, text)
  if (!items.length) throw new Error(`No encontré resultados en ${source}.`)

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: `📦 ${source.toUpperCase()} · APK`,
    body: `Resultados oficiales para *${text}*`,
    footer: `${source} · Ghost Nexora Bot`,
    cards: items.map((item, index) => ({
      title: `#${index + 1} · ${item.name}`.slice(0, 120),
      body: [
        `🌐 Fuente » ${item.source}`,
        item.version ? `🔄 Versión » ${item.version}` : '',
        item.summary || '',
        '✅ Página oficial · verifica antes de instalar',
      ]
        .filter(Boolean)
        .join('\n'),
      imageUrl: item.icon,
      buttons: [
        { type: 'reply' as const, text: '⬇️ Descargar', id: `${ctx.prefix}officialapkdl ${item.token}` },
        { type: 'url' as const, text: '🌐 Abrir', url: item.url },
      ],
    })),
  })
}

async function apk(ctx: CommandContext) {
  const query = ctx.argText.trim()
  if (query.length < 2) throw new Error(`Uso: ${ctx.prefix}apk <aplicación>`)

  await ctx.reply(
    [
      '📦 *ANDROID · FUENTES OFICIALES*',
      '━━━━━━━━━━━━━━',
      `🔎 ${query}`,
      '⏳ Consultando Uptodown y LiteAPKS...',
      `💡 Mods: ${ctx.prefix}happymod <app> · Aptoide/otros: ${ctx.prefix}aptoide <app>`,
    ].join('\n'),
  )

  const sources: Source[] = ['Uptodown', 'LiteAPKS']
  const groups = await Promise.all(
    sources.map(async (source) => ({ source, items: await search(source, query) })),
  )
  const all = groups.flatMap((g) => g.items).slice(0, 12)
  if (!all.length) {
    throw new Error(
      `No encontré resultados en Uptodown/LiteAPKS. Prueba ${ctx.prefix}happymod <app> para mods o ${ctx.prefix}aptoide <app>.`,
    )
  }

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '📦 ANDROID · FUENTES OFICIALES',
    body: `Resultados para *${query}*\nUptodown · LiteAPKS · HappyMod vía ${ctx.prefix}happymod`,
    footer: 'Verifica el origen antes de instalar APKs externas.',
    cards: all.map((item, index) => ({
      title: `#${index + 1} · ${item.source} · ${item.name}`.slice(0, 120),
      body: [
        item.version ? `🔄 ${item.version}` : '',
        item.summary || '',
        '✅ Fuente oficial',
      ]
        .filter(Boolean)
        .join('\n'),
      imageUrl: item.icon,
      buttons: [
        { type: 'reply' as const, text: '⬇️ Descargar', id: `${ctx.prefix}officialapkdl ${item.token}` },
        { type: 'url' as const, text: '🌐 Fuente', url: item.url },
      ],
    })),
  })
}

async function info(ctx: CommandContext) {
  const item = getSelected(ctx.args[0] || '')
  await ctx.reply(
    [
      `📦 *${item.name}*`,
      '━━━━━━━━━━━━━━',
      `Fuente: *${item.source}*`,
      item.version ? `Versión: ${item.version}` : '',
      item.summary || '',
      '',
      item.url,
      '',
      `Descargar: ${ctx.prefix}officialapkdl ${item.token}`,
    ]
      .filter(Boolean)
      .join('\n'),
  )
}

async function download(ctx: CommandContext) {
  const item = getSelected(ctx.args[0] || '')

  await ctx.reply(
    [
      '📦 *DESCARGA OFICIAL INICIADA*',
      '━━━━━━━━━━━━━━',
      `📱 ${item.name}`,
      `🌐 Fuente » ${item.source}`,
      item.version ? `🔄 Versión » ${item.version}` : '',
      '⏳ Resolviendo enlace y validando el archivo APK...',
    ]
      .filter(Boolean)
      .join('\n'),
  )

  const result = await downloadOfficialApk(item)
  try {
    await ctx.socket.sendMessage(
      ctx.chatId,
      {
        document: { url: result.filePath },
        mimetype: 'application/vnd.android.package-archive',
        fileName: result.fileName,
        caption: [
          `📦 *${item.name}*`,
          `🌐 Fuente oficial » ${item.source}`,
          item.version ? `🔄 Versión » ${item.version}` : '',
          `📏 Peso » ${bytes(result.size)}`,
          '',
          '✅ Validado como APK/ZIP',
          '',
          '👻 Ghost Nexora Bot',
        ]
          .filter(Boolean)
          .join('\n'),
      },
      { quoted: ctx.message },
    )
    recordSubbotDownload(ctx.instanceId, result.size)
  } finally {
    await result.cleanup()
  }
}

export const officialApkV8Commands: BotCommand[] = [
  {
    name: 'apk',
    aliases: ['apks', 'androidofficial'],
    category: 'downloads',
    description: 'Busca APKs en Uptodown y LiteAPKS (fuentes oficiales). Para mods usa .happymod; para Aptoide .aptoide.',
    usage: 'apk <aplicación>',
    handler: apk,
  },
  {
    name: 'uptodown',
    aliases: ['uptodownapk'],
    category: 'downloads',
    description: 'Busca directamente en Uptodown.',
    usage: 'uptodown <aplicación>',
    handler: (ctx) => searchSource(ctx, 'Uptodown', ctx.argText.trim()),
  },
  {
    name: 'liteapks',
    aliases: ['liteapk'],
    category: 'downloads',
    description: 'Busca directamente en LiteAPKS.',
    usage: 'liteapks <aplicación>',
    handler: (ctx) => searchSource(ctx, 'LiteAPKS', ctx.argText.trim()),
  },
  {
    name: 'officialapkdl',
    aliases: ['apkofficialdl', 'uddl', 'ladl'],
    category: 'downloads',
    description: 'Descarga una APK seleccionada desde Uptodown o LiteAPKS.',
    usage: 'officialapkdl <token>',
    handler: download,
  },
  {
    name: 'officialapkinfo',
    aliases: ['udinfo', 'lainfo'],
    category: 'downloads',
    description: 'Muestra la información de una APK de Uptodown/LiteAPKS.',
    usage: 'officialapkinfo <token>',
    handler: info,
  },
]
