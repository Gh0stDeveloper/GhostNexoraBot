import { jidNormalizedUser } from 'baileys'
import type { BotCommand, CommandContext } from '../types.js'
import { getContextInfo } from '../utils/message.js'
import { grantPrivateAccess, listPrivateAccess, privateAccessStatus, revokePrivateAccess } from '../services/private-access.js'

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

function parseDuration(args: string[]) {
  const token = args.find((arg) => /^(?:permanent|permanente|\d+[hd])$/i.test(arg))?.toLowerCase() ?? 'permanent'
  if (token === 'permanent' || token === 'permanente') return { label: 'permanente', durationMs: null as number | null }
  const match = /^(\d+)([hd])$/.exec(token)
  if (!match) throw new Error('Duración inválida. Usa 12h, 1d, 7d, 30d, 90d, 365d o permanent.')
  const amount = Number(match[1])
  if (!Number.isFinite(amount) || amount < 1 || amount > 3650) throw new Error('La duración debe estar entre 1 y 3650 días equivalentes.')
  const durationMs = amount * (match[2] === 'h' ? 3600_000 : 86400_000)
  return { label: token, durationMs }
}

function fmtExpiry(expiresAt: number, permanent: boolean) {
  return permanent ? 'PERMANENTE' : new Date(expiresAt).toLocaleString('es-MX')
}

export const privateAccessCommands: BotCommand[] = [
  {
    name: 'privategrant', aliases: ['allowprivate', 'privateallow'], category: 'owner', staffOnly: true,
    description: 'Concede manualmente acceso al bot por chat privado sin cobrar NXC.',
    usage: 'privategrant @usuario [30d|permanent]',
    async handler(ctx) {
      const target = await resolveTarget(ctx)
      const duration = parseDuration(ctx.args)
      const grant = grantPrivateAccess(target, duration.durationMs, ctx.sender)
      await ctx.socket.sendMessage(ctx.chatId, {
        text: [
          '╭━━〔 🔐 *ACCESO PRIVADO CONCEDIDO* 〕━━╮',
          `┃ Usuario » @${target.split('@')[0]}`,
          `┃ Duración » *${duration.label.toUpperCase()}*`,
          `┃ Vence » *${fmtExpiry(grant.expiresAt, grant.permanent)}*`,
          `┃ Concedido por » @${ctx.sender.split('@')[0]}`,
          '╰━━━━━━━━━━━━━━━━━━━━╯',
          '',
          'El permiso es administrativo y no descontó Nexora Coins.',
        ].join('\n'),
        mentions: [target, ctx.sender],
      }, { quoted: ctx.message })
    },
  },
  {
    name: 'privaterevoke', aliases: ['denyprivate', 'privateremove'], category: 'owner', staffOnly: true,
    description: 'Revoca inmediatamente cualquier acceso privado activo de un usuario.',
    usage: 'privaterevoke @usuario',
    async handler(ctx) {
      const target = await resolveTarget(ctx)
      const removed = revokePrivateAccess(target)
      await ctx.socket.sendMessage(ctx.chatId, {
        text: removed
          ? `🔒 *ACCESO PRIVADO REVOCADO*\n━━━━━━━━━━━━━━\n@${target.split('@')[0]} ya no puede usar módulos privados hasta volver a comprar o recibir permiso.`
          : `ℹ️ @${target.split('@')[0]} no tenía un acceso privado activo registrado.`,
        mentions: [target],
      }, { quoted: ctx.message })
    },
  },
  {
    name: 'privatestatus', aliases: ['privatecheck'], category: 'owner', staffOnly: true,
    description: 'Consulta el permiso privado de un usuario.', usage: 'privatestatus @usuario',
    async handler(ctx) {
      const target = await resolveTarget(ctx)
      const status = privateAccessStatus(target)
      await ctx.socket.sendMessage(ctx.chatId, {
        text: status
          ? `🔐 *ACCESO PRIVADO ACTIVO*\n━━━━━━━━━━━━━━\nUsuario: @${target.split('@')[0]}\nVence: *${fmtExpiry(status.expiresAt, status.permanent)}*`
          : `🔒 @${target.split('@')[0]} no tiene acceso privado activo.`,
        mentions: [target],
      }, { quoted: ctx.message })
    },
  },
  {
    name: 'privateusers', aliases: ['privateaccesslist'], category: 'owner', staffOnly: true,
    description: 'Lista usuarios que actualmente tienen acceso al bot por privado.',
    async handler(ctx) {
      const rows = listPrivateAccess(50)
      if (!rows.length) throw new Error('No hay usuarios con acceso privado activo.')
      const lines = rows.map((item, index) => `${index + 1}. @${item.userJid.split('@')[0]} · ${fmtExpiry(item.expiresAt, item.permanent)}`)
      await ctx.socket.sendMessage(ctx.chatId, {
        text: `╭━━〔 🔐 *USUARIOS PRIVADOS* 〕━━╮\n${lines.join('\n')}\n╰━━━━━━━━━━━━━━━━╯`,
        mentions: rows.map((item) => item.userJid),
      }, { quoted: ctx.message })
    },
  },
]
