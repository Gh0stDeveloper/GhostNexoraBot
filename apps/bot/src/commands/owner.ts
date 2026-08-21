import { config } from '../config.js'
import type { BotCommand } from '../types.js'

function toggle(value?: string) {
  const normalized = (value ?? '').toLowerCase()
  if (['on', 'true', '1', 'enable', 'activar'].includes(normalized)) return true
  if (['off', 'false', '0', 'disable', 'desactivar'].includes(normalized)) return false
  throw new Error('Usa on u off.')
}

export const ownerCommands: BotCommand[] = [
  {
    name: 'setprefix', aliases: ['prefixset'], category: 'owner', ownerOnly: true,
    description: 'Cambia y persiste el prefijo del bot.', usage: 'setprefix <nuevo>',
    async handler(ctx) {
      const next = ctx.args[0]
      if (!next) throw new Error(`Uso: ${ctx.prefix}setprefix !`)
      await ctx.settings.setPrefix(next)
      await ctx.reply(`✅ Prefijo actualizado a *${next}* y guardado de forma persistente.`)
    },
  },
  {
    name: 'adultmode', aliases: ['adultglobal'], category: 'owner', ownerOnly: true,
    description: 'Activa o desactiva globalmente el módulo 18+.', usage: 'adultmode on|off',
    async handler(ctx) {
      const enabled = toggle(ctx.args[0])
      await ctx.settings.setAdultEnabled(enabled)
      await ctx.reply(`🔞 Módulo 18+ global: *${enabled ? 'ON' : 'OFF'}*.\nLos grupos además requieren ${ctx.prefix}adult allow.`)
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
    name: 'status', aliases: ['botstatus'], category: 'owner', ownerOnly: true,
    description: 'Muestra el estado técnico del proceso.',
    async handler(ctx) {
      const memory = process.memoryUsage()
      await ctx.reply([
        `👻 *${config.botName} · Status*`,
        '✅ WhatsApp: conectado',
        `🔑 JID: ${ctx.socket.user?.id ?? 'N/D'}`,
        `⚙️ Prefijo: ${ctx.settings.prefix}`,
        `🔞 Adulto global: ${ctx.settings.adultEnabled ? 'ON' : 'OFF'}`,
        `🔐 Privado premium: ${ctx.settings.privateCommandsRequireAccess ? 'ON' : 'OFF'}`,
        `⏱️ Uptime: ${Math.floor(process.uptime())} s`,
        `🧠 RSS: ${(memory.rss / 1024 / 1024).toFixed(1)} MB`,
        `📥 Límite descarga: ${config.maxDownloadMb} MB`,
      ].join('\n'))
    },
  },
  {
    name: 'restart', aliases: ['reboot'], category: 'owner', ownerOnly: true,
    description: 'Reinicia el proceso; systemd lo levanta nuevamente.',
    async handler(ctx) {
      await ctx.reply('♻️ Reiniciando Ghost Nexora Bot...')
      setTimeout(() => process.exit(0), 750)
    },
  },
]
