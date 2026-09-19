import { createHash } from 'node:crypto'
import type { BotCommand, LegacyCompatibleCommandContext } from '../types.js'
import { sendCarousel, sendInteractiveCard } from '../services/interactive.js'
import { downloadYouTubeSearchAudio } from '../services/downloader.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'
import { getSpotifyTrack, searchSpotifyTracks, spotifyTrackId, type SpotifyTrack } from '../services/spotify.js'

const CACHE_TTL_MS = 20 * 60_000
type CachedTrack = SpotifyTrack & { expiresAt: number }
const cache = new Map<string, CachedTrack>()

function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

function tokenFor(track: SpotifyTrack) {
  return `sp_${createHash('sha256').update(track.id).digest('hex').slice(0, 16)}`
}

function remember(track: SpotifyTrack) {
  const token = tokenFor(track)
  cache.set(token, { ...track, expiresAt: Date.now() + CACHE_TTL_MS })
  return token
}

function cached(token: string) {
  const track = cache.get(token)
  if (!track || track.expiresAt <= Date.now()) {
    cache.delete(token)
    throw new Error('Ese resultado de Spotify expiró. Vuelve a buscar con .spotify <canción>.')
  }
  return track
}

async function resolveTrack(value: string) {
  if (/^sp_[a-f0-9]{16}$/i.test(value)) return cached(value)
  return getSpotifyTrack(value)
}

async function showTrack(ctx: LegacyCompatibleCommandContext, track: SpotifyTrack) {
  const token = remember(track)
  await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
    title: `Spotify · ${track.name}`,
    body: [
      `Artista: ${track.artists.join(', ') || 'Desconocido'}`,
      track.album ? `Álbum: ${track.album}` : '',
      `Duración: ${formatDuration(track.durationMs)}`,
    ].filter(Boolean).join('\n'),
    imageUrl: track.image,
    footer: 'Ghost Nexora Bot · Metadatos de Spotify',
    buttons: [
      { type: 'reply', text: 'Descargar audio', id: `${ctx.prefix}spotifydl ${token}` },
      { type: 'url', text: 'Abrir en Spotify', url: track.url },
      { type: 'reply', text: 'Letra', id: `${ctx.prefix}lyrics ${track.name} ${track.artists[0] ?? ''}`.trim() },
    ],
  })
}

export async function spotifySearch(ctx: LegacyCompatibleCommandContext) {
  const input = ctx.argText.trim()
  if (!input) throw new Error(`Uso: ${ctx.prefix}spotify <canción|artista|enlace de Spotify>`)

  if (spotifyTrackId(input)) {
    await showTrack(ctx, await getSpotifyTrack(input))
    return
  }

  await ctx.reply(`Buscando *${input.slice(0, 120)}* en Spotify…`)
  const tracks = await searchSpotifyTracks(input, 8)
  if (!tracks.length) throw new Error('Spotify no devolvió canciones para esa búsqueda.')

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: 'SPOTIFY · RESULTADOS',
    body: `Resultados para: *${input.slice(0, 120)}*\nSelecciona una canción para descargarla o abrirla en Spotify.`,
    footer: 'Ghost Nexora Bot · Spotify Web API',
    cards: tracks.map((track, index) => {
      const token = remember(track)
      return {
        title: `#${index + 1} · ${track.name}`.slice(0, 80),
        body: [
          track.artists.join(', '),
          track.album,
          formatDuration(track.durationMs),
        ].filter(Boolean).join('\n').slice(0, 240),
        imageUrl: track.image,
        buttons: [
          { type: 'reply' as const, text: 'Descargar audio', id: `${ctx.prefix}spotifydl ${token}` },
          { type: 'url' as const, text: 'Spotify', url: track.url },
          { type: 'reply' as const, text: 'Letra', id: `${ctx.prefix}lyrics ${track.name} ${track.artists[0] ?? ''}`.trim() },
        ],
      }
    }),
  })
}

async function spotifyDownload(ctx: LegacyCompatibleCommandContext) {
  const value = ctx.args[0]?.trim() ?? ''
  if (!value) throw new Error(`Uso: ${ctx.prefix}spotifydl <resultado|enlace Spotify>`)
  const track = await resolveTrack(value)
  const artist = track.artists.join(' ')
  const query = [artist, track.name, 'official audio'].filter(Boolean).join(' ')

  await ctx.reply([
    'SPOTIFY · AUDIO',
    `Canción: *${track.name}*`,
    `Artista: *${track.artists.join(', ') || 'Desconocido'}*`,
    'Buscando una fuente de audio compatible…',
  ].join('\n'))

  const result = await downloadYouTubeSearchAudio(query)
  try {
    await ctx.socket.sendMessage(ctx.chatId, {
      audio: { url: result.filePath },
      mimetype: 'audio/mpeg',
      ptt: false,
    }, { quoted: ctx.message })
    recordSubbotDownload(ctx.instanceId, result.size)
  } finally {
    await result.cleanup()
  }
}

export const spotifyCommands: BotCommand[] = [
  {
    name: 'spotifydl',
    aliases: ['spdl'],
    category: 'downloads',
    description: 'Descarga el audio asociado a una canción seleccionada desde Spotify.',
    usage: 'spotifydl <resultado|url>',
    handler: spotifyDownload,
  },
]
