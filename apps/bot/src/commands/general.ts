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
│ ${p}status · ${p}botadmins · ${p}suggestions
│ ${p}adultmode on|off · ${p}setbotname <nombre>
│ ${p}setbotcurrency <nombre> · ${p}setpfp
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
│ ${p}suggest <mensaje> · ${p}join <enlace>
│ ${p}cd · ${p}anime <búsqueda> · ${p}manga <búsqueda>
╰────────────────

╭─〔 👤 *PERFIL Y SOCIAL* 〕
│ ${p}profile · ${p}setdesc · ${p}setbirth DD/MM
│ ${p}setgender · ${p}level · ${p}tops · ${p}vr
│ ${p}marry @user · ${p}divorce
│ ${p}amante @user · ${p}terminar
╰────────────────

╭─〔 🎵 *MÚSICA Y DESCARGAS* 〕
│ ${p}play <búsqueda|url> · nota de voz
│ ${p}ytmusic <búsqueda|url> · audio
│ ${p}yt <búsqueda|url> [calidad] · video
│ ${p}yts <búsqueda> · ${p}lyrics <canción>
│ ${p}ytmp3 <url> · ${p}ytmp4 <url> [calidad]
│ ${p}tt · ${p}ig · ${p}fb · ${p}twitter
│ ${p}mediafire · ${p}gdrive · ${p}soundcloud
╰────────────────

╭─〔 🪙 *ECONOMÍA Y FINANZAS* 〕
│ ${p}bal · ${p}daily · ${p}work · ${p}slut · ${p}crime
│ ${p}deposit · ${p}withdraw · ${p}pay @user <monto>
│ ${p}rob @user · ${p}invest · ${p}cda
│ ${p}loan · ${p}paydebt · ${p}lend @user <monto>
│ ${p}baltop · ${p}balglobal · ${p}shop · ${p}buy
╰────────────────

╭─〔 📖 *GRIMORIO RPG* 〕
│ ${p}grimorio · ${p}tienda
│ ${p}comprar <item> [cantidad]
│ ${p}usar <item> [@user] · ${p}givegema @user [cant]
│ Items » tiempo · deseo · fortuna · sombras
│          escudo · renacer · maldicion
╰────────────────

╭─〔 🎮 *JUEGOS Y APUESTAS NXC* 〕
│ ${p}flip [cara|cruz] [apuesta]
│ ${p}dados [apuesta] · ${p}bj [apuesta]
│ ${p}ttt [apuesta] · ${p}ttt <1-9>
╰────────────────

╭─〔 🌸 *GACHA / COLECCIÓN* 〕
│ ${p}rw · ${p}claim · ${p}harem
│ ${p}wsearch <nombre> · ${p}winfo <nombre|id>
│ ${p}wimage <nombre|id> · ${p}ainfo <serie> · ${p}alist
│ ${p}givewaifu <nombre|id> @user
│ ${p}giveallharem @user · ${p}trade A / B @user
│ ${p}delchar <nombre|id> · ${p}setfav <nombre|id>
│ ${p}setclaim <frase> · ${p}vote <nombre|id>
│ ${p}topwaifus · ${p}wtop · ${p}add <anime/personaje>
╰────────────────

╭─〔 💞 *REACCIONES ANIME* 〕
│ ${p}hug · ${p}kiss · ${p}pat · ${p}nuzzle
│ ${p}blush · ${p}wink · ${p}wave · ${p}dance
│ ${p}poke · ${p}bite · ${p}slap · ${p}punch
│ ${p}patear · ${p}kill · ${p}crazy · ${p}bug
│ ${p}cry · ${p}spell · ${p}seducir · ${p}saborear
╰────────────────

╭─〔 🎨 *STICKERS Y HERRAMIENTAS* 〕
│ ${p}s · ${p}stickereffects · ${p}toimage
│ ${p}groupinfo · ${p}gitclone · ${p}apk
│ ${p}safebooru [tags]
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
│ ${p}gelbooru [tags] · ${p}e621 [tags]
╰────────────────
${staffSection}

✦ Usa los comandos con responsabilidad.
✦ El menú usa la foto real de perfil del bot.
✦ Noticias y cambios oficiales: botón *Visitar canal*.`.trim()

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
          '│ Economía » Nexora Economy + Grimorio RPG',
          '│ Colección » Nexora Gacha',
          '│ Reacciones » Anime GIF + FFmpeg',
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
