import type { BotCommand, CommandContext } from '../types.js'
import { config } from '../config.js'
import { sendCarousel, sendInteractiveCard, type InteractiveButton } from '../services/interactive.js'
import { isGroupAdministrator } from '../utils/target.js'

type MenuSection = {
  title: string
  body: (ctx: CommandContext) => string
  buttons?: (ctx: CommandContext) => InteractiveButton[]
}

const commonButtons = (ctx: CommandContext): InteractiveButton[] => [
  { type: 'reply', text: '🏠 Menú', id: `${ctx.prefix}menu` },
  { type: 'reply', text: '👤 Perfil', id: `${ctx.prefix}profile` },
  { type: 'url', text: '📢 Canal', url: config.officialChannelUrl },
]

const sections: Record<string, MenuSection> = {
  ia: {
    title: '🧠 IA Y BÚSQUEDA',
    body: (ctx) => [
      `${ctx.prefix}ai <mensaje> — Asistente IA.`,
      `${ctx.prefix}google <consulta> — Búsqueda web.`,
      `${ctx.prefix}wiki <consulta> — Wikipedia.`,
      `${ctx.prefix}anime <nombre> — Consulta anime/Jikan.`,
    ].join('\n'),
    buttons: commonButtons,
  },
  downloads: {
    title: '⬇️ DESCARGAS',
    body: (ctx) => [
      `${ctx.prefix}yts <texto> — Busca en YouTube y muestra carrusel.`,
      `${ctx.prefix}ytmp3 <url> — Audio desde enlace.`,
      `${ctx.prefix}ytmp4 <url> [calidad] — Video desde enlace.`,
      `${ctx.prefix}facebook <url> — Facebook con respaldo Lempi.`,
      `${ctx.prefix}instagram <url> — Instagram público.`,
      `${ctx.prefix}tiktok <url|búsqueda> — TikTok.`,
      `${ctx.prefix}twitter <url> — X/Twitter.`,
      `${ctx.prefix}mediafire <url> — MediaFire.`,
      `${ctx.prefix}soundcloud <url|búsqueda> — SoundCloud.`,
    ].join('\n'),
    buttons: commonButtons,
  },
  economy: {
    title: '🪙 NEXORA ECONOMY',
    body: (ctx) => [
      `${ctx.prefix}balance — Billetera global.`,
      `${ctx.prefix}work — Trabaja cada minuto.`,
      `${ctx.prefix}job — Elige profesión en carrusel.`,
      `${ctx.prefix}transfer — Transfiere NXC.`,
      `${ctx.prefix}loan / ${ctx.prefix}loan pay — Préstamos.`,
      `${ctx.prefix}miner — Minería pasiva.`,
      `${ctx.prefix}top / ${ctx.prefix}topglobal — Rankings.`,
      `${ctx.prefix}shop — Nexora Store en carrusel.`,
    ].join('\n'),
    buttons: (ctx) => [
      { type: 'reply', text: '🪙 Balance', id: `${ctx.prefix}balance` },
      { type: 'reply', text: '🛒 Tienda', id: `${ctx.prefix}shop` },
      { type: 'reply', text: '⛏️ Minero', id: `${ctx.prefix}miner` },
    ],
  },
  games: {
    title: '🎮 JUEGOS Y COLECCIÓN',
    body: (ctx) => [
      `${ctx.prefix}flip — Cara o cruz.`,
      `${ctx.prefix}dados — Dados.`,
      `${ctx.prefix}bj — Blackjack.`,
      `${ctx.prefix}ttt — Tres en raya.`,
      `${ctx.prefix}rw — Waifu roll.`,
      `${ctx.prefix}claim — Reclama personaje.`,
      `${ctx.prefix}harem — Tu colección.`,
    ].join('\n'),
    buttons: (ctx) => [
      { type: 'reply', text: '🪙 Cara/Cruz', id: `${ctx.prefix}flip` },
      { type: 'reply', text: '🎲 Dados', id: `${ctx.prefix}dados` },
      { type: 'reply', text: '🏠 Menú', id: `${ctx.prefix}menu` },
    ],
  },
  social: {
    title: '💞 SOCIAL Y REACCIONES',
    body: (ctx) => [
      `${ctx.prefix}hug / kiss / pat — Reacciones anime.`,
      `${ctx.prefix}smoke — Reacción de fumar.`,
      `${ctx.prefix}drug — Reacción ficticia.`,
      `${ctx.prefix}slime — Reacción slime.`,
      'Los comandos dirigidos aceptan mención o respuesta al mensaje.',
    ].join('\n'),
    buttons: (ctx) => [
      { type: 'reply', text: '🟢 Slime', id: `${ctx.prefix}slime` },
      { type: 'reply', text: '👤 Perfil', id: `${ctx.prefix}profile` },
      { type: 'reply', text: '🏠 Menú', id: `${ctx.prefix}menu` },
    ],
  },
  adult: {
    title: '🔞 MÓDULO 18+',
    body: (ctx) => [
      `${ctx.prefix}adult18 accept — Confirma mayoría de edad.`,
      `${ctx.prefix}xvideos <búsqueda|url> — Carrusel/descarga.`,
      `${ctx.prefix}xnxx <búsqueda|url> — Carrusel/descarga.`,
      `${ctx.prefix}pornhub <búsqueda|url> — Carrusel/descarga.`,
      `${ctx.prefix}erome — Navegación y descarga.`,
      `${ctx.prefix}fuck / cum / preñar — Roleplay 18+ consensuado.`,
    ].join('\n'),
    buttons: (ctx) => [
      { type: 'reply', text: '🔞 Confirmar 18+', id: `${ctx.prefix}adult18 accept` },
      { type: 'reply', text: '🏠 Menú', id: `${ctx.prefix}menu` },
      { type: 'url', text: '📢 Canal', url: config.officialChannelUrl },
    ],
  },
  subbot: {
    title: '🤖 SUBBOT',
    body: (ctx) => [
      `${ctx.prefix}subbot status — Estado real.`,
      `${ctx.prefix}subbot pair <número> — Vinculación.`,
      `${ctx.prefix}subbot qr — Genera QR.`,
      `${ctx.prefix}subbot reset — Borra una sesión fallida y permite volver a vincular.`,
      `${ctx.prefix}shop — Compra acceso de subbot.`,
    ].join('\n'),
    buttons: (ctx) => [
      { type: 'reply', text: '🤖 Estado', id: `${ctx.prefix}subbot status` },
      { type: 'reply', text: '🛒 Tienda', id: `${ctx.prefix}shop` },
      { type: 'reply', text: '🏠 Menú', id: `${ctx.prefix}menu` },
    ],
  },
  admin: {
    title: '🛡️ ADMINISTRACIÓN',
    body: (ctx) => [
      `${ctx.prefix}rules — Reglas y moderación.`,
      `${ctx.prefix}kick / promote / demote — Gestión por mención o respuesta.`,
      `${ctx.prefix}antilink on|off — 3 advertencias.`,
      `${ctx.prefix}antispam on|off — 3 advertencias.`,
      `${ctx.prefix}welcome on|off — Bienvenidas.`,
      `${ctx.prefix}adultmode on|off — Módulo 18+ del grupo.`,
      ctx.isBotStaff || ctx.isOwner ? `${ctx.prefix}addnxc / subbotgrant / subbotreset / botsticker / kicksticker / broadcast — Herramientas de staff.` : '',
    ].filter(Boolean).join('\n'),
    buttons: (ctx) => [
      ...(ctx.isGroup ? [{ type: 'reply' as const, text: '📜 Reglas', id: `${ctx.prefix}rules` }] : []),
      { type: 'reply', text: '🏠 Menú', id: `${ctx.prefix}menu` },
      { type: 'url', text: '📢 Canal', url: config.officialChannelUrl },
    ].slice(0, 3),
  },
}

