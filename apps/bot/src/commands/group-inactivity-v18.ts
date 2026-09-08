import type { BotCommand, CommandContext } from '../types.js'
import { config } from '../config.js'
import { digitsFromJid } from '../utils/message.js'
import {
  getGroupInactivitySettings,
  groupInactivityReport,
  normalizeInactiveDays,
  normalizeInactiveMessages,
  setGroupInactivitySettings,
  type GroupInactiveMember,
} from '../services/group-inactivity.js'

function inactivityProtection(ctx: CommandContext) {
  const protectedJids = [ctx.socket.user?.id, ctx.socket.user?.lid, ctx.instanceOwnerJid]
    .filter((value): value is string => Boolean(value))
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

function reasonText(member: GroupInactiveMember, days: number, minMessages: number) {
  if (member.reason === 'both') return `última actividad ≥ ${days} días y ≤ ${minMessages} mensajes`
  if (member.reason === 'low_messages') return `≤ ${minMessages} mensajes registrados`
  return `última actividad ≥ ${days} días`
}

function effectivePolicy(ctx: CommandContext, args = ctx.args) {
  const stored = getGroupInactivitySettings(ctx.chatId)
  return {
    days: normalizeInactiveDays(args[0], stored.days),
    minMessages: normalizeInactiveMessages(args[1], stored.minMessages),
    stored,
  }
}

async function configureInactivity(ctx: CommandContext, args = ctx.args) {
  const current = getGroupInactivitySettings(ctx.chatId)
  const action = (args[0] ?? 'status').toLowerCase()

  if (args.length === 0 || (['status', 'estado', 'config', 'ajustes'].includes(action) && args.length === 1)) {
    await ctx.reply([
      '╭━━〔 💤 *POLÍTICA DE INACTIVIDAD* 〕━━╮',
      `┃ Sin actividad: *${current.days} días*`,
      `┃ Mínimo de mensajes: *${current.minMessages > 0 ? `≤ ${current.minMessages}` : 'desactivado'}*`,
      '╰━━━━━━━━━━━━━━━━━━━━╯',
      '',
      `Cambiar: *${ctx.prefix}inactividad set <días> <mínimo>*`,
      `Ejemplo: *${ctx.prefix}inactividad set 7 10*`,
      '',
      current.minMessages > 0
        ? `Un miembro será elegible si pasa ${current.days} días sin actividad *o* si registra ${current.minMessages} mensajes o menos.`
        : `Un miembro será elegible cuando pase ${current.days} días sin actividad confirmada.`,
      'Los administradores, owners, staff, el bot y miembros sin historial suficiente permanecen protegidos.',
    ].join('\n'))
    return
  }

  const offset = ['set', 'config', 'ajustes', 'establecer'].includes(action) ? 1 : 0
  const days = normalizeInactiveDays(args[offset], current.days)
  const minMessages = normalizeInactiveMessages(args[offset + 1], current.minMessages)
  const saved = setGroupInactivitySettings(ctx.chatId, days, minMessages)
  await ctx.reply([
    '✅ *POLÍTICA DE INACTIVIDAD ACTUALIZADA*',
    '━━━━━━━━━━━━━━',
    `Sin actividad: *${saved.days} días*`,
    `Mínimo de mensajes: *${saved.minMessages > 0 ? `≤ ${saved.minMessages}` : 'desactivado'}*`,
    '',
    saved.minMessages > 0
      ? `Se considerará inactivo a quien cumpla cualquiera de los dos criterios: ${saved.days} días sin actividad o ${saved.minMessages} mensajes o menos.`
      : `Solo se utilizará la última actividad registrada (${saved.days} días).`,
  ].join('\n'))
}

async function inactiveUsersCommand(ctx: CommandContext) {
  const first = (ctx.args[0] ?? '').toLowerCase()
  if (['config', 'ajustes', 'set', 'establecer'].includes(first)) {
    await configureInactivity(ctx, ctx.args)
    return
  }

  const policy = effectivePolicy(ctx)
  const metadata = await ctx.socket.groupMetadata(ctx.chatId)
  const report = groupInactivityReport(ctx.chatId, metadata.participants, policy.days, {
    ...inactivityProtection(ctx),
    minMessages: policy.minMessages,
  })
  const visible = report.inactive.slice(0, 50)
  const remaining = Math.max(0, report.inactive.length - visible.length)

  const lines = visible.map((member, index) => [
    `${index + 1}. @${inactiveMention(member.userJid)}`,
    `   ├ Motivo: *${reasonText(member, report.days, report.minMessages)}*`,
    `   ├ Última actividad: ${formatTrackedDate(member.lastActivityAt)}`,
    `   └ Mensajes: *${member.messages}* · comandos: *${member.commands}*`,
  ].join('\n'))

  const body = [
    `╭━━〔 💤 *USUARIOS INACTIVOS · ${metadata.subject}* 〕━━╮`,
    `┃ Umbral temporal » *${report.days} días*`,
    `┃ Umbral mensajes » *${report.minMessages > 0 ? `≤ ${report.minMessages}` : 'desactivado'}*`,
    `┃ Miembros » *${report.totalParticipants}*`,
    `┃ Inactivos elegibles » *${report.inactive.length}*`,
    `┃ Activos registrados » *${report.activeCount}*`,
    `┃ Protegidos » *${report.protectedCount}*`,
    `┃ Sin historial » *${report.unknown.length}*`,
    `┃ Seguimiento desde » *${formatTrackedDate(report.trackedSince)}*`,
    '╰━━━━━━━━━━━━━━━━━━━━╯',
    '',
    report.inactive.length ? lines.join('\n\n') : '✅ No hay usuarios que cumplan los criterios de inactividad.',
    remaining ? `\n… y *${remaining}* usuario(s) elegible(s) más.` : '',
    report.unknown.length ? '\nℹ️ Los miembros sin historial no se clasifican como inactivos y nunca se expulsan automáticamente.' : '',
    `\nConfiguración persistente: *${ctx.prefix}inactividad*`,
    `Expulsar elegibles: *${ctx.prefix}expulsarinactivos*`,
  ].filter(Boolean).join('\n')

  await ctx.socket.sendMessage(ctx.chatId, {
    text: body,
    mentions: visible.map((member) => member.participantJid),
  }, { quoted: ctx.message })
}

async function kickInactiveUsersCommand(ctx: CommandContext) {
  const policy = effectivePolicy(ctx)
  const metadata = await ctx.socket.groupMetadata(ctx.chatId)
  const report = groupInactivityReport(ctx.chatId, metadata.participants, policy.days, {
    ...inactivityProtection(ctx),
    minMessages: policy.minMessages,
  })
  const MAX_PER_RUN = 20
  const candidates = report.inactive.slice(0, MAX_PER_RUN)

  if (!candidates.length) {
    await ctx.reply([
      `✅ *SIN EXPULSIONES · ${metadata.subject}*`,
      '━━━━━━━━━━━━━━',
      `No hay usuarios elegibles con la política actual: ${report.days} días${report.minMessages > 0 ? ` o ≤ ${report.minMessages} mensajes` : ''}.`,
      report.unknown.length ? `Sin historial y protegidos: *${report.unknown.length}*.` : '',
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
  const lines = removedMembers.map((member) => `› @${inactiveMention(member.userJid)} · ${reasonText(member, report.days, report.minMessages)}`)
  await ctx.socket.sendMessage(ctx.chatId, {
    text: [
      '╭━━〔 👢 *LIMPIEZA DE INACTIVOS* 〕━━╮',
      `┃ Umbral temporal » *${report.days} días*`,
      `┃ Umbral mensajes » *${report.minMessages > 0 ? `≤ ${report.minMessages}` : 'desactivado'}*`,
      `┃ Expulsados » *${removed}*`,
      `┃ Fallidos » *${failed}*`,
      `┃ Protegidos » *${report.protectedCount}*`,
      `┃ Sin historial » *${report.unknown.length}*`,
      `┃ Pendientes por límite » *${pending}*`,
      '╰━━━━━━━━━━━━━━━━━━━━╯',
      '',
      ...lines,
      pending ? `\n⚠️ Por seguridad se procesan máximo *${MAX_PER_RUN}* miembros por ejecución.` : '',
      report.unknown.length ? '\nℹ️ Los miembros sin historial no fueron expulsados.' : '',
    ].filter(Boolean).join('\n'),
    mentions: removedMembers.map((member) => member.participantJid),
  }, { quoted: ctx.message })
}

export const groupInactivityV18Commands: BotCommand[] = [
  {
    name: 'inactividad',
    aliases: ['inactiveconfig', 'inactivityconfig'],
    category: 'groups',
    description: 'Configura por grupo los días sin actividad y el mínimo total de mensajes.',
    usage: 'inactividad [status|set <días> <mínimo mensajes>]',
    groupOnly: true,
    adminOnly: true,
    handler: configureInactivity,
  },
  {
    name: 'inactivos',
    aliases: ['inactive', 'inactiveusers', 'usuariosinactivos'],
    category: 'groups',
    description: 'Lista miembros por última actividad o por mínimo configurable de mensajes.',
    usage: 'inactivos [días] [mínimo mensajes] | inactivos config <días> <mínimo>',
    groupOnly: true,
    adminOnly: true,
    handler: inactiveUsersCommand,
  },
  {
    name: 'expulsarinactivos',
    aliases: ['kickinactive', 'purgeinactive', 'sacarinactivos'],
    category: 'groups',
    description: 'Expulsa inactivos según tiempo o mínimo de mensajes; protege admins, owners, staff y desconocidos.',
    usage: 'expulsarinactivos [días] [mínimo mensajes]',
    groupOnly: true,
    adminOnly: true,
    botAdminOnly: true,
    handler: kickInactiveUsersCommand,
  },
]
