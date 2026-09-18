import type { BotCommand, CommandContext } from '../types.js'
import { sendCarousel, sendInteractiveCard } from '../services/interactive.js'
import {
  downloadHappyModApk,
  getHappyModItem,
  searchHappyMod,
  type HappyModItem,
} from '../services/happymod.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

const PAGE_SIZE = 8

function requireQuery(ctx: CommandContext) {
  const query = ctx.argText.trim()
  if (query.length < 2) throw new Error(`Uso: ${ctx.prefix}happymod <aplicación>`)
  return query.slice(0, 120)
}

function bytes(value?: number) {
  if (!value || value <= 0) return undefined
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`
  return `${(value / 1024 ** 2).toFixed(1)} MB`
}

function encodeQuery(query: string) {
  return Buffer.from(query, 'utf8').toString('base64url')
}

function decodeQuery(value: string) {
  try {
    const query = Buffer.from(value, 'base64url').toString('utf8').trim()
    if (query.length < 2 || query.length > 120) throw new Error('invalid query')
    return query
  } catch {
    throw new Error('La búsqueda expiró o no es válida. Ejecuta .happymod <aplicación> otra vez.')
  }
}

function happyBody(item: HappyModItem) {
  return [
    item.version ? `Versión: ${item.version}` : '',
    item.sizeLabel ? `Peso: ${item.sizeLabel}` : '',
    item.summary?.slice(0, 90) ?? '',
  ].filter(Boolean).join('\n').slice(0, 130) || 'HappyMod'
}

async function sendMoreButton(ctx: CommandContext, query: string, nextOffset: number, total: number) {
  if (nextOffset >= total) return
  await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
    title: '📦 HappyMod · más resultados',
    body: `Hay ${total - nextOffset} resultado${total - nextOffset === 1 ? '' : 's'} más de “${query}”.`,
    footer: `Mostrados ${nextOffset} de ${total}`,
    buttons: [{
      type: 'reply',
      text: 'Ver más resultados',
      id: `${ctx.prefix}happymodmore ${encodeQuery(query)} ${nextOffset}`,
    }],
  })
}

async function showPage(ctx: CommandContext, query: string, offset = 0) {
  const results = await searchHappyMod(query)
  if (!results.length) throw new Error(`HappyMod no encontró resultados para “${query}”.`)

  const safeOffset = Math.max(0, Math.trunc(offset))
  const page = results.slice(safeOffset, safeOffset + PAGE_SIZE)
  if (!page.length) {
    await ctx.reply(`📦 *HappyMod*\nNo hay más resultados para “${query}”.`)
    return
  }

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '📦 HAPPYMOD · BÚSQUEDA',
    body: `Resultados ${safeOffset + 1}-${safeOffset + page.length} de ${results.length} para: ${query}\nDesliza y toca Seleccionar.`,
    footer: 'Ghost Nexora Bot · HappyMod',
    cards: page.map((item, index) => ({
      title: `#${safeOffset + index + 1} · ${item.name}`.slice(0, 80),
      body: happyBody(item),
      imageUrl: item.icon,
      buttons: [{ type: 'reply', text: 'Seleccionar', id: `${ctx.prefix}happymodselect ${item.token}` }],
    })),
  })

  await sendMoreButton(ctx, query, safeOffset + page.length, results.length)
}

async function selectHappyMod(ctx: CommandContext) {
  const token = ctx.args[0] ?? ''
  if (!token) throw new Error(`Usa primero ${ctx.prefix}happymod <aplicación>.`)
  const item = getHappyModItem(token)
  await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
    title: `📦 HappyMod · ${item.name}`.slice(0, 80),
    body: [
      happyBody(item),
      'APK modificada: revisa permisos y procedencia antes de instalar.',
    ].filter(Boolean).join('\n'),
    footer: 'Ghost Nexora Bot · HappyMod',
    imageUrl: item.icon,
    buttons: [
      { type: 'reply', text: '⬇️ Descargar', id: `${ctx.prefix}happymoddl ${item.token}` },
      ...(item.url ? [{ type: 'url' as const, text: '🌐 Ver ficha', url: item.url }] : []),
    ],
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
      caption: [
        `📦 *${result.name}*`,
        result.version ? `Versión: ${result.version}` : '',
        `Peso: ${bytes(result.size)}`,
      ].filter(Boolean).join('\n'),
    }, { quoted: ctx.message })
    recordSubbotDownload(ctx.instanceId, result.size)
  } finally {
    await result.cleanup()
  }
}

export const happyModV19Commands: BotCommand[] = [
  {
    name: 'happymod',
    aliases: ['hm', 'hmod'],
    category: 'downloads',
    description: 'Busca aplicaciones exclusivamente en HappyMod.',
    usage: 'happymod <aplicación>',
    handler: (ctx) => showPage(ctx, requireQuery(ctx), 0),
  },
  {
    name: 'happymodmore',
    aliases: ['hmmore'],
    category: 'downloads',
    description: 'Muestra la siguiente página de resultados de HappyMod.',
    usage: 'happymodmore <búsqueda> <offset>',
    handler: (ctx) => {
      const query = decodeQuery(ctx.args[0] ?? '')
      const offset = Number(ctx.args[1] ?? PAGE_SIZE)
      if (!Number.isFinite(offset) || offset < 0) throw new Error('Página de HappyMod inválida.')
      return showPage(ctx, query, offset)
    },
  },
  {
    name: 'happymodselect',
    aliases: [],
    category: 'downloads',
    description: 'Selecciona un resultado de HappyMod.',
    handler: selectHappyMod,
  },
  {
    name: 'happymoddl',
    aliases: ['hmdl'],
    category: 'downloads',
    description: 'Descarga un resultado seleccionado de HappyMod.',
    handler: downloadHappyMod,
  },
]
