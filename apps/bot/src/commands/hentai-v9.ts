import * as cheerio from 'cheerio'
import type { BotCommand, CommandContext } from '../types.js'
import { config } from '../config.js'
import { settings } from '../core/settings.js'
import { economy } from '../services/economy.js'
import { downloadHentai, exploreHentai, getHentaiItem, searchHentai, type HentaiItem } from '../services/hentai.js'
import { sendCarousel, type InteractiveButton } from '../services/interactive.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

const PAGE_SIZE = 8
const PROHIBITED = /\b(child|children|underage|minor|preteen|pre-teen|loli|shota|niñ[oa]s?|menor(?:es)?)\b/i
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131 Safari/131 Safari/537.36 GhostNexoraBot/1.4'

function assertAdultAccess(ctx: CommandContext) {
  if (ctx.isGroup) {
    if (!economy.getGroupPolicy(ctx.chatId).adultAllowed) throw new Error(`Este grupo no está autorizado para el módulo 18+. Un administrador puede usar ${ctx.prefix}adultmode on.`)
  } else if (!settings.adultEnabled || !config.adultPrivateEnabled) throw new Error('El módulo 18+ está desactivado en chats privados.')
  if (!economy.hasEntitlement(ctx.sender, 'adult_consent')) throw new Error(`Antes debes confirmar que eres mayor de edad con ${ctx.prefix}adult18 accept.`)
}

function page(value?: string) { const n = Number(value ?? 1); return Number.isInteger(n) && n > 0 ? Math.min(50, n) : 1 }
function pack(value: string) { return Buffer.from(value, 'utf8').toString('base64url') }
function unpack(value: string) { return Buffer.from(value, 'base64url').toString('utf8') }

async function enrich(item: HentaiItem): Promise<HentaiItem> {
  if (item.thumbnail) return item
  try {
    const r = await fetch(item.url, { redirect: 'follow', headers: { 'user-agent': UA, accept: 'text/html,*/*' }, signal: AbortSignal.timeout(10_000) })
    if (!r.ok) return item
    const html = await r.text()
    if (PROHIBITED.test(html.slice(0, 200_000))) return item
    const $ = cheerio.load(html)
    const image = $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content')
    return image ? { ...item, thumbnail: new URL(image, r.url).toString() } : item
  } catch { return item }
}

async function show(ctx: CommandContext, mode: 'hot' | 'new' | 'search', currentPage: number, query?: string) {
  const result = mode === 'search' ? await searchHentai(query ?? '', currentPage, PAGE_SIZE) : await exploreHentai(mode, currentPage, PAGE_SIZE)
  if (!result.items.length) throw new Error('No se encontraron resultados públicos en esta página.')
  const items = await Promise.all(result.items.slice(0, PAGE_SIZE).map(enrich))
  const cards = items.map((item, i) => {
    const buttons: InteractiveButton[] = [
      { type: 'reply', text: 'Descargar', id: `${ctx.prefix}hentai dl ${item.token}` },
      { type: 'url', text: 'Abrir', url: item.url },
    ]
    if (i === items.length - 1 && items.length === PAGE_SIZE) buttons.push({ type: 'reply', text: 'Siguiente', id: mode === 'search' ? `${ctx.prefix}hentai search64 ${currentPage + 1} ${pack(query ?? '')}` : `${ctx.prefix}hentai ${mode} ${currentPage + 1}` })
    return { title: `#${i + 1} · ${item.title}`.slice(0, 80), body: [item.source ? `Fuente: ${item.source}` : '', item.duration ? `Duración: ${item.duration}` : '', `Página ${currentPage}`].filter(Boolean).join(' · ').slice(0, 120), imageUrl: item.thumbnail, footer: 'Hentai · Ghost Nexora Bot', buttons }
  })
  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, { title: `HENTAI · ${mode === 'search' ? 'BÚSQUEDA' : mode.toUpperCase()} · ${currentPage}`, body: mode === 'search' ? `Resultados para: ${query}` : `Explorar ${mode === 'hot' ? 'HOT' : 'NEW'}`, footer: '8 resultados por página', cards })
}

async function editStatus(ctx: CommandContext, status: unknown, text: string) {
  const key = (status as { key?: unknown } | null)?.key
  if (!key) return
  await ctx.socket.sendMessage(ctx.chatId, { text }, { edit: key } as unknown as never).catch(() => undefined)
}

async function download(ctx: CommandContext, value: string) {
  let title = 'Hentai'
  try { title = getHentaiItem(value).title } catch { /* URL directa */ }
  const status = await ctx.reply(`DESCARGANDO · ${title}`)
  try {
    const result = await downloadHentai(value)
    await ctx.socket.sendMessage(ctx.chatId, { video: { url: result.filePath }, mimetype: 'video/mp4', caption: `HENTAI\n${result.title}\n${(result.size / 1024 / 1024).toFixed(1)} MB` }, { quoted: ctx.message })
    recordSubbotDownload(ctx.instanceId, result.size)
    await editStatus(ctx, status, `ENVIADO A WHATSAPP\n${result.title}\n${(result.size / 1024 / 1024).toFixed(1)} MB`)
    await result.cleanup()
  } catch {
    await editStatus(ctx, status, `NO SE PUDO DESCARGAR\n${title}\nLa descarga no pudo completarse. Inténtalo nuevamente.`)
  }
}

export const hentaiV9Commands: BotCommand[] = [{
  name: 'hentai', aliases: ['h', 'hanime'], category: 'adult', description: 'Busca y descarga contenido hentai público con carrusel y navegación integrada.', usage: 'hentai [hot|new|search|dl] ...',
  async handler(ctx) {
    assertAdultAccess(ctx)
    const action = (ctx.args[0] ?? 'hot').toLowerCase()
    if (action === 'hot' || action === 'explore') { await show(ctx, 'hot', page(ctx.args[1])); return }
    if (action === 'new') { await show(ctx, 'new', page(ctx.args[1])); return }
    if (action === 'search') { const query = ctx.args.slice(1).join(' ').trim(); if (!query) throw new Error(`Uso: ${ctx.prefix}hentai search <texto>`); await show(ctx, 'search', 1, query); return }
    if (action === 'search64') { await show(ctx, 'search', page(ctx.args[1]), unpack(ctx.args[2] ?? '')); return }
    if (action === 'dl' || action === 'download') { const value = ctx.args[1]; if (!value) throw new Error(`Uso: ${ctx.prefix}hentai dl <token|url>`); await download(ctx, value); return }
    const raw = ctx.argText.trim(); if (/^https?:\/\//i.test(raw)) { await download(ctx, raw); return }
    await show(ctx, 'search', 1, raw || 'hentai')
  },
}]
