import type { BotCommand } from '../types.js'
import { googleSearch, wikipediaSearch } from '../services/web-search.js'
import { sendCarousel } from '../services/interactive.js'

function truncate(value: string | undefined, max = 420) {
  if (!value) return 'Sin descripción disponible.'
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

export const webSearchCommands: BotCommand[] = [
  {
    name: 'google', aliases: ['gsearch', 'buscar'], category: 'tools',
    description: 'Busca resultados públicos en Google.', usage: 'google <consulta>',
    async handler(ctx) {
      const query = ctx.argText.trim()
      if (!query) throw new Error(`Uso: ${ctx.prefix}google <consulta>`)
      const results = await googleSearch(query, 8)
      await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
        title: '🔎 GOOGLE SEARCH',
        body: `Resultados para: ${query}`,
        footer: 'Ghost Nexora Bot · búsqueda web',
        cards: results.map((item, index) => ({
          title: `#${index + 1} · ${item.title}`.slice(0, 120),
          body: truncate(item.snippet),
          buttons: [{ type: 'url', text: '🌐 Abrir resultado', url: item.url }],
        })),
      })
    },
  },
  {
    name: 'wiki', aliases: ['wikipedia'], category: 'tools',
    description: 'Busca artículos y resúmenes en Wikipedia.', usage: 'wiki <consulta>',
    async handler(ctx) {
      const query = ctx.argText.trim()
      if (!query) throw new Error(`Uso: ${ctx.prefix}wiki <consulta>`)
      const results = await wikipediaSearch(query, 8, 'es')
      if (!results.length) throw new Error('Wikipedia no encontró artículos para esa búsqueda.')
      await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
        title: '📚 WIKIPEDIA',
        body: `Resultados para: ${query}`,
        footer: 'Wikipedia en español · Ghost Nexora Bot',
        cards: results.map((item, index) => ({
          title: `#${index + 1} · ${item.title}`.slice(0, 120),
          body: truncate(item.snippet, 600),
          imageUrl: item.thumbnail,
          buttons: [{ type: 'url', text: '📖 Leer artículo', url: item.url }],
        })),
      })
    },
  },
]
