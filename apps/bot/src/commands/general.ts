import { config } from '../config.js'
import type { BotCommand } from '../types.js'
import { sendInteractiveCard } from '../services/interactive.js'
import { getBrandingAsset } from '../services/branding.js'
import { economy } from '../services/economy.js'
import { community } from '../services/community.js'
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

async function sendMenuPrimary(ctx: Parameters<BotCommand['handler']>[0], artwork: string | undefined, brand: ReturnType<typeof identity>, menu: string) {
  // El menú principal NO depende de Native Flow. Primero enviamos medios y texto
  // mediante mensajes WhatsApp estándar, que son los formatos más compatibles.
  if (artwork) {
    await ctx.socket.sendMessage(ctx.chatId, {
      image: { url: artwork },
      caption: `👻 *${brand.longName}*\nCommand Center · ${brand.label}`,
    }, { quoted: ctx.message }).catch(() => undefined)
  }
  await ctx.reply(menu)
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
        ctx.isGroup ? `┃ Grupo » *${groupEnabled ? 'ON' : 'OFF'}*` : `┃ Privado » *${privateUnlocked ? 'HABILITADO' : 'BLOQUEADO'}*`,
        privateUntil ? `┃ Acceso hasta » *${new Date(privateUntil).toLocaleString('es-MX')}*` : '',
        ctx.isGroup && !groupEnabled ? `┃ Activar » un admin debe usar *${p}bot on*` : '',
        !ctx.isGroup && !privateUnlocked ? `┃ Sin acceso » solo *${p}menu · ${p}shop · ${p}balance · ${p}buy*` : '',
      ].filter(Boolean).join('\n')

      const customizationSection = ctx.isBotStaff || ctx.isSubbotOwner ? `
╭─〔 🎛️ *PERSONALIZAR ${brand.label.toUpperCase()}* 〕
│ ${p}setbotname corto / largo
│ ${p}setbotcurrency <nombre> · ${p}setpfp
│ ${p}sb · ${p}welbanner · ${p}byebanner
│ ${p}delbanner · ${p}delwelbanner · ${p}delbyebanner
╰────────────────` : ''

      const staffSection = ctx.isBotStaff ? `
╭─〔 🛡️ *STAFF DEL BOT* 〕
│ ${p}system · ${p}speedtest
│ ${p}status · ${p}botadmins · ${p}suggestions
│ ${p}adultmode on|off
│ ${p}privategrant @user [30d|permanent]
│ ${p}privaterevoke @user · ${p}privatestatus @user
│ ${p}privateusers
${ctx.isOwner ? `│ ${p}botadmin add|remove @user\n│ ${p}setprefix · ${p}privatemode status · ${p}restart` : ''}
╰────────────────` : ''

      const lockedNotice = !ctx.isGroup && !privateUnlocked ? `
╭─〔 🔐 *ACCESO PRIVADO* 〕
│ Puedes consultar este menú aunque no tengas acceso.
│ Para usar los demás comandos compra en *${p}shop*.
│ Planes: private1d · private7d · private30d
╰────────────────
` : ''

      const groupNotice = ctx.isGroup && !groupEnabled ? `
╭─〔 ⏸️ *BOT APAGADO EN ESTE GRUPO* 〕
│ El menú permanece visible para todos.
│ Un administrador puede habilitarlo con *${p}bot on*.
╰────────────────
` : ''

      const menu = `
╭━━━〔 👻 *${brand.longName.toUpperCase()}* 〕━━━╮
┃ Instancia » *${brand.label}*
┃ Hola, *${ctx.pushName}*
┃ Prefijo » *${p}*
┃ Uptime » *${formatUptime(process.uptime())}*
┃ Moneda » *${brand.currencyName} (NXC)*
┃ Rol » *${ctx.isOwner ? 'Owner' : ctx.isBotStaff ? 'Staff global' : ctx.isSubbotOwner ? 'Owner del subbot' : 'Usuario'}*
${accessLines}
╰━━━━━━━━━━━━━━━━━━━━╯
${lockedNotice}${groupNotice}
╭─〔 🌐 *GENERAL Y BÚSQUEDA* 〕
│ ${p}menu · ${p}help · ${p}ping · ${p}info
│ ${p}suggest <mensaje> · ${p}join <enlace>
│ ${p}cd · ${p}anime <búsqueda> · ${p}manga <búsqueda>
│ ${p}google <búsqueda> · ${p}wiki <búsqueda>
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
│ ${p}flip [cara|cruz] [apuesta] · ${p}dados [apuesta]
│ ${p}bj [apuesta] · ${p}bjvs [apuesta] @user
│ ${p}ttt [apuesta] · ${p}lttt [apuesta] [@user]
│ ${p}tpvp @user [apuesta]
│ ${p}damas [apuesta|gratis] @user
│ ${p}damasbot [apuesta|gratis]
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
│ ${p}s · ${p}spack <nombre> · ${p}stickereffects
│ ${p}toimage · ${p}sprite <personaje>
│ ${p}groupinfo · ${p}gitclone · ${p}apk
│ ${p}safebooru [tags]
╰────────────────

╭─〔 👥 *ADMINISTRACIÓN DE GRUPOS* 〕
│ ${p}bot on|off|status
│ ${p}tag [mensaje] · ${p}hidetag
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
│ ${p}erome · ${p}erome search <texto>
│ ${p}erome hot|new [página] · ${p}erome status
│ ${p}gelbooru [tags] · ${p}e621 [tags]
╰────────────────
${customizationSection}
${staffSection}

✦ El menú siempre es visible; los permisos se aplican al ejecutar funciones.
✦ Los botones son opcionales: el texto funciona aunque WhatsApp no muestre Native Flow.`.trim()

      await sendMenuPrimary(ctx, artwork, brand, menu)

      const buttons = !ctx.isGroup && !privateUnlocked
        ? [
            { type: 'reply' as const, text: '🛒 Ver tienda', id: `${p}shop` },
            { type: 'reply' as const, text: '💰 Mi saldo', id: `${p}balance` },
            { type: 'url' as const, text: '📢 Visitar canal', url: config.officialChannelUrl },
          ]
        : [
            { type: 'url' as const, text: '📢 Visitar canal', url: config.officialChannelUrl },
            { type: 'reply' as const, text: '👤 Mi perfil', id: `${p}profile` },
            { type: 'reply' as const, text: '🏓 Ping', id: `${p}ping` },
          ]

      // Los controles Native Flow son una mejora visual, nunca la única salida del comando.
      await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
        title: `✦ ${brand.longName} · ACCIONES RÁPIDAS ✦`,
        body: !ctx.isGroup && !privateUnlocked
          ? `El menú ya fue enviado arriba. Puedes consultar la tienda y saldo desde estos accesos rápidos.`
          : `El menú ya fue enviado arriba. Estos botones son accesos rápidos opcionales.`,
        footer: `${brand.shortName} · Ghost Developer / Nexora`,
        buttons,
      }).catch(() => undefined)
    },
  },
  {
    name: 'ping', category: 'general', description: 'Comprueba latencia y disponibilidad.',
    async handler(ctx) {
      const start = performance.now()
      await ctx.socket.sendPresenceUpdate('composing', ctx.chatId).catch(() => undefined)
      const latency = Math.max(0, Math.round(performance.now() - start))
      const brand = identity(ctx)
      await ctx.reply(`╭━━〔 🏓 *${brand.shortName} · PONG* 〕━━╮\n┃ Latencia interna » *${latency} ms*\n┃ Uptime » *${formatUptime(process.uptime())}*\n┃ Estado » *ONLINE*\n╰━━━━━━━━━━━━━━╯`)
    },
  },
  {
    name: 'info', aliases: ['about', 'botinfo'], category: 'general', description: 'Información del bot.',
    async handler(ctx) {
      const artwork = await menuArtwork(ctx)
      const brand = identity(ctx)
      const body = [
        '╭─〔 *INFORMACIÓN* 〕',
        `│ Instancia » ${brand.label}`,
        '│ Plataforma » WhatsApp Multi-Device',
        '│ Core » TypeScript + Baileys',
        '│ Panel » Next.js + Tailwind CSS',
        '│ Economía » Nexora Economy + Grimorio RPG',
        '│ Colección » Nexora Gacha',
        '│ Juegos » IA + PvP persistente',
        '│ YouTube » m.youtube + yt1s + fallbacks',
        '│ Búsqueda » Google + Wikipedia',
        '│ Erome » exploración de video con sesión opcional',
        `│ Prefijo » ${ctx.prefix}`,
        `│ Uptime » ${formatUptime(process.uptime())}`,
        '│ Developer » Ghost Developer / Nexora',
        '╰──────────────',
      ].join('\n')
      if (artwork) {
        await ctx.socket.sendMessage(ctx.chatId, { image: { url: artwork }, caption: `👻 *${brand.longName}*` }, { quoted: ctx.message }).catch(() => undefined)
      }
      await ctx.reply(body)
      await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
        title: `👻 ${brand.longName}`,
        body: 'Acciones rápidas opcionales',
        buttons: [
          { type: 'url', text: '📢 Ver canal', url: config.officialChannelUrl },
          { type: 'reply', text: '📋 Menú', id: `${ctx.prefix}menu` },
        ],
      }).catch(() => undefined)
    },
  },
  {
    name: 'prefix', category: 'general', description: 'Muestra el prefijo actual.',
    async handler(ctx) { await ctx.reply(`⚙️ *PREFIJO ACTUAL*\n━━━━━━━━━━━━━━\nUsa: *${ctx.prefix}*`) },
  },
]
