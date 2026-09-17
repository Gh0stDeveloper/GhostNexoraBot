import type { BotCommand, CommandContext } from '../types.js'
import {
  downloadAnimeEpisode,
  getAnimeEpisodes,
  getAnimeEpisodesBySeason,
  getAnimeInfo,
  getAnimeSeasons,
  getAnimeSources,
  searchAnime,
} from '../services/anime.js'
import { sendCarousel, type CarouselCard } from '../services/interactive.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

const SEARCH_PAGE_SIZE = 5
const EPISODE_PAGE_SIZE = 8

const formatBytes = (bytes: number) => bytes >= 1024 ** 3
  ? `${(bytes / 1024 ** 3).toFixed(2)} GB`
  : `${(bytes / 1024 ** 2).toFixed(1)} MB`

const sourceQuality = (quality: string) => quality && quality !== 'unknown' ? quality : 'calidad disponible'
const clampPage = (page: number, total: number) => Math.max(1, Math.min(total, Number.isInteger(page) ? page : 1))

function searchBody(item: Awaited<ReturnType<typeof searchAnime>>[number]) {
  return [
    item.type ? `Tipo: *${item.type}*` : '',
    item.year ? `Año: *${item.year}*` : '',
    item.score ? `Puntuación: *${item.score.toFixed(2)}/10*` : '',
    item.episodes ? `Episodios: *${item.episodes}*` : '',
    item.status ? `Estado: *${item.status}*` : '',
  ].filter(Boolean).join('\n') || 'Ficha y episodios disponibles.'
}

async function animeSearchCarousel(ctx: CommandContext, query: string, page: number) {
  const allResults = await searchAnime(query, 20)
  if (!allResults.length) throw new Error('No encontré ese anime en las fuentes disponibles.')
  const totalPages = Math.max(1, Math.ceil(allResults.length / SEARCH_PAGE_SIZE))
  const currentPage = clampPage(page, totalPages)
  const visible = allResults.slice((currentPage - 1) * SEARCH_PAGE_SIZE, currentPage * SEARCH_PAGE_SIZE)

  const cards: CarouselCard[] = visible.map((item, index) => ({
    title: `${(currentPage - 1) * SEARCH_PAGE_SIZE + index + 1}. ${item.title}`.slice(0, 120),
    body: searchBody(item),
    imageUrl: item.image,
    buttons: [
      { type: 'reply', text: 'Episodios', id: `${ctx.prefix}animeeps ${item.id}` },
      { type: 'reply', text: 'Ficha', id: `${ctx.prefix}animeinfo ${item.id}` },
      ...(item.url ? [{ type: 'url' as const, text: 'MyAnimeList', url: item.url }] : []),
    ],
  }))

  if (totalPages > 1) {
    const nextPage = currentPage < totalPages ? currentPage + 1 : 1
    cards.push({
      title: currentPage < totalPages ? 'Siguiente tanda' : 'Volver al inicio',
      body: `Página ${currentPage}/${totalPages}.`,
      buttons: [{ type: 'reply', text: currentPage < totalPages ? 'Siguiente' : 'Primera', id: `${ctx.prefix}anime ${query} ${nextPage}` }],
    })
  }

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: 'ANIME · RESULTADOS',
    body: `Búsqueda: *${query}*\nPágina ${currentPage}/${totalPages} · ${allResults.length} resultados`,
    footer: 'Ghost Nexora Bot · metadata Jikan + fuentes de episodios',
    cards,
  })
}

async function sendSeasonCarousel(ctx: CommandContext, animeId: string, seasons: number[]) {
  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: 'ANIME · TEMPORADAS',
    body: `Temporadas disponibles: *${seasons.join(', ')}*`,
    footer: 'Ghost Nexora Bot',
    cards: seasons.slice(0, 12).map((season) => ({
      title: `Temporada ${season}`,
      body: `Explora los episodios disponibles de la temporada ${season}.`,
      buttons: [{ type: 'reply', text: 'Ver episodios', id: `${ctx.prefix}animeeps ${animeId} ${season} 1` }],
    })),
  })
}

