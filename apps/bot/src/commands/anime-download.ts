import type { BotCommand } from '../types.js'
import { downloadAnimeEpisode, getAnimeEpisodes, getAnimeSources, searchAnime } from '../services/anime.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

const formatBytes = (bytes: number) => {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

const sourceQuality = (quality: string) => quality && quality !== 'unknown' ? quality : 'calidad disponible'

export const animeDownloadCommands: BotCommand[] = [
  {
    name: 'anime',
    aliases: ['animes', 'buscaranime'],
    category: 'downloads',
    description: 'Busca un anime en varias fuentes y muestra sus identificadores.',
    usage: 'anime <nombre>',
    async handler(ctx) {
      const query = ctx.argText.trim()
      if (query.length < 2) throw new Error(`Uso: ${ctx.prefix}anime <nombre>`)

      await ctx.reply(`🔎 *ANIME*\n━━━━━━━━━━━━━━\nBuscando: *${query}*...`)
      const results = await searchAnime(query, 8)
      if (!results.length) throw new Error('No encontré ese anime en las fuentes disponibles.')

      const lines = results.map((item, index) => `${index + 1}. *${item.title}*\nID: \`${item.id}\``)
      await ctx.reply(
        `📺 *RESULTADOS*\n━━━━━━━━━━━━━━\n${lines.join('\n\n')}\n\n` +
        `Para ver episodios:\n\`${ctx.prefix}animeeps <ID>\``,
      )
    },
  },
  {
    name: 'animeeps',
    aliases: ['episodiosanime', 'animeepisodes'],
    category: 'downloads',
    description: 'Lista los episodios disponibles de un anime.',
    usage: 'animeeps <id>',
    async handler(ctx) {
      const animeId = ctx.argText.trim()
      if (!animeId) throw new Error(`Uso: ${ctx.prefix}animeeps <id>`)

      await ctx.reply(`📺 *ANIME*\n━━━━━━━━━━━━━━\nCargando episodios...`)
      const episodes = await getAnimeEpisodes(animeId)
      if (!episodes.length) throw new Error('No pude obtener episodios para ese anime.')

      const compact = episodes.slice(0, 60).map((episode) =>
        `• Episodio *${episode.number}* → \`${ctx.prefix}animedl ${animeId} ${episode.number}\``,
      )
      const extra = episodes.length > 60 ? `\n\n... y ${episodes.length - 60} episodios más.` : ''
      await ctx.reply(`🎬 *EPISODIOS*\n━━━━━━━━━━━━━━\n${compact.join('\n')}${extra}`)
    },
  },
  {
    name: 'animedl',
    aliases: ['animedownload', 'anime-descargar'],
    category: 'downloads',
    description: 'Descarga un episodio de anime desde una fuente disponible.',
    usage: 'animedl <id> <episodio>',
    async handler(ctx) {
      const animeId = ctx.args[0]?.trim()
      const episodeNumber = Number(ctx.args[1])
      if (!animeId || !Number.isInteger(episodeNumber) || episodeNumber < 1) {
        throw new Error(`Uso: ${ctx.prefix}animedl <id> <episodio>`)
      }

      const episodes = await getAnimeEpisodes(animeId)
      const episode = episodes.find((item) => item.number === episodeNumber)
      if (!episode) throw new Error(`No encontré el episodio ${episodeNumber}.`)

      const sources = await getAnimeSources(episode.id)
      if (!sources.length) throw new Error('No encontré una fuente de vídeo disponible para ese episodio.')

      const source = sources[0]!
      await ctx.reply(`⬇️ *ANIME*\n━━━━━━━━━━━━━━\nEpisodio: *${episodeNumber}*\nCalidad: *${sourceQuality(source.quality)}*\nDescargando...`)

      const result = await downloadAnimeEpisode(source, animeId, episodeNumber)
      try {
        await ctx.socket.sendMessage(ctx.chatId, {
          document: { url: result.filePath },
          fileName: result.fileName,
          mimetype: 'video/mp4',
          caption: `🎬 *ANIME*\nEpisodio: *${episodeNumber}*\nCalidad: *${sourceQuality(source.quality)}*\nTamaño: *${formatBytes(result.size)}*`,
        }, { quoted: ctx.message })
        recordSubbotDownload(ctx.instanceId, result.size)
      } finally {
        await result.cleanup()
      }
    },
  },
]