async function canUseAdminMenu(ctx: CommandContext) {
  if (ctx.isOwner || ctx.isBotStaff) return true
  if (!ctx.isGroup) return false
  return isGroupAdministrator(ctx)
}

async function sendSection(ctx: CommandContext, section: string) {
  const item = sections[section]
  if (!item) return false
  if (section === 'admin' && !await canUseAdminMenu(ctx)) throw new Error('Este menú está disponible únicamente para administradores del grupo o staff del bot.')
  await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
    title: item.title,
    body: item.body(ctx),
    footer: 'Ghost Nexora Bot · Usa los botones para navegar',
    buttons: item.buttons?.(ctx) ?? commonButtons(ctx),
  })
  return true
}

async function menuHandler(ctx: CommandContext) {
  const requested = (ctx.args[0] ?? '').toLowerCase()
  if (requested && await sendSection(ctx, requested)) return

  const showAdmin = await canUseAdminMenu(ctx)
  const cards = [
    {
      title: '🧠 IA Y BÚSQUEDA',
      body: 'IA, Google, Wikipedia y consultas de anime.',
      buttons: [{ type: 'reply' as const, text: '🧠 Abrir IA', id: `${ctx.prefix}menu ia` }],
    },
    {
      title: '⬇️ DESCARGAS',
      body: 'YouTube, Facebook, Instagram, TikTok, X, MediaFire y SoundCloud.',
      buttons: [{ type: 'reply' as const, text: '⬇️ Ver descargas', id: `${ctx.prefix}menu downloads` }],
    },
    {
      title: '🪙 NEXORA ECONOMY',
      body: 'Billetera global, banco, profesiones, préstamos, minería y rankings.',
      buttons: [
        { type: 'reply' as const, text: '🪙 Economía', id: `${ctx.prefix}menu economy` },
        { type: 'reply' as const, text: '🛒 Tienda', id: `${ctx.prefix}shop` },
      ],
    },
    {
      title: '🎮 JUEGOS Y COLECCIÓN',
      body: 'Minijuegos NXC, PvP, RPG y colección de personajes.',
      buttons: [{ type: 'reply' as const, text: '🎮 Ver juegos', id: `${ctx.prefix}menu games` }],
    },
    {
      title: '💞 SOCIAL',
      body: 'Reacciones, perfil y acciones entre usuarios por mención o respuesta.',
      buttons: [
        { type: 'reply' as const, text: '💞 Social', id: `${ctx.prefix}menu social` },
        { type: 'reply' as const, text: '👤 Mi perfil', id: `${ctx.prefix}profile` },
      ],
    },
    {
      title: '🔞 18+',
      body: 'Búsquedas y roleplay para adultos con consentimiento y control por grupo.',
      buttons: [{ type: 'reply' as const, text: '🔞 Ver 18+', id: `${ctx.prefix}menu adult` }],
    },
    {
      title: '🤖 SUBBOT',
      body: 'Estado, vinculación, QR, restablecimiento y compra de acceso.',
      buttons: [
        { type: 'reply' as const, text: '🤖 Subbot', id: `${ctx.prefix}menu subbot` },
        { type: 'reply' as const, text: '📡 Estado', id: `${ctx.prefix}subbot status` },
      ],
    },
    ...(showAdmin ? [{
      title: '🛡️ ADMINISTRACIÓN',
      body: 'Moderación del grupo y herramientas especiales de staff.',
      buttons: [{ type: 'reply' as const, text: '🛡️ Admin', id: `${ctx.prefix}menu admin` }],
    }] : []),
    {
      title: '📢 CANAL OFICIAL',
      body: 'Novedades, cambios, mantenimiento y anuncios oficiales del bot.',
      buttons: [{ type: 'url' as const, text: '📢 Ver canal', url: config.officialChannelUrl }],
    },
  ]

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '👻 GHOST NEXORA BOT · MENÚ',
    body: `Hola, ${ctx.pushName}. Desliza las categorías y usa los botones.\nPrefijo actual: ${ctx.prefix}`,
    footer: 'Ghost Nexora Bot · Menú interactivo',
    cards,
  })
}

export const menuV3Commands: BotCommand[] = [{
  name: 'menu',
  aliases: ['help', 'comandos'],
  category: 'general',
  description: 'Abre el menú interactivo por categorías con botones.',
  handler: menuHandler,
}]
