import type { BotCommand } from '../types.js'
import {
  downloadYouTubeAudio,
  downloadYouTubeSearchAudio,
  downloadYouTubeSearchVideo,
  downloadYouTubeVideo,
  type DownloadResult,
} from '../services/downloader.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

const youtubeUrl = /^https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)\//i

function formatBytes(bytes: number) {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function requireInput(value: string) {
  const text = value.trim()
  if (!text) throw new Error('Indica una URL de YouTube o el nombre de lo que quieres buscar.')
  return text
}

async function sendMediaHeader(ctx: Parameters<BotCommand['handler']>[0], result: DownloadResult, kind: 'audio' | 'video') {
  const info = result.info
  const caption = [
    `╭━━〔 ${kind === 'audio' ? '🎵' : '🎬'} *YOUTUBE* 〕━━╮`,
    `┃ ${info?.title ?? result.fileName}`,
    info?.uploader ? `┃ Canal » ${info.uploader}` : '',
    `┃ Peso » ${formatBytes(result.size)}`,
    '╰━━━━━━━━━━━━━━━━╯',
  ].filter(Boolean).join('\n')
  if (info?.thumbnail) {
    const sent = await ctx.socket.sendMessage(ctx.chatId, { image: { url: info.thumbnail }, caption }, { quoted: ctx.message }).catch(() => null)
    if (sent) return
  }
  await ctx.reply(caption)
}

async function audioResult(input: string) {
  return youtubeUrl.test(input) ? downloadYouTubeAudio(input) : downloadYouTubeSearchAudio(input)
}

async function videoResult(input: string, quality = 720) {
  return youtubeUrl.test(input) ? downloadYouTubeVideo(input, quality) : downloadYouTubeSearchVideo(input, quality)
}

export const youtubeFriendlyCommands: BotCommand[] = [
  {
    name: 'play', aliases: ['playaudio', 'nota'], category: 'downloads',
    description: 'Busca una canción y la envía como nota de voz.', usage: 'play <búsqueda|url>',
    async handler(ctx) {
      const input = requireInput(ctx.argText)
      await ctx.reply(`╭─〔 🔎 *BUSCANDO AUDIO* 〕\n│ ${input.slice(0, 120)}\n╰──────────────`)
      const result = await audioResult(input)
      try {
        await sendMediaHeader(ctx, result, 'audio')
        await ctx.socket.sendMessage(ctx.chatId, {
          audio: { url: result.filePath },
          mimetype: 'audio/mpeg',
          ptt: true,
        }, { quoted: ctx.message })
        recordSubbotDownload(ctx.instanceId, result.size)
      } finally { await result.cleanup() }
    },
  },
  {
    name: 'ytmusic', aliases: ['ytmusicdl', 'music'], category: 'downloads',
    description: 'Busca o descarga audio de YouTube/YouTube Music como archivo de audio normal.', usage: 'ytmusic <búsqueda|url>',
    async handler(ctx) {
      const input = requireInput(ctx.argText)
      const result = await audioResult(input)
      try {
        await sendMediaHeader(ctx, result, 'audio')
        await ctx.socket.sendMessage(ctx.chatId, {
          audio: { url: result.filePath },
          mimetype: 'audio/mpeg',
          ptt: false,
        }, { quoted: ctx.message })
        recordSubbotDownload(ctx.instanceId, result.size)
      } finally { await result.cleanup() }
    },
  },
  {
    name: 'yt', aliases: ['youtube'], category: 'downloads',
    description: 'Busca o descarga video de YouTube.', usage: 'yt <búsqueda|url> [calidad]',
    async handler(ctx) {
      const possibleQuality = Number(ctx.args.at(-1))
      const allowed = [144, 240, 360, 480, 720, 1080, 1440, 2160]
      const quality = allowed.includes(possibleQuality) ? possibleQuality : 720
      const input = requireInput(allowed.includes(possibleQuality) ? ctx.args.slice(0, -1).join(' ') : ctx.argText)
      const result = await videoResult(input, quality)
      try {
        await sendMediaHeader(ctx, result, 'video')
        await ctx.socket.sendMessage(ctx.chatId, {
          video: { url: result.filePath },
          mimetype: 'video/mp4',
          caption: `🎬 *${result.info?.title ?? 'YouTube'}*\nCalidad objetivo: hasta ${quality}p · ${formatBytes(result.size)}`,
        }, { quoted: ctx.message })
        recordSubbotDownload(ctx.instanceId, result.size)
      } finally { await result.cleanup() }
    },
  },
]
