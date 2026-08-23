import type { BotCommand, CommandContext } from '../types.js'
import { createDownloadProgress } from '../services/progress.js'
import { downloadSocialVideo, downloadSoundCloud } from '../services/downloader.js'
import { downloadMediaFire } from '../services/mediafire.js'
import { downloadAptoideApk } from '../services/aptoide.js'
import { searchTikTokVideos } from '../services/tiktok-search.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

function isUrl(value: string) { try { return ['http:', 'https:'].includes(new URL(value).protocol) } catch { return false } }
const size = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

async function socialDownload(ctx: CommandContext, name: string, platform: 'tiktok' | 'instagram' | 'twitter', url: string) {
  if (!isUrl(url)) throw new Error(`Uso: ${ctx.prefix}${name.toLowerCase()} <url>`)
  const progress = await createDownloadProgress(ctx, `${name} · video`)
  await progress.update('downloading', 'Obteniendo y validando el archivo')
  const result = await downloadSocialVideo(url, platform)
  try {
    await progress.update('sending', `${size(result.size)} · enviando a WhatsApp`)
    await ctx.socket.sendMessage(ctx.chatId, { video: { url: result.filePath }, mimetype: 'video/mp4', caption: `${name} · ${size(result.size)}` }, { quoted: ctx.message })
    recordSubbotDownload(ctx.instanceId, result.size)
    await progress.update('done', `${size(result.size)} enviados.`)
  } finally { await result.cleanup() }
}

async function tiktok(ctx: CommandContext) {
  const input = ctx.argText.trim()
  if (!input) throw new Error(`Uso: ${ctx.prefix}tiktok <url|búsqueda>`)
  if (isUrl(input)) { await socialDownload(ctx, 'TikTok', 'tiktok', input); return }
  const rows = await searchTikTokVideos(input, 10)
  if (!rows.length) throw new Error('TikTok no devolvió resultados públicos.')
  await ctx.reply(`🎵 *TIKTOK · RESULTADOS*\n━━━━━━━━━━━━━━\n${rows.map((item, i) => `${i + 1}. *${item.title || `@${item.username ?? 'TikTok'}`}*\n⬇️ ${ctx.prefix}tiktok ${item.url}`).join('\n\n')}`)
}

async function soundcloud(ctx: CommandContext) {
  const input = ctx.argText.trim(); if (!input) throw new Error(`Uso: ${ctx.prefix}soundcloud <url|búsqueda>`)
  const progress = await createDownloadProgress(ctx, 'SoundCloud · audio')
  await progress.update('downloading', isUrl(input) ? 'Descargando pista pública' : 'Buscando y descargando el primer resultado')
  const result = await downloadSoundCloud(input)
  try {
    await progress.update('sending', `${size(result.size)} · enviando audio`)
    await ctx.socket.sendMessage(ctx.chatId, { audio: { url: result.filePath }, mimetype: 'audio/mpeg', ptt: false }, { quoted: ctx.message })
    recordSubbotDownload(ctx.instanceId, result.size); await progress.update('done')
  } finally { await result.cleanup() }
}

async function mediafire(ctx: CommandContext) {
  const url = ctx.args[0] ?? ''; if (!isUrl(url)) throw new Error(`Uso: ${ctx.prefix}mediafire <url>`)
  const progress = await createDownloadProgress(ctx, 'MediaFire · archivo'); await progress.update('downloading')
  const result = await downloadMediaFire(url)
  try {
    await progress.update('sending', `${result.fileName} · ${size(result.size)}`)
    await ctx.socket.sendMessage(ctx.chatId, { document: { url: result.filePath }, mimetype: result.contentType, fileName: result.fileName, caption: `☁️ MediaFire · ${size(result.size)}` }, { quoted: ctx.message })
    recordSubbotDownload(ctx.instanceId, result.size); await progress.update('done')
  } finally { await result.cleanup() }
}

async function apkdl(ctx: CommandContext) {
  const target = ctx.argText.trim(); if (!target) throw new Error(`Uso: ${ctx.prefix}apkdl <id|package>`)
  const progress = await createDownloadProgress(ctx, 'Android · APK'); await progress.update('downloading', 'Fuente: Aptoide')
  const result = await downloadAptoideApk(target)
  try {
    if (result.malwareRank && !result.trusted && /(?:critical|malware|virus)/i.test(result.malwareRank)) throw new Error(`Aptoide marcó esta APK como ${result.malwareRank}; envío bloqueado.`)
    await progress.update('sending', `${result.name} · ${size(result.size)}`)
    await ctx.socket.sendMessage(ctx.chatId, { document: { url: result.filePath }, mimetype: 'application/vnd.android.package-archive', fileName: result.fileName, caption: `🤖 *${result.name}*\n${result.packageName}\n${result.version ?? ''}\n📦 ${size(result.size)}\n🛡️ ${result.trusted ? 'Aptoide TRUSTED' : result.malwareRank ?? 'Sin clasificación'}` }, { quoted: ctx.message })
    recordSubbotDownload(ctx.instanceId, result.size); await progress.update('done')
  } finally { await result.cleanup() }
}

export const downloadProgressV2Commands: BotCommand[] = [
  { name: 'tiktok', aliases: ['tt'], category: 'downloads', description: 'Busca TikTok o descarga un enlace con progreso editable.', handler: tiktok },
  { name: 'instagram', aliases: ['ig', 'insta'], category: 'downloads', description: 'Descarga un enlace público de Instagram.', handler: (ctx) => socialDownload(ctx, 'Instagram', 'instagram', ctx.args[0] ?? '') },
  { name: 'twitter', aliases: ['x', 'tweet'], category: 'downloads', description: 'Descarga un enlace público de X/Twitter.', handler: (ctx) => socialDownload(ctx, 'X/Twitter', 'twitter', ctx.args[0] ?? '') },
  { name: 'soundcloud', aliases: ['sc', 'scdl'], category: 'downloads', description: 'Descarga audio de SoundCloud con progreso editable.', handler: soundcloud },
  { name: 'mediafire', aliases: ['mf'], category: 'downloads', description: 'Descarga un archivo MediaFire con progreso editable.', handler: mediafire },
  { name: 'apkdl', aliases: ['appdl', 'apkdownload'], category: 'downloads', description: 'Descarga una APK seleccionada con progreso editable.', handler: apkdl },
  { name: 'ytsearch', aliases: ['buscarvideo', 'ytm'], category: 'downloads', description: 'Alias retirado: la búsqueda de YouTube usa únicamente yts.', async handler(ctx) { throw new Error(`La búsqueda de YouTube se centralizó. Usa ${ctx.prefix}yts <texto>.`) } },
]
