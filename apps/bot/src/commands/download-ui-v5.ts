import type { BotCommand, CommandContext } from '../types.js'
import { downloadLempi } from '../services/lempi.js'
import { downloadSocialVideo, getMediaInfo } from '../services/downloader.js'
import { createDownloadProgress } from '../services/progress.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'
import { logger } from '../utils/logger.js'

function bytes(value: number) {
  return value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(2)} GB` : `${(value / 1024 / 1024).toFixed(1)} MB`
}

function url(input: string) {
  try {
    const parsed = new URL(input)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
    return parsed.toString()
  } catch { throw new Error('Indica una URL válida.') }
}

async function facebook(ctx: CommandContext) {
  const source = url(ctx.args[0] ?? '')
  const progress = await createDownloadProgress(ctx, 'Facebook · video')
  const info = await getMediaInfo(source, 'facebook').catch(() => undefined)
  let result: Awaited<ReturnType<typeof downloadSocialVideo>> | Awaited<ReturnType<typeof downloadLempi>> | null = null
  try {
    await progress.update('downloading', 'Preparando y descargando el contenido…')
    try {
      result = info?.duration && info.duration >= 3600
        ? await downloadLempi(source, 'facebook')
        : await downloadSocialVideo(source, 'facebook')
    } catch (error) {
      logger.warn({ error }, 'primary Facebook download failed; using fallback')
      result = await downloadLempi(source, 'facebook')
    }
    await progress.update('sending', `${bytes(result.size)} · enviando a WhatsApp`)
    const caption = [
      '📘 *FACEBOOK · VIDEO*',
      '━━━━━━━━━━━━━━',
      info?.title ? `🎬 Título: *${info.title}*` : '',
      info?.uploader ? `👤 Autor: *${info.uploader}*` : '',
      info?.views !== undefined ? `👁️ Vistas: *${info.views.toLocaleString('es-MX')}*` : '',
      `📦 Peso: *${bytes(result.size)}*`,
    ].filter(Boolean).join('\n')
    await ctx.socket.sendMessage(ctx.chatId, { video: { url: result.filePath }, mimetype: 'video/mp4', caption }, { quoted: ctx.message })
    recordSubbotDownload(ctx.instanceId, result.size)
    await progress.update('done', `${bytes(result.size)} enviados correctamente.`)
  } finally { await result?.cleanup().catch(() => undefined) }
}

export const downloadUiV5Commands: BotCommand[] = [
  { name: 'facebook', aliases: ['fb'], category: 'downloads', description: 'Descarga videos públicos de Facebook.', usage: 'facebook <url>', handler: facebook },
]
