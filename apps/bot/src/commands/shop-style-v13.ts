import type { BotCommand, CommandContext } from '../types.js'
import { COIN_SYMBOL, economy } from '../services/economy.js'
import { mining, MINER_HOURLY_YIELD, MINER_MAX_COUNT } from '../services/mining.js'
import { sendCarousel } from '../services/interactive.js'
import { getCurrentBotVisualStyle, resolveCurrentBotVisualImage } from '../services/bot-styles-v13.js'

const fmt = (value: number) => `${Math.floor(value).toLocaleString('es-MX')} ${COIN_SYMBOL}`

const shopProducts = [
  { id: 'subbot1d', icon: '🤖', title: 'Subbot · 1 día', price: 6000, durationMs: 86400_000, description: 'Tu propia sesión de WhatsApp durante 24 horas.' },
  { id: 'subbot7d', icon: '🤖', title: 'Subbot · 7 días', price: 30000, durationMs: 7 * 86400_000, description: 'Subbot independiente durante una semana.' },
  { id: 'subbot30d', icon: '👑', title: 'Subbot · 30 días', price: 100000, durationMs: 30 * 86400_000, description: 'Subbot independiente durante 30 días.' },
] as const

type ShopProductId = typeof shopProducts[number]['id']

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
      { type: 'reply' as const, text: '🤖 Mi subbot', id: `${ctx.prefix}subbot status` },
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
      'El acceso por chat privado no se vende: está bloqueado y solo el owner de cada instancia puede autorizar usuarios.',
      'Desliza para ver productos disponibles.',
    ].join('\n'),
    footer: 'Nexora Economy · Ghost Nexora Bot',
    cards,
  })
}

async function buyCommand(ctx: CommandContext) {
  const id = (ctx.args[0] ?? '').toLowerCase()
  if (id.startsWith('private')) {
    throw new Error(`El acceso por chat privado ya no se vende. Solo el owner puede autorizar usuarios con ${ctx.prefix}private allow @usuario.`)
  }
  const item = shopProducts.find((product) => product.id === id as ShopProductId)
  if (!item) throw new Error(`Producto inválido. Consulta ${ctx.prefix}shop.`)
  const result = economy.purchase(ctx.sender, item.price, 'subbot_slot', item.durationMs, { product: item.id, store: 'v16-private-safe' })
  const active = economy.getActiveSubbot(ctx.sender)
  if (active) economy.db.prepare('UPDATE subbots SET expires_at = ? WHERE id = ?').run(result.expiresAt, active.id)
  else economy.createSubbot(ctx.sender, result.expiresAt)
  await ctx.reply(`✅ *COMPRA COMPLETADA*\n━━━━━━━━━━━━━━\nProducto: *${item.title}*\nPrecio: *${fmt(item.price)}*\nVence: ${new Date(result.expiresAt).toLocaleString('es-MX')}\n\nVincula con *${ctx.prefix}subbot pair <número>* o usa *${ctx.prefix}subbot qr*.`)
}

export const shopStyleV13Commands: BotCommand[] = [
  {
    name: 'shop',
    aliases: ['store', 'tienda'],
    category: 'economy',
    description: 'Nexora Store con estilo visual activo y sin venta de acceso por chat privado.',
    handler: shopCommand,
  },
  {
    name: 'buy',
    aliases: ['comprar'],
    category: 'economy',
    description: 'Compra productos disponibles; el chat privado no se vende.',
    usage: 'buy <producto>',
    handler: buyCommand,
  },
]