async function animeEpisodesCarousel(ctx: CommandContext, animeId: string, seasonNumber?: number, page = 1) {
  const seasons = await getAnimeSeasons(animeId)
  if (!seasons.length) throw new Error('No pude obtener episodios reproducibles para este anime.')
  if (seasonNumber === undefined && seasons.length > 1) return sendSeasonCarousel(ctx, animeId, seasons)

  const selectedSeason = seasonNumber ?? seasons[0]!
  if (!seasons.includes(selectedSeason)) throw new Error(`La temporada ${selectedSeason} no está disponible.`)
  const episodes = await getAnimeEpisodesBySeason(animeId, selectedSeason)
  if (!episodes.length) throw new Error(`No encontré episodios para la temporada ${selectedSeason}.`)
  const totalPages = Math.max(1, Math.ceil(episodes.length / EPISODE_PAGE_SIZE))
  const currentPage = clampPage(page, totalPages)
  const visible = episodes.slice((currentPage - 1) * EPISODE_PAGE_SIZE, currentPage * EPISODE_PAGE_SIZE)

  const cards: CarouselCard[] = visible.map((episode) => ({
    title: episode.title ? `Episodio ${episode.number} · ${episode.title}`.slice(0, 120) : `Episodio ${episode.number}`,
    body: `Temporada: *${selectedSeason}*\nEpisodio: *${episode.number}*`,
    buttons: [{ type: 'reply', text: 'Descargar', id: `${ctx.prefix}animedl ${animeId} ${episode.number} ${selectedSeason}` }],
  }))

  if (currentPage > 1) cards.push({ title: 'Página anterior', body: `Regresar a la página ${currentPage - 1}.`, buttons: [{ type: 'reply', text: 'Anterior', id: `${ctx.prefix}animeeps ${animeId} ${selectedSeason} ${currentPage - 1}` }] })
  if (currentPage < totalPages) cards.push({ title: 'Siguiente tanda', body: `Abrir la página ${currentPage + 1}.`, buttons: [{ type: 'reply', text: 'Siguiente', id: `${ctx.prefix}animeeps ${animeId} ${selectedSeason} ${currentPage + 1}` }] })
  if (seasons.length > 1) cards.push({ title: 'Temporadas', body: `Temporada actual: ${selectedSeason}`, buttons: [{ type: 'reply', text: 'Cambiar temporada', id: `${ctx.prefix}animeseasons ${animeId}` }] })

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: 'ANIME · EPISODIOS',
    body: `Temporada *${selectedSeason}* · Página ${currentPage}/${totalPages}\n${episodes.length} episodios disponibles`,
    footer: 'Ghost Nexora Bot',
    cards: cards.slice(0, 12),
  })
}

async function animeInfoCard(ctx: CommandContext, animeId: string) {
  const info = await getAnimeInfo(animeId)
  const episodes = await getAnimeEpisodes(animeId)
  const body = [
    info.titleEnglish && info.titleEnglish !== info.title ? `Inglés: *${info.titleEnglish}*` : '',
    info.titleJapanese ? `Japonés: *${info.titleJapanese}*` : '',
    info.type ? `Tipo: *${info.type}*` : '',
    info.year ? `Año: *${info.year}*` : '',
    info.score ? `Puntuación: *${info.score.toFixed(2)}/10*` : '',
    info.status ? `Estado: *${info.status}*` : '',
    info.duration ? `Duración: *${info.duration}*` : '',
    info.episodes ? `Episodios oficiales: *${info.episodes}*` : '',
    episodes.length ? `Episodios detectados: *${episodes.length}*` : '',
    info.genres?.length ? `Géneros: *${info.genres.slice(0, 8).join(', ')}*` : '',
    info.synopsis ? `\n${info.synopsis.slice(0, 700)}${info.synopsis.length > 700 ? '…' : ''}` : '',
  ].filter(Boolean).join('\n')

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: 'ANIME · FICHA',
    body: info.title,
    footer: 'Ghost Nexora Bot · información de catálogo',
    cards: [{
      title: info.title.slice(0, 120),
      body: body || 'Información disponible.',
      imageUrl: info.image,
      buttons: [
        { type: 'reply', text: 'Ver episodios', id: `${ctx.prefix}animeeps ${animeId}` },
        ...(info.url ? [{ type: 'url' as const, text: 'MyAnimeList', url: info.url }] : []),
      ],
    }],
  })
}

