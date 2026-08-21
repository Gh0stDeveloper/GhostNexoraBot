import type { BotCommand, CommandContext } from '../types.js'
import { config } from '../config.js'
import { settings } from '../core/settings.js'
import { economy } from '../services/economy.js'
import { downloadAdult, searchAdult, type AdultProvider } from '../services/adult.js'
import { sendCarousel } from '../services/interactive.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

function assertAdultAccess(ctx: CommandContext) {
  const isGroup = ctx.chatId.endsWith('@g.us')
  if (isGroup) {
    if (!economy.getGroupPolicy(ctx.chatId).adultAllowed) {
      throw new Error(`El módulo 18+ está desactivado en este grupo. Un administrador puede habilitarlo aquí con ${ctx.prefix}adultmode on.`)
    }
  } else {
    if (!settings.adultEnabled) throw new Error('El módulo 18+ está desactivado para chats privados.')
    if (!config.adultPrivateEnabled) throw new Error('El módulo 18+ está desactivado en chats privados.')
  }
  if (!economy.hasEntitlement(ctx.sender, 'adult_consent')) throw new Error(`Antes de usar el módulo debes confirmar que eres mayor de edad con ${ctx.prefix}adult18 accept.`)
}

function safeUrlForCommand(url: string) {
  return url.replace(/\s/g, '%20')
}

async function sendAdultVideo(ctx: CommandContext, provider: string, url: string) {
  await ctx.reply(`⬇️ *${provider.toUpperCase()}*\nPreparando el video...`)
  const result = await downloadAdult(url)
  try {
    const caption = `🔞 *${provider.toUpperCase()}*\n📦 ${(result.size / 1024 / 1024).toFixed(1)} MB`
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

async function searchOrDownload(ctx: CommandContext, provider: AdultProvider) {
  assertAdultAccess(ctx)
  const input = ctx.argText.trim()
  if (!input) throw new Error(`Uso: ${ctx.prefix}${provider} <búsqueda|url>`)

  if (/^https?:\/\//i.test(input)) {
    await sendAdultVideo(ctx, provider, input)
    return
  }

  const results = await searchAdult(provider, input, 10)
  if (!results.length) throw new Error('No encontré resultados públicos para esa búsqueda.')

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: `🔞 ${provider.toUpperCase()}`,
    body: `Resultados para: ${input}`,
    footer: 'Ghost Nexora Bot',
    cards: results.map((item, index) => ({
      title: `#${index + 1} · ${item.title}`.slice(0, 120),
      body: `${item.title}\nDescargar: ${ctx.prefix}adultdl ${safeUrlForCommand(item.url)}`,
      imageUrl: item.thumbnail,
      buttons: [
        { type: 'reply', text: '⬇️ Descargar', id: `${ctx.prefix}adultdl ${safeUrlForCommand(item.url)}` },
        { type: 'url', text: '🌐 Abrir', url: item.url },
      ],
    })),
  })
}

export const adultCommands: BotCommand[] = [
  {
    name: 'adult18', aliases: ['18plus'], category: 'adult', description: 'Confirma acceso voluntario al módulo para adultos.',
    async handler(ctx) {
      if ((ctx.args[0] ?? '').toLowerCase() !== 'accept') throw new Error(`Si eres mayor de edad y deseas habilitar este módulo para tu cuenta, usa ${ctx.prefix}adult18 accept.`)
      economy.grantEntitlement(ctx.sender, 'adult_consent', 365 * 86400_000)
      await ctx.reply(`🔞 Confirmación guardada. En grupos, el acceso depende únicamente del ajuste de ese grupo (${ctx.prefix}adultmode on|off).`)
    },
  },
  { name: 'xvideos', aliases: ['xv'], category: 'adult', description: 'Busca o descarga videos de XVideos.', async handler(ctx) { await searchOrDownload(ctx, 'xvideos') } },
  { name: 'xnxx', aliases: ['xn'], category: 'adult', description: 'Busca o descarga videos de XNXX.', async handler(ctx) { await searchOrDownload(ctx, 'xnxx') } },
  { name: 'pornhub', aliases: ['ph'], category: 'adult', description: 'Busca o descarga videos de Pornhub.', async handler(ctx) { await searchOrDownload(ctx, 'pornhub') } },
  {
    name: 'adultdl', aliases: ['18dl'], category: 'adult', description: 'Descarga un resultado 18+ seleccionado.', usage: 'adultdl <url>',
    async handler(ctx) {
      assertAdultAccess(ctx)
      const url = ctx.args[0]
      if (!url) throw new Error('Indica una URL soportada.')
      const provider = /xvideos/i.test(url) ? 'xvideos' : /xnxx/i.test(url) ? 'xnxx' : /pornhub/i.test(url) ? 'pornhub' : 'video'
      await sendAdultVideo(ctx, provider, url)
    },
  },
]
