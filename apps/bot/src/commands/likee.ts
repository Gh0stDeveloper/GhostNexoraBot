import type { BotCommand, CommandContext } from '../types.js'
import { createDownloadProgress } from '../services/progress.js'
import { downloadLempiLikee } from '../services/lempi-media-endpoints.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

function requireLikeeUrl(ctx: CommandContext) {
  const value = ctx.argText.trim()
  if (!value || !/^https?:\/\//i.test(value)) throw new Error(`Uso: ${ctx.prefix}likee <url>`)
  let url: URL
  try { url = new URL(value) } catch { throw new Error(`Uso: ${ctx.prefix}likee <url>`) }
  const host = url.hostname.toLowerCase()
  if (!(host === 'likee.video' || host.endsWith('.likee.video') || host === 'likee.com' || host.endsWith('.likee.com'))) {
    throw new Error('La URL indicada no pertenece a Likee.')
  }
  return value
}

function bytes(value: number) {
  return value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(2)} GB` : `${(value / 1024 ** 2).toFixed(1)} MB`
}

async function likee(ctx: CommandContext) {
  const sourceUrl = requireLikeeUrl(ctx)
  const progress = await createDownloadProgress(ctx, 'Likee · video')
  await progress.update('downloading', 'Consultando LemPi /dl/likee…')
  const result = await downloadLempiLikee(sourceUrl)
  try {
    await progress.update('sending', `${bytes(result.size)} · enviando a WhatsApp`)
    await ctx.socket.sendMessage(ctx.chatId, {
      video: { url: result.filePath },
      mimetype: 'video/mp4',
      caption: [
        '🎬 *LIKEE*',
        `📦 ${bytes(result.size)}`,
        'Fuente: LemPi /dl/likee',
        '👻 Ghost Nexora Bot',
      ].join('\n'),
    }, { quoted: ctx.message })
    recordSubbotDownload(ctx.instanceId, result.size)
    await progress.update('done', `${bytes(result.size)} enviados.`)
  } finally {
    await result.cleanup()
  }
}

export const likeeCommands: BotCommand[] = [
  {
    name: 'likee',
    aliases: ['like', 'likeedl'],
    category: 'downloads',
    description: 'Descarga videos de Likee mediante la API de LemPi.',
    usage: 'likee <url>',
    handler: likee,
  },
]
