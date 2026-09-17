import type { BotCommand, CommandContext } from '../types.js'
import { sendCarousel } from '../services/interactive.js'

const apkStores = [
  { id: 'uptodown', name: '📱 Uptodown', url: 'https://en.uptodown.com/android', command: 'uptodown', description: 'Busca y descarga desde el catálogo oficial de Uptodown.' },
  { id: 'liteapks', name: '📦 LiteAPKs', url: 'https://liteapks.com/', command: 'liteapks', description: 'Busca directamente en LiteAPKs.' },
  { id: 'happymod', name: '🧩 HappyMod', url: 'https://www.happymod.com/', command: 'happymod', description: 'Busca directamente en HappyMod.' },
]

const streams = [
  { name: '🎌 Anime', url: 'https://myanimelist.net/', command: 'anime', description: 'Busca anime, abre su ficha y navega por episodios.' },
  { name: '🧡 Crunchyroll', url: 'https://www.crunchyroll.com/', description: 'Plataforma oficial de streaming de anime.' },
  { name: '🎵 Spotify', url: 'https://open.spotify.com/', command: 'spotify', description: 'Busca música, reconoce enlaces y descarga pistas como audio.' },
  { name: '🐉 Xuper Hydra', url: 'https://xuperhydra.com/', description: 'Página del servicio Xuper Hydra.' },
]

async function apkMenu(ctx: CommandContext) {
  const query = ctx.argText.trim()
  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '📦 APK · FUENTES OFICIALES',
    body: query ? `Elige dónde buscar *${query}*.` : 'Elige una fuente. Las búsquedas no pasan por Google.',
    footer: 'Ghost Nexora Bot · fuentes directas',
    cards: apkStores.map((store) => ({
      title: store.name,
      body: `${store.description}${query ? `\n\nConsulta: ${query}` : ''}`,
      buttons: query
        ? [{ type: 'reply' as const, text: '🔎 Buscar aquí', id: `${ctx.prefix}${store.command} ${query}` }, { type: 'url' as const, text: '🌐 Sitio oficial', url: store.url }]
        : [{ type: 'reply' as const, text: '🔎 Buscar', id: `${ctx.prefix}${store.command}` }, { type: 'url' as const, text: '🌐 Sitio oficial', url: store.url }],
    })),
  })
}

async function streamingMenu(ctx: CommandContext) {
  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '▶️ STREAMING Y MULTIMEDIA',
    body: 'Los servicios con integración propia abren su comando real; los demás conservan su acceso oficial.',
    footer: 'Ghost Nexora Bot',
    cards: streams.map((item) => ({
      title: item.name,
      body: item.description,
      buttons: item.command
        ? [{ type: 'reply' as const, text: 'Usar comando', id: `${ctx.prefix}${item.command}` }, { type: 'url' as const, text: 'Abrir sitio', url: item.url }]
        : [{ type: 'url' as const, text: 'Abrir sitio oficial', url: item.url }],
    })),
  })
}

function one(name: string, aliases: string[], title: string, description: string, url: string): BotCommand {
  return { name, aliases, category: 'tools', description, usage: name, handler: async (ctx) => ctx.reply(`🌐 *${title}*\n━━━━━━━━━━━━━━\n${description}\n\n${url}`) }
}

export const sourceOverrideV7Commands: BotCommand[] = [
  { name: 'apk', aliases: ['apks', 'androidapp', 'androidapk'], category: 'downloads', description: 'Selector de fuentes APK oficiales: Uptodown, LiteAPKs y HappyMod.', usage: 'apk <aplicación>', handler: apkMenu },
  { name: 'downloads', aliases: ['downloadsites', 'fuentesapk'], category: 'downloads', description: 'Muestra únicamente fuentes APK oficiales configuradas.', usage: 'downloads', handler: apkMenu },
  { name: 'streaming', aliases: ['stream', 'veranime'], category: 'tools', description: 'Muestra servicios multimedia y abre las integraciones reales disponibles.', usage: 'streaming', handler: streamingMenu },
  one('animex', ['animexhd'], 'AnimeX', 'Abre AnimeX en su sitio oficial.', 'https://animex.one/'),
  one('crunchyroll', ['crunchy'], 'Crunchyroll', 'Abre Crunchyroll.', 'https://www.crunchyroll.com/'),
  one('xuperhydra', ['xhydra'], 'Xuper Hydra', 'Abre Xuper Hydra.', 'https://xuperhydra.com/'),
]
