import type { BotCommand, CommandContext } from '../types.js'
import { config } from '../config.js'
import { settings } from '../core/settings.js'
import { economy, COIN_SYMBOL } from '../services/economy.js'
import { mining, MINER_MAX_COUNT } from '../services/mining.js'
import { professionsV2, V2_PROFESSIONS } from '../services/professions-v2.js'
import { downloadAdult, searchAdult, type AdultProvider } from '../services/adult.js'
import { sendCarousel } from '../services/interactive.js'
import { createDownloadProgress } from '../services/progress.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

const fmt = (value: number) => `${Math.floor(value).toLocaleString('es-MX')} ${COIN_SYMBOL}`
const mb = (value: number) => `${(value / 1024 / 1024).toFixed(1)} MB`

async function botAvatar(ctx: CommandContext) {
  const jid = ctx.socket.user?.id
  if (!jid) return undefined
  return ctx.socket.profilePictureUrl(jid, 'image').catch(() => undefined)
}

async function jobCarousel(ctx: CommandContext) {
  const requested = ctx.argText.trim()
  const lower = requested.toLowerCase()
  const requestedPage = /^\d+$/.test(lower) ? Number(lower) : 1

  if (requested && !['list', 'lista', 'menu'].includes(lower) && !/^\d+$/.test(lower)) {
    const selected = professionsV2.set(ctx.sender, requested)
    await ctx.reply(`💼 *PROFESIÓN ACTUALIZADA*\n━━━━━━━━━━━━━━\n${selected.emoji} *${selected.label}*\n${selected.description}\n💰 ${fmt(selected.min)} — ${fmt(selected.max)} por trabajo\n⏱️ Cooldown: *1 minuto*`)
    return
  }

  const entries = Object.entries(V2_PROFESSIONS)
  const pageSize = 10
  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize))
  const page = Math.max(1, Math.min(totalPages, requestedPage || 1))
  const current = professionsV2.get(ctx.sender)
  const visible = entries.slice((page - 1) * pageSize, page * pageSize)
  const cards = visible.map(([id, item]) => ({
    title: `${item.emoji} ${item.label}`,
    body: `${item.description}\n\n💰 ${fmt(item.min)} — ${fmt(item.max)} por trabajo\n⏱️ Cooldown: 1 minuto`,
    buttons: [
      { type: 'reply' as const, text: '✅ Elegir', id: `${ctx.prefix}job ${id}` },
      { type: 'reply' as const, text: '💼 Elegir y trabajar', id: `${ctx.prefix}work ${id}` },
    ],
  }))

  if (totalPages > 1) {
    const targetPage = page < totalPages ? page + 1 : page - 1
    cards.push({
      title: page < totalPages ? '➡️ Más profesiones' : '⬅️ Profesiones anteriores',
      body: `Página ${page}/${totalPages}. Abre la página ${targetPage} para ver el resto de oficios.`,
      buttons: [{ type: 'reply' as const, text: page < totalPages ? 'Siguiente página' : 'Página anterior', id: `${ctx.prefix}job ${targetPage}` }],
    })
  }

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '💼 NEXORA · PROFESIONES',
    body: `Profesión actual: ${current.emoji} ${current.label}\nPágina ${page}/${totalPages} · desliza para elegir.`,
    footer: 'Ghost Nexora Bot · Trabajo cada 1 minuto',
    cards,
  })
}

const shopProducts = [
  { id: 'private1d', icon: '🔐', title: 'Acceso privado · 1 día', price: 2000, description: 'Todos los comandos disponibles en privado durante 24 horas.' },
  { id: 'private7d', icon: '🔐', title: 'Acceso privado · 7 días', price: 10000, description: 'Acceso privado durante una semana.' },
  { id: 'private30d', icon: '💎', title: 'Acceso privado · 30 días', price: 30000, description: 'Plan mensual de acceso privado.' },
  { id: 'subbot1d', icon: '🤖', title: 'Subbot · 1 día', price: 6000, description: 'Tu propia sesión de WhatsApp durante 24 horas.' },
  { id: 'subbot7d', icon: '🤖', title: 'Subbot · 7 días', price: 30000, description: 'Subbot independiente durante una semana.' },
  { id: 'subbot30d', icon: '👑', title: 'Subbot · 30 días', price: 100000, description: 'Subbot independiente durante 30 días.' },
] as const

async function shopCarousel(ctx: CommandContext) {
  const avatar = await botAvatar(ctx)
  const balance = economy.balance(ctx.sender)
  const miner = mining.summary(ctx.sender)
  const cards = shopProducts.map((item) => ({
    title: `${item.icon} ${item.title}`,
    body: `${item.description}\n\n💰 Precio: ${fmt(item.price)}\n🆔 ${item.id}`,
    imageUrl: avatar,
    buttons: [
      { type: 'reply' as const, text: '🛒 Comprar', id: `${ctx.prefix}buy ${item.id}` },
      { type: 'reply' as const, text: '🪙 Mi saldo', id: `${ctx.prefix}balance` },
      ...(item.id.startsWith('subbot') ? [{ type: 'reply' as const, text: '🤖 Mi subbot', id: `${ctx.prefix}subbot status` }] : []),
    ],
  }))

  cards.push({
    title: '⛏️ Minero NXC',
    body: miner.nextPrice
      ? `Mina NXC de forma pasiva.\n\n💰 Siguiente minero: ${fmt(miner.nextPrice)}\n⚙️ Producción: ${fmt(25)}/h por minero\n📦 Tienes: ${miner.count}/${MINER_MAX_COUNT}`
      : `Ya alcanzaste el máximo de ${MINER_MAX_COUNT} mineros.\nProducción actual: ${fmt(miner.hourly)}/h.`,
    imageUrl: avatar,
    buttons: miner.nextPrice ? [
      { type: 'reply' as const, text: '⛏️ Comprar minero', id: `${ctx.prefix}miner buy` },
      { type: 'reply' as const, text: '💰 Cobrar', id: `${ctx.prefix}miner collect` },
      { type: 'reply' as const, text: '📊 Estado', id: `${ctx.prefix}miner` },
    ] : [
      { type: 'reply' as const, text: '💰 Cobrar', id: `${ctx.prefix}miner collect` },
      { type: 'reply' as const, text: '📊 Estado', id: `${ctx.prefix}miner` },
    ],
  })

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '🛒 NEXORA STORE',
    body: `Saldo global: ${fmt(balance.total)}\nDesliza para ver productos y comprar directamente.`,
    footer: 'Nexora Economy · Ghost Nexora Bot',
    cards,
  })
}

