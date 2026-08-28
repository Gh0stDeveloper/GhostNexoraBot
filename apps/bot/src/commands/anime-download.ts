import type { BotCommand, CommandContext } from '../types.js'
import {
  downloadAnimeEpisode,
  getAnimeEpisodes,
  getAnimeEpisodesBySeason,
  getAnimeSeasons,
  getAnimeSources,
  searchAnime,
} from '../services/anime.js'
import { sendCarousel, type CarouselCard } from '../services/interactive.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

const SEARCH_PAGE_SIZE = 5
const EPISODE_PAGE_SIZE = 8

const formatBytes = (bytes: number) => {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

const sourceQuality = (quality: string) => quality && quality !== 'unknown' ? quality : 'calidad disponible'
const clampPage = (page: number, total: number) => Math.max(1, Math.min(total, Number.isInteger(page) ? page : 1))

async function animeSearchCarousel(ctx: CommandContext, query: string, page: number) {
  const allResults = await searchAnime(query, 20)
  if (!allResults.length) throw new Error('No encontré ese anime en las fuentes disponibles.')

  const totalPages = Math.max(1, Math.ceil(allResults.length / SEARCH_PAGE_SIZE))
  const currentPage = clampPage(page, totalPages)
  const visible = allResults.slice((currentPage - 1) * SEARCH_PAGE_SIZE, currentPage * SEARCH_PAGE_SIZE)

  const cards: CarouselCard[] = visible.map((item, index) => ({
    title: `${(currentPage - 1) * SEARCH_PAGE_SIZE + index + 1}. ${item.title}`.slice(0, 120),
    body: `ID: ${item.id}\n\nUsa los botones para explorar temporadas, episodios o la ficha del anime.`,
    imageUrl: item.image,
    buttons: [
      { type: 'reply', text: 'Temporadas', id: `${ctx.prefix}animeseasons ${item.id}` },
      { type: 'reply', text: 'Episodios', id: `${ctx.prefix}animeeps ${item.id}` },
      { type: 'reply', text: 'Ficha', id: `${ctx.prefix}animeinfo ${item.id}` },
    ],
  }))

  if (totalPages > 1) {
    const nextPage = currentPage < totalPages ? currentPage + 1 : 1
    cards.push({
      title: currentPage < totalPages ? 'Siguiente tanda' : 'Volver al inicio',
      body: `Página ${currentPage}/${totalPages}. Catálogo dividido en tandas pequeñas para evitar saturar WhatsApp.`,
      buttons: [{ type: 'reply', text: currentPage < totalPages ? 'Siguiente' : 'Primera', id: `${ctx.prefix}anime ${query} ${nextPage}` }],
    })
  }

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: 'ANIME · RESULTADOS',
    body: `Búsqueda: *${query}*\nPágina ${currentPage}/${totalPages} · ${allResults.length} resultados`,
    footer: 'Ghost Nexora Bot · Selecciona una acción',
    cards,
  })
}

