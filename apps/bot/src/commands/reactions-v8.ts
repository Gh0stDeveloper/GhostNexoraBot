import type { BotCommand, CommandContext } from '../types.js'
import { resolveTarget } from '../utils/target.js'
import { getReactionGif, reactionGifToMp4, type ReactionCategory } from '../services/reactions.js'

type Extra = { name: string; aliases: string[]; category: ReactionCategory; emoji: string; solo: string; directed: string }
const variants: Extra[] = [
  ['highfive',['chocar5'],'wave','🙌','busca un choque de manos','chocó las manos con'],
  ['clap',['aplaudir2'],'happy','👏','aplaude','aplaudió a'],
  ['laugh',['reir'],'happy','😂','se está riendo','se rió con'],
  ['headpat',['headpats','pathead'],'pat','🫳','quiere una caricia en la cabeza','acarició la cabeza de'],
  ['boop',['nariz'],'poke','👉','hizo boop','hizo boop a'],
  ['bonk',['golpecito'],'kick','🔨','recibió un bonk imaginario','le dio un bonk a'],
  ['facepalm',['facepalm2'],'confused','🤦','se llevó la mano a la cara','hizo facepalm frente a'],
  ['shrug',['encogerse'],'confused','🤷','se encogió de hombros','se encogió de hombros frente a'],
  ['salute',['saludar2'],'wave','🫡','hizo un saludo','saludó a'],
  ['handhold',['tomarmano'],'cuddle','🤝','tomó una mano','tomó de la mano a'],
  ['comfort',['consolar'],'cuddle','🫂','buscó consuelo','consoló a'],
  ['cheerup',['animar2'],'happy','🎉','está animando','animó a'],
  ['stare',['mirar2'],'confused','👀','se quedó mirando','se quedó mirando a'],
  ['panic',['panico'],'confused','😰','entró en pánico','entró en pánico junto a'],
  ['dizzy',['mareado'],'spin','😵','se mareó','mareó a'],
  ['sleep',['dormir2'],'happy','😴','se quedó dormido','se quedó dormido junto a'],
  ['yawn',['bostezo'],'happy','🥱','bostezó','hizo bostezar a'],
  ['angry',['enojo'],'kick','😠','se enojó','se enojó con'],
  ['rage',['furia'],'punch','💢','entró en modo furia','se enfureció con'],
  ['cryhug',['llorarabrazo'],'hug','😭','lloró pidiendo un abrazo','abrazó llorando a'],
  ['wave2',['saludo3'],'wave','👋','saludó con energía','saludó con energía a'],
  ['dance2',['bailar2'],'dance','💃','se puso a bailar','invitó a bailar a'],
  ['spin2',['girar2'],'spin','💫','dio vueltas','dio vueltas alrededor de'],
  ['poke2',['toque2'],'poke','👉','dio otro toque','dio otro toque a'],
  ['cuddle2',['mimos2'],'cuddle','🤗','quiere mimos','llenó de mimos a'],
]

async function execute(ctx: CommandContext, def: Extra) {
  const other = await resolveTarget(ctx)
  const sender = `@${ctx.sender.split('@')[0]}`; const target = other ? `@${other.split('@')[0]}` : ''
  const text = other ? `${sender} ${def.directed} ${target}` : `${sender} ${def.solo}`
  const caption = `${def.emoji} *REACCIÓN · ${def.name.toUpperCase()}*\n━━━━━━━━━━━━━━\n${text}`
  const mentions = other ? [ctx.sender, other] : [ctx.sender]
  try { const reaction = await getReactionGif(def.category); const video = await reactionGifToMp4(reaction.url); await ctx.socket.sendMessage(ctx.chatId, { video, gifPlayback: true, mimetype: 'video/mp4', caption, mentions }, { quoted: ctx.message }) }
  catch { await ctx.socket.sendMessage(ctx.chatId, { text: caption, mentions }, { quoted: ctx.message }) }
}

export const reactionV8Commands: BotCommand[] = variants.map(([name, aliases, category, emoji, solo, directed]) => ({ name, aliases, category: 'social', description: `Reacción ${name}; admite respuesta o mención.`, usage: `${name} [@usuario]`, handler: (ctx) => execute(ctx, { name, aliases, category, emoji, solo, directed }) }))
