import type { BotCommand, CommandContext } from '../types.js'
import { getContextInfo } from '../utils/message.js'
import { sendCarousel, sendInteractiveCard } from '../services/interactive.js'
import { community } from '../services/community.js'
import {
  claimCurrentWaifu,
  getClaim,
  giveWaifu,
  rarityEmoji,
  searchWaifus,
  waifuInfo,
} from '../services/waifu.js'
import {
  acceptTrade,
  createTrade,
  findOwnedCharacter,
  giveAllCharacters,
  popularSeries,
  releaseCharacter,
  searchAnimeSeries,
  seriesCharacters,
  topCharacters,
  voteCharacter,
} from '../services/waifu-extended.js'

const nxc = (value: number) => `${Math.floor(value).toLocaleString('es-MX')} NXC`

async function target(ctx: CommandContext) {
  const mentioned = getContextInfo(ctx.message)?.mentionedJid?.[0]
  const direct = ctx.args.find((arg) => /^\+?\d{8,20}$/.test(arg.replace(/[ -]/g, '')))?.replace(/\D/g, '')
  const candidate = mentioned ?? (direct ? `${direct}@s.whatsapp.net` : null)
  if (!candidate) return null
  if (!ctx.isGroup) return candidate
  const metadata = await ctx.socket.groupMetadata(ctx.chatId).catch(() => null)
  const participant = metadata?.participants.find((item) => [item.id, item.lid, item.phoneNumber].filter(Boolean).includes(candidate))
  return participant?.phoneNumber ?? participant?.id ?? candidate
}

function withoutMention(ctx: CommandContext) {
  return ctx.argText.replace(/@\d{5,20}/g, '').replace(/\s+/g, ' ').trim()
}

async function characterIdFromAny(query: string) {
  const text = query.trim()
  if (/^\d+$/.test(text)) return Number(text)
  const results = await searchWaifus(text, 8)
  const claimed = results.find((item) => getClaim(item.characterId))
  return claimed?.characterId ?? results[0]?.characterId ?? null
}

