import type { BotCommand, CommandContext } from '../types.js'
import { getContextInfo } from '../utils/message.js'
import { sendCarousel, type InteractiveButton } from '../services/interactive.js'
import {
  claimCurrentWaifu,
  giveWaifu,
  listHarem,
  rarityEmoji,
  rollWaifu,
  searchWaifus,
  sellWaifu,
  waifuInfo,
  waifuTop,
} from '../services/waifu.js'

const nxc = (value: number) => `${Math.floor(value).toLocaleString('es-MX')} NXC`

async function canonicalTarget(ctx: CommandContext) {
  const mentioned = getContextInfo(ctx.message)?.mentionedJid?.[0]
  const directNumber = ctx.args.find((arg) => /^\+?\d{8,15}$/.test(arg.replace(/[ -]/g, '')))?.replace(/\D/g, '')
  const candidate = mentioned ?? (directNumber ? `${directNumber}@s.whatsapp.net` : null)
  if (!candidate) return null
  if (!ctx.chatId.endsWith('@g.us')) return candidate

  const metadata = await ctx.socket.groupMetadata(ctx.chatId).catch(() => null)
  if (!metadata) return candidate
  const participant = metadata.participants.find((item) => [item.id, item.lid, item.phoneNumber].filter(Boolean).includes(candidate))
  return participant?.phoneNumber ?? participant?.id ?? candidate
}

function characterBody(input: {
  name: string
  nameKanji?: string
  characterId: number
  favorites: number
  rarity: Parameters<typeof rarityEmoji>[0]
  value: number
  claimPrice: number
}, available: boolean) {
  return [
    `🌸 *${input.name}*${input.nameKanji ? ` · ${input.nameKanji}` : ''}`,
    `🆔 MAL: ${input.characterId}`,
    `${rarityEmoji(input.rarity)} Rareza: *${input.rarity}*`,
    `❤️ Favoritos MAL: ${input.favorites.toLocaleString('es-MX')}`,
    `💎 Valor colección: *${nxc(input.value)}*`,
    `🪙 Reclamar: *${nxc(input.claimPrice)}*`,
    available ? '✅ Estado: *DISPONIBLE*' : '🔒 Estado: *YA RECLAMADA*',
  ].join('\n')
}

