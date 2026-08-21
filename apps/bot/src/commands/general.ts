import { config } from '../config.js'
import type { BotCommand } from '../types.js'

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return [days ? `${days}d` : '', hours ? `${hours}h` : '', `${minutes}m`].filter(Boolean).join(' ')
}

export const generalCommands: BotCommand[] = [
  {
    name: 'menu',
    aliases: ['help', 'comandos'],
    category: 'general',
    description: 'Muestra el menú completo.',
    async handler(ctx) {
      const p = ctx.prefix
      const menu = `
╭━━━〔 👻 *${config.botName.toUpperCase()}* 〕━━━⬣
┃ 👤 Hola, *${ctx.pushName}*
┃ ⚙️ Prefijo: *${p}*
┃ ⏱️ Uptime: *${formatUptime(process.uptime())}*
╰━━━━━━━━━━━━━━━━━━━━⬣

╭─❖ 🌐 *GENERAL*
│ ${p}menu / ${p}help
│ ${p}ping
│ ${p}info
│ ${p}prefix
╰─────────────⬣

╭─❖ 🎨 *STICKERS*
│ ${p}sticker / ${p}s
│ ${p}toimg
╰─────────────⬣

╭─❖ 🎵 *YOUTUBE & AUDIO*
│ ${p}yts <búsqueda>
│ ${p}play <búsqueda>
│ ${p}playvideo <búsqueda>
│ ${p}ytformats <url>
│ ${p}ytmp3 <url>
│ ${p}ytmp4 <url> [calidad]
│ ${p}soundcloud <url|búsqueda>
╰─────────────⬣

╭─❖ 📥 *DESCARGAS*
│ ${p}tiktok <url>
│ ${p}instagram <url>
│ ${p}facebook <url>
│ ${p}twitter <url>
│ ${p}mediafire <url>
╰─────────────⬣

╭─❖ 👥 *GRUPOS*
│ ${p}tagall [mensaje]
│ ${p}hidetag <mensaje>
│ ${p}link
│ ${p}group open|close
│ ${p}kick @usuario
│ ${p}promote @usuario
│ ${p}demote @usuario
╰─────────────⬣

╭─❖ 👑 *OWNER*
│ ${p}setprefix <nuevo>
│ ${p}status
│ ${p}restart
╰─────────────⬣

✨ *Ghost Developer / Nexora*
_Usa las descargas únicamente para contenido que puedas descargar legalmente._`.trim()
      await ctx.reply(menu)
    },
  },
  {
    name: 'ping',
    category: 'general',
    description: 'Comprueba latencia y disponibilidad.',
    async handler(ctx) {
      const start = performance.now()
      await ctx.socket.sendPresenceUpdate('composing', ctx.chatId).catch(() => undefined)
      const latency = Math.max(0, Math.round(performance.now() - start))
      await ctx.reply(`🏓 *Pong*\n⚡ Latencia interna: ${latency} ms\n⏱️ Uptime: ${formatUptime(process.uptime())}`)
    },
  },
  {
    name: 'info',
    aliases: ['bot'],
    category: 'general',
    description: 'Información del bot.',
    async handler(ctx) {
      await ctx.reply(`👻 *${config.botName}*\n\n🤖 WhatsApp Multi-Device\n🧩 Arquitectura modular TypeScript\n🌐 Web Next.js + Tailwind CSS\n👨‍💻 Desarrollado por Ghost Developer\n⚙️ Prefijo actual: *${ctx.prefix}*`)
    },
  },
  {
    name: 'prefix',
    category: 'general',
    description: 'Muestra el prefijo actual.',
    async handler(ctx) {
      await ctx.reply(`⚙️ El prefijo actual es: *${ctx.prefix}*`)
    },
  },
]