export const waifuExtendedCommands: BotCommand[] = [
  {
    name: 'claim', aliases: ['claimwaifu', 'cw'], category: 'collection', description: 'Reclama el último personaje mostrado.',
    async handler(ctx) {
      const result = claimCurrentWaifu(ctx.sender)
      const profile = community.getProfile(ctx.sender)
      const defaultPhrase = '$user reclamó a $character para su colección.'
      const phrase = (profile.claimPhrase ?? defaultPhrase)
        .replaceAll('$user', `@${ctx.sender.split('@')[0]}`)
        .replaceAll('$character', result.claim.name)
      await ctx.socket.sendMessage(ctx.chatId, {
        image: { url: result.claim.imageUrl },
        caption: [
          '╭━━〔 💖 *PERSONAJE RECLAMADO* 〕━━╮',
          `┃ ${rarityEmoji(result.claim.rarity)} *${result.claim.name}*`,
          `┃ ID » ${result.claim.characterId}`,
          `┃ Rareza » ${result.claim.rarity}`,
          `┃ Valor » ${nxc(result.claim.value)}`,
          `┃ Precio » ${nxc(result.claim.claimPrice)}`,
          `┃ Cartera » ${nxc(result.balance.wallet)}`,
          '╰━━━━━━━━━━━━━━━━╯',
          '',
          phrase,
          '',
          `Usa *${ctx.prefix}harem* para ver tu colección.`,
        ].join('\n'),
        mentions: [ctx.sender],
      }, { quoted: ctx.message })
    },
  },
  {
    name: 'givewaifu', aliases: ['wgive', 'regalarwaifu'], category: 'collection', description: 'Regala un personaje por nombre o ID.', usage: 'givewaifu <nombre|id> @usuario',
    async handler(ctx) {
      const other = await target(ctx)
      if (!other) throw new Error('Menciona a la persona que recibirá el personaje.')
      const query = withoutMention(ctx).replace(/^\+?\d{8,20}\s*/, '').trim()
      if (!query) throw new Error('Indica el nombre o ID del personaje.')
      const claim = findOwnedCharacter(ctx.sender, query)
      if (!claim) throw new Error(`No encontré "${query}" en tu harem.`)
      const moved = giveWaifu(ctx.sender, other, claim.characterId)
      await ctx.socket.sendMessage(ctx.chatId, {
        text: `🎁 *REGALO DE PERSONAJE*\n━━━━━━━━━━━━━━\n@${ctx.sender.split('@')[0]} regaló *${moved.name}* a @${other.split('@')[0]}.\nID: ${moved.characterId} · Valor: ${nxc(moved.value)}`,
        mentions: [ctx.sender, other],
      }, { quoted: ctx.message })
    },
  },
  {
    name: 'giveallharem', aliases: ['giveharem', 'regalartodo'], category: 'collection', description: 'Transfiere todo tu harem a otro usuario con confirmación.', usage: 'giveallharem @usuario',
    async handler(ctx) {
      const other = await target(ctx)
      if (!other) throw new Error('Menciona al usuario que recibirá todo el harem.')
      const confirmed = ctx.args.some((arg) => ['confirmar', 'confirm', 'aceptar'].includes(arg.toLowerCase()))
      if (!confirmed) {
        await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
          title: '⚠️ TRANSFERIR TODO EL HAREM',
          body: `Vas a entregar TODOS tus personajes a @${other.split('@')[0]}.\n\nEsta operación no transfiere monedas y no puede deshacerse automáticamente.`,
          buttons: [
            { type: 'reply', text: '✅ Confirmar transferencia', id: `${ctx.prefix}giveallharem ${other.split('@')[0]} confirmar` },
            { type: 'reply', text: '❌ Cancelar', id: `${ctx.prefix}harem` },
          ],
        })
        return
      }
      const count = giveAllCharacters(ctx.sender, other)
      await ctx.socket.sendMessage(ctx.chatId, {
        text: `🎁 *HAREM TRANSFERIDO*\n━━━━━━━━━━━━━━\n${count} personaje(s) fueron entregados a @${other.split('@')[0]}.`,
        mentions: [other],
      }, { quoted: ctx.message })
    },
  },
  {
    name: 'trade', aliases: ['wtrade', 'intercambiar'], category: 'collection', description: 'Propone un intercambio de personajes.', usage: 'trade <ofrezco> / <pido> @usuario',
    async handler(ctx) {
      const other = await target(ctx)
      if (!other) throw new Error('Menciona al usuario con quien quieres intercambiar.')
      const text = withoutMention(ctx)
      const [offeredQuery, requestedQuery] = text.split('/').map((part) => part.trim())
      if (!offeredQuery || !requestedQuery) throw new Error(`Uso: ${ctx.prefix}trade <ofrezco> / <pido> @usuario`)
      const trade = createTrade(ctx.sender, other, offeredQuery, requestedQuery)
      await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
        title: `🔄 TRADE #${trade.id}`,
        body: `@${ctx.sender.split('@')[0]} ofrece *${trade.offered.name}* por *${trade.requested.name}* de @${other.split('@')[0]}.\n\nExpira en 10 minutos. La propiedad se vuelve a verificar antes del intercambio.`,
        buttons: [
          { type: 'reply', text: '✅ Aceptar trade', id: `${ctx.prefix}tradeaccept ${trade.id}` },
          { type: 'reply', text: '📦 Ver harem', id: `${ctx.prefix}harem` },
        ],
      })
    },
  },
  {
    name: 'tradeaccept', aliases: ['accepttrade'], category: 'collection', description: 'Acepta un trade recibido.', usage: 'tradeaccept <id>',
    async handler(ctx) {
      const tradeId = Number(ctx.args[0])
      if (!Number.isInteger(tradeId) || tradeId <= 0) throw new Error('Indica el ID del trade.')
      const result = acceptTrade(ctx.sender, tradeId)
      await ctx.socket.sendMessage(ctx.chatId, {
        text: `✅ *TRADE #${tradeId} COMPLETADO*\n━━━━━━━━━━━━━━\n@${result.trade.targetJid.split('@')[0]} recibió *${result.offered.name}*.\n@${result.trade.proposerJid.split('@')[0]} recibió *${result.requested.name}*.`,
        mentions: [result.trade.targetJid, result.trade.proposerJid],
      }, { quoted: ctx.message })
    },
  },
  {
    name: 'delchar', aliases: ['releasechar', 'liberarchar'], category: 'collection', description: 'Libera un personaje de tu colección sin recompensa.', usage: 'delchar <nombre|id>',
    async handler(ctx) {
      if (!ctx.argText.trim()) throw new Error('Indica el personaje que quieres liberar.')
      const claim = releaseCharacter(ctx.sender, ctx.argText)
      await ctx.reply(`🕊️ *PERSONAJE LIBERADO*\n━━━━━━━━━━━━━━\n*${claim.name}* (ID ${claim.characterId}) volvió a estar disponible para futuros claims.`)
    },
  },
  {
    name: 'setfav', aliases: ['setfavorite', 'waifufav'], category: 'collection', description: 'Define tu personaje favorito del perfil.', usage: 'setfav <nombre|id>|off',
    async handler(ctx) {
      const query = ctx.argText.trim()
      if (!query) throw new Error('Indica un personaje de tu harem o usa off.')
      if (['off', 'none', 'quitar'].includes(query.toLowerCase())) {
        community.setFavoriteCharacter(ctx.sender, null)
        await ctx.reply('💔 Personaje favorito eliminado de tu perfil.')
        return
      }
      const claim = findOwnedCharacter(ctx.sender, query)
      if (!claim) throw new Error('Ese personaje no está en tu harem.')
      community.setFavoriteCharacter(ctx.sender, claim.name)
      await ctx.reply(`💖 *FAVORITO ACTUALIZADO*\nTu personaje favorito ahora es *${claim.name}*.`)
    },
  },
  {
    name: 'setclaim', aliases: ['claimphrase'], category: 'collection', description: 'Configura tu frase de reclamo con $user y $character.', usage: 'setclaim <frase>|off',
    async handler(ctx) {
      const text = ctx.argText.trim()
      if (!text) throw new Error(`Ejemplo: ${ctx.prefix}setclaim $user obtuvo a $character ✨`)
      if (['off', 'reset', 'quitar'].includes(text.toLowerCase())) {
        community.setClaimPhrase(ctx.sender, null)
        await ctx.reply('📝 Frase de claim restaurada al valor predeterminado.')
        return
      }
      community.setClaimPhrase(ctx.sender, text)
      await ctx.reply(`📝 *FRASE DE CLAIM GUARDADA*\n${text}`)
    },
  },
  {
    name: 'topwaifus', aliases: ['chartop', 'rankingwaifu'], category: 'collection', description: 'Ranking de personajes reclamados por votos y valor.',
    async handler(ctx) {
      const rows = topCharacters(10)
      if (!rows.length) throw new Error('Todavía no hay personajes reclamados.')
      const mentions = rows.map((row) => row.ownerJid)
      const lines = rows.map((row, index) => `${index + 1}. *${row.name}* · ${row.rarity}\n   🗳️ ${row.votes} · 💎 ${nxc(row.value)} · 👤 @${row.ownerJid.split('@')[0]}`)
      await ctx.socket.sendMessage(ctx.chatId, { text: `🏆 *TOP PERSONAJES · NEXORA GACHA*\n━━━━━━━━━━━━━━\n${lines.join('\n\n')}`, mentions }, { quoted: ctx.message })
    },
  },
  {
    name: 'vote', aliases: ['wvote', 'votar'], category: 'collection', description: 'Vota o retira tu voto de un personaje.', usage: 'vote <nombre|id>',
    async handler(ctx) {
      if (!ctx.argText.trim()) throw new Error('Indica un personaje.')
      const characterId = await characterIdFromAny(ctx.argText)
      if (!characterId) throw new Error('No encontré ese personaje.')
      const result = voteCharacter(ctx.sender, characterId)
      await ctx.reply(`${result.voted ? '🗳️ *VOTO REGISTRADO*' : '↩️ *VOTO RETIRADO*'}\n━━━━━━━━━━━━━━\n${result.claim.name}\nVotos actuales: *${result.votes}*`)
    },
  },
  {
    name: 'winfo', aliases: ['waifuinfo', 'charinfo'], category: 'collection', description: 'Información de personaje por nombre o ID.', usage: 'winfo <nombre|id>',
    async handler(ctx) {
      const query = ctx.argText.trim()
      if (!query) throw new Error('Indica un nombre o ID.')
      const id = /^\d+$/.test(query) ? Number(query) : (await searchWaifus(query, 1))[0]?.characterId
      if (!id) throw new Error('No encontré ese personaje.')
      const result = await waifuInfo(id)
      await ctx.socket.sendMessage(ctx.chatId, {
        image: { url: result.character.imageUrl },
        caption: [
          `🌸 *${result.character.name}*`,
          `🆔 MAL » ${result.character.characterId}`,
          `${rarityEmoji(result.character.rarity)} Rareza » ${result.character.rarity}`,
          `❤️ Favoritos » ${result.character.favorites.toLocaleString('es-MX')}`,
          `💎 Valor » ${nxc(result.character.value)}`,
          `📦 Estado » ${result.ownerJid ? 'RECLAMADO' : 'DISPONIBLE'}`,
          result.ownerJid ? `👤 Dueño » @${result.ownerJid.split('@')[0]}` : '',
        ].filter(Boolean).join('\n'),
        mentions: result.ownerJid ? [result.ownerJid] : [],
      }, { quoted: ctx.message })
    },
  },
  {
    name: 'wimage', aliases: ['waifuimage', 'charimage'], category: 'collection', description: 'Obtiene una imagen de un personaje.', usage: 'wimage <nombre|id>',
    async handler(ctx) {
      const query = ctx.argText.trim()
      if (!query) throw new Error('Indica un nombre o ID.')
      const id = /^\d+$/.test(query) ? Number(query) : (await searchWaifus(query, 1))[0]?.characterId
      if (!id) throw new Error('No encontré ese personaje.')
      const result = await waifuInfo(id)
      await ctx.socket.sendMessage(ctx.chatId, { image: { url: result.character.imageUrl }, caption: `🖼️ *${result.character.name}* · MAL #${id}` }, { quoted: ctx.message })
    },
  },
  {
    name: 'ainfo', aliases: ['animechars', 'seriesinfo'], category: 'collection', description: 'Muestra personajes de una serie.', usage: 'ainfo <serie>',
    async handler(ctx) {
      const query = ctx.argText.trim()
      if (!query) throw new Error('Indica una serie de anime.')
      const series = (await searchAnimeSeries(query, 1))[0]
      if (!series) throw new Error('No encontré esa serie.')
      const characters = await seriesCharacters(series.animeId, 12)
      if (!characters.length) throw new Error('No encontré personajes para esa serie.')
      await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
        title: `📚 ${series.title}`,
        body: `Personajes principales y secundarios disponibles en MyAnimeList.`,
        footer: 'Jikan / MyAnimeList · Ghost Nexora Bot',
        cards: characters.map((character) => ({
          title: character.name,
          body: `🆔 MAL » ${character.characterId}\n🎭 Rol » ${character.role ?? 'N/D'}`,
          imageUrl: character.imageUrl,
          buttons: [
            { type: 'reply' as const, text: 'ℹ️ Info', id: `${ctx.prefix}winfo ${character.characterId}` },
            { type: 'reply' as const, text: '🖼️ Imagen', id: `${ctx.prefix}wimage ${character.characterId}` },
          ],
        })),
      })
    },
  },
  {
    name: 'alist', aliases: ['animelist', 'serieslist'], category: 'collection', description: 'Lista series populares disponibles para consultar.', usage: 'alist [página]',
    async handler(ctx) {
      const page = Math.max(1, Number(ctx.args[0] ?? 1) || 1)
      const series = await popularSeries(page, 15)
      if (!series.length) throw new Error('No pude obtener la lista de series.')
      const lines = series.map((item, index) => `${(page - 1) * 15 + index + 1}. *${item.title}*${item.score ? ` · ⭐ ${item.score}` : ''}\n   ID ${item.animeId}`)
      await ctx.reply(`📚 *SERIES · PÁGINA ${page}*\n━━━━━━━━━━━━━━\n${lines.join('\n\n')}\n\nConsulta personajes con *${ctx.prefix}ainfo <serie>*.`)
    },
  },
]
