import { config } from '../config.js'
import type { BotCommand } from '../types.js'
import { sendInteractiveCard } from '../services/interactive.js'

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return [days ? `${days}d` : '', hours ? `${hours}h` : '', `${minutes}m`].filter(Boolean).join(' ')
}

async function botAvatar(ctx: Parameters<BotCommand['handler']>[0]) {
  const jid = ctx.socket.user?.id
  if (!jid) return undefined
  return ctx.socket.profilePictureUrl(jid, 'image').catch(() => undefined)
}

export const generalCommands: BotCommand[] = [
  {
    name: 'menu', aliases: ['help', 'comandos'], category: 'general', description: 'Muestra el menú completo.',
    async handler(ctx) {
      const p = ctx.prefix
      const avatar = await botAvatar(ctx)
      const staffSection = ctx.isBotStaff ? `
╭─〔 🛡️ *STAFF DEL BOT* 〕
│ ${p}status · ${p}botadmins
│ ${p}suggestions · ${p}adultmode on|off
│ ${p}setbotname <nombre>
│ ${p}setbotcurrency <nombre>
${ctx.isOwner ? `│ ${p}botadmin add|remove @user\n│ ${p}setprefix · ${p}privatemode · ${p}restart` : ''}
╰────────────────` : ''
      const menu = `
╭━━━〔 👻 *${ctx.settings.botDisplayName.toUpperCase()}* 〕━━━╮
┃ Hola, *${ctx.pushName}*
┃ Prefijo » *${p}*
┃ Uptime » *${formatUptime(process.uptime())}*
┃ Moneda » *${ctx.settings.currencyName} (NXC)*
┃ Rol » *${ctx.isOwner ? 'Owner' : ctx.isBotStaff ? 'Staff global' : 'Usuario'}*
╰━━━━━━━━━━━━━━━━━━━━╯

╭─〔 🌐 *GENERAL* 〕
│ ${p}menu · ${p}help · ${p}ping · ${p}info
│ ${p}suggest <mensaje> · ${p}cd
│ ${p}anime <búsqueda> · ${p}manga <búsqueda>
╰────────────────

╭─〔 👤 *PERFIL Y SOCIAL* 〕
│ ${p}profile · ${p}setdesc · ${p}setbirth DD/MM
│ ${p}setgender · ${p}level · ${p}tops
│ ${p}vr · ${p}marry @user · ${p}divorce
│ ${p}amante @user · ${p}terminar
╰────────────────

╭─〔 🎵 *MÚSICA Y DESCARGAS* 〕
│ ${p}yts <búsqueda> · ${p}play <búsqueda>
│ ${p}playvideo <búsqueda> · ${p}lyrics <canción>
│ ${p}ytmp3 <url> · ${p}ytmp4 <url> [calidad]
│ ${p}tiktok · ${p}instagram · ${p}facebook
│ ${p}twitter · ${p}mediafire · ${p}gdrive
╰────────────────

╭─〔 🪙 *ECONOMÍA* 〕
│ ${p}bal · ${p}work · ${p}deposit · ${p}withdraw
│ ${p}pay @user <monto> · ${p}rob @user
│ ${p}top · ${p}shop · ${p}buy <producto>
╰────────────────

╭─〔 🌸 *GACHA / COLECCIÓN* 〕
│ ${p}rw · ${p}claim · ${p}harem
│ ${p}wsearch <nombre> · ${p}winfo <id>
│ ${p}givewaifu @user <id> · ${p}wsell <id>
│ ${p}wtop · ${p}add <anime/personaje>
╰────────────────

╭─〔 🎨 *STICKERS Y HERRAMIENTAS* 〕
│ ${p}s · ${p}stickereffects · ${p}toimage
│ ${p}groupinfo · ${p}gitclone · ${p}apk
╰────────────────

╭─〔 👥 *ADMINISTRACIÓN DE GRUPOS* 〕
│ ${p}bot on|off · ${p}tag [mensaje] · ${p}hidetag
│ ${p}kick · ${p}promote · ${p}demote · ${p}del
│ ${p}open · ${p}close · ${p}link
│ ${p}antilink on|off · ${p}nsfw on|off
│ ${p}welcome on|off · ${p}goodbye on|off
│ ${p}setwelcome <frase> · ${p}setgoodbye <frase>
╰────────────────

╭─〔 🤖 *SUBBOTS* 〕
│ ${p}subbot status · ${p}subbot pair <número>
│ ${p}subbot portal
╰────────────────

╭─〔 🔞 *18+ CONTROLADO* 〕
│ ${p}adult18 accept
│ ${p}xvideos · ${p}xnxx · ${p}pornhub
╰────────────────
${staffSection}

✦ Usa los comandos con responsabilidad.
✦ Las noticias y cambios oficiales están en el canal mediante el botón inferior.`.trim()

      await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
        title: `✦ ${ctx.settings.botDisplayName} · COMMAND CENTER ✦`,
        body: menu,
        imageUrl: avatar,
        footer: 'Ghost Developer / Nexora · WhatsApp Multi-Device',
        buttons: [
          { type: 'url', text: '📢 Visitar canal', url: config.officialChannelUrl },
          { type: 'reply', text: '👤 Mi perfil', id: `${p}profile` },
          { type: 'reply', text: '🏓 Ping', id: `${p}ping` },
        ],
      })
    },
  },
  {
    name: 'ping', category: 'general', description: 'Comprueba latencia y disponibilidad.',
    async handler(ctx) {
      const start = performance.now()
      await ctx.socket.sendPresenceUpdate('composing', ctx.chatId).catch(() => undefined)
      const latency = Math.max(0, Math.round(performance.now() - start))
      await ctx.reply(`╭━━〔 🏓 *PONG* 〕━━╮\n┃ Latencia interna » *${latency} ms*\n┃ Uptime » *${formatUptime(process.uptime())}*\n┃ Estado » *ONLINE*\n╰━━━━━━━━━━━━━━╯`)
    },
  },
  {
    name: 'info', aliases: ['about', 'botinfo'], category: 'general', description: 'Información del bot.',
    async handler(ctx) {
      const avatar = await botAvatar(ctx)
      await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
        title: `👻 ${ctx.settings.botDisplayName}`,
        imageUrl: avatar,
        body: [
          '╭─〔 *INFORMACIÓN* 〕',
          '│ Plataforma » WhatsApp Multi-Device',
          '│ Core » TypeScript + Baileys',
          '│ Panel » Next.js + Tailwind CSS',
          '│ Economía » Nexora Economy',
          '│ Colección » Nexora Gacha',
          `│ Prefijo » ${ctx.prefix}`,
          `│ Uptime » ${formatUptime(process.uptime())}`,
          '│ Developer » Ghost Developer / Nexora',
          '╰──────────────',
        ].join('\n'),
        buttons: [
          { type: 'url', text: '📢 Ver canal', url: config.officialChannelUrl },
          { type: 'reply', text: '📋 Menú', id: `${ctx.prefix}menu` },
        ],
      })
    },
  },
  {
    name: 'prefix', category: 'general', description: 'Muestra el prefijo actual.',
    async handler(ctx) { await ctx.reply(`⚙️ *PREFIJO ACTUAL*\n━━━━━━━━━━━━━━\nUsa: *${ctx.prefix}*`) },
  },
]
