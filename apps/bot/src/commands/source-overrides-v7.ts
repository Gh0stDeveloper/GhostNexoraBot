import type { BotCommand, CommandContext } from '../types.js'
import { sendCarousel } from '../services/interactive.js'

const apkStores = [
  { id: 'uptodown', name: '📱 Uptodown', url: 'https://en.uptodown.com/android', command: 'uptodown', description: 'Busca y descarga desde el catálogo oficial de Uptodown.' },
  { id: 'liteapks', name: '📦 LiteAPKs', url: 'https://liteapks.com/', command: 'liteapks', description: 'Busca directamente en LiteAPKs.' },
  { id: 'happymod', name: '🧩 HappyMod', url: 'https://www.happymod.com/', command: 'happymod', description: 'Busca directamente en HappyMod.' },
]

const streams = [
  { name: '🎌 AnimeX', url: 'https://animex.one/' , description: 'Streaming y catálogo de anime en AnimeX.' },
  { name: '🧡 Crunchyroll', url: 'https://www.crunchyroll.com/', description: 'Plataforma oficial de streaming de anime.' },
  { name: '🎵 Spotify', url: 'https://open.spotify.com/', description: 'Música y podcasts en Spotify.' },
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
    title: '▶️ STREAMING · SITIOS OFICIALES',
    body: 'Accesos directos a las páginas oficiales. No se utiliza Google como intermediario.',
    footer: 'Ghost Nexora Bot',
    cards: streams.map((item) => ({ title: item.name, body: item.description, buttons: [{ type: 'url' as const, text: '🌐 Abrir sitio oficial', url: item.url }] })),
  })
}

function one(name: string, aliases: string[], title: string, description: string, url: string): BotCommand {
  return { name, aliases, category: 'tools', description, usage: name, handler: async (ctx) => ctx.reply(`🌐 *${title}*\n━━━━━━━━━━━━━━\n${description}\n\n${url}`) }
}

export const sourceOverrideV7Commands: BotCommand[] = [
  { name: 'apk', aliases: ['apks', 'androidapp', 'androidapk'], category: 'downloads', description: 'Selector de fuentes APK oficiales: Uptodown, LiteAPKs y HappyMod.', usage: 'apk <aplicación>', handler: apkMenu },
  { name: 'downloads', aliases: ['downloadsites', 'fuentesapk'], category: 'downloads', description: 'Muestra únicamente fuentes APK oficiales configuradas.', usage: 'downloads', handler: apkMenu },
  { name: 'streaming', aliases: ['stream', 'veranime'], category: 'tools', description: 'Muestra accesos directos a servicios oficiales.', usage: 'streaming', handler: streamingMenu },
  one('anime', ['animex'], 'AnimeX', 'Abre AnimeX en su sitio oficial.', 'https://animex.one/'),
  one('crunchyroll', ['crunchy'], 'Crunchyroll', 'Abre Crunchyroll.', 'https://www.crunchyroll.com/'),
  one('spotify', ['sp'], 'Spotify', 'Abre Spotify.', 'https://open.spotify.com/'),
  one('xuperhydra', ['xhydra'], 'Xuper Hydra', 'Abre Xuper Hydra.', 'https://xuperhydra.com/'),
]
