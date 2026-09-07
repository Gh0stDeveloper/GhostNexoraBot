import { createHash } from 'node:crypto'
import type { BotCommand, CommandContext } from '../types.js'
import { config } from '../config.js'
import { settings } from '../core/settings.js'
import { economy } from '../services/economy.js'
import { downloadAdult, searchAdult, type AdultProvider, type AdultSearchResult } from '../services/adult.js'
import { sendCarousel, sendInteractiveCard } from '../services/interactive.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

const CACHE_TTL_MS = 25 * 60_000
const MAX_RESULTS = 8

type CachedResult = {
  url: string
  title: string
  provider: AdultProvider
  thumbnail?: string
  expiresAt: number
}

const resultCache = new Map<string, CachedResult>()

function normalize(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function terms(value: string) {
  return normalize(value).split(' ').filter((part) => part.length >= 2)
}

function relevant(query: string, result: AdultSearchResult) {
  const wanted = terms(query)
  if (!wanted.length) return true
  const haystack = normalize(`${result.title} ${result.url}`)
  return wanted.every((term) => haystack.includes(term))
}

function score(query: string, result: AdultSearchResult) {
  const q = normalize(query)
  const title = normalize(result.title)
  let value = 0
  if (title === q) value += 200
  if (title.startsWith(q)) value += 100
  if (title.includes(q)) value += 70
  for (const term of terms(query)) {
    if (title.startsWith(term)) value += 18
    else if (title.includes(term)) value += 12
  }
  return value
}

function providerLabel(provider: AdultProvider) {
  if (provider === 'xvideos') return 'XVIDEOS'
  if (provider === 'xnxx') return 'XNXX'
  return 'PORNHUB'
}

function tokenFor(provider: AdultProvider, url: string) {
  return `ad_${createHash('sha256').update(`${provider}:${url}`).digest('hex').slice(0, 16)}`
}

function remember(provider: AdultProvider, item: AdultSearchResult) {
  const token = tokenFor(provider, item.url)
  resultCache.set(token, {
    url: item.url,
    title: item.title,
    provider,
    thumbnail: item.thumbnail,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })
  return token
}

function getCached(token: string) {
  const item = resultCache.get(token.trim())
  if (!item || item.expiresAt <= Date.now()) {
    resultCache.delete(token.trim())
    throw new Error('Ese resultado expiró. Vuelve a ejecutar la búsqueda 18+.')
  }
  return item
}

function assertAdultAccess(ctx: CommandContext) {
  if (ctx.chatId.endsWith('@g.us')) {
    if (!economy.getGroupPolicy(ctx.chatId).adultAllowed) {
      throw new Error(`El módulo 18+ está desactivado en este grupo. Un administrador puede habilitarlo con ${ctx.prefix}adultmode on.`)
    }
  } else {
    if (!settings.adultEnabled || !config.adultPrivateEnabled) throw new Error('El módulo 18+ está desactivado en chats privados.')
  }
  if (!economy.hasEntitlement(ctx.sender, 'adult_consent')) {
    throw new Error(`Antes de usar el módulo debes confirmar que eres mayor de edad con ${ctx.prefix}adult18 accept.`)
  }
}

function providerFromUrl(input: string): AdultProvider | undefined {
  try {
    const host = new URL(input).hostname.toLowerCase()
    if (host === 'xvideos.com' || host.endsWith('.xvideos.com')) return 'xvideos'
    if (host === 'xnxx.com' || host.endsWith('.xnxx.com')) return 'xnxx'
    if (host === 'pornhub.com' || host.endsWith('.pornhub.com')) return 'pornhub'
    return undefined
  } catch {
    return undefined
  }
}

async function sendVideo(ctx: CommandContext, provider: AdultProvider, url: string, title?: string) {
  const actual = providerFromUrl(url)
  if (!actual) throw new Error('La URL no pertenece a XVideos, XNXX o Pornhub.')
  if (actual !== provider) throw new Error(`Ese enlace pertenece a ${providerLabel(actual)}. Usa ${ctx.prefix}${actual} <url>.`)
  await ctx.reply(`⬇️ *${providerLabel(provider)}*\nPreparando el video…`)
  const result = await downloadAdult(url)
  try {
    const caption = [
      `🔞 *${providerLabel(provider)}*`,
      title ? `🎬 ${title.slice(0, 180)}` : '',
      `📦 ${(result.size / 1024 / 1024).toFixed(1)} MB`,
      '👻 Ghost Nexora Bot',
    ].filter(Boolean).join('\n')
    const sent = await ctx.socket.sendMessage(ctx.chatId, {
      video: { url: result.filePath },
      mimetype: 'video/mp4',
      caption,
    }, { quoted: ctx.message }).catch(() => null)
    if (!sent) {
      await ctx.socket.sendMessage(ctx.chatId, {
        document: { url: result.filePath },
        mimetype: 'video/mp4',
        fileName: result.fileName,
        caption,
      }, { quoted: ctx.message })
    }
    recordSubbotDownload(ctx.instanceId, result.size)
  } finally {
    await result.cleanup()
  }
}

async function searchProvider(ctx: CommandContext, provider: AdultProvider, query: string) {
  const raw = await searchAdult(provider, query, 15)
  const results = raw
    .filter((item) => relevant(query, item))
    .sort((a, b) => score(query, b) - score(query, a))
    .slice(0, MAX_RESULTS)
  if (!results.length) throw new Error(`No encontré resultados realmente relacionados con “${query}” en ${providerLabel(provider)}.`)

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: `🔞 ${providerLabel(provider)} · BÚSQUEDA`,
    body: `Resultados relacionados con: ${query}\nDesliza y toca Seleccionar.`,
    footer: `Ghost Nexora Bot · ${providerLabel(provider)}`,
    cards: results.map((item, index) => {
      const token = remember(provider, item)
      return {
        title: `#${index + 1} · ${item.title}`.slice(0, 78),
        body: providerLabel(provider),
        imageUrl: item.thumbnail,
        buttons: [{ type: 'reply' as const, text: 'Seleccionar', id: `${ctx.prefix}adultselect ${token}` }],
      }
    }),
  })
}

