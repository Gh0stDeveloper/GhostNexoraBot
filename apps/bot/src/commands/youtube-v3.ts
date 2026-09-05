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
import { sendCarousel, sendInteractiveCard } from '../services/interactive.js'
import { createDownloadProgress } from '../services/progress.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'
import { logger } from '../utils/logger.js'

const youtubeHosts = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']
const DOWNLOAD_QUALITIES = [144, 240, 360, 720] as const

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

function wantsDocument(value?: string) {
  return ['doc', 'document', 'documento', 'file', 'archivo'].includes((value ?? '').trim().toLowerCase())
}

async function sendYoutube(ctx: CommandContext, kind: 'audio' | 'video') {
  const url = youtubeUrl(ctx.args[0] ?? '')
  const allowed = [144, 240, 360, 480, 720, 1080, 1440, 2160]
  const requested = Number(ctx.args[1] ?? 720)
  const quality = allowed.includes(requested) ? requested : 720
  const asDocument = kind === 'audio' ? wantsDocument(ctx.args[1]) : wantsDocument(ctx.args[2])
  const progressLabel = kind === 'audio'
    ? `YouTube · audio${asDocument ? ' documento' : ''}`
    : `YouTube · video ${quality}p${asDocument ? ' documento' : ''}`
  const progress = await createDownloadProgress(ctx, progressLabel)
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

    if (asDocument) {
      await ctx.socket.sendMessage(ctx.chatId, {
        document: { url: result.filePath },
        mimetype: kind === 'audio' ? 'audio/mpeg' : 'video/mp4',
        fileName: result.fileName,
        caption,
      }, { quoted: ctx.message })
    } else if (kind === 'audio') {
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

async function youtubeDownloadMenu(ctx: CommandContext) {
  const url = youtubeUrl(ctx.args[0] ?? '')
  const info = await getMediaInfo(url, 'youtube').catch((): MediaInfo => ({
    title: 'Video de YouTube',
    webpageUrl: url,
  }))

  const body = [
    `🎬 *${info.title || 'Video de YouTube'}*`,
    info.uploader ? `👤 ${info.uploader}` : '',
    duration(info.duration) ? `⏱️ ${duration(info.duration)}` : '',
    count(info.views) ? `👁️ ${count(info.views)} vistas` : '',
    '',
    'Toca *Seleccionar* para elegir calidad y tipo de descarga.',
  ].filter((line) => line !== '').join('\n')

  await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
    title: '📥 MENÚ DE DESCARGA',
    body,
    footer: 'Ghost Nexora Bot · YouTube',
    imageUrl: info.thumbnail,
    buttons: [{
      type: 'select',
      text: 'Seleccionar',
      sections: [
        {
          title: '🎵 AUDIO',
          rows: [
            {
              id: `${ctx.prefix}ytmp3 ${url}`,
              title: 'Audio MP3',
            },
            {
              id: `${ctx.prefix}ytmp3 ${url} document`,
              title: 'Audio como documento',
            },
          ],
        },
        {
          title: '🎬 VIDEO NORMAL',
          rows: DOWNLOAD_QUALITIES.map((quality) => ({
            id: `${ctx.prefix}ytmp4 ${url} ${quality}`,
            title: `Video ${quality}p`,
          })),
        },
        {
          title: '📁 VIDEO COMO DOCUMENTO',
          rows: DOWNLOAD_QUALITIES.map((quality) => ({
            id: `${ctx.prefix}ytmp4 ${url} ${quality} document`,
            title: `Documento ${quality}p`,
          })),
        },
      ],
    }],
  })
}

async function yts(ctx: CommandContext) {
  const query = ctx.argText.trim()
  if (!query) throw new Error(`Uso: ${ctx.prefix}yts <búsqueda>`)
  const rows = await searchYouTube(query, 8)
  if (!rows.length) throw new Error('No encontré resultados en YouTube.')

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '▶️ YOUTUBE · BÚSQUEDA',
    body: `Resultados para: ${query}\nDesliza y toca Seleccionar.`,
    footer: 'Ghost Nexora Bot · YouTube',
    cards: rows.map((item, index) => ({
      title: `#${index + 1} · ${item.title}`.slice(0, 120),
      body: [
        item.channel ? `👤 ${item.channel}` : '',
        duration(item.duration) ? `⏱️ ${duration(item.duration)}` : '',
        count(item.views) ? `👁️ ${count(item.views)} vistas` : '',
        'Abre el menú para elegir formato y calidad.',
      ].filter(Boolean).join('\n'),
      imageUrl: item.thumbnail,
      buttons: [
        { type: 'reply', text: 'Seleccionar', id: `${ctx.prefix}ytformats ${item.url}` },
      ],
    })),
  })
}

export const youtubeV3Commands: BotCommand[] = [
  { name: 'yts', aliases: ['ytsearch', 'buscarvideo'], category: 'downloads', description: 'Busca videos de YouTube en carrusel con un botón Seleccionar.', handler: yts },
  { name: 'ytformats', aliases: ['ytquality', 'ytcalidad', 'ytmenu'], category: 'downloads', description: 'Abre el menú interactivo de audio, calidad y tipo de descarga de YouTube.', usage: 'ytformats <url>', handler: youtubeDownloadMenu },
  { name: 'ytmp3', aliases: ['yta', 'ytaudio'], category: 'downloads', description: 'Descarga audio desde un enlace de YouTube.', usage: 'ytmp3 <url> [document]', handler: (ctx) => sendYoutube(ctx, 'audio') },
  { name: 'ytmp4', aliases: ['ytv', 'ytvideo'], category: 'downloads', description: 'Descarga video desde un enlace de YouTube.', usage: 'ytmp4 <url> [calidad] [document]', handler: (ctx) => sendYoutube(ctx, 'video') },
  { name: 'play', aliases: ['playaudio'], category: 'downloads', description: 'Descarga audio desde un enlace de YouTube.', usage: 'play <url>', handler: (ctx) => sendYoutube(ctx, 'audio') },
  { name: 'playvideo', aliases: ['pv'], category: 'downloads', description: 'Descarga video desde un enlace de YouTube.', usage: 'playvideo <url> [calidad]', handler: (ctx) => sendYoutube(ctx, 'video') },
]
