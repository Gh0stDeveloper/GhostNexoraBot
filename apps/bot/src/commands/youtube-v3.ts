import type { BotCommand, CommandContext } from '../types.js'
import {
  downloadYouTubeAudio,
  downloadYouTubeVideo,
  getMediaInfo,
  searchYouTube,
  type DownloadResult,
  type MediaInfo,
} from '../services/downloader.js'
import { downloadLempi } from '../services/lempi.js'
import { sendCarousel } from '../services/interactive.js'
import { createDownloadProgress } from '../services/progress.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'
import { logger } from '../utils/logger.js'

const youtubeHosts = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']

function bytes(value: number) {
  return value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(2)} GB` : `${(value / 1024 / 1024).toFixed(1)} MB`
}

function youtubeUrl(input: string) {
  let url: URL
  try { url = new URL(input) } catch { throw new Error('URL inválida.') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Solo se permiten URLs HTTP/HTTPS.')
  const host = url.hostname.toLowerCase()
  if (!youtubeHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) throw new Error('La URL no pertenece a YouTube.')
  return url.toString()
}

function duration(seconds?: number) {
  if (!seconds || seconds <= 0) return undefined
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return [h ? `${h}h` : '', m ? `${m}m` : '', (!h || !m) && s ? `${s}s` : ''].filter(Boolean).join(' ')
}

function count(value?: number) {
  return Number.isFinite(value) ? Math.max(0, Number(value)).toLocaleString('es-MX') : undefined
}

type MediaFile = Pick<DownloadResult, 'filePath' | 'fileName' | 'size' | 'cleanup'> & { info?: MediaInfo }

function mediaCaption(kind: 'audio' | 'video', info: MediaInfo | undefined, size: number, quality?: number) {
  return [
    kind === 'audio' ? '🎵 *YOUTUBE · AUDIO*' : '🎬 *YOUTUBE · VIDEO*',
    '━━━━━━━━━━━━━━',
    info?.title ? `🎧 Título: *${info.title}*` : '',
    info?.uploader ? `👤 Canal: *${info.uploader}*` : '',
    count(info?.views) ? `👁️ Vistas: *${count(info?.views)}*` : '',
    count(info?.likes) ? `👍 Me gusta: *${count(info?.likes)}*` : '',
    duration(info?.duration) ? `⏱️ Duración: *${duration(info?.duration)}*` : '',
    kind === 'video' && quality ? `🎞️ Calidad solicitada: *${quality}p*` : '',
    `📦 Peso: *${bytes(size)}*`,
    info?.webpageUrl ? `🔗 ${info.webpageUrl}` : '',
  ].filter(Boolean).join('\n')
}

async function sendYoutube(ctx: CommandContext, kind: 'audio' | 'video') {
  const url = youtubeUrl(ctx.args[0] ?? '')
  const allowed = [144, 240, 360, 480, 720, 1080, 1440, 2160]
  const requested = Number(ctx.args[1] ?? 720)
  const quality = allowed.includes(requested) ? requested : 720
  const progress = await createDownloadProgress(ctx, kind === 'audio' ? 'YouTube · audio' : `YouTube · video ${quality}p`)
  const metadataPromise = getMediaInfo(url, 'youtube').catch(() => undefined)
  await progress.update('downloading', 'Preparando y descargando el contenido…')

  let result: MediaFile | null = null
  try {
    try {
      result = await downloadLempi(url, kind, quality)
    } catch (error) {
      logger.warn({ error, kind }, 'Lempi failed; using legacy YouTube fallback')
      await progress.update('downloading', 'Continuando la descarga…')
      result = kind === 'audio' ? await downloadYouTubeAudio(url) : await downloadYouTubeVideo(url, quality)
    }

    const info = result.info ?? await metadataPromise
    await progress.update('sending', `${bytes(result.size)} · enviando a WhatsApp`)
    const caption = mediaCaption(kind, info, result.size, kind === 'video' ? quality : undefined)

    if (kind === 'audio') {
      // WhatsApp no expone un caption normal para mensajes de audio; la ficha se envía justo antes.
      await ctx.socket.sendMessage(ctx.chatId, { text: caption }, { quoted: ctx.message })
      await ctx.socket.sendMessage(ctx.chatId, {
        audio: { url: result.filePath },
        mimetype: 'audio/mpeg',
        ptt: false,
      }, { quoted: ctx.message })
    } else {
      await ctx.socket.sendMessage(ctx.chatId, {
        video: { url: result.filePath },
        mimetype: 'video/mp4',
        caption,
      }, { quoted: ctx.message })
    }
    recordSubbotDownload(ctx.instanceId, result.size)
    await progress.update('done', `${bytes(result.size)} enviados correctamente.`)
  } finally {
    if (result) await result.cleanup().catch(() => undefined)
  }
}

async function yts(ctx: CommandContext) {
  const query = ctx.argText.trim()
  if (!query) throw new Error(`Uso: ${ctx.prefix}yts <búsqueda>`)
  const rows = await searchYouTube(query, 8)
  if (!rows.length) throw new Error('No encontré resultados en YouTube.')

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '▶️ YOUTUBE · BÚSQUEDA',
    body: `Resultados para: ${query}\nDesliza y elige audio o video.`,
    footer: 'Ghost Nexora Bot · YouTube',
    cards: rows.map((item, index) => ({
      title: `#${index + 1} · ${item.title}`.slice(0, 120),
      body: [
        item.channel ? `👤 ${item.channel}` : '',
        duration(item.duration) ? `⏱️ ${duration(item.duration)}` : '',
        count(item.views) ? `👁️ ${count(item.views)} vistas` : '',
        'Selecciona el formato que quieres descargar.',
      ].filter(Boolean).join('\n'),
      imageUrl: item.thumbnail,
      buttons: [
        { type: 'reply', text: '🎵 Audio', id: `${ctx.prefix}ytmp3 ${item.url}` },
        { type: 'reply', text: '🎬 Video 720p', id: `${ctx.prefix}ytmp4 ${item.url} 720` },
        { type: 'url', text: '▶️ Abrir', url: item.url },
      ],
    })),
  })
}

export const youtubeV3Commands: BotCommand[] = [
  { name: 'yts', aliases: ['ytsearch', 'buscarvideo'], category: 'downloads', description: 'Busca videos de YouTube y muestra resultados en carrusel.', handler: yts },
  { name: 'ytmp3', aliases: ['yta', 'ytaudio'], category: 'downloads', description: 'Descarga audio desde un enlace de YouTube.', usage: 'ytmp3 <url>', handler: (ctx) => sendYoutube(ctx, 'audio') },
  { name: 'ytmp4', aliases: ['ytv', 'ytvideo'], category: 'downloads', description: 'Descarga video desde un enlace de YouTube.', usage: 'ytmp4 <url> [calidad]', handler: (ctx) => sendYoutube(ctx, 'video') },
  { name: 'play', aliases: ['playaudio'], category: 'downloads', description: 'Descarga audio desde un enlace de YouTube.', usage: 'play <url>', handler: (ctx) => sendYoutube(ctx, 'audio') },
  { name: 'playvideo', aliases: ['pv'], category: 'downloads', description: 'Descarga video desde un enlace de YouTube.', usage: 'playvideo <url> [calidad]', handler: (ctx) => sendYoutube(ctx, 'video') },
]
