import { config } from '../config.js'
import type { BotCommand } from '../types.js'
import { getContextInfo, digitsFromJid } from '../utils/message.js'
import { community } from '../services/community.js'

function toggle(value?: string) {
  const normalized = (value ?? '').toLowerCase()
  if (['on', 'true', '1', 'enable', 'activar'].includes(normalized)) return true
  if (['off', 'false', '0', 'disable', 'desactivar'].includes(normalized)) return false
  throw new Error('Usa on u off.')
}

function targetNumber(ctx: Parameters<BotCommand['handler']>[0]) {
  const mention = getContextInfo(ctx.message)?.mentionedJid?.[0]
  const fromMention = mention ? digitsFromJid(mention) : ''
  const direct = ctx.args.find((arg) => /\d{8,20}/.test(arg))?.replace(/\D/g, '') ?? ''
  const value = fromMention || direct
  if (!value) throw new Error('Menciona al usuario o indica su número internacional.')
  return value
}

export const ownerCommands: BotCommand[] = [
  {
    name: 'botadmin', aliases: ['staffadmin'], category: 'owner', ownerOnly: true,
    description: 'Agrega o elimina administradores globales del bot.', usage: 'botadmin add|remove @usuario',
    async handler(ctx) {
      const action = (ctx.args[0] ?? '').toLowerCase()
      if (!['add', 'remove', 'agregar', 'eliminar'].includes(action)) throw new Error(`Uso: ${ctx.prefix}botadmin add|remove @usuario`)
      const number = targetNumber(ctx)
      if (action === 'add' || action === 'agregar') {
        const saved = await ctx.settings.addBotAdmin(number)
        await ctx.reply(`╭─〔 🛡️ *STAFF GLOBAL* 〕\n│ +${saved} fue agregado como administrador del bot.\n│ Puede usar comandos marcados como STAFF.\n╰──────────────`)
      } else {
        const removed = await ctx.settings.removeBotAdmin(number)
        await ctx.reply(removed ? `🛡️ +${number} fue retirado del staff global.` : `ℹ️ +${number} no estaba registrado como staff.`)
      }
    },
  },
  {
    name: 'botadmins', aliases: ['staff', 'stafflist'], category: 'owner', staffOnly: true,
    description: 'Lista los administradores globales del bot.',
    async handler(ctx) {
      const admins = ctx.settings.botAdmins
      const ownerLines = config.owners.map((number) => `👑 +${number} · Owner`)
      const adminLines = admins.map((number) => `🛡️ +${number} · Admin global`)
      await ctx.reply(`╭━━〔 👑 *STAFF DE ${ctx.settings.botDisplayName.toUpperCase()}* 〕━━╮\n${[...ownerLines, ...adminLines].join('\n') || 'Sin staff configurado.'}\n╰━━━━━━━━━━━━━━━━╯`)
    },
  },
  {
    name: 'setprefix', aliases: ['prefixset'], category: 'owner', ownerOnly: true,
    description: 'Cambia y persiste el prefijo del bot.', usage: 'setprefix <nuevo>',
    async handler(ctx) {
      const next = ctx.args[0]
      if (!next) throw new Error(`Uso: ${ctx.prefix}setprefix !`)
      await ctx.settings.setPrefix(next)
      await ctx.reply(`⚙️ *PREFIJO ACTUALIZADO*\n━━━━━━━━━━━━━━\nNuevo prefijo: *${next}*`)
    },
  },
  {
    name: 'setbotname', aliases: ['botname'], category: 'owner', staffOnly: true,
    description: 'Cambia el nombre visible del bot.', usage: 'setbotname <nombre>',
    async handler(ctx) {
      const next = ctx.argText.trim()
      await ctx.settings.setBotDisplayName(next)
      await ctx.socket.updateProfileName(next).catch(() => undefined)
      await ctx.reply(`✦ *IDENTIDAD ACTUALIZADA*\n━━━━━━━━━━━━━━\nNombre visible: *${next}*`)
    },
  },
  {
    name: 'setbotcurrency', aliases: ['setcurrency'], category: 'owner', staffOnly: true,
    description: 'Cambia el nombre visual de la moneda del bot.', usage: 'setbotcurrency <nombre>',
    async handler(ctx) {
      await ctx.settings.setCurrencyName(ctx.argText)
      await ctx.reply(`🪙 Moneda visual del bot: *${ctx.settings.currencyName}*\nEl símbolo interno NXC se conserva para compatibilidad.`)
    },
  },
  {
    name: 'adultmode', aliases: ['adultglobal'], category: 'owner', staffOnly: true,
    description: 'Activa o desactiva globalmente el módulo 18+.', usage: 'adultmode on|off',
    async handler(ctx) {
      const enabled = toggle(ctx.args[0])
      await ctx.settings.setAdultEnabled(enabled)
      await ctx.reply(`🔞 *NSFW GLOBAL*\n━━━━━━━━━━━━━━\nEstado: *${enabled ? 'ON' : 'OFF'}*\nCada grupo además debe habilitarlo con ${ctx.prefix}nsfw on.`)
    },
  },
  {
    name: 'privatemode', aliases: ['privateaccess'], category: 'owner', ownerOnly: true,
    description: 'Hace que los módulos privados requieran suscripción.', usage: 'privatemode on|off',
    async handler(ctx) {
      const enabled = toggle(ctx.args[0])
      await ctx.settings.setPrivateCommandsRequireAccess(enabled)
      await ctx.reply(`🔐 Acceso privado por suscripción: *${enabled ? 'ON' : 'OFF'}*.`)
    },
  },
  {
    name: 'suggestions', aliases: ['reports', 'tickets'], category: 'owner', staffOnly: true,
    description: 'Muestra las sugerencias y reportes recientes.',
    async handler(ctx) {
      const rows = community.listSuggestions(15)
      if (!rows.length) throw new Error('No hay sugerencias registradas.')
      const lines = rows.map((row) => `#${row.id} · @${row.userJid.split('@')[0]}\n${row.body.slice(0, 180)}${row.body.length > 180 ? '…' : ''}`)
      await ctx.reply(`📨 *SUGERENCIAS / REPORTES*\n━━━━━━━━━━━━━━\n${lines.join('\n\n')}`)
    },
  },
  {
    name: 'status', aliases: ['botstatus'], category: 'owner', staffOnly: true,
    description: 'Muestra el estado técnico del proceso.',
    async handler(ctx) {
      const memory = process.memoryUsage()
      await ctx.reply([
        `╭━━〔 👻 *${ctx.settings.botDisplayName} · STATUS* 〕━━╮`,
        '┃ WhatsApp » ✅ conectado',
        `┃ JID » ${ctx.socket.user?.id ?? 'N/D'}`,
        `┃ Prefijo » ${ctx.settings.prefix}`,
        `┃ Staff » ${ctx.settings.botAdmins.length} admin(s)`,
        `┃ NSFW global » ${ctx.settings.adultEnabled ? 'ON' : 'OFF'}`,
        `┃ Privado premium » ${ctx.settings.privateCommandsRequireAccess ? 'ON' : 'OFF'}`,
        `┃ Uptime » ${Math.floor(process.uptime())} s`,
        `┃ RSS » ${(memory.rss / 1024 / 1024).toFixed(1)} MB`,
        `┃ Descarga máx. » ${config.maxDownloadMb} MB`,
        '╰━━━━━━━━━━━━━━━━╯',
      ].join('\n'))
    },
  },
  {
    name: 'restart', aliases: ['reboot'], category: 'owner', ownerOnly: true,
    description: 'Reinicia el proceso; systemd lo levanta nuevamente.',
    async handler(ctx) {
      await ctx.reply('♻️ *REINICIO SOLICITADO*\nGhost Nexora Bot volverá a conectarse mediante systemd.')
      setTimeout(() => process.exit(0), 750)
    },
  },
]
