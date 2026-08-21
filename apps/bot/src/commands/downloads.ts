import type { BotCommand } from '../types.js'
import {
  downloadSocialVideo,
  downloadSoundCloud,
  downloadYouTubeAudio,
  downloadYouTubeSearchAudio,
  downloadYouTubeSearchVideo,
  downloadYouTubeVideo,
  getYouTubeFormats,
  searchYouTube,
  type DownloadPlatform,
} from '../services/downloader.js'
import { downloadMediaFire } from '../services/mediafire.js'

function requireUrl(args: string[]) {
  const url = args[0]
  if (!url) throw new Error('Debes indicar una URL.')
  return url
}

function requireText(value: string, label = 'Debes indicar una búsqueda.') {
  const text = value.trim()
  if (!text) throw new Error(label)
  return text
}

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return 'N/D'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`
}

const socialCommand = (
  name: string,
  aliases: string[],
  platform: Exclude<DownloadPlatform, 'youtube'>,
  icon: string,
): BotCommand => ({
  name,
  aliases,
  category: 'downloads',
  description: `Descarga contenido público de ${name}.`,
  usage: `${name} <url>`,
  async handler(ctx) {
    const url = requireUrl(ctx.args)
    await ctx.reply(`${icon} Preparando descarga de *${name}*...`)
    const result = await downloadSocialVideo(url, platform)
    try {
      await ctx.socket.sendMessage(ctx.chatId, {
        video: { url: result.filePath },
        mimetype: 'video/mp4',
        caption: `${icon} *${name}* · ${formatBytes(result.size)}\n👻 ${ctx.prefix}menu`,
      }, { quoted: ctx.message })
    } finally {
      await result.cleanup()
    }
  },
})

export const downloadCommands: BotCommand[] = [
  {
    name: 'yts',
    aliases: ['ytsearch', 'buscarvideo'],
    category: 'downloads',
    description: 'Busca videos públicos en YouTube.',
    usage: 'yts <búsqueda>',
    async handler(ctx) {
      const results = await searchYouTube(requireText(ctx.argText), 5)
      if (!results.length) throw new Error('No encontré resultados para esa búsqueda.')
      const lines = results.map((item, index) => [
        `*${index + 1}. ${item.title}*`,
        `👤 ${item.channel}`,
        `⏱️ ${formatDuration(item.duration)}`,
        `🔗 ${item.url}`,
      ].join('\n'))
      await ctx.reply(`🔎 *Resultados de YouTube*\n\n${lines.join('\n\n')}\n\n🎵 Usa *${ctx.prefix}play <búsqueda>* para descargar audio.`)
    },
  },
  {
    name: 'play',
    aliases: ['playaudio'],
    category: 'downloads',
    description: 'Busca en YouTube y descarga el primer resultado como MP3.',
    usage: 'play <búsqueda>',
    async handler(ctx) {
      const query = requireText(ctx.argText)
      await ctx.reply(`🔎 Buscando *${query}* y preparando audio...`)
      const result = await downloadYouTubeSearchAudio(query)
      try {
        await ctx.socket.sendMessage(ctx.chatId, {
          audio: { url: result.filePath },
          mimetype: 'audio/mpeg',
          ptt: false,
        }, { quoted: ctx.message })
      } finally {
        await result.cleanup()
      }
    },
  },
  {
    name: 'playvideo',
    aliases: ['playvid'],
    category: 'downloads',
    description: 'Busca en YouTube y descarga el primer resultado como video.',
    usage: 'playvideo <búsqueda>',
    async handler(ctx) {
      const query = requireText(ctx.argText)
      await ctx.reply(`🔎 Buscando *${query}* y preparando video hasta *720p*...`)
      const result = await downloadYouTubeSearchVideo(query, 720)
      try {
        await ctx.socket.sendMessage(ctx.chatId, {
          video: { url: result.filePath },
          mimetype: 'video/mp4',
          caption: `🎬 YouTube · hasta 720p · ${formatBytes(result.size)}`,
        }, { quoted: ctx.message })
      } finally {
        await result.cleanup()
      }
    },
  },
  {
    name: 'ytformats',
    aliases: ['ytquality', 'ytcalidad'],
    category: 'downloads',
    description: 'Muestra calidades disponibles de un video de YouTube.',
    usage: 'ytformats <url>',
    async handler(ctx) {
      const data = await getYouTubeFormats(requireUrl(ctx.args))
      const video = data.videoHeights.length ? data.videoHeights.map((height) => `${height}p`).join(', ') : 'No detectadas'
      const audio = data.audioBitrates.length ? data.audioBitrates.map((bitrate) => `${bitrate} kbps`).join(', ') : 'Automática'
      await ctx.reply(`🎬 *${data.title}*\n\n⏱️ Duración: ${formatDuration(data.duration)}\n📺 Video: ${video}\n🎵 Audio: ${audio}\n\nEjemplo: *${ctx.prefix}ytmp4 <url> 720*`)
    },
  },
  {
    name: 'ytmp3',
    aliases: ['yta', 'ytaudio'],
    category: 'downloads',
    description: 'Descarga audio de YouTube en MP3.',
    usage: 'ytmp3 <url>',
    async handler(ctx) {
      await ctx.reply('🎵 Preparando audio de YouTube...')
      const result = await downloadYouTubeAudio(requireUrl(ctx.args))
      try {
        await ctx.socket.sendMessage(ctx.chatId, {
          audio: { url: result.filePath },
          mimetype: 'audio/mpeg',
          ptt: false,
        }, { quoted: ctx.message })
      } finally {
        await result.cleanup()
      }
    },
  },
  {
    name: 'ytmp4',
    aliases: ['ytv', 'ytvideo'],
    category: 'downloads',
    description: 'Descarga video de YouTube con calidad seleccionable.',
    usage: 'ytmp4 <url> [144|240|360|480|720|1080|1440|2160]',
    async handler(ctx) {
      const url = requireUrl(ctx.args)
      const requested = Number.parseInt(ctx.args[1] ?? '720', 10)
      const allowed = [144, 240, 360, 480, 720, 1080, 1440, 2160]
      const quality = allowed.includes(requested) ? requested : 720
      await ctx.reply(`🎬 Preparando video de YouTube hasta *${quality}p*...`)
      const result = await downloadYouTubeVideo(url, quality)
      try {
        await ctx.socket.sendMessage(ctx.chatId, {
          video: { url: result.filePath },
          mimetype: 'video/mp4',
          caption: `🎬 YouTube · hasta ${quality}p · ${formatBytes(result.size)}\n👻 ${ctx.prefix}menu`,
        }, { quoted: ctx.message })
      } finally {
        await result.cleanup()
      }
    },
  },
  {
    name: 'soundcloud',
    aliases: ['sc', 'scdl'],
    category: 'downloads',
    description: 'Descarga audio público de SoundCloud por URL o búsqueda.',
    usage: 'soundcloud <url|búsqueda>',
    async handler(ctx) {
      const input = requireText(ctx.argText, 'Debes indicar una URL o búsqueda de SoundCloud.')
      await ctx.reply('🎧 Preparando audio de SoundCloud...')
      const result = await downloadSoundCloud(input)
      try {
        await ctx.socket.sendMessage(ctx.chatId, {
          audio: { url: result.filePath },
          mimetype: 'audio/mpeg',
          ptt: false,
        }, { quoted: ctx.message })
      } finally {
        await result.cleanup()
      }
    },
  },
  socialCommand('tiktok', ['tt'], 'tiktok', '🎵'),
  socialCommand('instagram', ['ig', 'insta'], 'instagram', '📸'),
  socialCommand('facebook', ['fb'], 'facebook', '📘'),
  socialCommand('twitter', ['x', 'tweet'], 'twitter', '🐦'),
  {
    name: 'mediafire',
    aliases: ['mf'],
    category: 'downloads',
    description: 'Descarga un archivo desde un enlace público de MediaFire.',
    usage: 'mediafire <url>',
    async handler(ctx) {
      await ctx.reply('☁️ Resolviendo enlace de MediaFire...')
      const result = await downloadMediaFire(requireUrl(ctx.args))
      await ctx.socket.sendMessage(ctx.chatId, {
        document: result.buffer,
        mimetype: result.contentType,
        fileName: result.fileName,
        caption: `☁️ *MediaFire*\n📦 ${result.fileName}\n📏 ${formatBytes(result.buffer.byteLength)}`,
      }, { quoted: ctx.message })
    },
  },
]
