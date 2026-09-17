import type { BotCommand, CommandContext } from '../types.js'
import { sendCarousel, type CarouselCard } from '../services/interactive.js'
import { downloadSpotifyAudio, isSpotifyUrl, resolveSpotifyItem, searchSpotify, type SpotifyTrack } from '../services/spotify.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

const SEARCH_LIMIT = 5

function formatBytes(bytes: number) {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return undefined
  const total = Math.max(0, Math.round(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function itemBody(track: SpotifyTrack) {
  return [
    track.artist ? `Artista: *${track.artist}*` : '',
    formatDuration(track.duration) ? `Duración: *${formatDuration(track.duration)}*` : '',
    track.kind !== 'track' ? `Tipo: *${track.kind}*` : '',
  ].filter(Boolean).join('\n') || 'Pista disponible.'
}

function downloadInput(track: SpotifyTrack) {
  return track.spotifyUrl && /\/track\//i.test(track.spotifyUrl)
    ? track.spotifyUrl
    : track.downloadQuery
}

async function sendSpotifyResults(ctx: CommandContext, query: string) {
  const rows = await searchSpotify(query, SEARCH_LIMIT)
  if (!rows.length) throw new Error('No encontré resultados musicales para esa búsqueda.')

  const cards: CarouselCard[] = rows.map((track, index) => {
    const buttons: CarouselCard['buttons'] = []
    if (track.kind === 'track') {
      buttons.push({ type: 'reply', text: 'Descargar MP3', id: `${ctx.prefix}spotifydl ${downloadInput(track)}` })
    }
    if (track.spotifyUrl) buttons.push({ type: 'url', text: 'Abrir Spotify', url: track.spotifyUrl })
    return {
      title: `${index + 1}. ${track.title}`.slice(0, 120),
      body: itemBody(track),
      imageUrl: track.image,
      buttons,
    }
  })

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: 'SPOTIFY · MÚSICA',
    body: isSpotifyUrl(query) ? 'Contenido reconocido desde Spotify.' : `Resultados para *${query}*`,
    footer: 'Ghost Nexora Bot · busca, abre o descarga audio',
    cards,
  })
}

async function sendDirectSpotifyCard(ctx: CommandContext, input: string) {
  const track = await resolveSpotifyItem(input)
  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: 'SPOTIFY · CONTENIDO',
    body: 'Enlace reconocido correctamente.',
    footer: 'Ghost Nexora Bot',
    cards: [{
      title: track.title.slice(0, 120),
      body: itemBody(track),
      imageUrl: track.image,
      buttons: [
        ...(track.kind === 'track' ? [{ type: 'reply' as const, text: 'Descargar MP3', id: `${ctx.prefix}spotifydl ${track.spotifyUrl}` }] : []),
        ...(track.spotifyUrl ? [{ type: 'url' as const, text: 'Abrir Spotify', url: track.spotifyUrl }] : []),
      ],
    }],
  })
}

async function download(ctx: CommandContext) {
  const input = ctx.argText.trim()
  if (!input) throw new Error(`Uso: ${ctx.prefix}spotifydl <canción|enlace de Spotify>`)
  await ctx.reply(`🎵 *SPOTIFY*\n━━━━━━━━━━━━━━\nBuscando el audio de *${input.slice(0, 110)}*...`)

  const result = await downloadSpotifyAudio(input)
  try {
    const title = result.track.title || result.download.info?.title || result.download.fileName
    const artist = result.track.artist || result.download.info?.uploader
    const caption = [
      '🎵 *SPOTIFY · AUDIO*',
      '━━━━━━━━━━━━━━',
      `Título: *${title}*`,
      artist ? `Artista: *${artist}*` : '',
      `Tamaño: *${formatBytes(result.download.size)}*`,
    ].filter(Boolean).join('\n')

    if (result.track.image) {
      await ctx.socket.sendMessage(ctx.chatId, {
        image: { url: result.track.image },
        caption,
      }, { quoted: ctx.message }).catch(() => ctx.reply(caption))
    } else {
      await ctx.reply(caption)
    }

    await ctx.socket.sendMessage(ctx.chatId, {
      audio: { url: result.download.filePath },
      mimetype: 'audio/mpeg',
      ptt: false,
    }, { quoted: ctx.message })
    recordSubbotDownload(ctx.instanceId, result.download.size)
  } finally {
    await result.download.cleanup()
  }
}

export const spotifyCommands: BotCommand[] = [
  {
    name: 'spotify',
    aliases: ['sp', 'spotifysearch'],
    category: 'downloads',
    description: 'Busca música, reconoce enlaces de Spotify y permite descargar la pista como MP3.',
    usage: 'spotify <canción|artista|enlace>',
    async handler(ctx) {
      const input = ctx.argText.trim()
      if (!input) throw new Error(`Uso: ${ctx.prefix}spotify <canción|artista|enlace>`)
      if (isSpotifyUrl(input)) await sendDirectSpotifyCard(ctx, input)
      else await sendSpotifyResults(ctx, input)
    },
  },
  {
    name: 'spotifydl',
    aliases: ['spdl', 'spotifydownload'],
    category: 'downloads',
    description: 'Descarga como MP3 una pista indicada por nombre o enlace individual de Spotify.',
    usage: 'spotifydl <canción|enlace>',
    handler: download,
  },
]