async function animeEpisodesCarousel(ctx: CommandContext, animeId: string, seasonNumber?: number, page = 1) {
  const seasons = await getAnimeSeasons(animeId)
  if (!seasons.length) throw new Error('No pude obtener las temporadas disponibles.')

  if (seasonNumber === undefined && seasons.length > 1) {
    await sendSeasonCarousel(ctx, animeId, seasons)
    return
  }

  const selectedSeason = seasonNumber ?? seasons[0]!
  if (!seasons.includes(selectedSeason)) throw new Error(`La temporada ${selectedSeason} no está disponible.`)

  const episodes = await getAnimeEpisodesBySeason(animeId, selectedSeason)
  if (!episodes.length) throw new Error(`No encontré episodios para la temporada ${selectedSeason}.`)

  const totalPages = Math.max(1, Math.ceil(episodes.length / EPISODE_PAGE_SIZE))
  const currentPage = clampPage(page, totalPages)
  const visible = episodes.slice((currentPage - 1) * EPISODE_PAGE_SIZE, currentPage * EPISODE_PAGE_SIZE)

  const cards: CarouselCard[] = visible.map((episode) => ({
    title: `Episodio ${episode.number}`,
    body: `Temporada: *${selectedSeason}*\nEpisodio: *${episode.number}*\n\nPulsa descargar para obtenerlo.`,
    buttons: [{
      type: 'reply',
      text: 'Descargar',
      id: `${ctx.prefix}animedl ${animeId} ${episode.number} ${selectedSeason}`,
    }],
  }))

  if (currentPage > 1) {
    cards.push({
      title: 'Página anterior',
      body: `Regresar a la tanda ${currentPage - 1}.`,
      buttons: [{ type: 'reply', text: 'Anterior', id: `${ctx.prefix}animeeps ${animeId} ${selectedSeason} ${currentPage - 1}` }],
    })
  }
  if (currentPage < totalPages) {
    cards.push({
      title: 'Siguiente tanda',
      body: `Episodios ${currentPage * EPISODE_PAGE_SIZE + 1}-${Math.min(episodes.length, (currentPage + 1) * EPISODE_PAGE_SIZE)}.`,
      buttons: [{ type: 'reply', text: 'Siguiente', id: `${ctx.prefix}animeeps ${animeId} ${selectedSeason} ${currentPage + 1}` }],
    })
  }
  if (seasons.length > 1) {
    cards.push({
      title: 'Temporadas',
      body: `Temporada actual: ${selectedSeason}\nTemporadas disponibles: ${seasons.join(', ')}`,
      buttons: [{ type: 'reply', text: 'Cambiar temporada', id: `${ctx.prefix}animeseasons ${animeId}` }],
    })
  }

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: 'ANIME · EPISODIOS',
    body: `Temporada *${selectedSeason}* · Página ${currentPage}/${totalPages}\n${episodes.length} episodios disponibles`,
    footer: `Ghost Nexora Bot · ${seasons.length} ${seasons.length === 1 ? 'temporada' : 'temporadas'}`,
    cards: cards.slice(0, 12),
  })
}

async function sendSeasonCarousel(ctx: CommandContext, animeId: string, seasons: number[]) {
  const cards: CarouselCard[] = seasons.slice(0, 12).map((season) => ({
    title: `Temporada ${season}`,
    body: `Explora los episodios disponibles de la temporada ${season}.`,
    buttons: [{ type: 'reply', text: 'Ver episodios', id: `${ctx.prefix}animeeps ${animeId} ${season} 1` }],
  }))

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: 'ANIME · TEMPORADAS',
    body: `Temporadas disponibles: *${seasons.join(', ')}*\nSelecciona una para abrir sus episodios.`,
    footer: 'Ghost Nexora Bot · Navegación por temporadas',
    cards,
  })
}

