import { config } from '../config.js'
import { settings } from '../core/settings.js'
import type { BotCommand, CommandContext } from '../types.js'
import { economy } from '../services/economy.js'
import { getReactionGif, reactionGifToMp4, type ReactionCategory } from '../services/reactions.js'
import { getContextInfo } from '../utils/message.js'
import { pickAdultReactionMedia } from '../services/adult-media-v8.js'

async function target(ctx: CommandContext) { const mention = getContextInfo(ctx.message)?.mentionedJid?.[0]; if (!mention) throw new Error('Menciona o responde a otro usuario.'); return mention }
function gate(ctx: CommandContext) { if (!economy.hasEntitlement(ctx.sender, 'adult_consent')) throw new Error(`Confirma mayoría de edad con ${ctx.prefix}adult18 accept.`); if (ctx.isGroup && !economy.getGroupPolicy(ctx.chatId).adultAllowed) throw new Error(`Este grupo debe habilitar NSFW con ${ctx.prefix}adultmode on.`); if (!ctx.isGroup && (!settings.adultEnabled || !config.adultPrivateEnabled)) throw new Error('El módulo 18+ está desactivado en este chat privado.') }

type Def = { name: string; aliases: string[]; category: ReactionCategory; title: string; text: string }
const defs: Def[] = [
  { name: 'fuck', aliases: ['room'], category: 'kiss', title: 'ESCENA PRIVADA', text: 'inició una escena privada de roleplay consensuado con' },
  { name: 'preñar', aliases: ['prenar'], category: 'cuddle', title: 'ROLEPLAY DE PAREJA', text: 'inició un roleplay consensuado de pareja/familia con' },
  { name: 'cum', aliases: ['finishrp'], category: 'happy', title: 'FIN DE ESCENA', text: 'dio por terminada su escena de roleplay consensuado con' },
]
async function run(def: Def, ctx: CommandContext) { gate(ctx); const other = await target(ctx); if (other === ctx.sender) throw new Error('Este roleplay requiere otro participante.'); if (!economy.hasEntitlement(other, 'adult_consent')) throw new Error(`El destinatario también debe usar ${ctx.prefix}adult18 accept.`); const caption = `🔞 *${def.title}*\n━━━━━━━━━━━━━━\n@${ctx.sender.split('@')[0]} ${def.text} @${other.split('@')[0]}\n\n✓ Consentimiento 18+ confirmado.`; const local = await pickAdultReactionMedia(def.name); if (local) { const isVideo = /video|gif|webm/i.test(local.mimeType); if (isVideo) { await ctx.socket.sendMessage(ctx.chatId, { video: local.data, gifPlayback: true, mimetype: local.mimeType.startsWith('video/') ? local.mimeType : 'video/mp4', caption, mentions: [ctx.sender, other] }, { quoted: ctx.message }); return } await ctx.socket.sendMessage(ctx.chatId, { image: local.data, caption, mentions: [ctx.sender, other] }, { quoted: ctx.message }); return } try { const reaction = await getReactionGif(def.category); const video = await reactionGifToMp4(reaction.url); await ctx.socket.sendMessage(ctx.chatId, { video, gifPlayback: true, mimetype: 'video/mp4', caption, mentions: [ctx.sender, other] }, { quoted: ctx.message }) } catch { await ctx.socket.sendMessage(ctx.chatId, { text: caption, mentions: [ctx.sender, other] }, { quoted: ctx.message }) } }
export const adultRoleplayV8Commands: BotCommand[] = defs.map((def) => ({ name: def.name, aliases: def.aliases, category: 'adult', description: `Roleplay 18+ no gráfico con consentimiento mutuo: ${def.name}.`, usage: `${def.name} @usuario`, handler: (ctx) => run(def, ctx) }))