async function selectResult(ctx: CommandContext) {
  assertAdultAccess(ctx)
  const token = ctx.args[0] ?? ''
  if (!token) throw new Error('Selecciona primero un resultado de la búsqueda.')
  const item = getCached(token)
  await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
    title: `🔞 ${providerLabel(item.provider)}`,
    body: item.title.slice(0, 260),
    footer: 'Ghost Nexora Bot',
    imageUrl: item.thumbnail,
    buttons: [{ type: 'reply', text: '⬇️ Descargar', id: `${ctx.prefix}adultdl ${token}` }],
  })
}

async function searchOrDownload(ctx: CommandContext, provider: AdultProvider) {
  assertAdultAccess(ctx)
  const input = ctx.argText.trim()
  if (!input) throw new Error(`Uso: ${ctx.prefix}${provider} <búsqueda|url>`)
  if (/^https?:\/\//i.test(input)) {
    await sendVideo(ctx, provider, input)
    return
  }
  await searchProvider(ctx, provider, input.slice(0, 160))
}

async function adultDownload(ctx: CommandContext) {
  assertAdultAccess(ctx)
  const value = ctx.args[0] ?? ''
  if (!value) throw new Error('Selecciona un resultado o indica una URL soportada.')
  if (/^ad_[a-f0-9]{16}$/i.test(value)) {
    const item = getCached(value)
    await sendVideo(ctx, item.provider, item.url, item.title)
    return
  }
  const provider = providerFromUrl(value)
  if (!provider) throw new Error('La URL no pertenece a XVideos, XNXX o Pornhub.')
  await sendVideo(ctx, provider, value)
}

export const adultDownloadV15Commands: BotCommand[] = [
  { name: 'xvideos', aliases: ['xv'], category: 'adult', description: 'Busca o descarga contenido público de XVideos con carrusel compatible.', handler: (ctx) => searchOrDownload(ctx, 'xvideos') },
  { name: 'xnxx', aliases: ['xn'], category: 'adult', description: 'Busca o descarga contenido público de XNXX con carrusel compatible.', handler: (ctx) => searchOrDownload(ctx, 'xnxx') },
  { name: 'pornhub', aliases: ['ph'], category: 'adult', description: 'Busca o descarga contenido público de Pornhub con carrusel compatible.', handler: (ctx) => searchOrDownload(ctx, 'pornhub') },
  { name: 'adultselect', aliases: ['18select'], category: 'adult', description: 'Selecciona un resultado 18+ antes de descargar.', handler: selectResult },
  { name: 'adultdl', aliases: ['18dl'], category: 'adult', description: 'Descarga un resultado 18+ seleccionado.', usage: 'adultdl <token|url>', handler: adultDownload },
]