export const waifuCommands: BotCommand[] = [
  {
    name: 'waifu', aliases: ['rw', 'rollwaifu', 'rollw'], category: 'collection',
    description: 'Obtén un personaje aleatorio para la colección.',
    async handler(ctx) {
      const result = await rollWaifu(ctx.sender)
      if (!result.ok) throw new Error(`Espera ${Math.ceil(result.remaining / 1000)} s antes de volver a hacer roll.`)
      const { character, owner } = result
      const buttons: InteractiveButton[] = owner
        ? [
            { type: 'reply', text: '🔄 Otro roll', id: `${ctx.prefix}rw` },
            { type: 'reply', text: 'ℹ️ Info', id: `${ctx.prefix}winfo ${character.characterId}` },
            { type: 'url', text: '🌐 MyAnimeList', url: character.sourceUrl },
          ]
        : [
            { type: 'reply', text: `💖 Claim ${character.claimPrice} NXC`, id: `${ctx.prefix}claim` },
            { type: 'reply', text: '🔄 Otro roll', id: `${ctx.prefix}rw` },
            { type: 'url', text: '🌐 MyAnimeList', url: character.sourceUrl },
          ]

      await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
        title: '🌸 NEXORA WAIFU COLLECTION',
        body: 'Personaje obtenido. Los rolls disponibles expiran en 5 minutos.',
        footer: 'Ghost Nexora Bot · Jikan / MyAnimeList',
        cards: [{
          title: `${rarityEmoji(character.rarity)} ${character.rarity.toUpperCase()}`,
          body: characterBody(character, !owner),
          imageUrl: character.imageUrl,
          footer: owner ? 'Este personaje ya pertenece a alguien.' : 'Disponible para reclamar.',
          buttons,
        }],
      })
    },
  },
  {
    name: 'claim', aliases: ['claimwaifu', 'cw'], category: 'collection',
    description: 'Reclama el último personaje disponible que obtuviste.',
    async handler(ctx) {
      const result = claimCurrentWaifu(ctx.sender)
      await ctx.socket.sendMessage(ctx.chatId, {
        image: { url: result.claim.imageUrl },
        caption: [
          '💖 *PERSONAJE RECLAMADO*',
          '',
          `${rarityEmoji(result.claim.rarity)} *${result.claim.name}*`,
          `🆔 ${result.claim.characterId}`,
          `💎 Valor: ${nxc(result.claim.value)}`,
          `🪙 Precio: ${nxc(result.claim.claimPrice)}`,
          `👛 Cartera restante: ${nxc(result.balance.wallet)}`,
          '',
          `Consulta tu colección con *${ctx.prefix}harem*.`
        ].join('\n'),
      }, { quoted: ctx.message })
    },
  },
  {
    name: 'harem', aliases: ['collection', 'coleccion', 'waifus', 'mywaifus'], category: 'collection',
    description: 'Muestra tu colección o la de otro usuario.', usage: 'harem [@usuario] [página]',
    async handler(ctx) {
      const target = await canonicalTarget(ctx) ?? ctx.sender
      const pageArg = ctx.args.find((arg) => /^\d{1,3}$/.test(arg))
      const result = listHarem(target, Number(pageArg ?? 1), 10)
      if (!result.items.length) throw new Error(target === ctx.sender ? 'Todavía no tienes personajes. Usa .rw.' : 'Ese usuario todavía no tiene personajes.')

      await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
        title: '💞 HAREM · NEXORA COLLECTION',
        body: `Colección: ${result.total} personajes · ${nxc(result.totalValue)}\nPágina ${result.page}/${result.totalPages}`,
        footer: `Usa ${ctx.prefix}harem ${result.page + 1} para otra página cuando exista.`,
        cards: result.items.map((item) => ({
          title: `${rarityEmoji(item.rarity)} ${item.name}`,
          body: [`🆔 ${item.characterId}`, `✨ ${item.rarity}`, `💎 ${nxc(item.value)}`, `❤️ ${item.favorites.toLocaleString('es-MX')} favoritos`].join('\n'),
          imageUrl: item.imageUrl,
          footer: 'Ghost Nexora Bot',
          buttons: [
            { type: 'reply' as const, text: 'ℹ️ Info', id: `${ctx.prefix}winfo ${item.characterId}` },
            { type: 'url' as const, text: '🌐 MAL', url: item.sourceUrl },
          ],
        })),
      })
    },
  },
  {
    name: 'winfo', aliases: ['waifuinfo', 'charinfo'], category: 'collection',
    description: 'Muestra información y disponibilidad de un personaje.', usage: 'winfo <id>',
    async handler(ctx) {
      const characterId = Number(ctx.args[0])
      if (!Number.isInteger(characterId) || characterId <= 0) throw new Error('Indica el ID de MyAnimeList del personaje.')
      const result = await waifuInfo(characterId)
      await ctx.socket.sendMessage(ctx.chatId, {
        image: { url: result.character.imageUrl },
        caption: `${characterBody(result.character, !result.ownerJid)}\n\n🌐 ${result.character.sourceUrl}`,
      }, { quoted: ctx.message })
    },
  },
  {
    name: 'wsearch', aliases: ['waifusearch', 'buscarwaifu'], category: 'collection',
    description: 'Busca personajes en Jikan/MyAnimeList.', usage: 'wsearch <nombre>',
    async handler(ctx) {
      const query = ctx.argText.trim()
      if (!query) throw new Error('Indica el nombre de un personaje.')
      const results = await searchWaifus(query, 8)
      if (!results.length) throw new Error('No encontré personajes con ese nombre.')
      await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
        title: '🔎 WAIFU SEARCH', body: `Resultados para: ${query}`, footer: 'Jikan / MyAnimeList',
        cards: results.map((item) => ({
          title: `${rarityEmoji(item.rarity)} ${item.name}`,
          body: characterBody(item, !item.ownerJid),
          imageUrl: item.imageUrl,
          buttons: [
            { type: 'reply' as const, text: 'ℹ️ Info', id: `${ctx.prefix}winfo ${item.characterId}` },
            { type: 'url' as const, text: '🌐 MAL', url: item.sourceUrl },
          ],
        })),
      })
    },
  },
  {
    name: 'wgive', aliases: ['givewaifu', 'regalarwaifu'], category: 'collection',
    description: 'Transfiere un personaje de tu colección a otro usuario.', usage: 'wgive @usuario <id>',
    async handler(ctx) {
      const target = await canonicalTarget(ctx)
      if (!target) throw new Error('Menciona al usuario que recibirá el personaje.')
      const characterId = Number(ctx.args.find((arg) => /^\d{1,7}$/.test(arg)))
      if (!Number.isInteger(characterId) || characterId <= 0) throw new Error('Indica el ID del personaje.')
      const claim = giveWaifu(ctx.sender, target, characterId)
      await ctx.socket.sendMessage(ctx.chatId, {
        text: `🎁 *${claim.name}* fue transferida a @${target.split('@')[0]}.\n🆔 ${claim.characterId} · 💎 ${nxc(claim.value)}`,
        mentions: [target],
      }, { quoted: ctx.message })
    },
  },
  {
    name: 'wsell', aliases: ['sellwaifu', 'venderwaifu'], category: 'collection',
    description: 'Vende un personaje al sistema por el 65% de su valor.', usage: 'wsell <id>',
    async handler(ctx) {
      const characterId = Number(ctx.args[0])
      if (!Number.isInteger(characterId) || characterId <= 0) throw new Error('Indica el ID del personaje.')
      const result = sellWaifu(ctx.sender, characterId)
      await ctx.reply(`💸 Vendiste *${result.claim.name}* por *${nxc(result.payout)}*.\n👛 Cartera: *${nxc(result.balance.wallet)}*.`)
    },
  },
  {
    name: 'wtop', aliases: ['waifutop', 'topharem'], category: 'collection',
    description: 'Muestra los coleccionistas con mayor valor de harem.',
    async handler(ctx) {
      const rows = waifuTop(10)
      if (!rows.length) throw new Error('Todavía no hay colecciones reclamadas.')
      const mentions = rows.map((row) => row.ownerJid)
      const lines = rows.map((row, index) => `${index + 1}. @${row.ownerJid.split('@')[0]} · ${row.count} personajes · 💎 ${nxc(row.totalValue)}`)
      await ctx.socket.sendMessage(ctx.chatId, { text: `🏆 *TOP HAREM · NEXORA*\n\n${lines.join('\n')}`, mentions }, { quoted: ctx.message })
    },
  },
]
