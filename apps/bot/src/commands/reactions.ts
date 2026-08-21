import type { BotCommand, CommandContext } from '../types.js'
import { getContextInfo } from '../utils/message.js'
import { getReactionGif, reactionGifToMp4, type ReactionCategory } from '../services/reactions.js'

async function target(ctx: CommandContext) {
  const mention = getContextInfo(ctx.message)?.mentionedJid?.[0]
  if (!mention) return null
  if (!ctx.isGroup) return mention
  const metadata = await ctx.socket.groupMetadata(ctx.chatId).catch(() => null)
  const participant = metadata?.participants.find((item) => [item.id, item.phoneNumber, item.lid].filter(Boolean).includes(mention))
  return participant?.phoneNumber ?? participant?.id ?? mention
}

type ReactionDefinition = {
  name: string
  aliases?: string[]
  category: ReactionCategory
  emoji: string
  solo: string
  directed: string
}

const definitions: ReactionDefinition[] = [
  { name: 'hug', aliases: ['abrazo', 'abrazar'], category: 'hug', emoji: '🫂', solo: 'necesita un abrazo', directed: 'abrazó con cariño a' },
  { name: 'kiss', aliases: ['besar', 'beso'], category: 'kiss', emoji: '💋', solo: 'manda un beso al aire', directed: 'besó a' },
  { name: 'pat', aliases: ['palmadita'], category: 'pat', emoji: '🫳', solo: 'quiere recibir una palmadita', directed: 'le dio una palmadita cariñosa a' },
  { name: 'nuzzle', aliases: ['acurrucar'], category: 'cuddle', emoji: '🌸', solo: 'se acurrucó cómodamente', directed: 'se acurrucó junto a' },
  { name: 'blush', aliases: ['sonrojar'], category: 'blush', emoji: '☺️', solo: 'se sonrojó', directed: 'se sonrojó por' },
  { name: 'wink', aliases: ['guiño'], category: 'wink', emoji: '😉', solo: 'guiñó un ojo', directed: 'le guiñó el ojo a' },
  { name: 'wave', aliases: ['saludar'], category: 'wave', emoji: '👋', solo: 'saludó con la mano', directed: 'saludó con la mano a' },
  { name: 'dance', aliases: ['bailar'], category: 'dance', emoji: '💃', solo: 'se puso a bailar', directed: 'invitó a bailar a' },
  { name: 'poke', aliases: ['tocar'], category: 'poke', emoji: '👉', solo: 'dio un toque al aire', directed: 'le dio un toque a' },
  { name: 'bite', aliases: ['morder'], category: 'bite', emoji: '🦷', solo: 'tiene ganas de morder algo', directed: 'mordió juguetonamente a' },
  { name: 'slap', aliases: ['cachetada'], category: 'slap', emoji: '🫲', solo: 'dio una cachetada imaginaria', directed: 'le dio una cachetada a' },
  { name: 'punch', aliases: ['golpe'], category: 'punch', emoji: '👊', solo: 'lanzó un puñetazo al aire', directed: 'lanzó un puñetazo de caricatura a' },
  { name: 'patear', aliases: ['kick'], category: 'kick', emoji: '🦵', solo: 'dio una patada al aire', directed: 'dio una patada de caricatura a' },
  { name: 'kill', aliases: ['eliminar'], category: 'shoot', emoji: '🎯', solo: 'entró en modo batalla ficticia', directed: 'eliminó del mapa ficticio a' },
  { name: 'crazy', aliases: ['loco'], category: 'spin', emoji: '🌀', solo: 'entró en modo caos', directed: 'se volvió loco junto a' },
  { name: 'bug', aliases: ['buguear'], category: 'confused', emoji: '🪲', solo: 'se quedó completamente bugueado', directed: 'bugueó de broma a' },
  { name: 'cry', aliases: ['llorar'], category: 'cry', emoji: '😭', solo: 'se puso a llorar', directed: 'llora por' },
  { name: 'spell', aliases: ['hechizo'], category: 'happy', emoji: '✨', solo: 'lanzó un hechizo misterioso', directed: 'lanzó un hechizo de RPG sobre' },
  { name: 'seducir', aliases: ['seduce'], category: 'wink', emoji: '💘', solo: 'practicó su mejor mirada encantadora', directed: 'intentó conquistar con encanto a' },
  { name: 'saborear', aliases: ['nom'], category: 'kiss', emoji: '😋', solo: 'está disfrutando el momento', directed: 'se acercó juguetonamente a' },
  { name: 'bochigood', aliases: ['bochi'], category: 'pat', emoji: '🌟', solo: 'activó el modo bochigood', directed: 'le dio un bochigood a' },
  { name: 'happy', aliases: ['feliz', 'celebrar'], category: 'happy', emoji: '🥳', solo: 'está celebrando a lo grande', directed: 'celebra junto a' },
  { name: 'cuddle', aliases: ['mimos', 'mimar'], category: 'cuddle', emoji: '🤗', solo: 'quiere mimos', directed: 'llenó de mimos a' },
  { name: 'confused', aliases: ['confundido', 'duda'], category: 'confused', emoji: '🤔', solo: 'se quedó pensando demasiado', directed: 'quedó confundido por' },
  { name: 'spin', aliases: ['girar', 'vueltas'], category: 'spin', emoji: '💫', solo: 'empezó a dar vueltas', directed: 'dio vueltas alrededor de' },
  { name: 'shoot', aliases: ['disparar', 'bang'], category: 'shoot', emoji: '🎯', solo: 'apuntó a un objetivo imaginario', directed: 'apuntó de caricatura a' },
  { name: 'cheer', aliases: ['animar', 'aplaudir'], category: 'happy', emoji: '👏', solo: 'empezó a animar a todos', directed: 'aplaudió y animó a' },
  { name: 'shy', aliases: ['timido', 'tímido'], category: 'blush', emoji: '🙈', solo: 'se puso tímido', directed: 'se puso tímido frente a' },
]

function reactionCommand(def: ReactionDefinition): BotCommand {
  return {
    name: def.name,
    aliases: def.aliases,
    category: 'social',
    description: `Reacción anime: ${def.name}.`,
    async handler(ctx) {
      const other = await target(ctx)
      const senderTag = `@${ctx.sender.split('@')[0]}`
      const targetTag = other ? `@${other.split('@')[0]}` : ''
      const caption = other
        ? `${def.emoji} *REACCIÓN · ${def.name.toUpperCase()}*\n━━━━━━━━━━━━━━\n${senderTag} ${def.directed} ${targetTag}`
        : `${def.emoji} *REACCIÓN · ${def.name.toUpperCase()}*\n━━━━━━━━━━━━━━\n${senderTag} ${def.solo}`
      const mentions = other ? [ctx.sender, other] : [ctx.sender]

      try {
        const reaction = await getReactionGif(def.category)
        const video = await reactionGifToMp4(reaction.url)
        await ctx.socket.sendMessage(ctx.chatId, {
          video,
          gifPlayback: true,
          mimetype: 'video/mp4',
          caption: `${caption}${reaction.animeName ? `\n\n🎞️ ${reaction.animeName}` : ''}`,
          mentions,
        }, { quoted: ctx.message })
      } catch {
        await ctx.socket.sendMessage(ctx.chatId, { text: caption, mentions }, { quoted: ctx.message })
      }
    },
  }
}

export const reactionCommands: BotCommand[] = definitions.map(reactionCommand)
