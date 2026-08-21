import type { BotCommand, CommandContext } from '../types.js'
import {
  downloadSocialVideo,
  downloadSoundCloud,
  downloadYouTubeAudio,
  downloadYouTubeSearchAudio,
  downloadYouTubeSearchVideo,
  downloadYouTubeVideo,
  getMediaInfo,
  getYouTubeFormats,
  searchYouTube,
  type DownloadPlatform,
  type MediaInfo,
} from '../services/downloader.js'
import { downloadMediaFire } from '../services/mediafire.js'
import { resolveExternalSocial, type ExternalSocialPlatform } from '../services/social-external.js'
import { sendCarousel } from '../services/interactive.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

function requireUrl(args: string[]) { const url = args[0]; if (!url) throw new Error('Debes indicar una URL.'); return url }
function requireText(value: string, label = 'Debes indicar una búsqueda.') { const text = value.trim(); if (!text) throw new Error(label); return text }
function formatBytes(bytes: number) { return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 / 1024).toFixed(1)} MB` }
function formatDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return 'N/D'
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = Math.floor(seconds % 60)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}
const compact = (value?: number) => value === undefined ? 'N/D' : new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 }).format(value)

function infoText(info: MediaInfo | undefined, size?: number) {
  if (!info) return size ? `📦 Peso: ${formatBytes(size)}` : ''
  const description = info.description?.replace(/\s+/g, ' ').trim().slice(0, 220)
  return [
    `🎬 *${info.title}*`,
    info.uploader ? `👤 ${info.uploader}` : '',
    info.duration ? `⏱️ ${formatDuration(info.duration)}` : '',
    info.views !== undefined ? `👁️ ${compact(info.views)} vistas` : '',
    info.likes !== undefined ? `❤️ ${compact(info.likes)} likes` : '',
    size ? `📦 ${formatBytes(size)}` : '',
    description ? `\n📝 ${description}${info.description && info.description.length > 220 ? '…' : ''}` : '',
  ].filter(Boolean).join('\n')
}

async function sendDownloadInfo(ctx: CommandContext, info: MediaInfo | undefined, size?: number) {
  if (!info) return
  const caption = infoText(info, size)
  if (info.thumbnail) {
    const sent = await ctx.socket.sendMessage(ctx.chatId, { image: { url: info.thumbnail }, caption }, { quoted: ctx.message }).catch(() => null)
    if (sent) return
  }
  await ctx.reply(caption)
}

const socialCommand = (name: string, aliases: string[], platform: Exclude<DownloadPlatform, 'youtube'>, icon: string): BotCommand => ({
  name, aliases, category: 'downloads', description: `Descarga contenido público de ${name}.`, usage: `${name} <url>`,
  async handler(ctx) {
    const url = requireUrl(ctx.args)
    await ctx.reply(`${icon} Analizando *${name}*...`)
    const info = await getMediaInfo(url, platform).catch(() => undefined)

    if (['facebook', 'instagram', 'tiktok'].includes(platform)) {
      try {
        const direct = await resolveExternalSocial(url, platform as ExternalSocialPlatform)
        await sendDownloadInfo(ctx, info)
        await ctx.socket.sendMessage(ctx.chatId, {
          video: { url: direct }, mimetype: 'video/mp4',
          caption: `${icon} *${name}* · proveedor web público${platform === 'tiktok' ? ' · se priorizó enlace sin marca/HD' : ''}\n👻 ${ctx.prefix}menu`,
        }, { quoted: ctx.message })
        return
      } catch {
        // El proveedor web es un acelerador/fallback sin cookies; si cambia, continúa yt-dlp.
      }
    }

    const result = await downloadSocialVideo(url, platform)
    try {
      await sendDownloadInfo(ctx, result.info ?? info, result.size)
      await ctx.socket.sendMessage(ctx.chatId, { video: { url: result.filePath }, mimetype: 'video/mp4', caption: `${icon} *${name}* · ${formatBytes(result.size)}\n👻 ${ctx.prefix}menu` }, { quoted: ctx.message })
      recordSubbotDownload(ctx.instanceId, result.size)
    } finally { await result.cleanup() }
  },
})

export const downloadCommands: BotCommand[] = [
  {
    name: 'yts', aliases: ['ytsearch', 'buscarvideo', 'ytm'], category: 'downloads', description: 'Busca videos en YouTube como carrusel interactivo.', usage: 'yts <búsqueda>',
    async handler(ctx) {
      const query = requireText(ctx.argText)
      const results = await searchYouTube(query, 10)
      if (!results.length) throw new Error('No encontré resultados para esa búsqueda.')
      try {
        await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
          title: '🎵 YOUTUBE MUSIC',
          body: `✦ GHOST NEXORA · INTERACTIVO ✦\n\n🎵 ${query}\n\n↔️ Desliza para ver más resultados.`,
          footer: 'Audio · Letra · Relacionadas',
          cards: results.map((item, index) => ({
            title: `🎵 CANCIÓN #${index + 1}`,
            body: [`🎵 ${item.title}`, `◇ Artista » ${item.channel}`, `◇ Duración » ${formatDuration(item.duration)}`, `◇ Vistas » ${compact(item.views)}`, item.likes !== undefined ? `◇ Likes » ${compact(item.likes)}` : ''].filter(Boolean).join('\n'),
            imageUrl: item.thumbnail,
            footer: 'Ghost Nexora Bot',
            buttons: [
              { type: 'reply', text: '🎧 Audio', id: `${ctx.prefix}ytmp3 ${item.url}` },
              { type: 'reply', text: '📝 Letra', id: `${ctx.prefix}lyrics ${item.title} ${item.channel}` },
              { type: 'reply', text: '🎶 Relacionadas', id: `${ctx.prefix}yts ${item.title}` },
            ],
          })),
        })
      } catch {
        const lines = results.map((item, i) => `${i + 1}. *${item.title}*\n👤 ${item.channel} · ⏱️ ${formatDuration(item.duration)} · 👁️ ${compact(item.views)}\n${item.url}`)
        await ctx.reply(`🎵 *YOUTUBE MUSIC*\n\n${lines.join('\n\n')}\n\n🎧 ${ctx.prefix}play <búsqueda> · 📝 ${ctx.prefix}lyrics <canción>`)
      }
    },
  },
  {
    name: 'play', aliases: ['playaudio'], category: 'downloads', description: 'Busca en YouTube y descarga el primer resultado como MP3.', usage: 'play <búsqueda>',
    async handler(ctx) {
      const query = requireText(ctx.argText)
      await ctx.reply(`🔎 Buscando *${query}*...`)
      const result = await downloadYouTubeSearchAudio(query)
      try {
        await sendDownloadInfo(ctx, result.info, result.size)
        await ctx.socket.sendMessage(ctx.chatId, { audio: { url: result.filePath }, mimetype: 'audio/mpeg', ptt: false }, { quoted: ctx.message })
        recordSubbotDownload(ctx.instanceId, result.size)
      } finally { await result.cleanup() }
    },
  },
  {
    name: 'playvideo', aliases: ['playvid'], category: 'downloads', description: 'Busca en YouTube y descarga el primer resultado como video.', usage: 'playvideo <búsqueda>',
    async handler(ctx) {
      const query = requireText(ctx.argText)
      const result = await downloadYouTubeSearchVideo(query, 720)
      try {
        await sendDownloadInfo(ctx, result.info, result.size)
        await ctx.socket.sendMessage(ctx.chatId, { video: { url: result.filePath }, mimetype: 'video/mp4', caption: `🎬 YouTube · hasta 720p · ${formatBytes(result.size)}` }, { quoted: ctx.message })
        recordSubbotDownload(ctx.instanceId, result.size)
      } finally { await result.cleanup() }
    },
  },
  {
    name: 'ytformats', aliases: ['ytquality', 'ytcalidad'], category: 'downloads', description: 'Muestra calidades disponibles de YouTube.', usage: 'ytformats <url>',
    async handler(ctx) {
      const data = await getYouTubeFormats(requireUrl(ctx.args))
      const video = data.videoHeights.length ? data.videoHeights.map((height) => `${height}p`).join(', ') : 'No detectadas'
      const audio = data.audioBitrates.length ? data.audioBitrates.map((bitrate) => `${bitrate} kbps`).join(', ') : 'Automática'
      await sendDownloadInfo(ctx, data)
      await ctx.reply(`🎚️ *FORMATOS DISPONIBLES*\n📺 ${video}\n🎵 ${audio}\n\nEjemplo: *${ctx.prefix}ytmp4 <url> 1080*`)
    },
  },
  {
    name: 'ytmp3', aliases: ['yta', 'ytaudio'], category: 'downloads', description: 'Descarga audio de YouTube en MP3.', usage: 'ytmp3 <url>',
    async handler(ctx) {
      const result = await downloadYouTubeAudio(requireUrl(ctx.args))
      try {
        await sendDownloadInfo(ctx, result.info, result.size)
        await ctx.socket.sendMessage(ctx.chatId, { audio: { url: result.filePath }, mimetype: 'audio/mpeg', ptt: false }, { quoted: ctx.message })
        recordSubbotDownload(ctx.instanceId, result.size)
      } finally { await result.cleanup() }
    },
  },
  {
    name: 'ytmp4', aliases: ['ytv', 'ytvideo'], category: 'downloads', description: 'Descarga video de YouTube con calidad seleccionable.', usage: 'ytmp4 <url> [144|240|360|480|720|1080|1440|2160]',
    async handler(ctx) {
      const url = requireUrl(ctx.args)
      const requested = Number.parseInt(ctx.args[1] ?? '720', 10)
      const allowed = [144, 240, 360, 480, 720, 1080, 1440, 2160]
      const quality = allowed.includes(requested) ? requested : 720
      const result = await downloadYouTubeVideo(url, quality)
      try {
        await sendDownloadInfo(ctx, result.info, result.size)
        await ctx.socket.sendMessage(ctx.chatId, { video: { url: result.filePath }, mimetype: 'video/mp4', caption: `🎬 YouTube · hasta ${quality}p · ${formatBytes(result.size)}` }, { quoted: ctx.message })
        recordSubbotDownload(ctx.instanceId, result.size)
      } finally { await result.cleanup() }
    },
  },
  {
    name: 'soundcloud', aliases: ['sc', 'scdl'], category: 'downloads', description: 'Descarga audio público de SoundCloud por URL o búsqueda.', usage: 'soundcloud <url|búsqueda>',
    async handler(ctx) {
      const result = await downloadSoundCloud(requireText(ctx.argText, 'Debes indicar una URL o búsqueda de SoundCloud.'))
      try {
        await sendDownloadInfo(ctx, result.info, result.size)
        await ctx.socket.sendMessage(ctx.chatId, { audio: { url: result.filePath }, mimetype: 'audio/mpeg', ptt: false }, { quoted: ctx.message })
        recordSubbotDownload(ctx.instanceId, result.size)
      } finally { await result.cleanup() }
    },
  },
  socialCommand('tiktok', ['tt'], 'tiktok', '🎵'),
  socialCommand('instagram', ['ig', 'insta'], 'instagram', '📸'),
  socialCommand('facebook', ['fb'], 'facebook', '📘'),
  socialCommand('twitter', ['x', 'tweet'], 'twitter', '🐦'),
  {
    name: 'mediafire', aliases: ['mf'], category: 'downloads', description: 'Descarga un archivo desde MediaFire.', usage: 'mediafire <url>',
    async handler(ctx) {
      const result = await downloadMediaFire(requireUrl(ctx.args))
      try {
        await ctx.socket.sendMessage(ctx.chatId, { document: { url: result.filePath }, mimetype: result.contentType, fileName: result.fileName, caption: `☁️ *MediaFire*\n📦 ${result.fileName}\n📏 ${formatBytes(result.size)}` }, { quoted: ctx.message })
        recordSubbotDownload(ctx.instanceId, result.size)
      } finally { await result.cleanup() }
    },
  },
]
