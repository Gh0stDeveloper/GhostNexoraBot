import { config } from '../config.js'
import type { BotCommand } from '../types.js'
import { sendInteractiveCard } from '../services/interactive.js'
import { getBrandingAsset } from '../services/branding.js'
import { economy } from '../services/economy.js'

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
  const banner = await getBrandingAsset('menu').catch(() => null)
  if (banner?.kind === 'image') return banner.path
  return botAvatar(ctx)
}

export const generalCommands: BotCommand[] = [
  {
    name: 'menu', aliases: ['help', 'comandos'], category: 'general', description: 'Muestra el menú completo.',
    async handler(ctx) {
      const p = ctx.prefix
      const artwork = await menuArtwork(ctx)
      const privateUntil = ctx.isGroup || ctx.isBotStaff ? null : economy.hasEntitlement(ctx.sender, 'private_access')
      const privateUnlocked = ctx.isGroup || ctx.isBotStaff || Boolean(privateUntil)

      if (!privateUnlocked) {
        await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
          title: `🔐 ${ctx.settings.botDisplayName} · CHAT PRIVADO PREMIUM`,
          imageUrl: artwork,
          body: [
            `Hola, *${ctx.pushName}*.`,
            '',
            'El uso del bot por mensaje privado requiere una suscripción comprada con NXC.',
            'En este chat, antes de comprar, solo puedes consultar el menú, saldo y tienda.',
            '',
            '╭─〔 PLANES PRIVADOS 〕',
            '│ 1 día  » 2,000 NXC',
            '│ 7 días » 10,000 NXC',
            '│ 30 días » 30,000 NXC',
            '╰────────────────',
            '',
            `Compra: *${p}buy private1d*`,
            `       *${p}buy private7d*`,
            `       *${p}buy private30d*`,
            '',
            'En grupos puedes seguir usando las funciones permitidas por sus administradores.',
          ].join('\n'),
          footer: 'Ghost Nexora Bot · acceso privado por suscripción',
          buttons: [
            { type: 'reply', text: '🛒 Ver tienda', id: `${p}shop` },
            { type: 'reply', text: '💰 Mi saldo', id: `${p}balance` },
            { type: 'url', text: '📢 Visitar canal', url: config.officialChannelUrl },
          ],
        })
        return
      }

      const accessLine = privateUntil ? `┃ Privado » activo hasta *${new Date(privateUntil).toLocaleDateString('es-MX')}*` : ''
      const staffSection = ctx.isBotStaff ? `
╭─〔 🛡️ *STAFF DEL BOT* 〕
│ ${p}status · ${p}botadmins · ${p}suggestions
│ ${p}adultmode on|off · ${p}setbotname <nombre>
│ ${p}setbotcurrency <nombre> · ${p}setpfp
│ ${p}sb · ${p}welbanner · ${p}byebanner
│ ${p}delbanner · ${p}delwelbanner · ${p}delbyebanner
${ctx.isOwner ? `│ ${p}botadmin add|remove @user\n│ ${p}setprefix · ${p}privatemode status · ${p}restart` : ''}
╰────────────────` : ''
      const menu = `
╭━━━〔 👻 *${ctx.settings.botDisplayName.toUpperCase()}* 〕━━━╮
┃ Hola, *${ctx.pushName}*
┃ Prefijo » *${p}*
┃ Uptime » *${formatUptime(process.uptime())}*
┃ Moneda » *${ctx.settings.currencyName} (NXC)*
┃ Rol » *${ctx.isOwner ? 'Owner' : ctx.isBotStaff ? 'Staff global' : 'Usuario'}*
${accessLine}
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
✦ Sin banner personalizado, el menú usa la foto real del bot.
✦ Noticias y cambios oficiales: botón *Visitar canal*.`.trim()

      await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
        title: `✦ ${ctx.settings.botDisplayName} · COMMAND CENTER ✦`,
        body: menu,
        imageUrl: artwork,
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
      const artwork = await menuArtwork(ctx)
      await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
        title: `👻 ${ctx.settings.botDisplayName}`,
        imageUrl: artwork,
        body: [
          '╭─〔 *INFORMACIÓN* 〕',
          '│ Plataforma » WhatsApp Multi-Device',
          '│ Core » TypeScript + Baileys',
          '│ Panel » Next.js + Tailwind CSS',
          '│ Economía » Nexora Economy + Grimorio RPG',
          '│ Colección » Nexora Gacha',
          '│ Juegos » IA + PvP persistente',
          '│ YouTube » m.youtube + yt1s + fallbacks',
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
