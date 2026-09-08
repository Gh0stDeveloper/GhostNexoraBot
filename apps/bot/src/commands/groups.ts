import type { BotCommand, CommandContext } from '../types.js'
import { config } from '../config.js'
import { digitsFromJid, getContextInfo } from '../utils/message.js'
import { community } from '../services/community.js'
import { economy } from '../services/economy.js'
import { groupInactivityReport, normalizeInactiveDays } from '../services/group-inactivity.js'
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

function inactivityProtection(ctx: CommandContext) {
  const protectedJids = [ctx.socket.user?.id, ctx.instanceOwnerJid].filter((value): value is string => Boolean(value))
  const protectedNumbers = [...config.owners, ...ctx.settings.botAdmins]
  if (ctx.instanceOwnerJid) {
    const number = digitsFromJid(ctx.instanceOwnerJid)
    if (number) protectedNumbers.push(number)
  }
  return { protectedJids, protectedNumbers: [...new Set(protectedNumbers)] }
}

function inactiveMention(jid: string) {
  return digitsFromJid(jid) || jid.split('@')[0] || 'usuario'
}

function formatTrackedDate(timestamp: number) {
  if (!timestamp) return 'sin historial suficiente'
  return new Date(timestamp).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}

async function inactiveUsersCommand(ctx: CommandContext) {
  const days = normalizeInactiveDays(ctx.args[0], 30)
  const metadata = await ctx.socket.groupMetadata(ctx.chatId)
  const report = groupInactivityReport(ctx.chatId, metadata.participants, days, inactivityProtection(ctx))
  const visible = report.inactive.slice(0, 50)
  const remaining = Math.max(0, report.inactive.length - visible.length)

  const lines = visible.map((member, index) => [
    `${index + 1}. @${inactiveMention(member.userJid)}`,
    `   ├ Inactivo: *${member.inactiveDays} días*`,
    `   ├ Última actividad: ${formatTrackedDate(member.lastActivityAt)}`,
    `   └ Mensajes registrados: *${member.messages}* · comandos: *${member.commands}*`,
  ].join('\n'))

  const body = [
    `╭━━〔 💤 *USUARIOS INACTIVOS · ${metadata.subject}* 〕━━╮`,
    `┃ Umbral » *${days} días*`,
    `┃ Miembros » *${report.totalParticipants}*`,
    `┃ Inactivos confirmados » *${report.inactive.length}*`,
    `┃ Activos registrados » *${report.activeCount}*`,
    `┃ Protegidos » *${report.protectedCount}*`,
    `┃ Sin historial » *${report.unknown.length}*`,
    `┃ Seguimiento desde » *${formatTrackedDate(report.trackedSince)}*`,
    '╰━━━━━━━━━━━━━━━━━━━━╯',
    '',
    report.inactive.length
      ? lines.join('\n\n')
      : `✅ No hay usuarios con inactividad confirmada de ${days} días o más.`,
    remaining ? `\n… y *${remaining}* usuario(s) inactivo(s) más.` : '',
    report.unknown.length
      ? '\nℹ️ Los miembros sin historial no se clasifican como inactivos y nunca se expulsan automáticamente.'
      : '',
    `\nPara expulsar los elegibles: *${ctx.prefix}expulsarinactivos ${days}*`,
  ].filter(Boolean).join('\n')

  await ctx.socket.sendMessage(ctx.chatId, {
    text: body,
    mentions: visible.map((member) => member.participantJid),
  }, { quoted: ctx.message })
}

async function kickInactiveUsersCommand(ctx: CommandContext) {
  const days = normalizeInactiveDays(ctx.args[0], 30)
  const metadata = await ctx.socket.groupMetadata(ctx.chatId)
  const report = groupInactivityReport(ctx.chatId, metadata.participants, days, inactivityProtection(ctx))
  const MAX_PER_RUN = 20
  const candidates = report.inactive.slice(0, MAX_PER_RUN)

  if (!candidates.length) {
    await ctx.reply([
      `✅ *SIN EXPULSIONES · ${metadata.subject}*`,
      '━━━━━━━━━━━━━━',
      `No hay usuarios elegibles con *${days} días* o más de inactividad confirmada.`,
      report.unknown.length ? `Sin historial y protegidos contra expulsión automática: *${report.unknown.length}*.` : '',
    ].filter(Boolean).join('\n'))
    return
  }

  let removed = 0
  let failed = 0
  const removedMembers: typeof candidates = []

  for (let index = 0; index < candidates.length; index += 5) {
    const chunk = candidates.slice(index, index + 5)
    try {
      await ctx.socket.groupParticipantsUpdate(ctx.chatId, chunk.map((member) => member.participantJid), 'remove')
      removed += chunk.length
      removedMembers.push(...chunk)
    } catch {
      // Si un lote falla, se intenta miembro por miembro para no abortar toda la limpieza.
      for (const member of chunk) {
        try {
          await ctx.socket.groupParticipantsUpdate(ctx.chatId, [member.participantJid], 'remove')
          removed += 1
          removedMembers.push(member)
        } catch {
          failed += 1
        }
      }
    }
    if (index + 5 < candidates.length) await new Promise((resolve) => setTimeout(resolve, 800))
  }

  const pending = Math.max(0, report.inactive.length - candidates.length)
  const lines = removedMembers.map((member) => `› @${inactiveMention(member.userJid)} · ${member.inactiveDays} días`)
  await ctx.socket.sendMessage(ctx.chatId, {
    text: [
      `╭━━〔 👢 *LIMPIEZA DE INACTIVOS* 〕━━╮`,
      `┃ Umbral » *${days} días*`,
      `┃ Expulsados » *${removed}*`,
      `┃ Fallidos » *${failed}*`,
      `┃ Protegidos » *${report.protectedCount}*`,
      `┃ Sin historial » *${report.unknown.length}*`,
      `┃ Pendientes por límite » *${pending}*`,
      '╰━━━━━━━━━━━━━━━━━━━━╯',
      '',
      ...lines,
      pending ? `\n⚠️ Por seguridad se procesan máximo *${MAX_PER_RUN}* miembros por ejecución. Repite el comando para continuar.` : '',
      report.unknown.length ? '\nℹ️ Los miembros sin historial no fueron expulsados.' : '',
    ].filter(Boolean).join('\n'),
    mentions: removedMembers.map((member) => member.participantJid),
  }, { quoted: ctx.message })
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
    name: 'inactivos',
    aliases: ['inactive', 'inactiveusers', 'usuariosinactivos'],
    category: 'groups',
    description: 'Lista miembros con inactividad confirmada según la actividad registrada por el bot.',
    usage: 'inactivos [días]',
    groupOnly: true,
    adminOnly: true,
    handler: inactiveUsersCommand,
  },
  {
    name: 'expulsarinactivos',
    aliases: ['kickinactive', 'purgeinactive', 'sacarinactivos'],
    category: 'groups',
    description: 'Expulsa miembros con inactividad confirmada; protege admins, owners, staff y usuarios sin historial.',
    usage: 'expulsarinactivos [días]',
    groupOnly: true,
    adminOnly: true,
    botAdminOnly: true,
    handler: kickInactiveUsersCommand,
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