export const animeDownloadCommands: BotCommand[] = [
  {
    name: 'anime', aliases: ['animes', 'buscaranime'], category: 'downloads',
    description: 'Busca anime con metadata de Jikan y navega a episodios disponibles.', usage: 'anime <nombre> [página]',
    async handler(ctx) {
      const pageArg = ctx.args.at(-1)
      const hasPage = Boolean(pageArg && /^\d+$/.test(pageArg) && ctx.args.length > 1)
      const page = hasPage ? Number(pageArg) : 1
      const query = hasPage ? ctx.args.slice(0, -1).join(' ').trim() : ctx.argText.trim()
      if (query.length < 2) throw new Error(`Uso: ${ctx.prefix}anime <nombre> [página]`)
      await animeSearchCarousel(ctx, query, page)
    },
  },
  {
    name: 'animeseasons', aliases: ['temporadasanime', 'animeseason'], category: 'downloads',
    description: 'Muestra temporadas detectadas para el anime seleccionado.', usage: 'animeseasons <id>',
    async handler(ctx) {
      const animeId = ctx.args[0]?.trim()
      if (!animeId) throw new Error(`Uso: ${ctx.prefix}animeseasons <id>`)
      const seasons = await getAnimeSeasons(animeId)
      if (!seasons.length) throw new Error('No pude obtener temporadas reproducibles para ese anime.')
      await sendSeasonCarousel(ctx, animeId, seasons)
    },
  },
  {
    name: 'animeeps', aliases: ['episodiosanime', 'animeepisodes'], category: 'downloads',
    description: 'Muestra episodios paginados manteniendo el proveedor correcto.', usage: 'animeeps <id> [temporada] [página]',
    async handler(ctx) {
      const animeId = ctx.args[0]?.trim()
      if (!animeId) throw new Error(`Uso: ${ctx.prefix}animeeps <id> [temporada] [página]`)
      const selectedSeason = ctx.args[1] && /^\d+$/.test(ctx.args[1]) ? Number(ctx.args[1]) : undefined
      const page = ctx.args[2] && /^\d+$/.test(ctx.args[2]) ? Number(ctx.args[2]) : 1
      await animeEpisodesCarousel(ctx, animeId, selectedSeason, page)
    },
  },
  {
    name: 'animeinfo', aliases: ['fichaanime', 'animeid'], category: 'downloads',
    description: 'Muestra ficha completa del anime: títulos, estado, score, géneros y sinopsis.', usage: 'animeinfo <id>',
    async handler(ctx) {
      const animeId = ctx.argText.trim()
      if (!animeId) throw new Error(`Uso: ${ctx.prefix}animeinfo <id>`)
      await animeInfoCard(ctx, animeId)
    },
  },
  {
    name: 'animedl', aliases: ['animedownload', 'anime-descargar'], category: 'downloads',
    description: 'Descarga un episodio conservando la fuente asociada al resultado seleccionado.', usage: 'animedl <id> <episodio> [temporada]',
    async handler(ctx) {
      const animeId = ctx.args[0]?.trim()
      const episodeNumber = Number(ctx.args[1])
      const selectedSeason = ctx.args[2] && /^\d+$/.test(ctx.args[2]) ? Number(ctx.args[2]) : undefined
      if (!animeId || !Number.isInteger(episodeNumber) || episodeNumber < 1) throw new Error(`Uso: ${ctx.prefix}animedl <id> <episodio> [temporada]`)

      const [info, episodes] = await Promise.all([
        getAnimeInfo(animeId).catch(() => ({ id: animeId, title: animeId })),
        selectedSeason === undefined ? getAnimeEpisodes(animeId) : getAnimeEpisodesBySeason(animeId, selectedSeason),
      ])
      const episode = episodes.find((item) => item.number === episodeNumber)
      if (!episode) throw new Error(`No encontré el episodio ${episodeNumber}.`)
      const sources = await getAnimeSources(episode.id)
      if (!sources.length) throw new Error('No encontré una fuente de vídeo disponible para ese episodio.')
      const source = sources[0]!
      await ctx.reply(`⬇️ *ANIME*\n━━━━━━━━━━━━━━\n${info.title}\nTemporada: *${episode.season}*\nEpisodio: *${episodeNumber}*\nCalidad: *${sourceQuality(source.quality)}*\nDescargando...`)

      const result = await downloadAnimeEpisode(source, info.title, episodeNumber)
      try {
        await ctx.socket.sendMessage(ctx.chatId, {
          document: { url: result.filePath }, fileName: result.fileName, mimetype: 'video/mp4',
          caption: `🎬 *${info.title}*\nTemporada: *${episode.season}*\nEpisodio: *${episodeNumber}*\nCalidad: *${sourceQuality(source.quality)}*\nTamaño: *${formatBytes(result.size)}*`,
        }, { quoted: ctx.message })
        recordSubbotDownload(ctx.instanceId, result.size)
      } finally { await result.cleanup() }
    },
  },
]
