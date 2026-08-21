import { config } from '../config.js'
import { settings } from '../core/settings.js'
import type { BotCommand, CommandContext } from '../types.js'
import { economy } from '../services/economy.js'
import { getReactionGif, reactionGifToMp4, type ReactionCategory } from '../services/reactions.js'
import { getContextInfo } from '../utils/message.js'

async function canonicalTarget(ctx: CommandContext) {
  const mention = getContextInfo(ctx.message)?.mentionedJid?.[0]
  if (!mention) return null
  if (!ctx.isGroup) return mention
  const metadata = await ctx.socket.groupMetadata(ctx.chatId).catch(() => null)
  const participant = metadata?.participants.find((item) => [item.id, item.phoneNumber, item.lid].filter(Boolean).includes(mention))
  return participant?.phoneNumber ?? participant?.id ?? mention
}

function assertAdultContext(ctx: CommandContext) {
  if (ctx.isGroup) {
    if (!economy.getGroupPolicy(ctx.chatId).adultAllowed) throw new Error(`Este grupo no habilitó NSFW. Un administrador puede usar ${ctx.prefix}adultmode on.`)
  } else {
    if (!settings.adultEnabled || !config.adultPrivateEnabled) throw new Error('El módulo 18+ está desactivado en chats privados.')
  }
  if (!economy.hasEntitlement(ctx.sender, 'adult_consent')) throw new Error(`Primero confirma que eres mayor de edad con ${ctx.prefix}adult18 accept.`)
}

async function requireMutualConsent(ctx: CommandContext) {
  assertAdultContext(ctx)
  const target = await canonicalTarget(ctx)
  if (!target) throw new Error('Menciona a otro usuario que haya confirmado acceso 18+.')
  if (target === ctx.sender) throw new Error('Este comando de roleplay requiere a otro participante.')
  if (!economy.hasEntitlement(target, 'adult_consent')) {
    throw new Error(`El destinatario no ha dado consentimiento 18+. Debe usar ${ctx.prefix}adult18 accept antes de participar.`)
  }
  return target
}

type AdultRole = { name: string; aliases?: string[]; category: ReactionCategory; title: string; action: string }

const roles: AdultRole[] = [
  { name: 'preñar', aliases: ['prenar'], category: 'cuddle', title: 'ROLEPLAY DE PAREJA', action: 'inició un roleplay consensuado de pareja/familia con' },
  { name: 'fuck', aliases: ['room'], category: 'kiss', title: 'ESCENA PRIVADA', action: 'inició una escena privada de roleplay consensuado con' },
  { name: 'cum', aliases: ['finishrp'], category: 'happy', title: 'FIN DE ESCENA', action: 'dio por terminada su escena de roleplay consensuado con' },
]

function command(def: AdultRole): BotCommand {
  return {
    name: def.name,
    aliases: def.aliases,
    category: 'adult',
    description: `Roleplay 18+ no gráfico con consentimiento mutuo: ${def.name}.`,
    async handler(ctx) {
      const target = await requireMutualConsent(ctx)
      const senderTag = `@${ctx.sender.split('@')[0]}`
      const targetTag = `@${target.split('@')[0]}`
      const caption = `🔞 *${def.title}*\n━━━━━━━━━━━━━━\n${senderTag} ${def.action} ${targetTag}\n\n✓ Ambos participantes tienen consentimiento 18+ registrado.`
      try {
        const reaction = await getReactionGif(def.category)
        const video = await reactionGifToMp4(reaction.url)
        await ctx.socket.sendMessage(ctx.chatId, {
          video,
          gifPlayback: true,
          mimetype: 'video/mp4',
          caption,
          mentions: [ctx.sender, target],
        }, { quoted: ctx.message })
      } catch {
        await ctx.socket.sendMessage(ctx.chatId, { text: caption, mentions: [ctx.sender, target] }, { quoted: ctx.message })
      }
    },
  }
}

export const adultRoleplayCommands: BotCommand[] = roles.map(command)
