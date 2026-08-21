import { config } from '../config.js'
import type { BotCommand } from '../types.js'
import { getBrandingAsset } from '../services/branding.js'
import { economy } from '../services/economy.js'
import { community } from '../services/community.js'
import { sendInteractiveCard } from '../services/interactive.js'
import { subbotCustomization } from '../services/subbot-customization.js'

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

async function menuArtwork(ctx: Parameters<BotCommand['handler']>[0]) {
  const banner = await getBrandingAsset('menu', ctx.instanceId).catch(() => null)
  if (banner?.kind === 'image') return banner.path
  return botAvatar(ctx)
}

function identity(ctx: Parameters<BotCommand['handler']>[0]) {
  if (ctx.instanceId) {
    const custom = subbotCustomization.get(ctx.instanceId)
    return { shortName: custom.shortName, longName: custom.longName, currencyName: custom.currencyName, label: `Subbot #${ctx.instanceId}` }
  }
  return { shortName: ctx.settings.botDisplayName, longName: ctx.settings.botDisplayName, currencyName: ctx.settings.currencyName, label: 'MainBot' }
}

async function sendMenu(ctx: Parameters<BotCommand['handler']>[0], artwork: string | undefined, menu: string, brand: ReturnType<typeof identity>) {
  let delivered = false
  if (artwork) {
    const sent = await ctx.socket.sendMessage(ctx.chatId, {
      image: { url: artwork },
      caption: menu,
    }, { quoted: ctx.message }).catch(() => null)
    delivered = Boolean(sent)
  }
  if (!delivered) await ctx.reply(menu)

  await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
    title: `👻 ${brand.shortName} · ACCESOS RÁPIDOS`,
    body: 'Selecciona una opción.',
    footer: 'Ghost Developer / Nexora',
    buttons: [
      { type: 'url', text: '📢 Ver canal', url: config.officialChannelUrl },
      { type: 'reply', text: '👤 Mi perfil', id: `${ctx.prefix}profile` },
      { type: 'reply', text: '🛒 Tienda', id: `${ctx.prefix}shop` },
    ],
  }).catch(() => undefined)
}

