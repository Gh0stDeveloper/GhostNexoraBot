import type { BotCommand, CommandContext } from '../types.js'
import { getContextInfo } from '../utils/message.js'

async function targetJids(ctx: CommandContext) {
  const context = getContextInfo(ctx.message)
  const mentioned = context?.mentionedJid ?? []
  const quoted = context?.participant ? [context.participant] : []
  const targets = [...new Set([...mentioned, ...quoted].filter(Boolean))]
  if (!targets.length) throw new Error('Menciona a un usuario o responde a su mensaje.')
  return targets
}

export const groupCommands: BotCommand[] = [
  {
    name: 'tagall',
    aliases: ['todos'],
    category: 'groups',
    description: 'Menciona a todos los integrantes.',
    groupOnly: true,
    adminOnly: true,
    async handler(ctx) {
      const metadata = await ctx.socket.groupMetadata(ctx.chatId)
      const mentions = metadata.participants.map((participant) => participant.id)
      const lines = metadata.participants.map((participant) => `• @${participant.id.split('@')[0]}`)
      const header = ctx.argText || '📢 Atención a todos'
      await ctx.socket.sendMessage(ctx.chatId, { text: `${header}\n\n${lines.join('\n')}`, mentions }, { quoted: ctx.message })
    },
  },
  {
    name: 'hidetag',
    aliases: ['htag'],
    category: 'groups',
    description: 'Envía una mención silenciosa a todo el grupo.',
    groupOnly: true,
    adminOnly: true,
    async handler(ctx) {
      const metadata = await ctx.socket.groupMetadata(ctx.chatId)
      const mentions = metadata.participants.map((participant) => participant.id)
      await ctx.socket.sendMessage(ctx.chatId, { text: ctx.argText || '📢', mentions }, { quoted: ctx.message })
    },
  },
  {
    name: 'link',
    aliases: ['grouplink', 'enlace'],
    category: 'groups',
    description: 'Obtiene el enlace de invitación del grupo.',
    groupOnly: true,
    adminOnly: true,
    botAdminOnly: true,
    async handler(ctx) {
      const code = await ctx.socket.groupInviteCode(ctx.chatId)
      await ctx.reply(`🔗 *Enlace del grupo*\nhttps://chat.whatsapp.com/${code}`)
    },
  },
  {
    name: 'group',
    aliases: ['grupo'],
    category: 'groups',
    description: 'Abre o cierra el envío de mensajes del grupo.',
    usage: 'group open|close',
    groupOnly: true,
    adminOnly: true,
    botAdminOnly: true,
    async handler(ctx) {
      const action = ctx.args[0]?.toLowerCase()
      if (!['open', 'close', 'abrir', 'cerrar'].includes(action ?? '')) {
        throw new Error(`Uso: ${ctx.prefix}group open|close`)
      }
      const close = action === 'close' || action === 'cerrar'
      await ctx.socket.groupSettingUpdate(ctx.chatId, close ? 'announcement' : 'not_announcement')
      await ctx.reply(close ? '🔒 Grupo cerrado: solo administradores pueden enviar mensajes.' : '🔓 Grupo abierto: todos pueden enviar mensajes.')
    },
  },
  {
    name: 'kick',
    aliases: ['remove', 'sacar'],
    category: 'groups',
    description: 'Expulsa usuarios mencionados.',
    groupOnly: true,
    adminOnly: true,
    botAdminOnly: true,
    async handler(ctx) {
      const targets = await targetJids(ctx)
      await ctx.socket.groupParticipantsUpdate(ctx.chatId, targets, 'remove')
      await ctx.reply(`👢 ${targets.length} usuario(s) expulsado(s).`)
    },
  },
  {
    name: 'promote',
    aliases: ['promover'],
    category: 'groups',
    description: 'Asciende usuarios a administrador.',
    groupOnly: true,
    adminOnly: true,
    botAdminOnly: true,
    async handler(ctx) {
      const targets = await targetJids(ctx)
      await ctx.socket.groupParticipantsUpdate(ctx.chatId, targets, 'promote')
      await ctx.reply(`🛡️ ${targets.length} usuario(s) promovido(s) a administrador.`)
    },
  },
  {
    name: 'demote',
    aliases: ['degradar'],
    category: 'groups',
    description: 'Quita permisos de administrador.',
    groupOnly: true,
    adminOnly: true,
    botAdminOnly: true,
    async handler(ctx) {
      const targets = await targetJids(ctx)
      await ctx.socket.groupParticipantsUpdate(ctx.chatId, targets, 'demote')
      await ctx.reply(`👤 ${targets.length} usuario(s) ya no son administradores.`)
    },
  },
]
