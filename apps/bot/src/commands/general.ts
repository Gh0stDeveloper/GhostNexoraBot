import { config } from '../config.js'
import type { BotCommand } from '../types.js'
import { getBrandingAsset } from '../services/branding.js'
import { economy } from '../services/economy.js'
import { community } from '../services/community.js'
import { sendCarousel, type CarouselCard } from '../services/interactive.js'
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

export const generalCommands: BotCommand[] = [
  {
    name: 'menu', aliases: ['help', 'comandos'], category: 'general', description: 'Muestra el menú completo en un único carrusel interactivo.',
    async handler(ctx) {
      const p = ctx.prefix
      const artwork = await menuArtwork(ctx)
      const brand = identity(ctx)
      const privateUntil = ctx.isGroup || ctx.isBotStaff || ctx.isSubbotOwner ? null : economy.hasEntitlement(ctx.sender, 'private_access')
      const privateUnlocked = ctx.isGroup || ctx.isBotStaff || ctx.isSubbotOwner || Boolean(privateUntil)
      const groupEnabled = !ctx.isGroup || community.getGroupSettings(ctx.chatId).botEnabled
      const profession = economy.profession(ctx.sender)
      const role = ctx.isOwner ? 'Owner' : ctx.isBotStaff ? 'Staff global' : ctx.isSubbotOwner ? 'Owner del subbot' : 'Usuario'
      const access = ctx.isGroup
        ? `Grupo: ${groupEnabled ? 'ON' : 'OFF'}${!groupEnabled ? ` · activa con ${p}bot on` : ''}`
        : `Privado: ${privateUnlocked ? 'HABILITADO' : 'BLOQUEADO'}${privateUntil ? ` hasta ${new Date(privateUntil).toLocaleString('es-MX')}` : ''}`

      const cards: CarouselCard[] = [
        {
          title: `👻 ${brand.longName}`,
          body: [
            `⚙️ ${brand.label}`,
            `👤 ${ctx.pushName} · ${role}`,
            `⌨️ Prefijo: ${p}`,
            `⏱️ Uptime: ${formatUptime(process.uptime())}`,
            `🪙 ${brand.currencyName} (NXC)`,
            `💼 ${profession.emoji} ${profession.label}`,
            `🔐 ${access}`,
            '',
            'Desliza para ver todas las categorías.',
          ].join('\n'),
          imageUrl: artwork,
          footer: 'Ghost Developer / Nexora',
          buttons: [
            { type: 'url', text: '📢 Ver canal', url: config.officialChannelUrl },
            { type: 'reply', text: '👤 Mi perfil', id: `${p}profile` },
            { type: 'reply', text: '🛒 Tienda', id: `${p}shop` },
          ],
        },
        {
          title: '🧠 IA · BÚSQUEDA',
          body: `${p}ai <pregunta> · ${p}investiga <tema>\n${p}google <búsqueda> · ${p}wiki <búsqueda>\n${p}anime <título> · ${p}manga <título>\n${p}mangachapters <id|url> [es|en]\n${p}mangadl <id|url> <cap|latest> [es|en]`,
          buttons: [
            { type: 'reply', text: '🤖 Estado IA', id: `${p}aistatus` },
            { type: 'reply', text: '🌐 Wikipedia', id: `${p}wiki WhatsApp` },
          ],
        },
        {
          title: '🎵 DESCARGAS',
          body: `YouTube: ${p}yts · ${p}play · ${p}ytmusic · ${p}yt\n${p}ytmp3 · ${p}ytmp4 · ${p}playvideo · ${p}ytformats\n${p}lyrics · ${p}soundcloud\n\nRedes: ${p}tiktok · ${p}instagram · ${p}facebook · ${p}twitter\nArchivos: ${p}mediafire · ${p}gdrive · ${p}gitclone · ${p}apk`,
          buttons: [
            { type: 'reply', text: '🎵 Buscar YouTube', id: `${p}yts música` },
            { type: 'reply', text: '🎬 TikTok', id: `${p}tiktok videos` },
          ],
        },
        {
          title: '🪙 ECONOMÍA · TRABAJO',
          body: `${p}bal · ${p}daily · ${p}work [profesión]\n${p}job · ${p}slut · ${p}crime\n${p}deposit · ${p}withdraw · ${p}pay @user <monto>\n${p}rob @user · ${p}invest · ${p}cda\n${p}loan · ${p}paydebt · ${p}lend\n${p}baltop · ${p}balglobal`,
          buttons: [
            { type: 'reply', text: '💼 Profesiones', id: `${p}job` },
            { type: 'reply', text: '🪙 Mi saldo', id: `${p}balance` },
            { type: 'reply', text: '🛒 Nexora Store', id: `${p}shop` },
          ],
        },
        {
          title: '📖 RPG · JUEGOS · GACHA',
          body: `RPG: ${p}grimorio · ${p}tienda · ${p}comprar · ${p}usar\nJuegos: ${p}flip · ${p}dados · ${p}bj · ${p}bjvs\n${p}ttt · ${p}lttt · ${p}tpvp · ${p}damas · ${p}damasbot\nGacha: ${p}rw · ${p}claim · ${p}harem · ${p}wsearch · ${p}winfo\n${p}trade · ${p}setfav · ${p}vote · ${p}wtop`,
          buttons: [
            { type: 'reply', text: '📖 Grimorio', id: `${p}grimorio` },
            { type: 'reply', text: '🛍️ Tienda RPG', id: `${p}tienda` },
            { type: 'reply', text: '🌸 Waifu', id: `${p}rw` },
          ],
        },
        {
          title: '💞 SOCIAL · REACCIONES',
          body: `Perfil: ${p}profile · ${p}setdesc · ${p}setbirth · ${p}setgender\n${p}level · ${p}tops · ${p}vr · ${p}marry · ${p}divorce\n\nReacciones: ${p}hug · ${p}kiss · ${p}pat · ${p}nuzzle · ${p}blush\n${p}wink · ${p}wave · ${p}dance · ${p}poke · ${p}bite\n${p}slap · ${p}punch · ${p}patear · ${p}cry · ${p}spell`,
          buttons: [
            { type: 'reply', text: '👤 Perfil', id: `${p}profile` },
            { type: 'reply', text: '🫂 Abrazo', id: `${p}hug` },
          ],
        },
        {
          title: '🎨 STICKERS · HERRAMIENTAS',
          body: `${p}s [efecto] · soporta imagen/GIF/video corto\n${p}spack <nombre> | <autor>\n${p}sauthor <alias> · ${p}stickereffects\n${p}toimage · ${p}sprite <personaje>\n${p}groupinfo · ${p}safebooru [tags]`,
          buttons: [
            { type: 'reply', text: '🎨 Efectos', id: `${p}stickereffects` },
            { type: 'reply', text: '📦 Mi pack', id: `${p}spack` },
          ],
        },
        {
          title: '👥 ADMINISTRACIÓN DE GRUPOS',
          body: `${p}bot on|off|status · ${p}tag · ${p}hidetag\n${p}kick · ${p}promote · ${p}demote · ${p}del\n${p}open · ${p}close · ${p}link\n${p}antilink on|off · ${p}nsfw on|off\n${p}welcome on|off · ${p}goodbye on|off\n${p}setwelcome · ${p}setgoodbye`,
          buttons: [
            { type: 'reply', text: '🤖 Estado bot', id: `${p}bot status` },
            { type: 'reply', text: '👥 Info grupo', id: `${p}groupinfo` },
          ],
        },
        {
          title: '🤖 SUBBOTS · PERSONALIZACIÓN',
          body: `${p}subbot status\n${p}subbot pair <número>\n${p}subbot qr · fallback QR local\n${p}subbot portal\n\nPersonalización autorizada: ${p}setbotname · ${p}setbotcurrency · ${p}setpfp\n${p}sb · ${p}welbanner · ${p}byebanner`,
          buttons: [
            { type: 'reply', text: '🤖 Mi subbot', id: `${p}subbot status` },
            { type: 'reply', text: '📲 QR subbot', id: `${p}subbot qr` },
            { type: 'reply', text: '🛒 Comprar subbot', id: `${p}shop` },
          ],
        },
        {
          title: '🔞 CONTENIDO 18+',
          body: `${p}adult18 accept\n${p}xvideos <búsqueda|url> · ${p}xnxx <búsqueda|url>\n${p}pornhub <búsqueda|url>\n${p}erome · ${p}erome search <texto>\n${p}erome profiles <usuario> · ${p}erome profile <usuario|url>\n${p}erome album <id|url> · ${p}erome dl <id|url> <video>\n${p}gelbooru [tags] · ${p}e621 [tags]`,
          buttons: [
            { type: 'reply', text: '🔞 Erome', id: `${p}erome` },
          ],
        },
      ]

      if (ctx.isBotStaff || ctx.isSubbotOwner) {
        cards.push({
          title: '🛡️ STAFF · CONTROL',
          body: ctx.isBotStaff
            ? `${p}system · ${p}speedtest · ${p}status\n${p}botadmins · ${p}suggestions · ${p}adultmode on|off\n${p}privategrant · ${p}privaterevoke · ${p}privatestatus\n${p}privateusers${ctx.isOwner ? `\n${p}botadmin add|remove · ${p}setprefix · ${p}restart` : ''}`
            : `Owner de ${brand.label}\n${p}setbotname · ${p}setbotcurrency · ${p}setpfp\n${p}sb · ${p}welbanner · ${p}byebanner`,
          buttons: [
            { type: 'reply', text: '📊 Estado', id: `${p}status` },
            ...(ctx.isBotStaff ? [{ type: 'reply' as const, text: '🖥️ Sistema', id: `${p}system` }] : []),
          ],
        })
      }

      await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
        title: `👻 ${brand.shortName} · MENÚ`,
        body: `Hola ${ctx.pushName}. Todo el menú y sus accesos rápidos están dentro de este único mensaje. ↔️ Desliza las tarjetas.`,
        footer: 'Ghost Developer / Nexora',
        cards,
      })
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
