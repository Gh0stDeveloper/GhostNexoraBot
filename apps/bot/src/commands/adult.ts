import type { BotCommand, CommandContext } from '../types.js'
import { config } from '../config.js'
import { settings } from '../core/settings.js'
import { economy } from '../services/economy.js'
import { downloadAdult, searchAdult, type AdultProvider } from '../services/adult.js'
import { sendCarousel } from '../services/interactive.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

function assertAdultAccess(ctx: CommandContext) {
  if (!settings.adultEnabled) throw new Error(`El módulo 18+ está desactivado globalmente. El owner puede habilitarlo con ${ctx.prefix}adultmode on.`)
  const isGroup = ctx.chatId.endsWith('@g.us')
  if (isGroup && !economy.getGroupPolicy(ctx.chatId).adultAllowed) throw new Error('Este grupo no está autorizado para el módulo 18+.')
  if (!isGroup && !config.adultPrivateEnabled) throw new Error('El módulo 18+ está desactivado en chats privados.')
  if (!economy.hasEntitlement(ctx.sender, 'adult_consent')) throw new Error(`Antes de usar el módulo debes confirmar que eres mayor de edad con ${ctx.prefix}adult18 accept.`)
}

async function searchOrDownload(ctx: CommandContext, provider: AdultProvider) {
  assertAdultAccess(ctx)
  const input = ctx.argText.trim()
  if (!input) throw new Error(`Uso: ${ctx.prefix}${provider} <búsqueda|url>`)
  if (/^https?:\/\//i.test(input)) {
    const result = await downloadAdult(input)
    try {
      await ctx.socket.sendMessage(ctx.chatId, {
        video: { url: result.filePath }, mimetype: 'video/mp4',
        caption: `🔞 ${provider.toUpperCase()} · ${(result.size / 1024 / 1024).toFixed(1)} MB\nContenido solicitado bajo responsabilidad del usuario.`,
      }, { quoted: ctx.message })
      recordSubbotDownload(ctx.instanceId, result.size)
    } finally { await result.cleanup() }
    return
  }

  const results = await searchAdult(provider, input, 12)
  if (!results.length) throw new Error('No encontré resultados públicos para esa búsqueda.')
  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: `🔞 ${provider.toUpperCase()}`,
    body: `Resultados para: ${input}\nDesliza para ver más.`,
    footer: 'Solo adultos · Ghost Nexora Bot',
    cards: results.map((item, index) => ({
      title: `Resultado #${index + 1}`,
      body: item.title,
      imageUrl: item.thumbnail,
      buttons: [
        { type: 'reply', text: 'Descargar', id: `${ctx.prefix}adultdl ${item.url}` },
        { type: 'url', text: 'Abrir', url: item.url },
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
      await ctx.reply('🔞 Confirmación guardada. El módulo seguirá sujeto a la configuración global y a la allowlist de cada grupo.')
    },
  },
  { name: 'xvideos', aliases: ['xv'], category: 'adult', description: 'Busca o descarga contenido 18+ permitido.', async handler(ctx) { await searchOrDownload(ctx, 'xvideos') } },
  { name: 'xnxx', aliases: ['xn'], category: 'adult', description: 'Busca o descarga contenido 18+ permitido.', async handler(ctx) { await searchOrDownload(ctx, 'xnxx') } },
  { name: 'pornhub', aliases: ['ph'], category: 'adult', description: 'Busca o descarga contenido 18+ permitido.', async handler(ctx) { await searchOrDownload(ctx, 'pornhub') } },
  {
    name: 'adultdl', aliases: ['18dl'], category: 'adult', description: 'Descarga un resultado 18+ seleccionado.', usage: 'adultdl <url>',
    async handler(ctx) {
      assertAdultAccess(ctx)
      const url = ctx.args[0]
      if (!url) throw new Error('Indica una URL soportada.')
      const result = await downloadAdult(url)
      try {
        await ctx.socket.sendMessage(ctx.chatId, { video: { url: result.filePath }, mimetype: 'video/mp4', caption: `🔞 Descarga completada · ${(result.size / 1024 / 1024).toFixed(1)} MB` }, { quoted: ctx.message })
        recordSubbotDownload(ctx.instanceId, result.size)
      } finally { await result.cleanup() }
    },
  },
]
