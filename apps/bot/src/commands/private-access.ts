import { jidNormalizedUser } from 'baileys'
import type { BotCommand, CommandContext } from '../types.js'
import { getContextInfo } from '../utils/message.js'
import { allowPrivateChat, denyPrivateChat, isPrivateChatApproved, listPrivateChatUsers } from '../services/private-chat-policy.js'

async function resolveTarget(ctx: CommandContext) {
  const mention = getContextInfo(ctx.message)?.mentionedJid?.[0]
  if (mention) {
    if (ctx.isGroup) {
      const metadata = await ctx.socket.groupMetadata(ctx.chatId).catch(() => null)
      const participant = metadata?.participants.find((item) => [item.id, item.phoneNumber, item.lid].filter(Boolean).includes(mention))
      const best = participant?.phoneNumber ?? participant?.id ?? mention
      try { return jidNormalizedUser(best) } catch { return best }
    }
    try { return jidNormalizedUser(mention) } catch { return mention }
  }

  const raw = ctx.args.find((arg) => /^\+?\d{8,20}$/.test(arg.replace(/[\s-]/g, '')))
  const digits = raw?.replace(/\D/g, '') ?? ''
  if (!digits) throw new Error('Menciona al usuario o indica su número internacional.')
  return `${digits}@s.whatsapp.net`
}

function requireInstanceOwner(ctx: CommandContext) {
  if (!ctx.isOwner && !ctx.isSubbotOwner) throw new Error('Solo el owner de esta instancia puede administrar el chat privado.')
}

async function privatePolicyCommand(ctx: CommandContext) {
  requireInstanceOwner(ctx)
  const action = (ctx.args[0] ?? 'list').toLowerCase()

  if (['allow', 'add', 'aprobar', 'permitir'].includes(action)) {
    const target = await resolveTarget({ ...ctx, args: ctx.args.slice(1) })
    const saved = allowPrivateChat(target, ctx.sender)
    await ctx.socket.sendMessage(ctx.chatId, {
      text: `🔐 *CHAT PRIVADO AUTORIZADO*\n━━━━━━━━━━━━━━\n@${saved.split('@')[0]} puede usar esta instancia por chat privado.\n\nEl permiso pertenece únicamente a ${ctx.instanceId ? `este subbot #${ctx.instanceId}` : 'este MainBot'}.`,
      mentions: [saved],
    }, { quoted: ctx.message })
    return
  }

  if (['deny', 'remove', 'revoke', 'quitar', 'bloquear'].includes(action)) {
    const target = await resolveTarget({ ...ctx, args: ctx.args.slice(1) })
    const removed = denyPrivateChat(target)
    await ctx.socket.sendMessage(ctx.chatId, {
      text: removed
        ? `🔒 *CHAT PRIVADO REVOCADO*\n━━━━━━━━━━━━━━\n@${target.split('@')[0]} ya no puede usar esta instancia por privado.`
        : `ℹ️ @${target.split('@')[0]} no estaba autorizado para usar esta instancia por privado.`,
      mentions: [target],
    }, { quoted: ctx.message })
    return
  }

  if (['status', 'check', 'estado'].includes(action)) {
    const target = await resolveTarget({ ...ctx, args: ctx.args.slice(1) })
    const allowed = isPrivateChatApproved(target)
    await ctx.socket.sendMessage(ctx.chatId, {
      text: `${allowed ? '🔐' : '🔒'} @${target.split('@')[0]} ${allowed ? 'está autorizado' : 'no está autorizado'} para usar esta instancia por chat privado.`,
      mentions: [target],
    }, { quoted: ctx.message })
    return
  }

  if (!['list', 'lista', 'users', 'usuarios'].includes(action)) {
    throw new Error(`Uso: ${ctx.prefix}private allow|deny|status @usuario · ${ctx.prefix}private list`)
  }

  const rows = listPrivateChatUsers(100)
  if (!rows.length) {
    await ctx.reply('🔒 *CHAT PRIVADO BLOQUEADO*\n━━━━━━━━━━━━━━\nNo hay usuarios adicionales autorizados. Solo el owner de esta instancia puede usar el chat privado.')
    return
  }
  const lines = rows.map((row, index) => `${index + 1}. @${row.userJid.split('@')[0]}`)
  await ctx.socket.sendMessage(ctx.chatId, {
    text: `╭━━〔 🔐 *ALLOWLIST PRIVADA* 〕━━╮\n${lines.join('\n')}\n╰━━━━━━━━━━━━━━━━╯`,
    mentions: rows.map((row) => row.userJid),
  }, { quoted: ctx.message })
}

export const privateAccessCommands: BotCommand[] = [
  {
    name: 'private',
    aliases: ['privatechat', 'privateallow', 'allowprivate', 'privategift', 'privategrant'],
    category: 'owner',
    staffOnly: true,
    subbotOwnerAllowed: true,
    description: 'Administra la allowlist local de usuarios autorizados para chat privado.',
    usage: 'private allow|deny|status @usuario | private list',
    handler: privatePolicyCommand,
  },
]
