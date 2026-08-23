import type { BotCommand, CommandContext } from '../types.js'
import { config } from '../config.js'
import { settings } from '../core/settings.js'
import { economy } from '../services/economy.js'
import { downloadEromeVideo, getEromeAlbum } from '../services/erome.js'
import { createDownloadProgress } from '../services/progress.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'
import { eromeCommands } from './erome.js'

const baseErome = eromeCommands.find((command) => command.name === 'erome') ?? (() => {
  throw new Error('No se encontró el comando base de Erome.')
})()

function assertAdultAccess(ctx: CommandContext) {
  if (ctx.isGroup) {
    if (!economy.getGroupPolicy(ctx.chatId).adultAllowed) throw new Error(`Este grupo no está autorizado para el módulo 18+. Un administrador puede usar ${ctx.prefix}adultmode on.`)
  } else if (!settings.adultEnabled || !config.adultPrivateEnabled) throw new Error('El módulo 18+ está desactivado en chats privados.')
  if (!economy.hasEntitlement(ctx.sender, 'adult_consent')) throw new Error(`Antes debes confirmar que eres mayor de edad con ${ctx.prefix}adult18 accept.`)
}

function albumId(input: string) {
  const raw = input.trim()
  if (/^[A-Za-z0-9_-]{5,30}$/.test(raw)) return raw
  try {
    const url = new URL(raw)
    const match = /^\/a\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname)
    if (match && ['erome.com', 'www.erome.com'].includes(url.hostname)) return match[1]!
  } catch { /* handled below */ }
  throw new Error('Indica un ID o enlace de álbum Erome válido.')
}

async function handler(ctx: CommandContext) {
  const action = (ctx.args[0] ?? '').toLowerCase()
  if (!['dl', 'download'].includes(action)) return baseErome.handler(ctx)
  assertAdultAccess(ctx)
  const albumInput = ctx.args[1]
  const index = Number(ctx.args[2])
  if (!albumInput || !Number.isInteger(index)) throw new Error(`Uso: ${ctx.prefix}erome dl <album-id|url> <video>`)
  const id = albumId(albumInput)
  const preview = await getEromeAlbum(albumInput)
  const video = preview.videos[index - 1]
  if (!video) throw new Error(`Elige un video entre 1 y ${preview.videos.length}.`)

  const progress = await createDownloadProgress(ctx, `Erome · ${preview.title}`)
  await progress.update('downloading', `Video #${index} · descargando desde CDN de Erome`)
  const result = await downloadEromeVideo(albumInput, index)
  try {
    const mb = `${(result.size / 1024 / 1024).toFixed(1)} MB`
    await progress.update('sending', `${mb} · enviando video a WhatsApp`)
    const sent = await ctx.socket.sendMessage(ctx.chatId, {
      video: { url: result.filePath }, mimetype: 'video/mp4',
      caption: `🔞 *EROME · VIDEO ${result.video.index}*\n${result.album.title}\n📦 ${mb}`,
    }, { quoted: ctx.message }).catch(() => null)
    if (!sent) await ctx.socket.sendMessage(ctx.chatId, {
      document: { url: result.filePath }, fileName: `erome-${id}-${index}.mp4`, mimetype: 'video/mp4',
      caption: `🔞 Erome · ${result.album.title} · ${mb}`,
    }, { quoted: ctx.message })
    recordSubbotDownload(ctx.instanceId, result.size)
    await progress.update('done', `${mb} enviados.`)
  } finally { await result.cleanup() }
}

export const eromeProgressV2Commands: BotCommand[] = [{
  ...baseErome,
  description: 'Explora Erome y descarga videos con progreso editable.',
  handler,
}]
