import type { BotCommand, CommandContext } from '../types.js'
import { config } from '../config.js'
import { settings } from '../core/settings.js'
import { economy } from '../services/economy.js'
import {
  downloadHentai,
  exploreHentai,
  getHentaiItem,
  searchHentai,
  type HentaiItem,
} from '../services/hentai.js'
import { sendCarousel, sendInteractiveCard, type InteractiveButton } from '../services/interactive.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

function assertAdultAccess(ctx: CommandContext) {
  if (ctx.isGroup) {
    if (!economy.getGroupPolicy(ctx.chatId).adultAllowed) {
      throw new Error(
        `Este grupo no está autorizado para el módulo 18+. Un administrador puede usar ${ctx.prefix}adultmode on.`,
      )
    }
  } else {
    if (!settings.adultEnabled || !config.adultPrivateEnabled) {
      throw new Error('El módulo 18+ está desactivado en chats privados.')
    }
  }
  if (!economy.hasEntitlement(ctx.sender, 'adult_consent')) {
    throw new Error(`Antes debes confirmar que eres mayor de edad con ${ctx.prefix}adult18 accept.`)
  }
}

function safePage(value?: string) {
  const page = Number(value ?? 1)
  return Number.isInteger(page) && page > 0 ? Math.min(50, page) : 1
}

function encodeQuery(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function decodeQuery(value: string) {
  try {
    return Buffer.from(value, 'base64url').toString('utf8')
  } catch {
    throw new Error('La búsqueda paginada ya no es válida.')
  }
}

/** Erome-style listing: few cards, short bodies, separate navigation card. */
async function listingUi(
  ctx: CommandContext,
  mode: 'hot' | 'new' | 'search',
  page: number,
  query: string | undefined,
  items: HentaiItem[],
) {
  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: `🔞 HENTAI · ${mode === 'search' ? 'BÚSQUEDA' : mode.toUpperCase()}`,
    body: mode === 'search' ? `Resultados para: ${query}\nPágina: ${page}` : `Explorar ${mode === 'hot' ? 'HOT' : 'NEW'} · página ${page}`,
    footer: 'Hentai · Ghost Nexora Bot',
    cards: items.slice(0, 8).map((item, index) => ({
      title: `#${index + 1} · ${item.title}`.slice(0, 80),
      body: [
        item.source ? `Fuente: ${item.source}` : '',
        item.duration ? `⏱ ${item.duration}` : '',
      ]
        .filter(Boolean)
        .join('\n') || 'Video hentai',
      imageUrl: item.thumbnail,
      buttons: [
        { type: 'reply' as const, text: '⬇️ Descargar', id: `${ctx.prefix}hentai dl ${item.token}` },
        { type: 'url' as const, text: '🌐 Abrir', url: item.url },
      ],
    })),
  })

  const buttons: InteractiveButton[] = []
  if (page > 1) {
    buttons.push({
      type: 'reply',
      text: '◀️ Anterior',
      id:
        mode === 'search'
          ? `${ctx.prefix}hentai search64 ${page - 1} ${encodeQuery(query ?? '')}`
          : `${ctx.prefix}hentai ${mode} ${page - 1}`,
    })
  }
  buttons.push({
    type: 'reply',
    text: 'Siguiente ▶️',
    id:
      mode === 'search'
        ? `${ctx.prefix}hentai search64 ${page + 1} ${encodeQuery(query ?? '')}`
        : `${ctx.prefix}hentai ${mode} ${page + 1}`,
  })
  if (mode !== 'search') {
    buttons.push({
      type: 'reply',
      text: mode === 'hot' ? '🆕 NEW' : '🔥 HOT',
      id: `${ctx.prefix}hentai ${mode === 'hot' ? 'new' : 'hot'} 1`,
    })
  }

  await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
    title: '🔞 HENTAI · NAVEGACIÓN',
    body: `Página actual: *${page}*`,
    footer: 'Hentai',
    buttons,
  })
}

async function showListing(ctx: CommandContext, mode: 'hot' | 'new' | 'search', page: number, query?: string) {
  const result =
    mode === 'search'
      ? await searchHentai(query ?? '', page, 8)
      : await exploreHentai(mode, page, 8)
  if (!result.items.length) throw new Error('No se encontraron videos hentai públicos en esta página.')
  await listingUi(ctx, mode, page, query, result.items)
}

async function sendDownload(ctx: CommandContext, tokenOrUrl: string) {
  let title = 'Hentai'
  try {
    if (/^ht_/i.test(tokenOrUrl)) title = getHentaiItem(tokenOrUrl).title
  } catch {
    /* url directa */
  }

  await ctx.reply(`⬇️ *HENTAI · PREPARANDO*\n${title}`)
  const result = await downloadHentai(tokenOrUrl)
  try {
    const caption = `🔞 *HENTAI*\n${result.title}\n📦 ${(result.size / 1024 / 1024).toFixed(1)} MB`
    const sent = await ctx.socket
      .sendMessage(
        ctx.chatId,
        {
          video: { url: result.filePath },
          mimetype: 'video/mp4',
          caption,
        },
        { quoted: ctx.message },
      )
      .catch(() => null)

    if (!sent) {
      await ctx.socket.sendMessage(
        ctx.chatId,
        {
          document: { url: result.filePath },
          mimetype: 'video/mp4',
          fileName: result.fileName,
          caption,
        },
        { quoted: ctx.message },
      )
    }
    recordSubbotDownload(ctx.instanceId, result.size)
  } finally {
    await result.cleanup()
  }
}

export const hentaiCommands: BotCommand[] = [
  {
    name: 'hentai',
    aliases: ['h', 'hanime'],
    category: 'adult',
    description: 'Explora, busca y descarga videos hentai públicos (UI tipo Erome).',
    usage: 'hentai [hot|new|search|dl] ...',
    async handler(ctx) {
      assertAdultAccess(ctx)
      const action = (ctx.args[0] ?? 'hot').toLowerCase()

      if (action === 'hot' || action === 'explore') {
        await showListing(ctx, 'hot', safePage(ctx.args[1]))
        return
      }
      if (action === 'new') {
        await showListing(ctx, 'new', safePage(ctx.args[1]))
        return
      }
      if (action === 'search') {
        const query = ctx.args.slice(1).join(' ').trim()
        if (!query) throw new Error(`Uso: ${ctx.prefix}hentai search <texto>`)
        await showListing(ctx, 'search', 1, query)
        return
      }
      if (action === 'search64') {
        const page = safePage(ctx.args[1])
        const query = decodeQuery(ctx.args[2] ?? '')
        await showListing(ctx, 'search', page, query)
        return
      }
      if (action === 'dl' || action === 'download') {
        const token = ctx.args[1]
        if (!token) throw new Error(`Uso: ${ctx.prefix}hentai dl <token|url>`)
        await sendDownload(ctx, token)
        return
      }

      const rawInput = ctx.argText.trim()
      if (/^https?:\/\//i.test(rawInput)) {
        await sendDownload(ctx, rawInput)
        return
      }
      if (!rawInput || rawInput.toLowerCase() === 'hot') {
        await showListing(ctx, 'hot', 1)
        return
      }
      await showListing(ctx, 'search', 1, rawInput)
    },
  },
]
