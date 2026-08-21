import { config } from '../config.js'
import type { BotCommand } from '../types.js'

export const ownerCommands: BotCommand[] = [
  {
    name: 'setprefix',
    aliases: ['prefixset'],
    category: 'owner',
    description: 'Cambia y persiste el prefijo del bot.',
    ownerOnly: true,
    usage: 'setprefix <nuevo>',
    async handler(ctx) {
      const next = ctx.args[0]
      if (!next) throw new Error(`Uso: ${ctx.prefix}setprefix !`)
      await ctx.settings.setPrefix(next)
      await ctx.reply(`✅ Prefijo actualizado a *${next}* y guardado de forma persistente.`)
    },
  },
  {
    name: 'status',
    aliases: ['botstatus'],
    category: 'owner',
    description: 'Muestra el estado técnico del proceso.',
    ownerOnly: true,
    async handler(ctx) {
      const memory = process.memoryUsage()
      await ctx.reply([
        `👻 *${config.botName} · Status*`,
        `✅ WhatsApp: conectado`,
        `🔑 JID: ${ctx.socket.user?.id ?? 'N/D'}`,
        `⚙️ Prefijo: ${ctx.settings.prefix}`,
        `⏱️ Uptime: ${Math.floor(process.uptime())} s`,
        `🧠 RSS: ${(memory.rss / 1024 / 1024).toFixed(1)} MB`,
        `📥 Límite descarga: ${config.maxDownloadMb} MB`,
      ].join('\n'))
    },
  },
  {
    name: 'restart',
    aliases: ['reboot'],
    category: 'owner',
    description: 'Reinicia el proceso; systemd lo levanta nuevamente.',
    ownerOnly: true,
    async handler(ctx) {
      await ctx.reply('♻️ Reiniciando Ghost Nexora Bot...')
      setTimeout(() => process.exit(0), 750)
    },
  },
]