export const animeDownloadCommands: BotCommand[] = [
  {
    name: 'anime',
    aliases: ['animes', 'buscaranime'],
    category: 'downloads',
    description: 'Busca anime en varias fuentes y muestra resultados en carrusel paginado.',
    usage: 'anime <nombre> [página]',
    async handler(ctx) {
      const pageArg = ctx.args.at(-1)
      const hasPage = Boolean(pageArg && /^\d+$/.test(pageArg))
      const page = hasPage ? Number(pageArg) : 1
      const query = hasPage ? ctx.args.slice(0, -1).join(' ').trim() : ctx.argText.trim()
      if (query.length < 2) throw new Error(`Uso: ${ctx.prefix}anime <nombre> [página]`)
      await ctx.reply(`🔎 *ANIME*\n━━━━━━━━━━━━━━\nBuscando *${query}*...`)
      await animeSearchCarousel(ctx, query, page)
    },
  },
  {
    name: 'animeseasons',
    aliases: ['temporadasanime', 'animeseason'],
    category: 'downloads',
    description: 'Muestra las temporadas disponibles de un anime.',
    usage: 'animeseasons <id>',
    async handler(ctx) {
      const animeId = ctx.args[0]?.trim()
      if (!animeId) throw new Error(`Uso: ${ctx.prefix}animeseasons <id>`)
      await animeEpisodesCarousel(ctx, animeId)
    },
  },
  {
    name: 'animeeps',
    aliases: ['episodiosanime', 'animeepisodes'],
    category: 'downloads',
    description: 'Muestra episodios paginados; si hay varias temporadas, muestra primero sus temporadas.',
    usage: 'animeeps <id> [temporada] [página]',
    async handler(ctx) {
      const animeId = ctx.args[0]?.trim()
      if (!animeId) throw new Error(`Uso: ${ctx.prefix}animeeps <id> [temporada] [página]`)
      const seasonArg = ctx.args[1]
      const pageArg = ctx.args[2]
      const selectedSeason = seasonArg && /^\d+$/.test(seasonArg) ? Number(seasonArg) : undefined
      const page = pageArg && /^\d+$/.test(pageArg) ? Number(pageArg) : 1
      await animeEpisodesCarousel(ctx, animeId, selectedSeason, page)
    },
  },
  {
    name: 'animeinfo',
    aliases: ['fichaanime', 'animeid'],
    category: 'downloads',
    description: 'Muestra la ficha mínima de un anime seleccionado.',
    usage: 'animeinfo <id>',
    async handler(ctx) {
      const animeId = ctx.argText.trim()
      if (!animeId) throw new Error(`Uso: ${ctx.prefix}animeinfo <id>`)
      const seasons = await getAnimeSeasons(animeId)
      const episodes = await getAnimeEpisodes(animeId)
      await ctx.reply(
        `📺 *ANIME*\n━━━━━━━━━━━━━━\nID: \`${animeId}\`\nTemporadas: *${seasons.length}*\nEpisodios: *${episodes.length}*\n\n` +
        `Usa *Temporadas* o *Episodios* para continuar.`,
      )
    },
  },
  {
    name: 'animedl',
    aliases: ['animedownload', 'anime-descargar'],
    category: 'downloads',
    description: 'Descarga un episodio de anime desde una fuente disponible.',
    usage: 'animedl <id> <episodio> [temporada]',
    async handler(ctx) {
      const animeId = ctx.args[0]?.trim()
      const episodeNumber = Number(ctx.args[1])
      const selectedSeason = ctx.args[2] && /^\d+$/.test(ctx.args[2]) ? Number(ctx.args[2]) : undefined
      if (!animeId || !Number.isInteger(episodeNumber) || episodeNumber < 1) {
        throw new Error(`Uso: ${ctx.prefix}animedl <id> <episodio> [temporada]`)
      }

      const episodes = selectedSeason === undefined
        ? await getAnimeEpisodes(animeId)
        : await getAnimeEpisodesBySeason(animeId, selectedSeason)
      const episode = episodes.find((item) => item.number === episodeNumber)
      if (!episode) throw new Error(`No encontré el episodio ${episodeNumber}.`)

      const sources = await getAnimeSources(episode.id)
      if (!sources.length) throw new Error('No encontré una fuente de vídeo disponible para ese episodio.')

      const source = sources[0]!
      await ctx.reply(`⬇️ *ANIME*\n━━━━━━━━━━━━━━\nTemporada: *${episode.season}*\nEpisodio: *${episodeNumber}*\nCalidad: *${sourceQuality(source.quality)}*\nDescargando...`)

      const result = await downloadAnimeEpisode(source, animeId, episodeNumber)
      try {
        await ctx.socket.sendMessage(ctx.chatId, {
          document: { url: result.filePath },
          fileName: result.fileName,
          mimetype: 'video/mp4',
          caption: `🎬 *ANIME*\nTemporada: *${episode.season}*\nEpisodio: *${episodeNumber}*\nCalidad: *${sourceQuality(source.quality)}*\nTamaño: *${formatBytes(result.size)}*`,
        }, { quoted: ctx.message })
        recordSubbotDownload(ctx.instanceId, result.size)
      } finally {
        await result.cleanup()
      }
    },
  },
]
