import type { BotCommand, LegacyCompatibleCommandContext } from '../types.js'
import { downloadLempiTerabox, type LempiRemoteFile } from '../services/lempi-media-endpoints.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

function requireTeraboxUrl(ctx: LegacyCompatibleCommandContext) {
  const value = ctx.argText.trim()
  if (!value || !/^https?:\/\//i.test(value)) throw new Error(`Uso: ${ctx.prefix}terabox <url>`)
  let url: URL
  try { url = new URL(value) } catch { throw new Error(`Uso: ${ctx.prefix}terabox <url>`) }
  const host = url.hostname.toLowerCase()
  if (!/(^|\.)(?:terabox\.com|1024terabox\.com|teraboxapp\.com)$/i.test(host)) {
    throw new Error('La URL indicada no pertenece a TeraBox.')
  }
  return value
}

function bytes(value: number) {
  return value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(2)} GB` : `${(value / 1024 ** 2).toFixed(1)} MB`
}

async function sendFile(ctx: LegacyCompatibleCommandContext, file: LempiRemoteFile, first: boolean) {
  const caption = first
    ? [
        '📦 *TERABOX*',
        `Archivo: ${file.fileName}`,
        `Peso: ${bytes(file.size)}`,
        '👻 Ghost Nexora Bot',
      ].join('\n')
    : undefined
  const options = first ? { quoted: ctx.message } : undefined

  if (file.kind === 'image') {
    await ctx.socket.sendMessage(ctx.chatId, { image: { url: file.filePath }, caption }, options)
    return
  }
  if (file.kind === 'video') {
    await ctx.socket.sendMessage(ctx.chatId, { video: { url: file.filePath }, caption }, options)
    return
  }
  if (file.kind === 'audio') {
    await ctx.socket.sendMessage(ctx.chatId, {
      audio: { url: file.filePath },
      ptt: false,
      fileName: file.fileName,
    }, options)
    return
  }
  await ctx.socket.sendMessage(ctx.chatId, {
    document: { url: file.filePath },
    fileName: file.fileName,
    caption,
  }, options)
}

async function terabox(ctx: LegacyCompatibleCommandContext) {
  const sourceUrl = requireTeraboxUrl(ctx)
  await ctx.reply('📦 *TERABOX*\n━━━━━━━━━━━━━━\nPreparando los archivos…')
  let files: LempiRemoteFile[]
  try {
    files = await downloadLempiTerabox(sourceUrl, 10)
  } catch {
    throw new Error('No se pudieron preparar los archivos en este momento.')
  }
  let total = 0
  try {
    for (const [index, file] of files.entries()) {
      total += file.size
      await sendFile(ctx, file, index === 0)
    }
    recordSubbotDownload(ctx.instanceId, total)
    await ctx.reply(`✅ *TERABOX*\n━━━━━━━━━━━━━━\nArchivos enviados: ${files.length}\nTotal: ${bytes(total)}`)
  } finally {
    await Promise.all(files.map((file) => file.cleanup()))
  }
}

export const teraboxCommands: BotCommand[] = [
  {
    name: 'terabox',
    aliases: ['tera', 'teraboxdl'],
    category: 'downloads',
    description: 'Descarga archivos compartidos de TeraBox.',
    usage: 'terabox <url>',
    handler: terabox,
  },
]