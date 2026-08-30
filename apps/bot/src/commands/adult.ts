import { createHash } from 'node:crypto'
import type { BotCommand, CommandContext } from '../types.js'
import { config } from '../config.js'
import { settings } from '../core/settings.js'
import { economy } from '../services/economy.js'
import { downloadAdult, searchAdult, type AdultProvider } from '../services/adult.js'
import { sendCarousel, sendInteractiveCard, type InteractiveButton } from '../services/interactive.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

const CACHE_TTL_MS = 25 * 60_000
type CachedResult = { url: string; title: string; provider: AdultProvider; expiresAt: number }
const resultCache = new Map<string, CachedResult>()

function tokenFor(url: string) {
  return `ad_${createHash('sha256').update(url).digest('hex').slice(0, 16)}`
}

function rememberResult(provider: AdultProvider, title: string, url: string) {
  const token = tokenFor(url)
  resultCache.set(token, { url, title, provider, expiresAt: Date.now() + CACHE_TTL_MS })
  return token
}

function getCachedResult(token: string) {
  const entry = resultCache.get(token.trim())
  if (!entry) throw new Error('Ese resultado expiró. Vuelve a buscar con .xvideos / .xnxx / .pornhub <texto>.')
  if (entry.expiresAt <= Date.now()) {
    resultCache.delete(token.trim())
    throw new Error('Ese resultado expiró. Vuelve a ejecutar la búsqueda.')
  }
  return entry
}

function assertAdultAccess(ctx: CommandContext) {
  const isGroup = ctx.chatId.endsWith('@g.us')
  if (isGroup) {
    if (!economy.getGroupPolicy(ctx.chatId).adultAllowed) {
      throw new Error(
        `El módulo 18+ está desactivado en este grupo. Un administrador puede habilitarlo aquí con ${ctx.prefix}adultmode on.`,
      )
    }
  } else {
    if (!settings.adultEnabled) throw new Error('El módulo 18+ está desactivado para chats privados.')
    if (!config.adultPrivateEnabled) throw new Error('El módulo 18+ está desactivado en chats privados.')
  }
  if (!economy.hasEntitlement(ctx.sender, 'adult_consent')) {
    throw new Error(`Antes de usar el módulo debes confirmar que eres mayor de edad con ${ctx.prefix}adult18 accept.`)
  }
}

async function sendAdultVideo(ctx: CommandContext, provider: string, url: string) {
  await ctx.reply(`⬇️ *${provider.toUpperCase()}*\nPreparando el video...`)
  const result = await downloadAdult(url)
  try {
    const caption = `🔞 *${provider.toUpperCase()}*\n📦 ${(result.size / 1024 / 1024).toFixed(1)} MB`
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

/**
 * Carrusel estilo Erome: máximo 8 tarjetas, cuerpos cortos, botones con token
 * (no URLs largas) y tarjeta de navegación separada. Evita el aviso de
 * "actualiza WhatsApp" por payloads interactivos demasiado pesados.
 */
async function searchOrDownload(ctx: CommandContext, provider: AdultProvider) {
  assertAdultAccess(ctx)
  const input = ctx.argText.trim()
  if (!input) throw new Error(`Uso: ${ctx.prefix}${provider} <búsqueda|url>`)

  if (/^https?:\/\//i.test(input)) {
    await sendAdultVideo(ctx, provider, input)
    return
  }

  const results = await searchAdult(provider, input, 8)
  if (!results.length) throw new Error('No encontré resultados públicos para esa búsqueda.')

  const cards = results.slice(0, 8).map((item, index) => {
    const token = rememberResult(provider, item.title, item.url)
    return {
      title: `#${index + 1} · ${item.title}`.slice(0, 80),
      body: provider.toUpperCase(),
      imageUrl: item.thumbnail,
      buttons: [
        { type: 'reply' as const, text: '⬇️ Descargar', id: `${ctx.prefix}adultdl ${token}` },
        { type: 'url' as const, text: '🌐 Abrir', url: item.url },
      ],
    }
  })

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: `🔞 ${provider.toUpperCase()}`,
    body: `Resultados para: ${input}`,
    footer: `${provider} · Ghost Nexora Bot`,
    cards,
  })

  const buttons: InteractiveButton[] = [
    { type: 'reply', text: '🔁 Nueva búsqueda', id: `${ctx.prefix}${provider}` },
  ]
  await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
    title: `🔞 ${provider.toUpperCase()} · NAVEGACIÓN`,
    body: `Mostrando ${cards.length} resultados. Usa Descargar en cada tarjeta.`,
    footer: provider,
    buttons,
  })
}

export const adultCommands: BotCommand[] = [
  {
    name: 'adult18',
    aliases: ['18plus'],
    category: 'adult',
    description: 'Confirma acceso voluntario al módulo para adultos.',
    async handler(ctx) {
      if ((ctx.args[0] ?? '').toLowerCase() !== 'accept') {
        throw new Error(
          `Si eres mayor de edad y deseas habilitar este módulo para tu cuenta, usa ${ctx.prefix}adult18 accept.`,
        )
      }
      economy.grantEntitlement(ctx.sender, 'adult_consent', 365 * 86400_000)
      await ctx.reply(
        `🔞 Confirmación guardada. En grupos, el acceso depende únicamente del ajuste de ese grupo (${ctx.prefix}adultmode on|off).`,
      )
    },
  },
  {
    name: 'xvideos',
    aliases: ['xv'],
    category: 'adult',
    description: 'Busca o descarga videos de XVideos (carrusel estilo Erome).',
    async handler(ctx) {
      await searchOrDownload(ctx, 'xvideos')
    },
  },
  {
    name: 'xnxx',
    aliases: ['xn'],
    category: 'adult',
    description: 'Busca o descarga videos de XNXX (carrusel estilo Erome).',
    async handler(ctx) {
      await searchOrDownload(ctx, 'xnxx')
    },
  },
  {
    name: 'pornhub',
    aliases: ['ph'],
    category: 'adult',
    description: 'Busca o descarga videos de Pornhub (carrusel estilo Erome).',
    async handler(ctx) {
      await searchOrDownload(ctx, 'pornhub')
    },
  },
  {
    name: 'adultdl',
    aliases: ['18dl'],
    category: 'adult',
    description: 'Descarga un resultado 18+ seleccionado por token o URL.',
    usage: 'adultdl <token|url>',
    async handler(ctx) {
      assertAdultAccess(ctx)
      const key = ctx.args[0]
      if (!key) throw new Error('Indica un token o una URL soportada.')

      if (/^ad_[a-f0-9]{16}$/i.test(key)) {
        const cached = getCachedResult(key)
        await sendAdultVideo(ctx, cached.provider, cached.url)
        return
      }

      const provider = /xvideos/i.test(key)
        ? 'xvideos'
        : /xnxx/i.test(key)
          ? 'xnxx'
          : /pornhub/i.test(key)
            ? 'pornhub'
            : 'video'
      await sendAdultVideo(ctx, provider, key)
    },
  },
]
