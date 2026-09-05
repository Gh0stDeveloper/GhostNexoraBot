import type { BotCommand, CommandContext } from '../types.js'
import { COIN_SYMBOL, economy } from '../services/economy.js'
import { mining, MINER_HOURLY_YIELD, MINER_MAX_COUNT } from '../services/mining.js'
import { sendCarousel } from '../services/interactive.js'
import { getCurrentBotVisualStyle, resolveCurrentBotVisualImage } from '../services/bot-styles-v13.js'

const fmt = (value: number) => `${Math.floor(value).toLocaleString('es-MX')} ${COIN_SYMBOL}`

const shopProducts = [
  { id: 'private1d', icon: '🔐', title: 'Acceso privado · 1 día', price: 2000, description: 'Todos los comandos disponibles en privado durante 24 horas.' },
  { id: 'private7d', icon: '🔐', title: 'Acceso privado · 7 días', price: 10000, description: 'Acceso privado durante una semana.' },
  { id: 'private30d', icon: '💎', title: 'Acceso privado · 30 días', price: 30000, description: 'Plan mensual de acceso privado.' },
  { id: 'subbot1d', icon: '🤖', title: 'Subbot · 1 día', price: 6000, description: 'Tu propia sesión de WhatsApp durante 24 horas.' },
  { id: 'subbot7d', icon: '🤖', title: 'Subbot · 7 días', price: 30000, description: 'Subbot independiente durante una semana.' },
  { id: 'subbot30d', icon: '👑', title: 'Subbot · 30 días', price: 100000, description: 'Subbot independiente durante 30 días.' },
] as const

async function currentBotAvatar(ctx: CommandContext) {
  const jid = ctx.socket.user?.id
  if (!jid) return undefined
  return ctx.socket.profilePictureUrl(jid, 'image').catch(() => undefined)
}

async function styledImage(ctx: CommandContext) {
  const avatar = await currentBotAvatar(ctx)
  return resolveCurrentBotVisualImage(avatar)
}

async function shopCommand(ctx: CommandContext) {
  const balance = economy.balance(ctx.sender)
  const miner = mining.summary(ctx.sender)
  const imageUrl = await styledImage(ctx)
  const style = getCurrentBotVisualStyle()

  const cards = shopProducts.map((item) => ({
    title: `${item.icon} ${item.title}`,
    body: `${item.description}\n\n💰 Precio: ${fmt(item.price)}\n🆔 ${item.id}`,
    imageUrl,
    footer: `${style.icon} ${style.name} · Ghost Nexora Bot`,
    buttons: [
      { type: 'reply' as const, text: '🛒 Comprar', id: `${ctx.prefix}buy ${item.id}` },
      { type: 'reply' as const, text: '🪙 Mi saldo', id: `${ctx.prefix}balance` },
      ...(item.id.startsWith('subbot') ? [{ type: 'reply' as const, text: '🤖 Mi subbot', id: `${ctx.prefix}subbot status` }] : []),
    ],
  }))

  cards.push({
    title: '⛏️ Minero NXC',
    body: miner.nextPrice
      ? `Mina NXC de forma pasiva.\n\n💰 Siguiente minero: ${fmt(miner.nextPrice)}\n⚙️ Producción: ${fmt(MINER_HOURLY_YIELD)}/h por minero\n📦 Tienes: ${miner.count}/${MINER_MAX_COUNT}`
      : `Ya alcanzaste el máximo de ${MINER_MAX_COUNT} mineros.\nProducción actual: ${fmt(miner.hourly)}/h.`,
    imageUrl,
    footer: `${style.icon} ${style.name} · Ghost Nexora Bot`,
    buttons: miner.nextPrice ? [
      { type: 'reply' as const, text: '⛏️ Comprar minero', id: `${ctx.prefix}minershop` },
      { type: 'reply' as const, text: '💰 Cobrar', id: `${ctx.prefix}miner collect` },
      { type: 'reply' as const, text: '📊 Estado', id: `${ctx.prefix}miner` },
    ] : [
      { type: 'reply' as const, text: '💰 Cobrar', id: `${ctx.prefix}miner collect` },
      { type: 'reply' as const, text: '📊 Estado', id: `${ctx.prefix}miner` },
    ],
  })

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '🛒 NEXORA STORE',
    body: [
      `Saldo global: ${fmt(balance.total)}`,
      `Estilo visual: ${style.icon} ${style.name}`,
      'Desliza para ver productos y comprar directamente.',
    ].join('\n'),
    footer: 'Nexora Economy · Ghost Nexora Bot',
    cards,
  })
}

export const shopStyleV13Commands: BotCommand[] = [
  {
    name: 'shop',
    aliases: ['store', 'tienda'],
    category: 'economy',
    description: 'Nexora Store en carrusel con el estilo visual activo de la instancia.',
    handler: shopCommand,
  },
]
