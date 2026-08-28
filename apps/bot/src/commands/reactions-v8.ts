import type { BotCommand, CommandContext } from '../types.js'
import { resolveTarget } from '../utils/target.js'
import { getReactionGif, reactionGifToMp4, type ReactionCategory } from '../services/reactions.js'

type ReactionDef = { name: string; aliases: string[]; category: ReactionCategory; emoji: string; solo: string; directed: string }
const variants: ReactionDef[] = [
  { name: 'highfive', aliases: ['chocar5'], category: 'wave', emoji: '🙌', solo: 'busca un choque de manos', directed: 'chocó las manos con' },
  { name: 'clap', aliases: ['aplaudir2'], category: 'happy', emoji: '👏', solo: 'aplaude', directed: 'aplaudió a' },
  { name: 'laugh', aliases: ['reir'], category: 'happy', emoji: '😂', solo: 'se está riendo', directed: 'se rió con' },
  { name: 'headpat', aliases: ['headpats', 'pathead'], category: 'pat', emoji: '🫳', solo: 'quiere una caricia en la cabeza', directed: 'acarició la cabeza de' },
  { name: 'boop', aliases: ['nariz'], category: 'poke', emoji: '👉', solo: 'hizo boop', directed: 'hizo boop a' },
  { name: 'bonk', aliases: ['golpecito'], category: 'kick', emoji: '🔨', solo: 'recibió un bonk imaginario', directed: 'le dio un bonk a' },
  { name: 'facepalm', aliases: ['facepalm2'], category: 'confused', emoji: '🤦', solo: 'se llevó la mano a la cara', directed: 'hizo facepalm frente a' },
  { name: 'shrug', aliases: ['encogerse'], category: 'confused', emoji: '🤷', solo: 'se encogió de hombros', directed: 'se encogió de hombros frente a' },
  { name: 'salute', aliases: ['saludar2'], category: 'wave', emoji: '🫡', solo: 'hizo un saludo', directed: 'saludó a' },
  { name: 'handhold', aliases: ['tomarmano'], category: 'cuddle', emoji: '🤝', solo: 'tomó una mano', directed: 'tomó de la mano a' },
  { name: 'comfort', aliases: ['consolar'], category: 'cuddle', emoji: '🫂', solo: 'buscó consuelo', directed: 'consoló a' },
  { name: 'cheerup', aliases: ['animar2'], category: 'happy', emoji: '🎉', solo: 'está animando', directed: 'animó a' },
  { name: 'stare', aliases: ['mirar2'], category: 'confused', emoji: '👀', solo: 'se quedó mirando', directed: 'se quedó mirando a' },
  { name: 'panic', aliases: ['panico'], category: 'confused', emoji: '😰', solo: 'entró en pánico', directed: 'entró en pánico junto a' },
  { name: 'dizzy', aliases: ['mareado'], category: 'spin', emoji: '😵', solo: 'se mareó', directed: 'mareó a' },
  { name: 'sleep', aliases: ['dormir2'], category: 'happy', emoji: '😴', solo: 'se quedó dormido', directed: 'se quedó dormido junto a' },
  { name: 'yawn', aliases: ['bostezo'], category: 'happy', emoji: '🥱', solo: 'bostezó', directed: 'hizo bostezar a' },
  { name: 'angry', aliases: ['enojo'], category: 'kick', emoji: '😠', solo: 'se enojó', directed: 'se enojó con' },
  { name: 'rage', aliases: ['furia'], category: 'punch', emoji: '💢', solo: 'entró en modo furia', directed: 'se enfureció con' },
  { name: 'cryhug', aliases: ['llorarabrazo'], category: 'hug', emoji: '😭', solo: 'lloró pidiendo un abrazo', directed: 'abrazó llorando a' },
  { name: 'wave2', aliases: ['saludo3'], category: 'wave', emoji: '👋', solo: 'saludó con energía', directed: 'saludó con energía a' },
  { name: 'dance2', aliases: ['bailar2'], category: 'dance', emoji: '💃', solo: 'se puso a bailar', directed: 'invitó a bailar a' },
  { name: 'spin2', aliases: ['girar2'], category: 'spin', emoji: '💫', solo: 'dio vueltas', directed: 'dio vueltas alrededor de' },
  { name: 'poke2', aliases: ['toque2'], category: 'poke', emoji: '👉', solo: 'dio otro toque', directed: 'dio otro toque a' },
  { name: 'cuddle2', aliases: ['mimos2'], category: 'cuddle', emoji: '🤗', solo: 'quiere mimos', directed: 'llenó de mimos a' },
]

async function execute(ctx: CommandContext, def: ReactionDef): Promise<void> {
  const other = await resolveTarget(ctx)
  const sender = `@${ctx.sender.split('@')[0]}`; const target = other ? `@${other.split('@')[0]}` : ''
  const text = other ? `${sender} ${def.directed} ${target}` : `${sender} ${def.solo}`
  const caption = `${def.emoji} *REACCIÓN · ${def.name.toUpperCase()}*\n━━━━━━━━━━━━━━\n${text}`
  const mentions = other ? [ctx.sender, other] : [ctx.sender]
  try { const reaction = await getReactionGif(def.category); const video = await reactionGifToMp4(reaction.url); await ctx.socket.sendMessage(ctx.chatId, { video, gifPlayback: true, mimetype: 'video/mp4', caption, mentions }, { quoted: ctx.message }) }
  catch { await ctx.socket.sendMessage(ctx.chatId, { text: caption, mentions }, { quoted: ctx.message }) }
}

export const reactionV8Commands: BotCommand[] = variants.map((def) => ({ name: def.name, aliases: def.aliases, category: 'social', description: `Reacción ${def.name}; admite respuesta o mención.`, usage: `${def.name} [@usuario]`, handler: (ctx: CommandContext) => execute(ctx, def) }))
