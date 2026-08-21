import { config } from '../config.js'
import type { BotCommand } from '../types.js'
import { getContextInfo, digitsFromJid } from '../utils/message.js'
import { community } from '../services/community.js'
import { subbotCustomization } from '../services/subbot-customization.js'

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

function botNames(input: string) {
  const parts = input.split('/').map((value) => value.trim()).filter(Boolean)
  if (!parts.length) throw new Error('Indica el nombre. Formato recomendado: nombre corto / nombre largo.')
  const shortName = parts[0]!
  const longName = parts[1] ?? shortName
  if (shortName.length < 2 || shortName.length > 24) throw new Error('El nombre corto debe tener entre 2 y 24 caracteres.')
  if (longName.length < 2 || longName.length > 60) throw new Error('El nombre largo debe tener entre 2 y 60 caracteres.')
  return { shortName, longName }
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
    name: 'setbotname', aliases: ['botname'], category: 'owner', staffOnly: true, subbotOwnerAllowed: true,
    description: 'Cambia el nombre corto de WhatsApp y el nombre largo mostrado por la instancia.', usage: 'setbotname <corto> / <largo>',
    async handler(ctx) {
      const names = botNames(ctx.argText)
      if (ctx.instanceId) {
        const saved = subbotCustomization.setNames(ctx.instanceId, names.shortName, names.longName)
        await ctx.socket.updateProfileName(saved.shortName).catch(() => undefined)
        await ctx.reply(`✦ *SUBBOT #${ctx.instanceId} PERSONALIZADO*\n━━━━━━━━━━━━━━\nNombre corto: *${saved.shortName}*\nNombre largo: *${saved.longName}*`)
        return
      }
      await ctx.settings.setBotDisplayName(names.longName)
      await ctx.socket.updateProfileName(names.shortName).catch(() => undefined)
      await ctx.reply(`✦ *IDENTIDAD DEL MAINBOT ACTUALIZADA*\n━━━━━━━━━━━━━━\nNombre corto de WhatsApp: *${names.shortName}*\nNombre largo del menú: *${names.longName}*`)
    },
  },
  {
    name: 'setbotcurrency', aliases: ['setcurrency'], category: 'owner', staffOnly: true, subbotOwnerAllowed: true,
    description: 'Cambia el nombre visual de la moneda de la instancia.', usage: 'setbotcurrency <nombre>',
    async handler(ctx) {
      if (ctx.instanceId) {
        const saved = subbotCustomization.setCurrency(ctx.instanceId, ctx.argText)
        await ctx.reply(`🪙 Moneda visual del subbot #${ctx.instanceId}: *${saved.currencyName}*\nEl símbolo interno NXC se conserva para compatibilidad.`)
        return
      }
      await ctx.settings.setCurrencyName(ctx.argText)
      await ctx.reply(`🪙 Moneda visual del MainBot: *${ctx.settings.currencyName}*\nEl símbolo interno NXC se conserva para compatibilidad.`)
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
    description: 'Muestra la política de acceso premium de chats privados.', usage: 'privatemode status',
    async handler(ctx) {
      const action = (ctx.args[0] ?? 'status').toLowerCase()
      if (['off', 'false', '0', 'disable', 'desactivar'].includes(action)) {
        throw new Error('El acceso premium en chat privado es obligatorio y no puede desactivarse. Los usuarios deben comprar private1d/private7d/private30d en .shop.')
      }
      await ctx.settings.setPrivateCommandsRequireAccess(true)
      await ctx.reply(`🔐 *CHAT PRIVADO PREMIUM*\n━━━━━━━━━━━━━━\nEstado: *OBLIGATORIO*\nSin private_access solo están disponibles *${ctx.prefix}menu*, *${ctx.prefix}shop*, *${ctx.prefix}balance* y *${ctx.prefix}buy*.`)
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
        '┃ Privado premium » OBLIGATORIO',
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