function assertAdult(ctx: CommandContext) {
  if (ctx.isGroup) {
    if (!economy.getGroupPolicy(ctx.chatId).adultAllowed) throw new Error(`El módulo 18+ está desactivado en este grupo. Un administrador puede usar ${ctx.prefix}adultmode on.`)
  } else if (!settings.adultEnabled || !config.adultPrivateEnabled) {
    throw new Error('El módulo 18+ está desactivado en chats privados.')
  }
  if (!economy.hasEntitlement(ctx.sender, 'adult_consent')) throw new Error(`Confirma que eres mayor de edad con ${ctx.prefix}adult18 accept.`)
}

function isUrl(value: string) {
  try { return ['http:', 'https:'].includes(new URL(value).protocol) } catch { return false }
}

function safeUrlForCommand(url: string) { return url.replace(/\s/g, '%20') }

async function adultVideo(ctx: CommandContext, provider: string, url: string) {
  assertAdult(ctx)
  const progress = await createDownloadProgress(ctx, `${provider.toUpperCase()} · video`)
  await progress.update('downloading', 'Extrayendo fuente directa y validando el archivo')
  const result = await downloadAdult(url)
  try {
    await progress.update('sending', `${mb(result.size)} · enviando a WhatsApp`)
    const sent = await ctx.socket.sendMessage(ctx.chatId, {
      video: { url: result.filePath }, mimetype: 'video/mp4',
      caption: `🔞 *${provider.toUpperCase()}* · ${mb(result.size)}`,
    }, { quoted: ctx.message }).catch(() => null)
    if (!sent) await ctx.socket.sendMessage(ctx.chatId, {
      document: { url: result.filePath }, mimetype: 'video/mp4', fileName: result.fileName,
    }, { quoted: ctx.message })
    recordSubbotDownload(ctx.instanceId, result.size)
    await progress.update('done', `${mb(result.size)} enviados.`)
  } finally { await result.cleanup() }
}

async function adultCarousel(ctx: CommandContext, provider: AdultProvider) {
  assertAdult(ctx)
  const input = ctx.argText.trim()
  if (!input) throw new Error(`Uso: ${ctx.prefix}${provider} <búsqueda|url>`)
  if (isUrl(input)) { await adultVideo(ctx, provider, input); return }
  const rows = await searchAdult(provider, input, 10)
  if (!rows.length) throw new Error('No encontré resultados públicos para esa búsqueda.')
  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: `🔞 ${provider.toUpperCase()}`,
    body: `Resultados para: ${input}\nDesliza para seleccionar un video.`,
    footer: 'Ghost Nexora Bot · +18',
    cards: rows.map((item, index) => ({
      title: `#${index + 1} · ${item.title}`.slice(0, 120),
      body: item.title,
      imageUrl: item.thumbnail,
      // Solo quick-reply: evita el CTA externo que algunos clientes rechazaban en tarjetas 18+.
      buttons: [{ type: 'reply', text: '⬇️ Descargar', id: `${ctx.prefix}adultdl ${safeUrlForCommand(item.url)}` }],
    })),
  })
}

export const carouselCompatV3Commands: BotCommand[] = [
  { name: 'job', aliases: ['profession', 'profesion', 'empleo'], category: 'economy', description: 'Elige tu profesión desde un carrusel paginado.', handler: jobCarousel },
  { name: 'shop', aliases: ['store', 'tienda'], category: 'economy', description: 'Muestra la Nexora Store en carrusel.', handler: shopCarousel },
  { name: 'xvideos', aliases: ['xv'], category: 'adult', description: 'Busca o descarga videos de XVideos en carrusel.', handler: (ctx) => adultCarousel(ctx, 'xvideos') },
  { name: 'xnxx', aliases: ['xn'], category: 'adult', description: 'Busca o descarga videos de XNXX en carrusel.', handler: (ctx) => adultCarousel(ctx, 'xnxx') },
  { name: 'pornhub', aliases: ['ph'], category: 'adult', description: 'Busca o descarga videos de Pornhub en carrusel.', handler: (ctx) => adultCarousel(ctx, 'pornhub') },
  { name: 'adultdl', aliases: ['18dl'], category: 'adult', description: 'Descarga un resultado +18 seleccionado.', async handler(ctx) {
    const url = ctx.args[0] ?? ''
    if (!isUrl(url)) throw new Error('Indica una URL soportada.')
    const provider = /xvideos/i.test(url) ? 'xvideos' : /xnxx/i.test(url) ? 'xnxx' : /pornhub/i.test(url) ? 'pornhub' : 'video'
    await adultVideo(ctx, provider, url)
  } },
]
