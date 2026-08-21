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
    name: 'menu', aliases: ['help', 'comandos'], category: 'general', description: 'Muestra el menú completo.',
    async handler(ctx) {
      const p = ctx.prefix
      const menu = `
╭━━━〔 👻 *${config.botName.toUpperCase()}* 〕━━━⬣
┃ 👤 Hola, *${ctx.pushName}*
┃ ⚙️ Prefijo: *${p}*
┃ ⏱️ Uptime: *${formatUptime(process.uptime())}*
┃ 🪙 Economía: *Nexora Coins (NXC)*
╰━━━━━━━━━━━━━━━━━━━━⬣

╭─❖ 🌐 *GENERAL*
│ ${p}menu · ${p}ping · ${p}info · ${p}prefix
╰─────────────⬣

╭─❖ 🎨 *STICKERS*
│ ${p}sticker / ${p}s
│ ${p}toimg
╰─────────────⬣

╭─❖ 🎵 *MÚSICA & VIDEO*
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

╭─❖ 🪙 *ECONOMÍA*
│ ${p}balance / ${p}bal
│ ${p}work / ${p}w
│ ${p}deposit <cantidad>
│ ${p}withdraw <cantidad>
│ ${p}transfer @user <cantidad>
│ ${p}rob @user
│ ${p}top
│ ${p}shop · ${p}buy <producto>
╰─────────────⬣

╭─❖ 🤖 *SUBBOTS*
│ ${p}subbot status
│ ${p}subbot pair <número>
│ ${p}subbot portal
╰─────────────⬣

╭─❖ 👥 *GRUPOS*
│ ${p}tagall · ${p}hidetag
│ ${p}link · ${p}group open|close
│ ${p}kick · ${p}promote · ${p}demote
│ ${p}enable welcome|antilink|antispam
│ ${p}disable welcome|antilink|antispam
╰─────────────⬣

╭─❖ 🔞 *18+ · CONTROLADO*
│ ${p}adult18 accept
│ ${p}xvideos <búsqueda|url>
│ ${p}xnxx <búsqueda|url>
│ ${p}pornhub <búsqueda|url>
╰─────────────⬣

╭─❖ 👑 *OWNER*
│ ${p}setprefix <nuevo>
│ ${p}adultmode on|off
│ ${p}privatemode on|off
│ ${p}subbots
│ ${p}status · ${p}restart
╰─────────────⬣

📢 *CANAL OFICIAL DE GHOST NEXORA BOT*
${config.officialChannelUrl}

📰 Actualizaciones, noticias, grupos oficiales y avisos del desarrollador se publicarán en ese canal.

✨ *Ghost Developer / Nexora*`.trim()
      await ctx.reply(menu)
    },
  },
  {
    name: 'ping', category: 'general', description: 'Comprueba latencia y disponibilidad.',
    async handler(ctx) {
      const start = performance.now()
      await ctx.socket.sendPresenceUpdate('composing', ctx.chatId).catch(() => undefined)
      const latency = Math.max(0, Math.round(performance.now() - start))
      await ctx.reply(`🏓 *Pong*\n⚡ Latencia interna: ${latency} ms\n⏱️ Uptime: ${formatUptime(process.uptime())}`)
    },
  },
  {
    name: 'info', aliases: ['bot'], category: 'general', description: 'Información del bot.',
    async handler(ctx) {
      await ctx.reply(`👻 *${config.botName}*\n\n🤖 WhatsApp Multi-Device\n🧩 TypeScript + Baileys\n🌐 Next.js + Tailwind CSS\n🪙 Nexora Economy\n👨‍💻 Ghost Developer\n⚙️ Prefijo: *${ctx.prefix}*\n📢 ${config.officialChannelUrl}`)
    },
  },
  { name: 'prefix', category: 'general', description: 'Muestra el prefijo actual.', async handler(ctx) { await ctx.reply(`⚙️ El prefijo actual es: *${ctx.prefix}*`) } },
]
