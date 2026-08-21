import type { BotCommand, CommandContext } from '../types.js'
import { config } from '../config.js'
import { economy } from '../services/economy.js'
import { sendCarousel } from '../services/interactive.js'
import { searchE621, searchGelbooru, searchSafebooru, type BooruPost } from '../services/booru.js'

function assertAdultAccess(ctx: CommandContext) {
  if (!ctx.settings.adultEnabled) throw new Error(`El módulo 18+ está desactivado globalmente. El staff puede habilitarlo con ${ctx.prefix}adultmode on.`)
  if (ctx.isGroup && !economy.getGroupPolicy(ctx.chatId).adultAllowed) throw new Error(`Este grupo no tiene NSFW activo. Un admin puede usar ${ctx.prefix}nsfw on.`)
  if (!ctx.isGroup && !config.adultPrivateEnabled) throw new Error('El módulo 18+ está desactivado en chats privados.')
  if (!economy.hasEntitlement(ctx.sender, 'adult_consent')) throw new Error(`Confirma primero que eres mayor de edad con ${ctx.prefix}adult18 accept.`)
}

async function sendResults(ctx: CommandContext, title: string, query: string, posts: BooruPost[]) {
  if (!posts.length) throw new Error('No encontré imágenes para esas etiquetas.')
  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title,
    body: `🔎 Etiquetas: ${query || 'aleatorio'}\n↔️ Desliza para ver resultados.`,
    footer: 'Ghost Nexora Bot · Booru',
    cards: posts.slice(0, 10).map((post, index) => ({
      title: `${title} #${index + 1}`,
      body: [`ID » ${post.id}`, post.rating ? `Rating » ${post.rating}` : '', `Score » ${post.score ?? 0}`].filter(Boolean).join('\n'),
      imageUrl: post.previewUrl ?? post.imageUrl,
      footer: 'Contenido según clasificación del proveedor',
      buttons: [
        { type: 'url' as const, text: '🖼️ Abrir imagen', url: post.imageUrl },
        { type: 'url' as const, text: '🔎 Ver post', url: post.postUrl },
      ],
    })),
  })
}

export const booruCommands: BotCommand[] = [
  {
    name: 'safebooru', aliases: ['sbooru'], category: 'tools', description: 'Busca imágenes SFW por etiquetas.', usage: 'safebooru [tags]',
    async handler(ctx) {
      const query = ctx.argText.trim()
      const posts = await searchSafebooru(query, 10)
      await sendResults(ctx, '🌿 SAFEBOORU', query, posts)
    },
  },
  {
    name: 'gelbooru', aliases: ['gbooru'], category: 'adult', description: 'Busca imágenes en Gelbooru; requiere NSFW activo.', usage: 'gelbooru [tags]',
    async handler(ctx) {
      assertAdultAccess(ctx)
      const query = ctx.argText.trim()
      const posts = await searchGelbooru(query, 10)
      await sendResults(ctx, '🔞 GELBOORU', query, posts)
    },
  },
  {
    name: 'e621', aliases: ['e6'], category: 'adult', description: 'Busca imágenes en e621; requiere NSFW activo.', usage: 'e621 [tags]',
    async handler(ctx) {
      assertAdultAccess(ctx)
      const query = ctx.argText.trim()
      const posts = await searchE621(query, 10)
      await sendResults(ctx, '🔞 E621', query, posts)
    },
  },
]