export const generalCommands: BotCommand[] = [
  {
    name: 'menu', aliases: ['help', 'comandos'], category: 'general', description: 'Muestra el menú completo.',
    async handler(ctx) {
      const p = ctx.prefix
      const artwork = await menuArtwork(ctx)
      const brand = identity(ctx)
      const privateUntil = ctx.isGroup || ctx.isBotStaff || ctx.isSubbotOwner ? null : economy.hasEntitlement(ctx.sender, 'private_access')
      const privateUnlocked = ctx.isGroup || ctx.isBotStaff || ctx.isSubbotOwner || Boolean(privateUntil)
      const groupEnabled = !ctx.isGroup || community.getGroupSettings(ctx.chatId).botEnabled

      const accessLines = [
        ctx.isGroup ? `┃ 👥 Grupo » *${groupEnabled ? 'ON' : 'OFF'}*` : `┃ 🔐 Privado » *${privateUnlocked ? 'HABILITADO' : 'BLOQUEADO'}*`,
        privateUntil ? `┃ ⏳ Acceso hasta » *${new Date(privateUntil).toLocaleString('es-MX')}*` : '',
        ctx.isGroup && !groupEnabled ? `┃ ▶️ Activar » *${p}bot on*` : '',
        !ctx.isGroup && !privateUnlocked ? `┃ 🛒 Acceso » *${p}shop*` : '',
      ].filter(Boolean).join('\n')

      const customizationSection = ctx.isBotStaff || ctx.isSubbotOwner ? `
╭─〔 🎛️ *PERSONALIZACIÓN* 〕
│ ${p}setbotname corto / largo
│ ${p}setbotcurrency <nombre> · ${p}setpfp
│ ${p}sb · ${p}welbanner · ${p}byebanner
│ ${p}delbanner · ${p}delwelbanner · ${p}delbyebanner
╰────────────────` : ''

      const staffSection = ctx.isBotStaff ? `
╭─〔 🛡️ *STAFF DEL BOT* 〕
│ ${p}system · ${p}speedtest · ${p}status
│ ${p}botadmins · ${p}suggestions
│ ${p}adultmode on|off
│ ${p}privategrant @user [30d|permanent]
│ ${p}privaterevoke @user · ${p}privatestatus @user
│ ${p}privateusers
${ctx.isOwner ? `│ ${p}botadmin add|remove @user\n│ ${p}setprefix · ${p}restart` : ''}
╰────────────────` : ''

      const menu = `
╭━━━〔 👻 *${brand.longName.toUpperCase()}* 〕━━━╮
┃ ⚙️ Instancia » *${brand.label}*
┃ 👤 Usuario » *${ctx.pushName}*
┃ ⌨️ Prefijo » *${p}*
┃ ⏱️ Uptime » *${formatUptime(process.uptime())}*
┃ 🪙 Moneda » *${brand.currencyName} (NXC)*
┃ 🏷️ Rol » *${ctx.isOwner ? 'Owner' : ctx.isBotStaff ? 'Staff global' : ctx.isSubbotOwner ? 'Owner del subbot' : 'Usuario'}*
${accessLines}
╰━━━━━━━━━━━━━━━━━━━━╯

╭─〔 🧠 *IA · BÚSQUEDA · CONOCIMIENTO* 〕
│ ${p}ai <pregunta> · ${p}investiga <tema>
│ ${p}google <búsqueda> · ${p}wiki <búsqueda>
│ ${p}anime <búsqueda> · ${p}manga <búsqueda>
│ ${p}mangachapters <id|url> [es|en]
│ ${p}mangadl <id|url> <cap|latest> [es|en]
╰────────────────

╭─〔 🎵 *DESCARGAS · YOUTUBE Y AUDIO* 〕
│ ${p}yts <búsqueda> · ${p}play <búsqueda|url>
│ ${p}ytmusic <búsqueda|url> · ${p}yt <búsqueda|url> [calidad]
│ ${p}ytmp3 <url> · ${p}ytmp4 <url> [calidad]
│ ${p}playvideo <búsqueda> · ${p}ytformats <url>
│ ${p}lyrics <canción> · ${p}soundcloud <url|búsqueda>
╰────────────────

╭─〔 📲 *DESCARGAS · REDES Y ARCHIVOS* 〕
│ ${p}tiktok <url|búsqueda> · ${p}tiktok profiles <usuario>
│ ${p}tiktok profile <@usuario|url>
│ ${p}instagram <url> · ${p}facebook <url>
│ ${p}twitter <url> · ${p}mediafire <url>
│ ${p}gdrive <url> · ${p}gitclone <url> · ${p}apk <app>
╰────────────────

╭─〔 🌐 *GENERAL* 〕
│ ${p}menu · ${p}ping · ${p}info · ${p}channel
│ ${p}suggest <mensaje> · ${p}join <enlace> · ${p}cd
╰────────────────

╭─〔 👤 *PERFIL Y SOCIAL* 〕
│ ${p}profile · ${p}setdesc · ${p}setbirth DD/MM
│ ${p}setgender · ${p}level · ${p}tops · ${p}vr
│ ${p}marry @user · ${p}divorce
│ ${p}amante @user · ${p}terminar
╰────────────────

╭─〔 🪙 *ECONOMÍA Y FINANZAS* 〕
│ ${p}bal · ${p}daily · ${p}work · ${p}slut · ${p}crime
│ ${p}deposit · ${p}withdraw · ${p}pay @user <monto>
│ ${p}rob @user · ${p}invest · ${p}cda
│ ${p}loan · ${p}paydebt · ${p}lend @user <monto>
│ ${p}baltop · ${p}balglobal · ${p}shop · ${p}buy
╰────────────────

╭─〔 📖 *GRIMORIO RPG* 〕
│ ${p}grimorio · ${p}tienda · ${p}comprar <item>
│ ${p}usar <item> [@user] · ${p}givegema @user [cant]
│ Items » tiempo · deseo · fortuna · sombras
│          escudo · renacer · maldicion
╰────────────────

╭─〔 🎮 *JUEGOS Y APUESTAS NXC* 〕
│ ${p}flip · ${p}dados · ${p}bj · ${p}bjvs
│ ${p}ttt · ${p}lttt · ${p}tpvp
│ ${p}damas · ${p}damasbot
╰────────────────

╭─〔 🌸 *GACHA Y COLECCIÓN* 〕
│ ${p}rw · ${p}claim · ${p}harem
│ ${p}wsearch · ${p}winfo · ${p}wimage
│ ${p}ainfo · ${p}alist · ${p}givewaifu
│ ${p}giveallharem · ${p}trade · ${p}delchar
│ ${p}setfav · ${p}setclaim · ${p}vote
│ ${p}topwaifus · ${p}wtop · ${p}add
╰────────────────

╭─〔 💞 *REACCIONES* 〕
│ ${p}hug · ${p}kiss · ${p}pat · ${p}nuzzle
│ ${p}blush · ${p}wink · ${p}wave · ${p}dance
│ ${p}poke · ${p}bite · ${p}slap · ${p}punch
│ ${p}patear · ${p}kill · ${p}crazy · ${p}bug
│ ${p}cry · ${p}spell · ${p}seducir · ${p}saborear
╰────────────────

╭─〔 🎨 *STICKERS Y HERRAMIENTAS* 〕
│ ${p}s · ${p}spack <nombre> · ${p}stickereffects
│ ${p}toimage · ${p}sprite <personaje>
│ ${p}groupinfo · ${p}safebooru [tags]
╰────────────────

╭─〔 👥 *ADMINISTRACIÓN DE GRUPOS* 〕
│ ${p}bot on|off|status · ${p}tag · ${p}hidetag
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

╭─〔 🔞 *DESCARGAS Y CONTENIDO 18+* 〕
│ ${p}adult18 accept
│ ${p}xvideos <búsqueda|url>
│ ${p}xnxx <búsqueda|url>
│ ${p}pornhub <búsqueda|url>
│ ${p}erome · ${p}erome search <texto>
│ ${p}erome profiles <usuario> · ${p}erome profile <usuario|url>
│ ${p}erome album <id|url> · ${p}erome dl <id|url> <video>
│ ${p}gelbooru [tags] · ${p}e621 [tags]
╰────────────────
${customizationSection}
${staffSection}

📢 *Canal oficial y accesos rápidos disponibles debajo del menú.*
*Ghost Developer / Nexora*`.trim()

      await sendMenu(ctx, artwork, menu, brand)
    },
  },
  {
    name: 'ping', category: 'general', description: 'Comprueba latencia y disponibilidad.',
    async handler(ctx) {
      const start = performance.now()
      await ctx.socket.sendPresenceUpdate('composing', ctx.chatId).catch(() => undefined)
      const latency = Math.max(0, Math.round(performance.now() - start))
      const brand = identity(ctx)
      await ctx.reply(`╭━━〔 🏓 *${brand.shortName} · PONG* 〕━━╮\n┃ Latencia » *${latency} ms*\n┃ Uptime » *${formatUptime(process.uptime())}*\n┃ Estado » *ONLINE*\n╰━━━━━━━━━━━━━━╯`)
    },
  },
  {
    name: 'info', aliases: ['about', 'botinfo'], category: 'general', description: 'Información del bot.',
    async handler(ctx) {
      const artwork = await menuArtwork(ctx)
      const brand = identity(ctx)
      const body = [
        `╭━━〔 👻 *${brand.longName}* 〕━━╮`,
        `┃ Instancia » ${brand.label}`,
        '┃ Plataforma » WhatsApp Multi-Device',
        '┃ Core » TypeScript + Baileys',
        '┃ Panel » Next.js',
        '┃ Economía » Nexora Economy',
        '┃ Juegos » IA + PvP',
        '┃ Búsqueda » Google + Wikipedia',
        `┃ Prefijo » ${ctx.prefix}`,
        `┃ Uptime » ${formatUptime(process.uptime())}`,
        '┃ Developer » Ghost Developer / Nexora',
        '╰━━━━━━━━━━━━━━━━╯',
      ].join('\n')
      if (artwork) {
        const sent = await ctx.socket.sendMessage(ctx.chatId, { image: { url: artwork }, caption: body }, { quoted: ctx.message }).catch(() => null)
        if (sent) return
      }
      await ctx.reply(body)
    },
  },
  {
    name: 'channel', aliases: ['canal'], category: 'general', description: 'Muestra el canal oficial.',
    async handler(ctx) {
      await ctx.reply(`📢 *CANAL OFICIAL*\n${config.officialChannelUrl}`)
    },
  },
  {
    name: 'prefix', category: 'general', description: 'Muestra el prefijo actual.',
    async handler(ctx) { await ctx.reply(`⚙️ *PREFIJO ACTUAL*\n━━━━━━━━━━━━━━\nUsa: *${ctx.prefix}*`) },
  },
]
