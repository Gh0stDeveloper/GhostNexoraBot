import type { BotCommand, CommandContext } from '../types.js'
import { sendCarousel } from '../services/interactive.js'
import { getClaim, rarityEmoji } from '../services/waifu.js'
import { aniListCharacter, aniListDisplayId, createAniListWaifuRoll, searchAniListCharacters } from '../services/anilist-waifu-v5.js'
import { aniListSeriesCharacters, popularAniListSeries, searchAniListSeries } from '../services/anilist-series-v5.js'

const waitText = (ms: number) => `${Math.max(1, Math.ceil(ms / 1000))} s`
const nxc = (value: number) => `${Math.floor(value).toLocaleString('es-MX')} NXC`

function parseAniListId(value: string) {
  const match = /^al[-:#]?(\d+)$/i.exec(value.trim())
  return match ? Number(match[1]) : undefined
}

async function resolveCharacter(query: string) {
  const text = query.trim()
  if (!text) throw new Error('Indica un personaje.')
  const al = parseAniListId(text)
  if (al) return aniListCharacter(al)
  if (/^\d+$/.test(text)) {
    const numeric = Number(text)
    const stored = getClaim(numeric)
    if (stored) return { ...stored, aniListId: numeric >= 1_000_000_000 ? numeric - 1_000_000_000 : numeric }
    return aniListCharacter(numeric)
  }
  const row = (await searchAniListCharacters(text, 1))[0]
  if (!row) throw new Error('No encontré ese personaje.')
  return row
}

async function roll(ctx: CommandContext) {
  const result = await createAniListWaifuRoll(ctx.sender)
  if (!result.ok) throw new Error(`Espera ${waitText(result.remaining)} antes de otro roll.`)
  const c = result.character
  await ctx.socket.sendMessage(ctx.chatId, {
    image: { url: c.imageUrl },
    caption: [
      '🌸 *NEXORA WAIFU*',
      '━━━━━━━━━━━━━━',
      `${rarityEmoji(c.rarity)} *${c.name}*`,
      `🆔 ${aniListDisplayId(c)}`,
      `❤️ Favoritos: ${c.favorites.toLocaleString('es-MX')}`,
      `💎 Valor: ${nxc(c.value)}`,
      `🪙 Claim: ${nxc(c.claimPrice)}`,
      result.owner ? '🔒 Ya pertenece a otro usuario.' : `✅ Disponible · reclama con *${ctx.prefix}claim*`,
    ].join('\n'),
  }, { quoted: ctx.message })
}

async function search(ctx: CommandContext) {
  const query = ctx.argText.trim()
  if (!query) throw new Error(`Uso: ${ctx.prefix}wsearch <personaje>`)
  const rows = await searchAniListCharacters(query, 8)
  if (!rows.length) throw new Error('No encontré personajes con ese nombre.')
  await ctx.reply(`🔎 *PERSONAJES · ANILIST*\n━━━━━━━━━━━━━━\n${rows.map((c, i) => `${i + 1}. ${rarityEmoji(c.rarity)} *${c.name}* · ${aniListDisplayId(c)}\n   ❤️ ${c.favorites.toLocaleString('es-MX')} · Info: *${ctx.prefix}winfo AL-${c.aniListId}*`).join('\n\n')}`)
}

async function info(ctx: CommandContext) {
  const c = await resolveCharacter(ctx.argText)
  const stored = getClaim(c.characterId)
  const owner = stored?.ownerJid
  await ctx.socket.sendMessage(ctx.chatId, {
    image: { url: c.imageUrl },
    caption: [
      `🌸 *${c.name}*`,
      `🆔 AniList » AL-${c.aniListId}`,
      `${rarityEmoji(c.rarity)} Rareza » ${c.rarity}`,
      `❤️ Favoritos » ${c.favorites.toLocaleString('es-MX')}`,
      `💎 Valor » ${nxc(c.value)}`,
      `📦 Estado » ${owner ? 'RECLAMADO' : 'DISPONIBLE'}`,
      owner ? `👤 Dueño » @${owner.split('@')[0]}` : '',
    ].filter(Boolean).join('\n'),
    mentions: owner ? [owner] : [],
  }, { quoted: ctx.message })
}

async function image(ctx: CommandContext) {
  const c = await resolveCharacter(ctx.argText)
  await ctx.socket.sendMessage(ctx.chatId, { image: { url: c.imageUrl }, caption: `🖼️ *${c.name}* · AniList AL-${c.aniListId}` }, { quoted: ctx.message })
}

async function animeInfo(ctx: CommandContext) {
  const query = ctx.argText.trim()
  if (!query) throw new Error('Indica una serie de anime.')
  const series = (await searchAniListSeries(query, 1))[0]
  if (!series) throw new Error('No encontré esa serie.')
  const characters = await aniListSeriesCharacters(series.animeId, 12)
  if (!characters.length) throw new Error('No encontré personajes para esa serie.')
  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: `📚 ${series.title}`,
    body: 'Personajes principales y secundarios del catálogo AniList.',
    footer: 'Ghost Nexora Bot · Anime',
    cards: characters.map((character) => ({
      title: character.name,
      body: `🆔 AniList » AL-${character.aniListId}\n🎭 Rol » ${character.role ?? 'N/D'}`,
      imageUrl: character.imageUrl,
      buttons: [
        { type: 'reply' as const, text: 'ℹ️ Info', id: `${ctx.prefix}winfo AL-${character.aniListId}` },
        { type: 'reply' as const, text: '🖼️ Imagen', id: `${ctx.prefix}wimage AL-${character.aniListId}` },
      ],
    })),
  })
}

async function animeList(ctx: CommandContext) {
  const page = Math.max(1, Number(ctx.args[0] ?? 1) || 1)
  const series = await popularAniListSeries(page, 15)
  if (!series.length) throw new Error('No pude obtener la lista de series.')
  const lines = series.map((item, index) => `${(page - 1) * 15 + index + 1}. *${item.title}*${item.score ? ` · ⭐ ${item.score.toFixed(1)}` : ''}\n   AniList #${item.animeId}`)
  await ctx.reply(`📚 *SERIES · PÁGINA ${page}*\n━━━━━━━━━━━━━━\n${lines.join('\n\n')}\n\nConsulta personajes con *${ctx.prefix}ainfo <serie>*.`)
}

export const waifuV5Commands: BotCommand[] = [
  { name: 'waifu', aliases: ['rw','rollwaifu','rollw'], category: 'collection', description: 'Roll de personaje usando el catálogo AniList.', handler: roll },
  { name: 'wsearch', aliases: ['waifusearch','buscarwaifu'], category: 'collection', description: 'Busca personajes en AniList.', handler: search },
  { name: 'winfo', aliases: ['waifuinfo','charinfo'], category: 'collection', description: 'Información de personaje mediante AniList o colección local.', handler: info },
  { name: 'wimage', aliases: ['waifuimage','charimage'], category: 'collection', description: 'Obtiene la imagen de un personaje mediante AniList.', handler: image },
  { name: 'ainfo', aliases: ['animechars','seriesinfo'], category: 'collection', description: 'Muestra personajes de una serie mediante AniList.', handler: animeInfo },
  { name: 'alist', aliases: ['animelist','serieslist'], category: 'collection', description: 'Lista series populares del catálogo AniList.', handler: animeList },
]
