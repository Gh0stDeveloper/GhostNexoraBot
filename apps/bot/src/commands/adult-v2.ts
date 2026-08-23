import type { BotCommand, CommandContext } from '../types.js'
import { config } from '../config.js'
import { settings } from '../core/settings.js'
import { economy } from '../services/economy.js'
import { downloadAdult, searchAdult, type AdultProvider } from '../services/adult.js'
import { createDownloadProgress } from '../services/progress.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

function assertAdult(ctx: CommandContext) {
  if (ctx.isGroup) {
    if (!economy.getGroupPolicy(ctx.chatId).adultAllowed) throw new Error(`El módulo 18+ está desactivado en este grupo. Un administrador puede usar ${ctx.prefix}adultmode on.`)
  } else if (!settings.adultEnabled || !config.adultPrivateEnabled) throw new Error('El módulo 18+ está desactivado en chats privados.')
  if (!economy.hasEntitlement(ctx.sender, 'adult_consent')) throw new Error(`Confirma que eres mayor de edad con ${ctx.prefix}adult18 accept.`)
}

function isUrl(value: string) { try { return ['http:', 'https:'].includes(new URL(value).protocol) } catch { return false } }
function mb(value: number) { return `${(value / 1024 / 1024).toFixed(1)} MB` }

async function sendVideo(ctx: CommandContext, provider: string, url: string) {
  assertAdult(ctx)
  const progress = await createDownloadProgress(ctx, `${provider.toUpperCase()} · video`)
  await progress.update('downloading', 'Extrayendo la fuente directa y validando el archivo')
  const result = await downloadAdult(url)
  try {
    await progress.update('sending', `${mb(result.size)} · enviando a WhatsApp`)
    const sent = await ctx.socket.sendMessage(ctx.chatId, { video: { url: result.filePath }, mimetype: 'video/mp4', caption: `🔞 ${provider.toUpperCase()} · ${mb(result.size)}` }, { quoted: ctx.message }).catch(() => null)
    if (!sent) await ctx.socket.sendMessage(ctx.chatId, { document: { url: result.filePath }, mimetype: 'video/mp4', fileName: result.fileName }, { quoted: ctx.message })
    recordSubbotDownload(ctx.instanceId, result.size)
    await progress.update('done', `${mb(result.size)} enviados.`)
  } finally { await result.cleanup() }
}

async function searchOrDownload(ctx: CommandContext, provider: AdultProvider) {
  assertAdult(ctx)
  const input = ctx.argText.trim()
  if (!input) throw new Error(`Uso: ${ctx.prefix}${provider} <búsqueda|url>`)
  if (isUrl(input)) { await sendVideo(ctx, provider, input); return }
  const rows = await searchAdult(provider, input, 10)
  if (!rows.length) throw new Error('No encontré resultados públicos para esa búsqueda.')
  await ctx.reply(`🔞 *${provider.toUpperCase()} · RESULTADOS*\n━━━━━━━━━━━━━━\n${rows.map((item, i) => `${i + 1}. *${item.title}*\n⬇️ ${ctx.prefix}adultdl ${item.url.replace(/\s/g, '%20')}`).join('\n\n')}\n\n_Formato compatible: se evita el carrusel Native Flow que algunos clientes de WhatsApp rechazan._`)
}

export const adultV2Commands: BotCommand[] = [
  { name: 'xvideos', aliases: ['xv'], category: 'adult', description: 'Busca o descarga videos de XVideos.', handler: (ctx) => searchOrDownload(ctx, 'xvideos') },
  { name: 'xnxx', aliases: ['xn'], category: 'adult', description: 'Busca o descarga videos de XNXX.', handler: (ctx) => searchOrDownload(ctx, 'xnxx') },
  { name: 'pornhub', aliases: ['ph'], category: 'adult', description: 'Busca o descarga videos de Pornhub.', handler: (ctx) => searchOrDownload(ctx, 'pornhub') },
  { name: 'adultdl', aliases: ['18dl'], category: 'adult', description: 'Descarga un resultado 18+ seleccionado.', async handler(ctx) {
    const url = ctx.args[0] ?? ''; if (!isUrl(url)) throw new Error('Indica una URL soportada.')
    const provider = /xvideos/i.test(url) ? 'xvideos' : /xnxx/i.test(url) ? 'xnxx' : /pornhub/i.test(url) ? 'pornhub' : 'video'
    await sendVideo(ctx, provider, url)
  } },
]
