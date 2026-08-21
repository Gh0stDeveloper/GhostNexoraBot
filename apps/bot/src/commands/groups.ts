import type { BotCommand, CommandContext } from '../types.js'
import { getContextInfo } from '../utils/message.js'
import { community } from '../services/community.js'
import { economy } from '../services/economy.js'
import { sendInteractiveCard } from '../services/interactive.js'

async function targetJids(ctx: CommandContext) {
  const context = getContextInfo(ctx.message)
  const mentioned = context?.mentionedJid ?? []
  const quoted = context?.participant ? [context.participant] : []
  const targets = [...new Set([...mentioned, ...quoted].filter(Boolean))]
  if (!targets.length) throw new Error('Menciona a un usuario o responde a su mensaje.')
  return targets
}

async function updateGroupOpen(ctx: CommandContext, close: boolean) {
  await ctx.socket.groupSettingUpdate(ctx.chatId, close ? 'announcement' : 'not_announcement')
  await ctx.reply(close
    ? '╭─〔 🔒 *GRUPO CERRADO* 〕\n│ Solo los administradores pueden enviar mensajes.\n╰──────────────'
    : '╭─〔 🔓 *GRUPO ABIERTO* 〕\n│ Todos los participantes pueden enviar mensajes.\n╰──────────────')
}

export const groupCommands: BotCommand[] = [
  {
    name: 'bot',
    aliases: ['botgroup', 'botmode'],
    category: 'groups',
    description: 'Enciende o apaga el bot dentro del grupo.',
    usage: 'bot on|off|status',
    groupOnly: true,
    adminOnly: true,
    async handler(ctx) {
      const action = (ctx.args[0] ?? 'status').toLowerCase()
      if (action === 'status') {
        const state = community.getGroupSettings(ctx.chatId)
        await ctx.reply(`🤖 *BOT EN ESTE GRUPO*\n━━━━━━━━━━━━━━\nEstado: *${state.botEnabled ? 'ON' : 'OFF'}*`)
        return
      }
      if (!['on', 'off', 'activar', 'desactivar'].includes(action)) throw new Error(`Uso: ${ctx.prefix}bot on|off|status`)
      const enabled = action === 'on' || action === 'activar'
      community.setGroupBotEnabled(ctx.chatId, enabled)
      await ctx.reply(`🤖 *${ctx.settings.botDisplayName.toUpperCase()}*\n━━━━━━━━━━━━━━\nFuncionamiento en este grupo: *${enabled ? 'ON' : 'OFF'}*`)
    },
  },
  {
    name: 'tagall',
    aliases: ['todos', 'tag'],
    category: 'groups',
    description: 'Menciona a todos los integrantes.',
    groupOnly: true,
    adminOnly: true,
    async handler(ctx) {
      const metadata = await ctx.socket.groupMetadata(ctx.chatId)
      const mentions = metadata.participants.map((participant) => participant.id)
      const lines = metadata.participants.map((participant) => `› @${participant.id.split('@')[0]}`)
      const header = ctx.argText || '📢 Atención a todos'
      await ctx.socket.sendMessage(ctx.chatId, {
        text: `╭━━〔 📣 *MENCIÓN GENERAL* 〕━━╮\n┃ ${header}\n╰━━━━━━━━━━━━━━━━╯\n\n${lines.join('\n')}`,
        mentions,
      }, { quoted: ctx.message })
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
      await ctx.socket.sendMessage(ctx.chatId, { text: ctx.argText || '📢 Atención', mentions }, { quoted: ctx.message })
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
      await ctx.reply(`🔗 *ENLACE DEL GRUPO*\n━━━━━━━━━━━━━━\nhttps://chat.whatsapp.com/${code}`)
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
      if (!['open', 'close', 'abrir', 'cerrar'].includes(action ?? '')) throw new Error(`Uso: ${ctx.prefix}group open|close`)
      await updateGroupOpen(ctx, action === 'close' || action === 'cerrar')
    },
  },
  {
    name: 'open', aliases: ['abrir'], category: 'groups', description: 'Abre el grupo.', groupOnly: true, adminOnly: true, botAdminOnly: true,
    async handler(ctx) { await updateGroupOpen(ctx, false) },
  },
  {
    name: 'close', aliases: ['cerrar'], category: 'groups', description: 'Cierra el grupo.', groupOnly: true, adminOnly: true, botAdminOnly: true,
    async handler(ctx) { await updateGroupOpen(ctx, true) },
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
      await ctx.reply(`👢 *MODERACIÓN*\n━━━━━━━━━━━━━━\n${targets.length} usuario(s) expulsado(s).`)
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
      await ctx.reply(`🛡️ *ADMINISTRACIÓN*\n━━━━━━━━━━━━━━\n${targets.length} usuario(s) promovido(s).`)
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
      await ctx.reply(`👤 *ADMINISTRACIÓN*\n━━━━━━━━━━━━━━\n${targets.length} usuario(s) degradado(s).`)
    },
  },
  {
    name: 'del', aliases: ['delete', 'borrar'], category: 'groups', description: 'Elimina el mensaje citado.', groupOnly: true, adminOnly: true, botAdminOnly: true,
    async handler(ctx) {
      const context = getContextInfo(ctx.message)
      if (!context?.stanzaId) throw new Error('Responde al mensaje que quieres eliminar.')
      await ctx.socket.sendMessage(ctx.chatId, {
        delete: {
          remoteJid: ctx.chatId,
          id: context.stanzaId,
          participant: context.participant,
        },
      })
      await ctx.react('🗑️')
    },
  },
  {
    name: 'groupinfo', aliases: ['infogrupo', 'ginfo'], category: 'tools', description: 'Muestra información y configuración del grupo.', groupOnly: true,
    async handler(ctx) {
      const metadata = await ctx.socket.groupMetadata(ctx.chatId)
      const policy = economy.getGroupPolicy(ctx.chatId)
      const extra = community.getGroupSettings(ctx.chatId)
      const admins = metadata.participants.filter((p) => p.admin).length
      const imageUrl = await ctx.socket.profilePictureUrl(ctx.chatId, 'image').catch(() => undefined)
      await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
        title: `👥 ${metadata.subject}`,
        imageUrl,
        body: [
          '╭─〔 *INFORMACIÓN DEL GRUPO* 〕',
          `│ Miembros » ${metadata.participants.length}`,
          `│ Administradores » ${admins}`,
          `│ Bot » ${extra.botEnabled ? 'ON' : 'OFF'}`,
          `│ Bienvenida » ${policy.welcome ? 'ON' : 'OFF'}`,
          `│ Despedida » ${extra.goodbyeEnabled ? 'ON' : 'OFF'}`,
          `│ Anti-link » ${policy.antiLink ? 'ON' : 'OFF'}`,
          `│ Anti-spam » ${policy.antiSpam ? 'ON' : 'OFF'}`,
          `│ NSFW » ${policy.adultAllowed ? 'ON' : 'OFF'}`,
          '╰──────────────',
          metadata.desc ? `\n📝 ${metadata.desc.slice(0, 500)}` : '',
        ].filter(Boolean).join('\n'),
        buttons: [
          { type: 'reply', text: '📋 Menú', id: `${ctx.prefix}menu` },
        ],
      })
    },
  },
]
